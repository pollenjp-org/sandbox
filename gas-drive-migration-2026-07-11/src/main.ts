/**
 * =====================================================================
 *  マイドライブ → 別ドメイン共有ドライブ 移行スクリプト
 * =====================================================================
 *
 * 【何をするか】
 *   移行元アカウント (例: xxx@google.com) のマイドライブにあるフォルダを、
 *   別ドメイン (例: @misugi-corp.co.jp) の Google Workspace にある
 *   「共有ドライブ」へ移行する。
 *
 *   Google ドライブの仕様上、ドメインをまたいだ
 *     - オーナー権限の譲渡          → 不可
 *     - フォルダごとの共有ドライブへの移動 → 不可 (エラー)
 *     - ファイル単位の共有ドライブへの移動 → 可能
 *   であるため、このスクリプトは
 *     1. 移行先にフォルダ階層を「同じ名前で作り直し」
 *     2. ファイルだけを 1 件ずつ移動 (移動した瞬間、所有権は共有ドライブ
 *        = 移行先組織に移る)
 *   という戦略をとる。
 *
 * 【どのアカウントで実行するか】
 *   ★ 移行元アカウント (ファイルのオーナー) で実行する ★
 *   マイドライブからファイルを持ち出せるのは原則オーナーだけのため。
 *   事前に移行先の共有ドライブへ、移行元アカウントを
 *   「コンテンツ管理者」以上のメンバーとして追加しておくこと。
 *
 * 【使い方 (詳細は docs/textbook/03-setup-guide.md)】
 *   1. 下の CONFIG を書き換える (まずは DRY_RUN: true のまま)
 *   2. エディタで startMigration を実行 → ログで移行計画を確認
 *   3. DRY_RUN: false にして startMigration を再実行
 *   実行時間が GAS の上限 (約 6 分) に近づくと自動で中断・保存し、
 *   時間主導トリガーで自動再開する。進捗は printStatus で確認できる。
 *
 * 【主なエントリポイント (エディタから実行する関数)】
 *   - startMigration()          : 移行を開始する
 *   - resumeMigration()         : 中断した移行を再開する (トリガーからも呼ばれる)
 *   - printStatus()             : 進捗・統計・失敗一覧をログに出す
 *   - cancelMigration()         : 移行を中止する (トリガー削除)
 *   - resetState()              : 保存された状態を完全に消す
 *   - trashEmptySourceFolders() : 移行完了後、空になった移行元フォルダをゴミ箱へ
 */

// ---------------------------------------------------------------------
// 設定 (ここを書き換える)
// ---------------------------------------------------------------------

const CONFIG = {
  /**
   * 移行元フォルダの ID。
   * マイドライブでフォルダを開いたときの URL
   *   https://drive.google.com/drive/folders/【この部分】
   * をコピーする。
   */
  SOURCE_FOLDER_ID: '<<<移行元フォルダIDをここに>>>',

  /**
   * 移行先の ID。次のどちらでもよい。
   *   - 共有ドライブそのものの ID (共有ドライブ直下に配置する場合)
   *   - 共有ドライブ内のフォルダの ID (その配下に配置する場合)
   * どちらも URL の https://drive.google.com/drive/folders/【この部分】。
   * ※ マイドライブ内のフォルダを指定するとエラーで停止する (安全装置)。
   */
  DEST_FOLDER_ID: '<<<移行先の共有ドライブID または フォルダIDをここに>>>',

  /**
   * true  : 移行先に「移行元フォルダと同名のトップフォルダ」を作り、その中へ移行する
   * false : 移行先フォルダの直下へ、移行元フォルダの「中身」を直接ばらまく
   */
  CREATE_TOP_FOLDER: true,

  /**
   * true の間は一切変更を加えず、実行予定の操作をログに出すだけ (お試しモード)。
   * まず true で実行して計画を確認し、問題なければ false にして本実行する。
   */
  DRY_RUN: true,

  /**
   * 「移動」が失敗したファイルを「コピー」で救済するか。
   * 他人がオーナーのファイルなどは移動できないことがあるため true を推奨。
   * コピーは新しいファイル ID になる (= 旧 URL は移行先を指さない) 点に注意。
   */
  COPY_FALLBACK: true,

  /**
   * コピー救済したとき、自分がオーナーの元ファイルをゴミ箱に入れるか。
   * false なら元ファイルは移行元に残る (二重管理になるが安全寄り)。
   */
  TRASH_ORIGINAL_AFTER_COPY: false,

  /**
   * 完了・エラー停止時に通知するメールアドレス。空文字なら通知しない。
   * 例: 'you@example.com'
   */
  NOTIFY_EMAIL: '',

  /**
   * 1 回の実行の制限時間 (ミリ秒)。GAS の実行上限 (約 6 分) より短くしておき、
   * 超えたら状態を保存して自動再開トリガーに引き継ぐ。
   */
  TIME_LIMIT_MS: 4.5 * 60 * 1000,

  /** 自動再開トリガーが発火するまでの待ち時間 (ミリ秒) */
  RESUME_DELAY_MS: 60 * 1000,

  /** Drive API の一覧取得 1 ページあたりの件数 (最大 1000) */
  PAGE_SIZE: 1000,

  /** API が一時エラーを返したときのリトライ最大回数 */
  MAX_RETRIES: 5,
};

// ---------------------------------------------------------------------
// 内部定数
// ---------------------------------------------------------------------

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** 状態保存に使うスクリプトプロパティのキー */
const STATE_META_KEY = 'MIGRATION_STATE_META';
const STATE_CHUNK_KEY_PREFIX = 'MIGRATION_STATE_CHUNK_';

/**
 * スクリプトプロパティは 1 値あたり約 9KB までしか保存できないため、
 * 状態 JSON をこのサイズで分割 (チャンク化) して保存する。
 */
const STATE_CHUNK_SIZE = 8000;

/** 状態 JSON 全体の安全上限 (プロパティ全体の上限 500KB に余裕を持たせる) */
const STATE_TOTAL_LIMIT = 400000;

/** 失敗の詳細を記録する最大件数 (超過分は件数のみカウント) */
const MAX_RECORDED_FAILURES = 300;

/** 自動再開トリガーが呼び出す関数名 */
const RESUME_HANDLER = 'resumeMigration';

/** DRY_RUN 中に「作ったことにした」フォルダへ振る仮 ID の接頭辞 */
const DRY_RUN_ID_PREFIX = 'dryrun:';

// ---------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------

/** 「移行元フォルダ src の中身を、移行先フォルダ dst へ移す」という作業単位 */
interface FolderTask {
  /** 移行元フォルダ ID */
  src: string;
  /** 対応する移行先フォルダ ID (DRY_RUN 中は 'dryrun:...' の仮 ID のことがある) */
  dst: string;
  /** ログ・レポート用の移行元パス表記 (例: '営業部/2026年度') */
  path: string;
}

interface FailureRecord {
  fileId: string;
  name: string;
  path: string;
  reason: string;
}

interface MigrationStats {
  foldersVisited: number;
  foldersCreated: number;
  foldersReused: number;
  filesMoved: number;
  filesCopied: number;
  filesFailed: number;
}

type MigrationStatus = 'RUNNING' | 'SUSPENDED' | 'DONE' | 'CANCELLED' | 'ERROR';

/** 実行をまたいで引き継ぐ移行ジョブの全状態 */
interface MigrationState {
  status: MigrationStatus;
  /** このジョブが DRY_RUN として開始されたか (途中で CONFIG を変えても影響しない) */
  dryRun: boolean;
  /** これから処理するフォルダの待ち行列 (BFS: 幅優先探索) */
  queue: FolderTask[];
  stats: MigrationStats;
  failures: FailureRecord[];
  /** 自動再開が連続で異常終了した回数 (3 回で自動再開を止める) */
  errorStreak: number;
  startedAt: string;
  updatedAt: string;
}

/** listChildren が返す子アイテムの情報 */
interface ChildItem {
  id: string;
  name: string;
  mimeType: string;
  ownedByMe: boolean;
}

// =====================================================================
// エントリポイント
// =====================================================================

/**
 * 移行を開始する。
 * 進行中のジョブがある場合は誤操作防止のため開始を拒否する
 * (resumeMigration / cancelMigration / resetState を先に使うこと)。
 */
function startMigration(): void {
  validateConfig_();

  const existing = loadState_();
  if (existing && (existing.status === 'RUNNING' || existing.status === 'SUSPENDED')) {
    throw new Error(
      '進行中の移行ジョブがあります。printStatus で状況を確認し、' +
        '再開するなら resumeMigration、中止するなら cancelMigration を実行してください。'
    );
  }
  // 完了/中止/エラー済みの古い状態は捨てて新規開始する
  deleteResumeTriggers_();
  clearStateStorage_();

  // --- 移行元の検証 ---
  const src = withRetry_('移行元フォルダの取得', () =>
    Drive.Files.get(CONFIG.SOURCE_FOLDER_ID, {
      supportsAllDrives: true,
      fields: 'id, name, mimeType, driveId, ownedByMe',
    })
  );
  if (src.mimeType !== FOLDER_MIME) {
    throw new Error(`SOURCE_FOLDER_ID がフォルダではありません: ${src.name} (${src.mimeType})`);
  }
  if (src.driveId) {
    Logger.log(
      '⚠ 移行元が既に共有ドライブ内にあります。このスクリプトはマイドライブ→共有ドライブを想定しています。' +
        '移動には移行元共有ドライブ側の権限が必要になる場合があります。続行します。'
    );
  }

  // --- 移行先の検証 (共有ドライブ内であることを必ず確認する) ---
  const dest = resolveDestination_(CONFIG.DEST_FOLDER_ID);

  const state = newState_(CONFIG.DRY_RUN);
  Logger.log('====================================================');
  Logger.log(`移行元 : ${src.name} (${src.id})`);
  Logger.log(`移行先 : ${dest.label}`);
  Logger.log(`モード : ${state.dryRun ? 'DRY_RUN (計画の確認のみ・変更なし)' : '本実行'}`);
  Logger.log('====================================================');

  // トップフォルダを作るか、移行先直下へ中身を直接移すか
  const srcName = src.name || 'untitled';
  const rootDst = CONFIG.CREATE_TOP_FOLDER
    ? ensureFolder_(srcName, dest.rootId, state, srcName)
    : dest.rootId;

  state.queue.push({ src: src.id as string, dst: rootDst, path: srcName });
  saveState_(state);

  runLoop_(state);
}

/**
 * 中断した移行を再開する。
 * 時間主導トリガーから自動で呼ばれるほか、エディタから手動実行してもよい
 * (ERROR 停止後の再開は手動でこれを実行する)。
 */
function resumeMigration(): void {
  // 多重発火を防ぐため、まず自分を呼んだ種類のトリガーを掃除する
  deleteResumeTriggers_();

  const state = loadState_();
  if (!state) {
    Logger.log('保存された移行状態がありません。startMigration から開始してください。');
    return;
  }
  if (state.status === 'DONE' || state.status === 'CANCELLED') {
    Logger.log(`このジョブは既に ${state.status} です。新規開始は resetState → startMigration。`);
    return;
  }

  // 手動再開でエラー連続カウンタをリセットし、もう一度自動運転に戻す
  state.errorStreak = 0;
  state.status = 'RUNNING';
  Logger.log(`移行を再開します (残りフォルダ: ${state.queue.length})`);
  runLoop_(state);
}

/** 進捗・統計・失敗一覧をログに出力する。 */
function printStatus(): void {
  const state = loadState_();
  if (!state) {
    Logger.log('保存された移行状態はありません (未実行、または resetState 済み)。');
    return;
  }
  Logger.log(buildReport_(state));
}

/**
 * 移行を中止する。自動再開トリガーを削除し、状態を CANCELLED にする。
 * (移動済みのファイルはそのまま移行先に残る。巻き戻しは行わない。)
 */
function cancelMigration(): void {
  deleteResumeTriggers_();
  const state = loadState_();
  if (!state) {
    Logger.log('進行中の移行はありません。');
    return;
  }
  state.status = 'CANCELLED';
  saveState_(state);
  Logger.log(`移行を中止しました。処理済み: ${state.stats.foldersVisited} フォルダ / ` +
    `${state.stats.filesMoved} ファイル移動。残りキュー: ${state.queue.length} フォルダ。`);
}

/** 保存された状態と自動再開トリガーを完全に消し、まっさらな状態に戻す。 */
function resetState(): void {
  deleteResumeTriggers_();
  clearStateStorage_();
  Logger.log('移行状態をリセットしました。startMigration で新規に開始できます。');
}

/**
 * 【後片付け用・任意】移行完了後に実行する。
 * 移行元フォルダ配下を走査し、「完全に空になったフォルダ」だけを
 * 深い階層から順にゴミ箱へ入れる。ファイルが 1 つでも残っていれば
 * そのフォルダ (と先祖) は残す。CONFIG.DRY_RUN を尊重する。
 */
function trashEmptySourceFolders(): void {
  validateConfig_();
  const state = loadState_();
  if (!state || state.status !== 'DONE') {
    Logger.log(
      '⚠ 移行が DONE になっていません。printStatus で完了を確認してから実行することを推奨します。' +
        'このまま続行します (空フォルダしか消さないため致命的ではありません)。'
    );
  }
  const src = Drive.Files.get(CONFIG.SOURCE_FOLDER_ID, {
    supportsAllDrives: true,
    fields: 'id, name, ownedByMe',
  });
  const trashed = trashIfEmptyRecursive_(src.id as string, src.name || '', src.ownedByMe === true);
  Logger.log(
    trashed
      ? `完了: 移行元フォルダ「${src.name}」ごとゴミ箱に入れました${CONFIG.DRY_RUN ? ' (DRY_RUN: 実際には変更していません)' : ''}。`
      : `完了: 中身が残っているため一部フォルダは残しました。printStatus の失敗一覧を確認してください。`
  );
}

// =====================================================================
// メインループ
// =====================================================================

/**
 * キューが空になるまでフォルダを 1 つずつ処理する。
 * 制限時間を超えそうになったら状態を保存し、トリガーで自動再開する。
 */
function runLoop_(state: MigrationState): void {
  const deadline = Date.now() + CONFIG.TIME_LIMIT_MS;

  try {
    while (state.queue.length > 0) {
      if (Date.now() > deadline) {
        suspendAndScheduleResume_(state);
        return;
      }

      // キューの先頭を「覗く」だけにし、完了してから取り除く。
      // こうすると途中で中断しても、次回同じフォルダを最初から安全に
      // やり直せる (処理はべき等 = 何度実行しても結果が同じ)。
      const task = state.queue[0];
      let completed = false;
      try {
        completed = processFolder_(task, state, deadline);
      } catch (e) {
        // このフォルダ固有の問題 (権限など) は記録して先へ進む。
        // 配下のサブフォルダは列挙できていないため未処理のまま残る。
        recordFailure_(state, {
          fileId: task.src,
          name: `(フォルダ) ${task.path}`,
          path: task.path,
          reason: `フォルダ処理に失敗 (配下は未処理): ${errorMessage_(e)}`,
        });
        completed = true; // 記録した上でキューからは取り除く
      }

      if (!completed) {
        // 時間切れ。タスクはキューに残したまま保存して中断する。
        suspendAndScheduleResume_(state);
        return;
      }

      state.queue.shift();
      state.errorStreak = 0;
      saveState_(state);
    }

    finishMigration_(state);
  } catch (e) {
    // 状態保存の失敗や想定外の例外。連続で起きる場合は自動再開を止める。
    state.errorStreak = (state.errorStreak || 0) + 1;
    Logger.log(`✖ 想定外のエラー (連続 ${state.errorStreak} 回目): ${errorMessage_(e)}`);

    if (state.errorStreak >= 3) {
      state.status = 'ERROR';
      trySaveState_(state);
      deleteResumeTriggers_();
      notify_(
        '【要確認】ドライブ移行がエラーで停止しました',
        `連続 ${state.errorStreak} 回エラーが発生したため自動再開を停止しました。\n\n` +
          `直近のエラー: ${errorMessage_(e)}\n\n` +
          `対処後、GAS エディタから resumeMigration を実行すると再開できます。\n\n` +
          buildReport_(state)
      );
    } else {
      state.status = 'SUSPENDED';
      trySaveState_(state);
      scheduleResume_();
    }
    throw e; // GAS の実行ログにもエラーとして残す
  }
}

/**
 * 1 フォルダ分の処理:
 *   1. フォルダ内の「ファイル」を移行先へ 1 件ずつ移動 (失敗時はコピー救済)
 *   2. サブフォルダを列挙し、移行先に同名フォルダを find-or-create
 *   3. サブフォルダをキューへ追加 (すべて完了した場合のみ)
 *
 * @returns true = このフォルダの処理を完了 / false = 時間切れで中断
 *          (false のときキューには手を付けていないので、再実行で安全にやり直せる)
 */
function processFolder_(task: FolderTask, state: MigrationState, deadline: number): boolean {
  Logger.log(`📁 処理中: ${task.path}`);

  // --- 1. ファイルの移動 ---
  // 先にファイルを動かす。途中で時間切れになっても、移動済みファイルは
  // 移行元から消えているため、次回の一覧には残りだけが出てくる。
  const files = listChildren_(task.src, 'files');
  for (const file of files) {
    if (Date.now() > deadline) return false;
    moveOneFile_(file, task, state);
  }

  // --- 2. サブフォルダの作成 ---
  // キューへの追加は最後にまとめて行う (途中中断で中途半端に積まないため)。
  const newTasks: FolderTask[] = [];
  const subfolders = listChildren_(task.src, 'folders');
  for (const sub of subfolders) {
    if (Date.now() > deadline) return false;
    const childPath = `${task.path}/${sub.name}`;
    const dstId = ensureFolder_(sub.name, task.dst, state, childPath);
    newTasks.push({ src: sub.id, dst: dstId, path: childPath });
  }

  // --- 3. コミット ---
  for (const t of newTasks) state.queue.push(t);
  state.stats.foldersVisited += 1;
  return true;
}

// =====================================================================
// Drive 操作
// =====================================================================

/**
 * 移行先 ID を検証して起点フォルダを決める。
 * 共有ドライブ ID そのもの / 共有ドライブ内フォルダ ID の両方を受け付け、
 * マイドライブ内のフォルダが指定された場合はエラーにする (このスクリプトの
 * 目的は「所有権が組織に移る」共有ドライブへの移行であるため)。
 */
function resolveDestination_(destId: string): { rootId: string; label: string } {
  // まず「共有ドライブ ID そのもの」として解釈を試みる。
  // 共有ドライブの ID は、そのルートフォルダの ID と同一なのでそのまま親に使える。
  try {
    const drive = Drive.Drives.get(destId);
    return { rootId: destId, label: `共有ドライブ「${drive.name}」の直下` };
  } catch (e) {
    // 共有ドライブ ID ではなかった → フォルダ ID として検証する
  }

  const folder = withRetry_('移行先フォルダの取得', () =>
    Drive.Files.get(destId, {
      supportsAllDrives: true,
      fields: 'id, name, mimeType, driveId',
    })
  );
  if (folder.mimeType !== FOLDER_MIME) {
    throw new Error(`DEST_FOLDER_ID がフォルダではありません: ${folder.name} (${folder.mimeType})`);
  }
  if (!folder.driveId) {
    throw new Error(
      `DEST_FOLDER_ID (${folder.name}) は共有ドライブ内にありません。` +
        '移行先には共有ドライブ、または共有ドライブ内のフォルダを指定してください。' +
        '(マイドライブへ移動しても所有権は移行先組織に移りません)'
    );
  }
  const drive = Drive.Drives.get(folder.driveId);
  return {
    rootId: destId,
    label: `共有ドライブ「${drive.name}」内のフォルダ「${folder.name}」`,
  };
}

/**
 * 指定した親フォルダの子アイテムを全件取得する (ページネーション対応)。
 * @param filter 'files' = フォルダ以外すべて / 'folders' = フォルダのみ / 'all' = 両方
 */
function listChildren_(parentId: string, filter: 'files' | 'folders' | 'all'): ChildItem[] {
  const mimeCondition =
    filter === 'folders'
      ? ` and mimeType = '${FOLDER_MIME}'`
      : filter === 'files'
        ? ` and mimeType != '${FOLDER_MIME}'`
        : '';
  const q = `'${parentId}' in parents and trashed = false${mimeCondition}`;

  const items: ChildItem[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const res: DriveV3.FileList = withRetry_('子アイテムの一覧取得', () =>
      Drive.Files.list({
        q: q,
        pageSize: CONFIG.PAGE_SIZE,
        pageToken: pageToken,
        fields: 'nextPageToken, files(id, name, mimeType, ownedByMe)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      })
    );
    for (const f of res.files || []) {
      items.push({
        id: f.id as string,
        name: f.name || '(名称不明)',
        mimeType: f.mimeType || '',
        ownedByMe: f.ownedByMe === true,
      });
    }
    pageToken = res.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * 移行先フォルダ dstParentId の直下に名前 name のフォルダを用意して ID を返す。
 * 既に同名フォルダがあればそれを再利用する (find-or-create)。
 * このおかげで、中断後の再実行や 2 回目の実行でもフォルダが二重にできない。
 */
function ensureFolder_(
  name: string,
  dstParentId: string,
  state: MigrationState,
  pathForLog: string
): string {
  // DRY_RUN で親自体がまだ仮 ID なら、子も仮 ID を返すだけ
  if (dstParentId.indexOf(DRY_RUN_ID_PREFIX) === 0) {
    state.stats.foldersCreated += 1;
    Logger.log(`  [DRY_RUN] フォルダ作成予定: ${pathForLog}`);
    return DRY_RUN_ID_PREFIX + pathForLog;
  }

  // 既存の同名フォルダを探す
  const q =
    `'${dstParentId}' in parents and trashed = false` +
    ` and mimeType = '${FOLDER_MIME}' and name = '${escapeForQuery_(name)}'`;
  const found: DriveV3.FileList = withRetry_('移行先フォルダの検索', () =>
    Drive.Files.list({
      q: q,
      pageSize: 1,
      fields: 'files(id, name)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    })
  );
  const hit = (found.files || [])[0];
  if (hit && hit.id) {
    state.stats.foldersReused += 1;
    return hit.id;
  }

  if (state.dryRun) {
    state.stats.foldersCreated += 1;
    Logger.log(`  [DRY_RUN] フォルダ作成予定: ${pathForLog}`);
    return DRY_RUN_ID_PREFIX + pathForLog;
  }

  const created = withRetry_('移行先フォルダの作成', () =>
    Drive.Files.create(
      { name: name, mimeType: FOLDER_MIME, parents: [dstParentId] },
      null,
      { supportsAllDrives: true, fields: 'id' }
    )
  );
  state.stats.foldersCreated += 1;
  Logger.log(`  📂 フォルダ作成: ${pathForLog}`);
  return created.id as string;
}

/**
 * ファイルを 1 件、移行元フォルダから移行先フォルダへ「移動」する。
 * Drive API では移動 = 「親の付け替え」(addParents / removeParents)。
 * 共有ドライブへ移動した瞬間に、所有者はその共有ドライブ (移行先組織) になる。
 *
 * 移動できない場合 (他人がオーナー等) は COPY_FALLBACK に従いコピーで救済する。
 */
function moveOneFile_(file: ChildItem, task: FolderTask, state: MigrationState): void {
  const label = `${task.path}/${file.name}`;

  if (state.dryRun) {
    state.stats.filesMoved += 1;
    Logger.log(`  [DRY_RUN] 移動予定: ${label}${file.ownedByMe ? '' : ' (⚠ 他人がオーナーのため移動できない可能性)'}`);
    return;
  }

  try {
    withRetry_(`ファイル移動: ${label}`, () =>
      Drive.Files.update({}, file.id, null, {
        addParents: task.dst,
        removeParents: task.src,
        supportsAllDrives: true,
        fields: 'id, parents',
      })
    );
    state.stats.filesMoved += 1;
    Logger.log(`  ✅ 移動: ${label}`);
    return;
  } catch (moveErr) {
    if (!CONFIG.COPY_FALLBACK) {
      recordFailure_(state, {
        fileId: file.id,
        name: file.name,
        path: task.path,
        reason: `移動失敗: ${errorMessage_(moveErr)}`,
      });
      return;
    }

    // --- コピーによる救済 ---
    try {
      withRetry_(`ファイルコピー: ${label}`, () =>
        Drive.Files.copy({ name: file.name, parents: [task.dst] }, file.id, {
          supportsAllDrives: true,
          fields: 'id',
        })
      );
      state.stats.filesCopied += 1;
      Logger.log(`  🔁 コピーで救済: ${label} (移動不可: ${errorMessage_(moveErr)})`);

      if (CONFIG.TRASH_ORIGINAL_AFTER_COPY && file.ownedByMe) {
        withRetry_(`元ファイルをゴミ箱へ: ${label}`, () =>
          Drive.Files.update({ trashed: true }, file.id, null, { supportsAllDrives: true })
        );
        Logger.log(`  🗑 元ファイルをゴミ箱へ: ${label}`);
      }
    } catch (copyErr) {
      recordFailure_(state, {
        fileId: file.id,
        name: file.name,
        path: task.path,
        reason:
          `移動失敗: ${errorMessage_(moveErr)} / コピーも失敗: ${errorMessage_(copyErr)}`,
      });
    }
  }
}

/** 移行完了後の後片付け: 空フォルダを深い階層から順にゴミ箱へ入れる。 */
function trashIfEmptyRecursive_(folderId: string, path: string, ownedByMe: boolean): boolean {
  const children = listChildren_(folderId, 'all');
  let allCleared = true;

  for (const child of children) {
    if (child.mimeType === FOLDER_MIME) {
      if (!trashIfEmptyRecursive_(child.id, `${path}/${child.name}`, child.ownedByMe)) {
        allCleared = false;
      }
    } else {
      Logger.log(`  ⏭ ファイルが残っているため残置: ${path}/${child.name}`);
      allCleared = false;
    }
  }

  if (!allCleared) return false;

  if (!ownedByMe) {
    Logger.log(`  ⏭ 他人がオーナーのフォルダは残置: ${path}`);
    return false;
  }
  if (CONFIG.DRY_RUN) {
    Logger.log(`  [DRY_RUN] 空フォルダをゴミ箱に入れる予定: ${path}`);
    return true;
  }
  withRetry_(`空フォルダをゴミ箱へ: ${path}`, () =>
    Drive.Files.update({ trashed: true }, folderId, null, { supportsAllDrives: true })
  );
  Logger.log(`  🗑 空フォルダをゴミ箱へ: ${path}`);
  return true;
}

// =====================================================================
// 中断・再開 (トリガー)
// =====================================================================

/** 状態を保存し、自動再開トリガーを仕掛けて中断する。 */
function suspendAndScheduleResume_(state: MigrationState): void {
  state.status = 'SUSPENDED';
  saveState_(state);
  scheduleResume_();
  Logger.log(
    `⏸ 制限時間に達したため中断しました (残りフォルダ: ${state.queue.length})。` +
      `約 ${Math.round(CONFIG.RESUME_DELAY_MS / 1000)} 秒後に自動再開します。`
  );
}

/** RESUME_DELAY_MS 後に resumeMigration を 1 回呼ぶ時間主導トリガーを作る。 */
function scheduleResume_(): void {
  deleteResumeTriggers_(); // 二重予約防止
  ScriptApp.newTrigger(RESUME_HANDLER).timeBased().after(CONFIG.RESUME_DELAY_MS).create();
}

/** resumeMigration を呼ぶトリガーをすべて削除する。 */
function deleteResumeTriggers_(): void {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === RESUME_HANDLER) {
      ScriptApp.deleteTrigger(t);
    }
  }
}

/** キューが空になったときの完了処理。 */
function finishMigration_(state: MigrationState): void {
  state.status = 'DONE';
  saveState_(state);
  deleteResumeTriggers_();

  const report = buildReport_(state);
  Logger.log(report);
  notify_(
    state.dryRun
      ? '【DRY_RUN 完了】ドライブ移行の計画確認が終わりました'
      : '【完了】ドライブ移行が終わりました',
    report
  );
}

// =====================================================================
// 状態の保存と読み込み (スクリプトプロパティ + チャンク分割)
// =====================================================================

function newState_(dryRun: boolean): MigrationState {
  return {
    status: 'RUNNING',
    dryRun: dryRun,
    queue: [],
    stats: {
      foldersVisited: 0,
      foldersCreated: 0,
      foldersReused: 0,
      filesMoved: 0,
      filesCopied: 0,
      filesFailed: 0,
    },
    failures: [],
    errorStreak: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 状態をスクリプトプロパティへ保存する。
 * 1 値 9KB 制限を回避するため JSON を 8000 文字ごとに分割して保存し、
 * メタ情報 (チャンク数) を別キーに持つ。
 */
function saveState_(state: MigrationState): void {
  state.updatedAt = new Date().toISOString();
  const json = JSON.stringify(state);
  if (json.length > STATE_TOTAL_LIMIT) {
    throw new Error(
      `移行状態が大きくなりすぎました (${json.length} 文字)。` +
        'フォルダ数が非常に多い場合は、サブフォルダごとに SOURCE_FOLDER_ID を' +
        '指定して分割実行してください。'
    );
  }

  const props = PropertiesService.getScriptProperties();
  const prevMetaRaw = props.getProperty(STATE_META_KEY);
  const prevChunkCount = prevMetaRaw ? (JSON.parse(prevMetaRaw).chunkCount as number) : 0;

  const payload: { [key: string]: string } = {};
  let chunkCount = 0;
  for (let i = 0; i < json.length; i += STATE_CHUNK_SIZE) {
    payload[STATE_CHUNK_KEY_PREFIX + chunkCount] = json.substring(i, i + STATE_CHUNK_SIZE);
    chunkCount += 1;
  }
  payload[STATE_META_KEY] = JSON.stringify({ chunkCount: chunkCount });
  props.setProperties(payload);

  // 前回より短くなった分の余りチャンクを掃除する
  for (let i = chunkCount; i < prevChunkCount; i++) {
    props.deleteProperty(STATE_CHUNK_KEY_PREFIX + i);
  }
}

/** saveState_ の失敗をログに落とすだけの安全版 (エラー処理中に使う)。 */
function trySaveState_(state: MigrationState): void {
  try {
    saveState_(state);
  } catch (e) {
    Logger.log(`⚠ 状態の保存に失敗しました: ${errorMessage_(e)}`);
  }
}

/** 保存された状態を読み込む。無ければ null。 */
function loadState_(): MigrationState | null {
  const props = PropertiesService.getScriptProperties();
  const metaRaw = props.getProperty(STATE_META_KEY);
  if (!metaRaw) return null;

  const chunkCount = JSON.parse(metaRaw).chunkCount as number;
  let json = '';
  for (let i = 0; i < chunkCount; i++) {
    const chunk = props.getProperty(STATE_CHUNK_KEY_PREFIX + i);
    if (chunk === null) {
      Logger.log(`⚠ 状態データの一部 (チャンク ${i}) が見つかりません。状態を破棄します。`);
      return null;
    }
    json += chunk;
  }
  return JSON.parse(json) as MigrationState;
}

/** 状態保存に使ったスクリプトプロパティをすべて削除する。 */
function clearStateStorage_(): void {
  const props = PropertiesService.getScriptProperties();
  const metaRaw = props.getProperty(STATE_META_KEY);
  if (metaRaw) {
    const chunkCount = JSON.parse(metaRaw).chunkCount as number;
    for (let i = 0; i < chunkCount; i++) {
      props.deleteProperty(STATE_CHUNK_KEY_PREFIX + i);
    }
    props.deleteProperty(STATE_META_KEY);
  }
}

// =====================================================================
// ユーティリティ
// =====================================================================

/** CONFIG の書き換え忘れを実行前に検出する。 */
function validateConfig_(): void {
  if (!CONFIG.SOURCE_FOLDER_ID || CONFIG.SOURCE_FOLDER_ID.indexOf('<<<') === 0) {
    throw new Error('CONFIG.SOURCE_FOLDER_ID に移行元フォルダの ID を設定してください。');
  }
  if (!CONFIG.DEST_FOLDER_ID || CONFIG.DEST_FOLDER_ID.indexOf('<<<') === 0) {
    throw new Error('CONFIG.DEST_FOLDER_ID に移行先 (共有ドライブ) の ID を設定してください。');
  }
  if (CONFIG.SOURCE_FOLDER_ID === CONFIG.DEST_FOLDER_ID) {
    throw new Error('移行元と移行先が同じ ID です。');
  }
}

/**
 * Drive API の一時的なエラー (レート制限・サーバエラー) を
 * 指数バックオフ (待ち時間を 2 倍ずつ延ばす) でリトライする。
 * 権限不足など恒久的なエラーは即座に投げ直す。
 */
function withRetry_<T>(label: string, fn: () => T): T {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // 1, 2, 4, 8, 16 秒 + ランダムなゆらぎ (同時リトライの衝突を避ける)
      const waitMs = Math.min(Math.pow(2, attempt - 1) * 1000, 32000) + Math.floor(Math.random() * 500);
      Utilities.sleep(waitMs);
    }
    try {
      return fn();
    } catch (e) {
      lastError = e;
      if (!isTransientError_(e)) {
        throw e; // リトライしても直らない種類のエラー
      }
      Logger.log(`  ↻ 一時エラーのためリトライします (${attempt + 1}/${CONFIG.MAX_RETRIES}): ${label}`);
    }
  }
  throw new Error(`リトライ上限に達しました: ${label} / 最後のエラー: ${errorMessage_(lastError)}`);
}

/** リトライで回復する見込みのあるエラーか判定する。 */
function isTransientError_(e: unknown): boolean {
  const msg = errorMessage_(e);
  return /(429|500|502|503|rate ?limit|ratelimitexceeded|userratelimitexceeded|quota|internal error|backend error|timed? ?out|transient)/i.test(
    msg
  );
}

function errorMessage_(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Drive API の検索クエリ (q パラメータ) 用に名前をエスケープする。 */
function escapeForQuery_(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** 失敗を統計と一覧に記録する (一覧は上限あり)。 */
function recordFailure_(state: MigrationState, failure: FailureRecord): void {
  state.stats.filesFailed += 1;
  if (state.failures.length < MAX_RECORDED_FAILURES) {
    state.failures.push(failure);
  } else if (state.failures.length === MAX_RECORDED_FAILURES) {
    state.failures.push({
      fileId: '-',
      name: '-',
      path: '-',
      reason: `(これ以上の失敗詳細は記録上限 ${MAX_RECORDED_FAILURES} 件を超えたため省略)`,
    });
  }
  Logger.log(`  ✖ 失敗: ${failure.path}/${failure.name} — ${failure.reason}`);
}

/** 進捗レポート文字列を組み立てる。 */
function buildReport_(state: MigrationState): string {
  const s = state.stats;
  const lines = [
    '================ 移行レポート ================',
    `状態        : ${state.status}${state.dryRun ? ' (DRY_RUN)' : ''}`,
    `開始        : ${state.startedAt}`,
    `最終更新    : ${state.updatedAt}`,
    `処理フォルダ: ${s.foldersVisited}`,
    `作成フォルダ: ${s.foldersCreated} (既存を再利用: ${s.foldersReused})`,
    `移動ファイル: ${s.filesMoved}`,
    `コピー救済  : ${s.filesCopied}`,
    `失敗        : ${s.filesFailed}`,
    `残りフォルダ: ${state.queue.length}`,
    '=============================================',
  ];
  if (state.failures.length > 0) {
    lines.push('--- 失敗一覧 ---');
    for (const f of state.failures) {
      lines.push(`- ${f.path}/${f.name} (${f.fileId}): ${f.reason}`);
    }
  }
  return lines.join('\n');
}

/** NOTIFY_EMAIL が設定されていればメール通知する。失敗しても処理は続ける。 */
function notify_(subject: string, body: string): void {
  if (!CONFIG.NOTIFY_EMAIL) return;
  try {
    MailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, body);
  } catch (e) {
    Logger.log(`⚠ メール通知に失敗しました: ${errorMessage_(e)}`);
  }
}
