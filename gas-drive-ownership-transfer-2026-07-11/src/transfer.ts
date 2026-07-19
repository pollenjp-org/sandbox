/**
 * 所有権譲渡の中核ロジック。
 *
 * GAS には「1 回の実行は最大 6 分」という制限があるため、
 *   1. 制限時間内で処理できるところまで進める(= 1 バッチ)
 *   2. 時間切れが近づいたら進捗をスクリプトプロパティに保存する
 *   3. 時間主導トリガーで自分自身を起動し直して続きを処理する
 * という「バッチ処理 + チェックポイント + 自動再開」の構成をとる。
 */

/**
 * 走査戦略を指定して一括譲渡を開始する(sheet.ts のメニューから呼ばれる)。
 * options には「設定」シートから読み取った実行設定と、ダイアログを素早く
 * 返すための「最初のバッチだけ短い時間予算」を渡す。
 */
function startTransferWithStrategy(strategy: TransferStrategy, options: TransferStartOptions): void {
  // 同じ利用者のメニュー操作とトリガー実行が同時に走らないよう、ユーザーロックで排他する。
  // (ユーザーロックは利用者ごとに独立しているため、別の利用者の実行は妨げない)
  const lock = LockService.getUserLock();
  if (!lock.tryLock(CONFIG.lockWaitMs)) {
    throw new Error(
      '別の実行が進行中のためロックを取得できませんでした。しばらく待ってから再実行してください。'
    );
  }
  try {
    if (loadState() !== null) {
      throw new Error(
        '未完了の処理が残っています。メニューの「進捗を確認」で状況を見るか、「停止(リセット)」してから開始してください。'
      );
    }
    // 前回の実行の残骸(再開トリガー)が残っていれば掃除する
    deleteResumeTriggers();

    const state = createInitialState(strategy, options);
    if (strategy === 'tree') {
      const root = resolveRootFolder(options.rootFolderId);
      state.folderQueue.push(root.getId());
      // 指定した起点フォルダ自身は走査中に列挙されないため、ここで譲渡する。
      // (マイドライブのルートが指定された場合、ルート自体は譲渡できないため対象外)
      if (state.includeFolders && root.getId() !== DriveApp.getRootFolder().getId()) {
        transferOwnershipIfOwned(root, state, 'folder');
      }
    }
    logStartBanner(state);
    runBatch(state, options.maxRuntimeMs);
  } finally {
    lock.releaseLock();
  }
}

/** 実行設定を検証し、実行状態の初期値を作る */
function createInitialState(strategy: TransferStrategy, options: TransferStartOptions): TransferState {
  const myEmail = Session.getEffectiveUser().getEmail();
  const newOwnerEmail = options.newOwnerEmail.trim();
  if (newOwnerEmail === '' || newOwnerEmail.indexOf('@') === -1) {
    throw new Error('譲渡先のメールアドレスを設定してください。');
  }
  if (newOwnerEmail.toLowerCase() === myEmail.toLowerCase()) {
    throw new Error('譲渡先が自分自身になっています。譲渡先のメールアドレスを確認してください。');
  }
  return {
    strategy,
    myEmail,
    newOwnerEmail,
    dryRun: options.dryRun,
    method: options.method,
    includeFolders: CONFIG.includeFolders,
    startedAt: new Date().toISOString(),
    batchCount: 1,
    folderQueue: [],
    current: null,
    searchPhase: 'files',
    searchToken: null,
    stats: {
      scanned: 0,
      transferred: 0,
      invited: 0,
      planned: 0,
      skippedNotOwned: 0,
      skippedUnsupported: 0,
      errors: 0,
    },
  };
}

/**
 * フォルダ ID の入力値を正規化する。
 * Drive のフォルダ URL がそのまま貼り付けられた場合は ID 部分を取り出す。
 */
function normalizeFolderIdInput(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\/folders\/([A-Za-z0-9_-]+)/);
  return match !== null ? match[1] : trimmed;
}

/**
 * 走査の起点となるフォルダを解決する。
 * 「うっかりマイドライブ全体を対象にしてしまう」事故を防ぐため、
 * 空文字(未指定)はエラーにして、必ず明示的なフォルダ ID を要求する。
 */
function resolveRootFolder(rootFolderId: string): GoogleAppsScript.Drive.Folder {
  if (rootFolderId === '') {
    throw new Error('対象フォルダの ID が指定されていません。「設定」シートの B3 に入力してください。');
  }
  try {
    return DriveApp.getFolderById(rootFolderId);
  } catch (e) {
    throw new Error(
      `起点フォルダが見つかりません: ${rootFolderId}(アクセス権と ID を確認してください)`
    );
  }
}

/**
 * 1 バッチ分の処理を実行する。
 * 時間切れで中断した場合は状態を保存して再開トリガーを予約し、
 * 最後まで到達した場合は完了処理を行う。
 */
function runBatch(state: TransferState, maxRuntimeMsOverride?: number): void {
  const budgetMs = maxRuntimeMsOverride !== undefined ? maxRuntimeMsOverride : CONFIG.maxRuntimeMs;
  const deadline = Date.now() + budgetMs;
  const suspended =
    state.strategy === 'tree' ? runTreeBatch(state, deadline) : runSearchBatch(state, deadline);
  if (suspended) {
    saveState(state);
    scheduleResume();
    logProgress(state, '制限時間が近づいたため、いったん中断しました');
  } else {
    finishTransfer(state);
  }
  // このバッチで溜めたログ行を「譲渡ログ」シートへまとめて書き出す
  flushSheetLog();
}

/**
 * ツリー走査: フォルダキューから 1 つずつ取り出し、
 *   フェーズ 1: フォルダ直下のファイルを処理
 *   フェーズ 2: サブフォルダを処理してキューの末尾に追加(幅優先探索)
 * を繰り返す。時間切れなら継続トークンを state に記録して true を返す。
 */
function runTreeBatch(state: TransferState, deadline: number): boolean {
  while (true) {
    if (Date.now() >= deadline) {
      return true;
    }
    let progress = state.current;
    if (progress === null) {
      const nextFolderId = state.folderQueue.shift();
      if (nextFolderId === undefined) {
        return false; // キューが空 = すべて処理済み
      }
      progress = { folderId: nextFolderId, phase: 'files', token: null };
      state.current = progress;
    }

    // フェーズ 1: フォルダ直下のファイル
    if (progress.phase === 'files') {
      const files =
        progress.token !== null
          ? DriveApp.continueFileIterator(progress.token)
          : DriveApp.getFolderById(progress.folderId).getFiles();
      while (files.hasNext()) {
        if (Date.now() >= deadline) {
          progress.token = files.getContinuationToken();
          return true;
        }
        transferOwnershipIfOwned(files.next(), state, 'file');
      }
      progress.phase = 'subfolders';
      progress.token = null;
    }

    // フェーズ 2: サブフォルダ(譲渡 + キューへの追加)
    const folders =
      progress.token !== null
        ? DriveApp.continueFolderIterator(progress.token)
        : DriveApp.getFolderById(progress.folderId).getFolders();
    while (folders.hasNext()) {
      if (Date.now() >= deadline) {
        progress.token = folders.getContinuationToken();
        return true;
      }
      const subfolder = folders.next();
      if (state.includeFolders) {
        transferOwnershipIfOwned(subfolder, state, 'folder');
      }
      state.folderQueue.push(subfolder.getId());
    }
    state.current = null; // このフォルダは完了。次のループでキューから取り出す
  }
}

/**
 * 検索走査: フォルダ階層に関係なく「自分が所有する」全アイテムを
 * Drive の検索クエリで列挙して処理する。時間切れなら true を返す。
 *
 * 注意: 本番実行(dryRun = false)では、譲渡したアイテムが検索結果から
 * 消えていくため、継続トークンでの再開時に取りこぼしが発生することがある。
 * 完了後にメニューの「所有アイテム数を確認」で残数を確認し、必要なら再実行する。
 */
function runSearchBatch(state: TransferState, deadline: number): boolean {
  if (state.searchPhase === 'files') {
    const files =
      state.searchToken !== null
        ? DriveApp.continueFileIterator(state.searchToken)
        : DriveApp.searchFiles(OWNED_ITEMS_QUERY);
    while (files.hasNext()) {
      if (Date.now() >= deadline) {
        state.searchToken = files.getContinuationToken();
        return true;
      }
      transferOwnershipIfOwned(files.next(), state, 'file');
    }
    state.searchPhase = 'folders';
    state.searchToken = null;
  }

  if (!state.includeFolders) {
    return false;
  }
  const folders =
    state.searchToken !== null
      ? DriveApp.continueFolderIterator(state.searchToken)
      : DriveApp.searchFolders(OWNED_ITEMS_QUERY);
  while (folders.hasNext()) {
    if (Date.now() >= deadline) {
      state.searchToken = folders.getContinuationToken();
      return true;
    }
    transferOwnershipIfOwned(folders.next(), state, 'folder');
  }
  return false;
}

/**
 * Advanced Drive Service(高度な Drive サービス / Drive API v3)を返す。
 * appsscript.json の enabledAdvancedServices で有効化していないと undefined になるため、
 * その場合は分かりやすいエラーにする。
 */
function driveApi(): GoogleAppsScript.Drive {
  if (Drive === undefined) {
    throw new Error(
      'Advanced Drive Service(Drive)が有効化されていません。' +
        'Apps Script エディタの「サービス」で Drive API を追加するか、appsscript.json の enabledAdvancedServices を確認してください。'
    );
  }
  return Drive;
}

/**
 * ファイルが Google ネイティブ形式(ドキュメント/スプレッドシート/スライド等)かどうか。
 * 招待方式(個人アカウント)で所有権を移転できるのはネイティブ形式のファイルだけ。
 * ここに渡ってくるのは kind === 'file' のアイテムのみ(フォルダは呼び出し側で除外済み)。
 */
function isGoogleNativeFile(item: DriveItem): boolean {
  const mimeType = (item as GoogleAppsScript.Drive.File).getMimeType();
  return mimeType.indexOf(GOOGLE_NATIVE_MIME_PREFIX) === 0 && mimeType !== FOLDER_MIME_TYPE;
}

/**
 * アイテムが自分の所有物であれば所有権を譲渡する。
 * - direct(直接譲渡): DriveApp.setOwner() による即時譲渡(Workspace 同一ドメイン向け)。
 * - invite(招待方式): Drive API v3 の pendingOwner による招待(個人アカウント向け)。
 *   ネイティブ形式のファイルのみが対象で、フォルダ・非ネイティブ形式は「対象外」として記録する。
 * DRY RUN 中はログ出力のみ。個々の失敗は記録して処理を続行する。
 */
function transferOwnershipIfOwned(item: DriveItem, state: TransferState, kind: 'file' | 'folder'): void {
  state.stats.scanned++;
  const kindLabel = kind === 'file' ? 'ファイル' : 'フォルダ';
  let name = '(名称不明)';
  let id = '';
  try {
    id = item.getId();
    name = item.getName();
    const label = `${kindLabel}「${name}」(id: ${id})`;
    // 共有ドライブ内のアイテムには所有者がいないため null が返ることがある
    const owner: GoogleAppsScript.Base.User | null = item.getOwner();
    const ownerEmail = owner === null ? '' : owner.getEmail();
    if (ownerEmail.toLowerCase() !== state.myEmail.toLowerCase()) {
      state.stats.skippedNotOwned++;
      return;
    }
    if (state.method === 'invite') {
      // 招待方式(個人アカウント向け): pendingOwner を立てて「招待」する。
      // 個人アカウントで移転できるのは Google ネイティブ形式のファイルのみ。
      // フォルダ・非ネイティブ形式(PDF/Office 等)は対象外として記録しスキップする。
      if (kind === 'folder' || !isGoogleNativeFile(item)) {
        state.stats.skippedUnsupported++;
        const reason =
          kind === 'folder'
            ? 'フォルダは招待方式(個人アカウント)では移転できません'
            : '非ネイティブ形式(PDF/Office 等)は招待方式では移転できません';
        console.log(`対象外: ${label}(${reason})`);
        recordSheetLog(state, '対象外', kindLabel, name, id, reason);
        return;
      }
      if (state.dryRun) {
        state.stats.planned++;
        console.log(`[DRY RUN] 招待対象: ${label}`);
        recordSheetLog(state, 'DRY RUN 招待対象', kindLabel, name, id, '');
        return;
      }
      driveApi().Permissions.create(
        { role: 'writer', type: 'user', emailAddress: state.newOwnerEmail, pendingOwner: true },
        id
      );
      state.stats.invited++;
      console.log(`招待済み: ${label}`);
      recordSheetLog(state, '招待済み', kindLabel, name, id, '受信側で「承諾」の実行が必要');
      return;
    }

    // 直接譲渡(Workspace 同一ドメイン向け): setOwner による即時譲渡。
    if (state.dryRun) {
      state.stats.planned++;
      console.log(`[DRY RUN] 譲渡対象: ${label}`);
      recordSheetLog(state, 'DRY RUN 対象', kindLabel, name, id, '');
      return;
    }
    item.setOwner(state.newOwnerEmail);
    state.stats.transferred++;
    console.log(`譲渡完了: ${label}`);
    recordSheetLog(state, '譲渡完了', kindLabel, name, id, '');
  } catch (e) {
    state.stats.errors++;
    const message = e instanceof Error ? e.message : String(e);
    console.error(`譲渡失敗: ${kindLabel}「${name}」(id: ${id}): ${message}`);
    recordSheetLog(state, 'エラー', kindLabel, name, id, message);
  }
}

/** すべて処理し終えたときの完了処理 */
function finishTransfer(state: TransferState): void {
  clearState();
  deleteResumeTriggers();
  logProgress(state, 'すべての処理が完了しました');
  const s = state.stats;
  const doneLabel = state.dryRun
    ? `${state.method === 'invite' ? '招待' : '譲渡'}対象 ${s.planned} 件`
    : state.method === 'invite'
      ? `招待済み ${s.invited} 件 / 対象外 ${s.skippedUnsupported} 件`
      : `譲渡済み ${s.transferred} 件`;
  recordSheetLog(
    state,
    'サマリ',
    '-',
    'すべての処理が完了しました',
    '',
    `走査 ${s.scanned} 件 / ${doneLabel} / エラー ${s.errors} 件`
  );
  if (state.strategy === 'search' && !state.dryRun) {
    console.log(
      '検索走査では譲渡により検索結果が変化するため、取りこぼしが残ることがあります。' +
        'メニューの「所有アイテム数を確認」で残数を確認し、残っていれば「開始(検索走査)」をもう一度実行してください。'
    );
  }
}

/**
 * 中断した処理を再開する。
 * 通常は時間主導トリガーが自動で呼び出す(手動で実行しても安全)。
 * トリガーは作成した利用者として実行されるため、その利用者自身の
 * 進捗(ユーザープロパティ)を読んで続きを処理する。
 */
function resumeTransfer(): void {
  // 発火済みの一回限りのトリガーは自動では消えないため、まず掃除する
  deleteResumeTriggers();
  const lock = LockService.getUserLock();
  if (!lock.tryLock(CONFIG.lockWaitMs)) {
    console.warn('別の実行が進行中です。再開を後回しにします。');
    scheduleResume();
    return;
  }
  try {
    const state = loadState();
    if (state === null) {
      console.log('再開する処理はありません。');
      return;
    }
    state.batchCount++;
    console.log(`バッチ ${state.batchCount} 回目を開始します。`);
    runBatch(state);
  } finally {
    lock.releaseLock();
  }
}

/** 実行中の処理を止めて、保存された状態と再開トリガーをリセットする(メニューの「停止」から呼ばれる) */
function stopTransfer(): void {
  deleteResumeTriggers();
  const state = loadState();
  if (state !== null) {
    logProgress(state, '処理を中止し、状態をリセットします');
  } else {
    console.log('保存された状態はありません(トリガーの掃除のみ行いました)。');
  }
  clearState();
}

/**
 * 自分が所有するアイテム数の概算メッセージを作る(上限 1,000 件)。
 * 実行前の規模把握と、実行後の「残っていないか」の確認に使う。
 */
function describeOwnedItems(): string {
  const limit = 1000;
  let fileCount = 0;
  const files = DriveApp.searchFiles(OWNED_ITEMS_QUERY);
  while (files.hasNext() && fileCount < limit) {
    files.next();
    fileCount++;
  }
  let folderCount = 0;
  const folders = DriveApp.searchFolders(OWNED_ITEMS_QUERY);
  while (folders.hasNext() && folderCount < limit) {
    folders.next();
    folderCount++;
  }
  const format = (n: number): string => (n >= limit ? `${limit} 件以上` : `${n} 件`);
  return `自分が所有するアイテム: ファイル ${format(fileCount)} / フォルダ ${format(folderCount)}`;
}

/** 開始時の告知ログ */
function logStartBanner(state: TransferState): void {
  const mode = state.strategy === 'tree' ? 'ツリー走査' : '検索走査';
  const methodLabel = state.method === 'invite' ? '招待方式' : '直接譲渡';
  console.log(
    `所有権の一括譲渡を開始します: ${state.myEmail} → ${state.newOwnerEmail}(${mode} / ${methodLabel})`
  );
  if (state.method === 'invite') {
    console.log(
      '招待方式: Google ネイティブ形式のファイルのみを pendingOwner で招待します。' +
        'フォルダ・非ネイティブ形式は対象外です。受信側での「承諾」が必要です。'
    );
  }
  if (state.dryRun) {
    console.log('[DRY RUN] 実際の譲渡・招待は行いません。対象の列挙とログ出力のみ行います。');
  } else {
    console.warn('本番モードです。所有権の譲渡(または招待)を実際に実行します。');
  }
}

/** 進捗・結果のサマリをログに出力する */
function logProgress(state: TransferState, headline: string): void {
  console.log(formatProgress(state, headline));
}

/** 進捗・結果のサマリを整形する(ログ出力とシート UI のダイアログで共用) */
function formatProgress(state: TransferState, headline: string): string {
  const s = state.stats;
  const methodLabel = state.method === 'invite' ? '招待方式' : '直接譲渡';
  const lines = [
    `=== ${headline} ===`,
    `モード: ${state.strategy === 'tree' ? 'ツリー走査' : '検索走査'} / ${methodLabel}${state.dryRun ? ' (DRY RUN)' : ''}`,
    `譲渡先: ${state.newOwnerEmail}`,
    `バッチ回数: ${state.batchCount}`,
    `走査済み: ${s.scanned} 件`,
  ];
  if (state.dryRun) {
    lines.push(`${state.method === 'invite' ? '招待' : '譲渡'}対象 (DRY RUN): ${s.planned} 件`);
  } else if (state.method === 'invite') {
    lines.push(`招待済み: ${s.invited} 件`);
  } else {
    lines.push(`譲渡済み: ${s.transferred} 件`);
  }
  lines.push(`スキップ(自分の所有物でない): ${s.skippedNotOwned} 件`);
  if (state.method === 'invite') {
    lines.push(`対象外(フォルダ・非ネイティブ形式): ${s.skippedUnsupported} 件`);
  }
  lines.push(`エラー: ${s.errors} 件`);
  if (state.strategy === 'tree') {
    lines.push(`未処理のフォルダキュー: ${state.folderQueue.length} 件`);
  }
  lines.push(`開始時刻: ${state.startedAt}`);
  return lines.join('\n');
}
