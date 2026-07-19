"use strict";
/**
 * =====================================================================
 *  マイドライブ → 別ドメイン共有ドライブ 移行ツール
 *  (スプレッドシート UI 版)
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
 * 【操作方法】
 *   このスクリプトは Google スプレッドシートに紐づく (container-bound)。
 *   利用者はコードを一切触らず、スプレッドシートの
 *     - 「設定」シート        … 移行元/移行先フォルダ ID や各種設定を入力
 *     - メニュー「📁 ドライブ移行」… 開始・進捗確認・中止などの操作
 *     - 「進捗」/「失敗一覧」シート … 実行状況の確認
 *   だけで完結する。詳細は docs/textbook/03_setup_guide.md を参照。
 *
 * 【どのアカウントで実行するか】
 *   ★ 移行元アカウント (ファイルのオーナー) で実行する ★
 *   マイドライブからファイルを持ち出せるのは原則オーナーだけのため。
 *   事前に移行先の共有ドライブへ、移行元アカウントを
 *   「コンテンツ管理者」以上のメンバーとして追加しておくこと。
 */
// =====================================================================
// スプレッドシート UI の定義
// =====================================================================
/** シート名 */
const SHEET_SETTINGS = '設定';
const SHEET_STATUS = '進捗';
const SHEET_FAILURES = '失敗一覧';
const SHEET_SKIPPED = 'スキップ一覧';
/** 設定シートの列レイアウト (1 始まり) */
const COL_LABEL = 1; // A: 設定項目 (保護)
const COL_VALUE = 2; // B: 入力値 (ユーザーが編集する唯一の列)
const COL_DESC = 3; // C: 説明 (保護)
/** 設定項目が始まる行 (1: タイトル, 2: 見出し, 3〜: 各設定) */
const SETTINGS_HEADER_ROWS = 2;
/**
 * 設定シートに並べる項目の定義 (ここに 1 行足すだけで設定項目が増える)。
 * ラベルは設定シート A 列と対応し、値の読み書きのキーになる。
 */
const SETTING_DEFS = [
    {
        key: 'SOURCE_FOLDER_ID',
        label: '移行元フォルダID',
        description: 'マイドライブで対象フォルダを開いた URL の /folders/ 以降の文字列。例: 1AbCdEf...',
        type: 'string',
        default: '',
        required: true,
    },
    {
        key: 'DEST_FOLDER_ID',
        label: '移行先ID（共有ドライブ or その中のフォルダ）',
        description: '共有ドライブそのもの、または共有ドライブ内フォルダの ID。URL の /folders/ 以降。マイドライブ内は指定不可。',
        type: 'string',
        default: '',
        required: true,
    },
    {
        key: 'DRY_RUN',
        label: 'ドライラン（お試し・変更なし）',
        description: 'チェックすると一切変更せず、実行予定の操作を「進捗」シートとログに出すだけ。まずこれで確認し、本実行時にチェックを外す。',
        type: 'boolean',
        default: true,
    },
    {
        key: 'CREATE_TOP_FOLDER',
        label: '移行先にトップフォルダを作る',
        description: 'チェック: 移行先に「移行元と同名フォルダ」を作りその中へ移行。外す: 移行先フォルダ直下へ中身を直接展開。',
        type: 'boolean',
        default: true,
    },
    {
        key: 'COPY_FALLBACK',
        label: '移動失敗時にコピーで救済',
        description: '自分が所有するファイルの移動が失敗した場合にコピーで救済する。コピーはファイル ID が変わる点に注意。※他人所有ファイルはそもそも処理せずスキップする(救済対象外)。',
        type: 'boolean',
        default: true,
    },
    {
        key: 'TRASH_ORIGINAL_AFTER_COPY',
        label: 'コピー救済後に元ファイルを削除',
        description: 'コピーで救済したあと、元ファイル(自分所有)をゴミ箱に入れる。',
        type: 'boolean',
        default: false,
    },
    {
        key: 'LEAVE_BREADCRUMB',
        label: '移動元に案内ファイル(.txt)を残す',
        description: '各フォルダの中身を移動したあと、移動元フォルダに「このフォルダの中身は移動しました.txt」を作り、移行先フォルダのリンクを記載する。フォルダ自体は移動できないため、旧フォルダを見た人に移行先を知らせる目印になる。',
        type: 'boolean',
        default: true,
    },
    {
        key: 'NOTIFY_EMAIL',
        label: '完了通知メール（空欄可）',
        description: '完了・エラー停止時に通知するメールアドレス。空欄なら通知しない。',
        type: 'string',
        default: '',
    },
    {
        key: 'TIME_LIMIT_MS',
        label: '[詳細] 1回の実行制限（ミリ秒）',
        description: 'GAS の約6分制限より短く。既定 270000 (=4.5分)。通常変更不要。',
        type: 'number',
        default: 270000,
    },
    {
        key: 'RESUME_DELAY_MS',
        label: '[詳細] 自動再開までの待機（ミリ秒）',
        description: '既定 60000 (=60秒)。通常変更不要。',
        type: 'number',
        default: 60000,
    },
    {
        key: 'PAGE_SIZE',
        label: '[詳細] 一覧取得のページ件数',
        description: '最大 1000。既定 1000。通常変更不要。',
        type: 'number',
        default: 1000,
    },
    {
        key: 'MAX_RETRIES',
        label: '[詳細] API リトライ回数',
        description: '一時エラー時の最大リトライ回数。既定 5。通常変更不要。',
        type: 'number',
        default: 5,
    },
];
// ---------------------------------------------------------------------
// 内部定数
// ---------------------------------------------------------------------
const FOLDER_MIME = 'application/vnd.google-apps.folder';
/** 状態保存に使うスクリプトプロパティのキー */
const STATE_META_KEY = 'MIGRATION_STATE_META';
const STATE_CHUNK_KEY_PREFIX = 'MIGRATION_STATE_CHUNK_';
/** スクリプトプロパティ 1 値の制限 (約9KB) を避けるための分割サイズ */
const STATE_CHUNK_SIZE = 8000;
/** 状態 JSON 全体の安全上限 (全体500KB制限に余裕を持たせる) */
const STATE_TOTAL_LIMIT = 400000;
/** 失敗の詳細を記録する最大件数 */
const MAX_RECORDED_FAILURES = 300;
/** 自動再開トリガーが呼び出す関数名 */
const RESUME_HANDLER = 'resumeMigration';
/** DRY_RUN 中に「作ったことにした」フォルダへ振る仮 ID の接頭辞 */
const DRY_RUN_ID_PREFIX = 'dryrun:';
/**
 * 移動元フォルダに残す案内ファイルの名前。
 * この名前のファイルは「移行ツールが作った目印」とみなし、移行先へは移動しない
 * (再実行でも移動されない)。
 */
const BREADCRUMB_NAME = 'このフォルダの中身は移動しました.txt';
/**
 * 失敗の分類。進捗シートの内訳と「失敗一覧」シートの「種別」列に使う。
 * ここに並べた順で進捗シートに内訳行が出る (件数 0 でも常に表示)。
 * ※他人所有ファイルは「失敗」ではなく「スキップ」として別集計する
 *   (処理自体を行わないため。下記 recordSkip_ 参照)。
 */
const FAILURE_CATEGORIES = [
    { code: 'MOVE_FAILED_NO_FALLBACK', label: '移動失敗（コピー救済OFF）' },
    { code: 'MOVE_AND_COPY_FAILED', label: '移動もコピーも失敗' },
    { code: 'FOLDER_FAILED', label: 'フォルダ処理失敗（配下未処理）' },
    { code: 'OTHER', label: 'その他の失敗' },
];
/** スキップした理由の表示ラベル */
const SKIP_REASON_NOT_OWNED = '他人所有のため処理せずスキップ';
function categoryLabel_(code) {
    const hit = FAILURE_CATEGORIES.filter((c) => c.code === code)[0];
    return hit ? hit.label : code;
}
/** 進捗シートへの書き込み間隔 (ミリ秒)。頻繁すぎる書き込みを抑える */
const STATUS_WRITE_INTERVAL_MS = 10000;
/** 現在の実行で読み込んだ設定のキャッシュ (実行ごとに GAS がリセットする) */
let ACTIVE_CONFIG = null;
/** 進捗シートへ最後に書き込んだ時刻 (ミリ秒) */
let LAST_STATUS_WRITE_MS = 0;
// =====================================================================
// メニュー (スプレッドシートを開くと表示される)
// =====================================================================
/**
 * スプレッドシートを開いたときに自動実行される特殊関数。
 * 「📁 ドライブ移行」メニューを追加する。
 */
function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu('📁 ドライブ移行')
        .addItem('① 設定シートを準備 / 初期化', 'setupSheets')
        .addSeparator()
        .addItem('② 移行を開始（設定シートに従う）', 'startMigration')
        .addItem('③ 進捗を更新して表示', 'showStatus')
        .addSeparator()
        .addItem('中断からの再開', 'resumeMigration')
        .addItem('移行を中止', 'cancelMigration')
        .addItem('状態をリセット（最初から）', 'resetState')
        .addSeparator()
        .addItem('【後片付け】空フォルダを削除', 'trashEmptySourceFolders')
        .addItem('ヘルプを表示', 'showHelp')
        .addToUi();
}
/**
 * 設定・進捗・失敗一覧の各シートを作成 (または再初期化) する。
 * 最初に一度だけ実行する。既存のシートがあっても値は保持し、
 * 不足している設定行と書式だけを補う。
 */
function setupSheets() {
    const ss = getSpreadsheet_();
    buildSettingsSheet_(ss);
    buildStatusSheet_(ss);
    buildFailuresSheet_(ss);
    buildSkippedSheet_(ss);
    ss.setActiveSheet(getSheet_(SHEET_SETTINGS));
    const ui = getUiOrNull_();
    if (ui) {
        ui.alert('セットアップ完了', '「設定」シートに移行元・移行先のフォルダ ID と各種設定を入力してください。\n\n' +
            '入力できたら メニュー「📁 ドライブ移行」→「② 移行を開始」を実行します。\n' +
            'まずは「ドライラン」にチェックが入った状態で試すことを強く推奨します。', ui.ButtonSet.OK);
    }
}
/** 使い方の要約をダイアログ表示する。 */
function showHelp() {
    const ui = getUiOrNull_();
    if (!ui)
        return;
    ui.alert('📁 ドライブ移行ツール ヘルプ', [
        '■ 手順',
        '① 設定シートを準備 → 「設定」シートに ID と設定を入力',
        '② 移行を開始（まず「ドライラン」ON で計画確認 → OFF で本実行）',
        '③ 進捗を更新して表示（いつでも状況確認可能）',
        '',
        '■ 実行中について',
        '・約4.5分ごとに自動で中断・再開します（何もしなくてOK）',
        '・ブラウザを閉じても処理はサーバー側で継続します',
        '・進捗は「進捗」シート、失敗は「失敗一覧」シートに出ます',
        '',
        '■ 事前準備',
        '・移行先の共有ドライブに、実行アカウントを「コンテンツ管理者」で追加',
        '',
        '詳しくは docs/textbook/ を参照してください。',
    ].join('\n'), ui.ButtonSet.OK);
}
// =====================================================================
// エントリポイント (メニュー / トリガーから実行)
// =====================================================================
/**
 * 移行を開始する。設定シートを読み、検証し、確認ダイアログの後に実行する。
 * 進行中ジョブがある場合は誤操作防止のため拒否する。
 */
function startMigration() {
    const ui = getUiOrNull_();
    const cfg = loadConfigOrAlert_();
    if (!cfg)
        return;
    const existing = loadState_();
    if (existing && (existing.status === 'RUNNING' || existing.status === 'SUSPENDED')) {
        alertOrLog_('実行できません', '進行中の移行ジョブがあります。「③ 進捗を更新して表示」で状況を確認し、' +
            '再開するなら「中断からの再開」、中止するなら「移行を中止」を選んでください。');
        return;
    }
    // --- 移行元/移行先の検証 (変更前に失敗を検出する) ---
    let srcName;
    let destLabel;
    let rootDstParent;
    try {
        const src = withRetry_('移行元フォルダの取得', () => Drive.Files.get(cfg.SOURCE_FOLDER_ID, {
            supportsAllDrives: true,
            fields: 'id, name, mimeType, driveId, ownedByMe',
        }));
        if (src.mimeType !== FOLDER_MIME) {
            throw new Error(`移行元がフォルダではありません: ${src.name} (${src.mimeType})`);
        }
        srcName = src.name || 'untitled';
        const dest = resolveDestination_(cfg.DEST_FOLDER_ID);
        destLabel = dest.label;
        rootDstParent = dest.rootId;
    }
    catch (e) {
        alertOrLog_('設定エラー', `移行元/移行先の確認に失敗しました:\n\n${errorMessage_(e)}`);
        return;
    }
    // --- 本実行なら確認ダイアログ ---
    if (ui) {
        const mode = cfg.DRY_RUN
            ? 'ドライラン（変更なし・計画の確認のみ）'
            : '★本実行（実際にファイルを移動します）';
        const resp = ui.alert('移行を開始しますか?', [
            `モード : ${mode}`,
            `移行元 : ${srcName}`,
            `移行先 : ${destLabel}`,
            '',
            cfg.DRY_RUN
                ? '※ドライランなので変更は行いません。'
                : '※本実行です。移動したファイルの所有権は移行先組織に移ります。',
        ].join('\n'), ui.ButtonSet.OK_CANCEL);
        if (resp !== ui.Button.OK) {
            return;
        }
    }
    // --- 初期化して開始 ---
    deleteResumeTriggers_();
    clearStateStorage_();
    const state = newState_(cfg.DRY_RUN);
    Logger.log('====================================================');
    Logger.log(`移行元 : ${srcName} (${cfg.SOURCE_FOLDER_ID})`);
    Logger.log(`移行先 : ${destLabel}`);
    Logger.log(`モード : ${state.dryRun ? 'DRY_RUN' : '本実行'}`);
    Logger.log('====================================================');
    const rootDst = cfg.CREATE_TOP_FOLDER
        ? ensureFolder_(srcName, rootDstParent, state, srcName)
        : rootDstParent;
    state.queue.push({ src: cfg.SOURCE_FOLDER_ID, dst: rootDst, path: srcName });
    saveState_(state);
    writeStatusToSheet_(state);
    toast_(state.dryRun ? 'ドライランを開始しました' : '移行を開始しました', '📁 ドライブ移行');
    runLoop_(state);
}
/**
 * 中断した移行を再開する。時間主導トリガーが自動で呼ぶほか、
 * メニューからの手動再開・ERROR 停止後の復帰にも使う。
 * ★トリガーからも呼ばれるため UI 依存の処理を書かないこと。
 */
function resumeMigration() {
    deleteResumeTriggers_();
    const state = loadState_();
    if (!state) {
        Logger.log('保存された移行状態がありません。「② 移行を開始」から始めてください。');
        toast_('再開できる移行がありません', '📁 ドライブ移行');
        return;
    }
    if (state.status === 'DONE' || state.status === 'CANCELLED') {
        Logger.log(`このジョブは既に ${state.status} です。`);
        toast_(`このジョブは既に ${state.status} です`, '📁 ドライブ移行');
        return;
    }
    state.errorStreak = 0;
    state.status = 'RUNNING';
    Logger.log(`移行を再開します (残りフォルダ: ${state.queue.length})`);
    toast_('移行を再開しました', '📁 ドライブ移行');
    runLoop_(state);
}
/** 現在の進捗を「進捗」「失敗一覧」シートへ書き出し、ログにも出す。 */
function showStatus() {
    const state = loadState_();
    if (!state) {
        alertOrLog_('進捗', '保存された移行状態はありません（未実行、またはリセット済み）。');
        return;
    }
    writeStatusToSheet_(state);
    Logger.log(buildReport_(state));
    const ss = getSpreadsheet_();
    const statusSheet = getSheet_(SHEET_STATUS);
    if (statusSheet)
        ss.setActiveSheet(statusSheet);
    toast_(`状態: ${state.status} / 残り ${state.queue.length} フォルダ`, '📁 ドライブ移行');
}
/** 移行を中止する。自動再開トリガーを削除し、状態を CANCELLED にする。 */
function cancelMigration() {
    const state = loadState_();
    if (!state) {
        alertOrLog_('移行を中止', '進行中の移行はありません。');
        return;
    }
    if (!confirm_('移行を中止しますか?', '移動済みのファイルは移行先に残ります（巻き戻しはしません）。')) {
        return;
    }
    deleteResumeTriggers_();
    state.status = 'CANCELLED';
    saveState_(state);
    writeStatusToSheet_(state);
    alertOrLog_('移行を中止しました', `処理済み: ${state.stats.foldersVisited} フォルダ / ${state.stats.filesMoved} ファイル移動。` +
        `残りキュー: ${state.queue.length} フォルダ。`);
}
/** 保存された状態と自動再開トリガーを完全に消し、まっさらに戻す。 */
function resetState() {
    if (!confirm_('状態をリセットしますか?', '保存された進捗をすべて消去します。移行済みファイルは移行先に残ります。\nこの後「② 移行を開始」で最初からやり直せます。')) {
        return;
    }
    deleteResumeTriggers_();
    clearStateStorage_();
    const statusSheet = getSheet_(SHEET_STATUS);
    if (statusSheet)
        buildStatusSheet_(getSpreadsheet_());
    const failSheet = getSheet_(SHEET_FAILURES);
    if (failSheet)
        buildFailuresSheet_(getSpreadsheet_());
    const skipSheet = getSheet_(SHEET_SKIPPED);
    if (skipSheet)
        buildSkippedSheet_(getSpreadsheet_());
    alertOrLog_('リセット完了', '移行状態をリセットしました。');
}
/**
 * 【後片付け・任意】移行完了後、移行元で「完全に空になったフォルダ」だけを
 * 深い階層から順にゴミ箱へ入れる。設定の「ドライラン」を尊重する。
 */
function trashEmptySourceFolders() {
    const cfg = loadConfigOrAlert_();
    if (!cfg)
        return;
    const state = loadState_();
    if (!state || state.status !== 'DONE') {
        if (!confirm_('注意', '移行が完了(DONE)していません。空のフォルダしか削除しませんが、続行しますか?')) {
            return;
        }
    }
    else if (!confirm_('空フォルダの片付け', cfg.DRY_RUN ? '（ドライラン）削除予定を確認します。' : '空になった移行元フォルダをゴミ箱へ入れます。')) {
        return;
    }
    const src = Drive.Files.get(cfg.SOURCE_FOLDER_ID, {
        supportsAllDrives: true,
        fields: 'id, name, ownedByMe',
    });
    const trashed = trashIfEmptyRecursive_(src.id, src.name || '', src.ownedByMe === true);
    alertOrLog_('後片付け完了', trashed
        ? `移行元フォルダ「${src.name}」ごとゴミ箱に入れました${cfg.DRY_RUN ? '（ドライラン: 実際には変更なし）' : ''}。`
        : '中身が残っているため一部フォルダは残しました。「失敗一覧」シートを確認してください。');
}
// =====================================================================
// メインループ
// =====================================================================
function runLoop_(state) {
    const cfg = cfg_();
    const deadline = Date.now() + cfg.TIME_LIMIT_MS;
    try {
        while (state.queue.length > 0) {
            if (Date.now() > deadline) {
                suspendAndScheduleResume_(state);
                return;
            }
            const task = state.queue[0];
            let completed = false;
            try {
                completed = processFolder_(task, state, deadline);
            }
            catch (e) {
                recordFailure_(state, {
                    category: 'FOLDER_FAILED',
                    fileId: task.src,
                    name: `(フォルダ) ${task.path}`,
                    path: task.path,
                    reason: `フォルダ処理に失敗 (配下は未処理): ${errorMessage_(e)}`,
                });
                completed = true;
            }
            if (!completed) {
                suspendAndScheduleResume_(state);
                return;
            }
            state.queue.shift();
            state.errorStreak = 0;
            saveState_(state);
            maybeWriteStatus_(state);
        }
        finishMigration_(state);
    }
    catch (e) {
        state.errorStreak = (state.errorStreak || 0) + 1;
        Logger.log(`✖ 想定外のエラー (連続 ${state.errorStreak} 回目): ${errorMessage_(e)}`);
        if (state.errorStreak >= 3) {
            state.status = 'ERROR';
            trySaveState_(state);
            writeStatusToSheet_(state);
            deleteResumeTriggers_();
            notify_('【要確認】ドライブ移行がエラーで停止しました', `連続 ${state.errorStreak} 回エラーが発生したため自動再開を停止しました。\n\n` +
                `直近のエラー: ${errorMessage_(e)}\n\n` +
                `対処後、メニュー「中断からの再開」で再開できます。\n\n` +
                buildReport_(state));
        }
        else {
            state.status = 'SUSPENDED';
            trySaveState_(state);
            scheduleResume_();
        }
        throw e;
    }
}
/**
 * 1 フォルダ分の処理: ファイル移動 → サブフォルダ find-or-create → キュー追加。
 * @returns true = 完了 / false = 時間切れで中断 (再実行で安全にやり直せる)
 */
function processFolder_(task, state, deadline) {
    Logger.log(`📁 処理中: ${task.path}`);
    const files = listChildren_(task.src, 'files');
    for (const file of files) {
        if (Date.now() > deadline)
            return false;
        // 自分で残した案内ファイルは移行先へ移動しない (目印として移動元に残す)
        if (file.name === BREADCRUMB_NAME)
            continue;
        moveOneFile_(file, task, state);
    }
    const newTasks = [];
    const subfolders = listChildren_(task.src, 'folders');
    for (const sub of subfolders) {
        if (Date.now() > deadline)
            return false;
        const childPath = `${task.path}/${sub.name}`;
        const dstId = ensureFolder_(sub.name, task.dst, state, childPath);
        newTasks.push({ src: sub.id, dst: dstId, path: childPath });
    }
    // このフォルダの中身を移し終えたので、移動元に移行先への案内ファイルを残す
    leaveBreadcrumb_(task, state);
    for (const t of newTasks)
        state.queue.push(t);
    state.stats.foldersVisited += 1;
    return true;
}
// =====================================================================
// Drive 操作
// =====================================================================
/**
 * 移行先 ID を検証し起点フォルダを決める。共有ドライブ ID / 共有ドライブ内
 * フォルダ ID の両方を受け付け、マイドライブ内が指定されたらエラーにする。
 */
function resolveDestination_(destId) {
    try {
        const drive = Drive.Drives.get(destId);
        return { rootId: destId, label: `共有ドライブ「${drive.name}」の直下` };
    }
    catch (e) {
        // 共有ドライブ ID ではなかった → フォルダ ID として検証
    }
    const folder = withRetry_('移行先フォルダの取得', () => Drive.Files.get(destId, {
        supportsAllDrives: true,
        fields: 'id, name, mimeType, driveId',
    }));
    if (folder.mimeType !== FOLDER_MIME) {
        throw new Error(`移行先がフォルダではありません: ${folder.name} (${folder.mimeType})`);
    }
    if (!folder.driveId) {
        throw new Error(`移行先 (${folder.name}) は共有ドライブ内にありません。共有ドライブ、または` +
            '共有ドライブ内のフォルダを指定してください（マイドライブへ移動しても所有権は移りません）。');
    }
    const drive = Drive.Drives.get(folder.driveId);
    return { rootId: destId, label: `共有ドライブ「${drive.name}」内のフォルダ「${folder.name}」` };
}
/** 親フォルダの子アイテムを全件取得する (ページネーション対応)。 */
function listChildren_(parentId, filter) {
    const mimeCondition = filter === 'folders'
        ? ` and mimeType = '${FOLDER_MIME}'`
        : filter === 'files'
            ? ` and mimeType != '${FOLDER_MIME}'`
            : '';
    const q = `'${parentId}' in parents and trashed = false${mimeCondition}`;
    const items = [];
    let pageToken = undefined;
    do {
        const res = withRetry_('子アイテムの一覧取得', () => Drive.Files.list({
            q: q,
            pageSize: cfg_().PAGE_SIZE,
            pageToken: pageToken,
            fields: 'nextPageToken, files(id, name, mimeType, ownedByMe, owners(emailAddress))',
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
        }));
        for (const f of res.files || []) {
            const owner = (f.owners || [])[0];
            items.push({
                id: f.id,
                name: f.name || '(名称不明)',
                mimeType: f.mimeType || '',
                ownedByMe: f.ownedByMe === true,
                ownerEmail: (owner && owner.emailAddress) || '',
            });
        }
        pageToken = res.nextPageToken;
    } while (pageToken);
    return items;
}
/**
 * 移行先に同名フォルダを用意して ID を返す (find-or-create)。
 * 既存があれば再利用するので、再実行してもフォルダが二重にできない。
 */
function ensureFolder_(name, dstParentId, state, pathForLog) {
    if (dstParentId.indexOf(DRY_RUN_ID_PREFIX) === 0) {
        state.stats.foldersCreated += 1;
        Logger.log(`  [DRY_RUN] フォルダ作成予定: ${pathForLog}`);
        return DRY_RUN_ID_PREFIX + pathForLog;
    }
    const q = `'${dstParentId}' in parents and trashed = false` +
        ` and mimeType = '${FOLDER_MIME}' and name = '${escapeForQuery_(name)}'`;
    const found = withRetry_('移行先フォルダの検索', () => Drive.Files.list({
        q: q,
        pageSize: 1,
        fields: 'files(id, name)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
    }));
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
    const created = withRetry_('移行先フォルダの作成', () => Drive.Files.create({ name: name, mimeType: FOLDER_MIME, parents: [dstParentId] }, null, {
        supportsAllDrives: true,
        fields: 'id',
    }));
    state.stats.foldersCreated += 1;
    Logger.log(`  📂 フォルダ作成: ${pathForLog}`);
    return created.id;
}
/**
 * ファイルを1件、移行元→移行先へ移動する (親の付け替え)。
 *
 * ★所有権を持たないファイル (ownedByMe=false) は、そもそも処理しない。
 *   共有ドライブへ移動しても所有権は移行元組織に残る/コピーは別ファイルになる等、
 *   「移行」として意味をなさないため、移動もコピーもせず「スキップ」として記録し、
 *   移動元にそのまま残す (誰が所有者かは「スキップ一覧」シートで確認できる)。
 *
 * 自分が所有するファイルのみ移動する。移動に失敗した場合は設定に従いコピーで救済する。
 */
function moveOneFile_(file, task, state) {
    const cfg = cfg_();
    const label = `${task.path}/${file.name}`;
    // 他人所有ファイルは処理せずスキップ (ドライラン・本実行を問わず)
    if (!file.ownedByMe) {
        recordSkip_(state, {
            fileId: file.id,
            name: file.name,
            path: task.path,
            ownerEmail: file.ownerEmail,
            reason: SKIP_REASON_NOT_OWNED,
        });
        return;
    }
    if (state.dryRun) {
        state.stats.filesMoved += 1;
        Logger.log(`  [DRY_RUN] 移動予定: ${label}`);
        return;
    }
    try {
        withRetry_(`ファイル移動: ${label}`, () => Drive.Files.update({}, file.id, null, {
            addParents: task.dst,
            removeParents: task.src,
            supportsAllDrives: true,
            fields: 'id, parents',
        }));
        state.stats.filesMoved += 1;
        Logger.log(`  ✅ 移動: ${label}`);
        return;
    }
    catch (moveErr) {
        if (!cfg.COPY_FALLBACK) {
            recordFailure_(state, {
                category: 'MOVE_FAILED_NO_FALLBACK',
                fileId: file.id,
                name: file.name,
                path: task.path,
                reason: `移動失敗: ${errorMessage_(moveErr)}`,
            });
            return;
        }
        try {
            withRetry_(`ファイルコピー: ${label}`, () => Drive.Files.copy({ name: file.name, parents: [task.dst] }, file.id, {
                supportsAllDrives: true,
                fields: 'id',
            }));
            state.stats.filesCopied += 1;
            Logger.log(`  🔁 コピーで救済: ${label} (移動不可: ${errorMessage_(moveErr)})`);
            if (cfg.TRASH_ORIGINAL_AFTER_COPY) {
                withRetry_(`元ファイルをゴミ箱へ: ${label}`, () => Drive.Files.update({ trashed: true }, file.id, null, { supportsAllDrives: true }));
                Logger.log(`  🗑 元ファイルをゴミ箱へ: ${label}`);
            }
        }
        catch (copyErr) {
            recordFailure_(state, {
                category: 'MOVE_AND_COPY_FAILED',
                fileId: file.id,
                name: file.name,
                path: task.path,
                reason: `移動失敗: ${errorMessage_(moveErr)} / コピーも失敗: ${errorMessage_(copyErr)}`,
            });
        }
    }
}
/**
 * 移動元フォルダに「このフォルダの中身は移動しました.txt」を残す。
 * 中身に移行先フォルダへのリンクを記載する。フォルダ自体はドメイン間で移動
 * できないため、旧フォルダを開いた人に移行先を知らせる目印になる。
 * 冪等: 既存の案内ファイルがあれば内容を更新し、なければ新規作成する。
 */
function leaveBreadcrumb_(task, state) {
    if (!cfg_().LEAVE_BREADCRUMB)
        return;
    // 移行先がまだ実体を持たない (DRY_RUN の仮 ID) 場合はリンクを確定できない
    const isDryDst = task.dst.indexOf(DRY_RUN_ID_PREFIX) === 0;
    const destLink = isDryDst
        ? '(DRY_RUN のため未確定)'
        : `https://drive.google.com/drive/folders/${task.dst}`;
    const content = [
        'このフォルダの中身は別の場所へ移動しました。',
        '',
        '▼ 移行先フォルダ',
        destLink,
        '',
        `移行日時: ${formatNow_()}`,
        '',
        '※このファイルは移行ツールが自動生成した案内です。',
        '※ドメインをまたぐ制約でフォルダ自体は移動できないため、',
        '  中身のファイルのみを移行先へ移動し、この案内を移動元に残しています。',
    ].join('\n');
    if (state.dryRun) {
        Logger.log(`  [DRY_RUN] 案内ファイル作成予定: ${task.path}/${BREADCRUMB_NAME}`);
        return;
    }
    try {
        const q = `'${task.src}' in parents and trashed = false and name = '${escapeForQuery_(BREADCRUMB_NAME)}'`;
        const found = withRetry_('案内ファイルの検索', () => Drive.Files.list({
            q: q,
            pageSize: 1,
            fields: 'files(id)',
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
        }));
        const blob = Utilities.newBlob(content, 'text/plain', BREADCRUMB_NAME);
        const existing = (found.files || [])[0];
        if (existing && existing.id) {
            withRetry_('案内ファイルの更新', () => Drive.Files.update({}, existing.id, blob, { supportsAllDrives: true }));
        }
        else {
            withRetry_('案内ファイルの作成', () => Drive.Files.create({ name: BREADCRUMB_NAME, mimeType: 'text/plain', parents: [task.src] }, blob, { supportsAllDrives: true, fields: 'id' }));
        }
        Logger.log(`  📝 案内ファイルを配置: ${task.path}/${BREADCRUMB_NAME}`);
    }
    catch (e) {
        // 案内ファイルは補助的なものなので、失敗しても移行本体は止めない
        Logger.log(`  ⚠ 案内ファイルの配置に失敗 (無視して続行): ${task.path} — ${errorMessage_(e)}`);
    }
}
/** 空フォルダを深い階層から順にゴミ箱へ入れる (後片付け)。 */
function trashIfEmptyRecursive_(folderId, path, ownedByMe) {
    const children = listChildren_(folderId, 'all');
    let allCleared = true;
    for (const child of children) {
        if (child.mimeType === FOLDER_MIME) {
            if (!trashIfEmptyRecursive_(child.id, `${path}/${child.name}`, child.ownedByMe)) {
                allCleared = false;
            }
        }
        else if (child.name === BREADCRUMB_NAME) {
            // 自分で残した案内ファイルは「空」の判定では無視する
            // (フォルダごとゴミ箱に入れる際に一緒に片付く)
            continue;
        }
        else {
            Logger.log(`  ⏭ ファイルが残っているため残置: ${path}/${child.name}`);
            allCleared = false;
        }
    }
    if (!allCleared)
        return false;
    if (!ownedByMe) {
        Logger.log(`  ⏭ 他人がオーナーのフォルダは残置: ${path}`);
        return false;
    }
    if (cfg_().DRY_RUN) {
        Logger.log(`  [DRY_RUN] 空フォルダをゴミ箱に入れる予定: ${path}`);
        return true;
    }
    withRetry_(`空フォルダをゴミ箱へ: ${path}`, () => Drive.Files.update({ trashed: true }, folderId, null, { supportsAllDrives: true }));
    Logger.log(`  🗑 空フォルダをゴミ箱へ: ${path}`);
    return true;
}
// =====================================================================
// 中断・再開 (トリガー)
// =====================================================================
function suspendAndScheduleResume_(state) {
    state.status = 'SUSPENDED';
    saveState_(state);
    writeStatusToSheet_(state);
    scheduleResume_();
    Logger.log(`⏸ 制限時間に達したため中断しました (残りフォルダ: ${state.queue.length})。自動再開します。`);
}
function scheduleResume_() {
    deleteResumeTriggers_();
    ScriptApp.newTrigger(RESUME_HANDLER).timeBased().after(cfg_().RESUME_DELAY_MS).create();
}
function deleteResumeTriggers_() {
    const triggers = ScriptApp.getProjectTriggers();
    for (const t of triggers) {
        if (t.getHandlerFunction() === RESUME_HANDLER) {
            ScriptApp.deleteTrigger(t);
        }
    }
}
function finishMigration_(state) {
    state.status = 'DONE';
    saveState_(state);
    writeStatusToSheet_(state);
    deleteResumeTriggers_();
    const report = buildReport_(state);
    Logger.log(report);
    toast_('移行が完了しました 🎉', '📁 ドライブ移行', 10);
    notify_(state.dryRun ? '【DRY_RUN 完了】ドライブ移行の計画確認が終わりました' : '【完了】ドライブ移行が終わりました', report);
}
// =====================================================================
// 設定シートの読み込み
// =====================================================================
/** 現在の設定を返す (実行中はキャッシュ)。 */
function cfg_() {
    if (!ACTIVE_CONFIG)
        ACTIVE_CONFIG = loadConfig_();
    return ACTIVE_CONFIG;
}
/**
 * 設定シートを読み込んで Config を組み立て、検証する。
 * 必須項目が空・未セットアップなら分かりやすいエラーを投げる。
 */
function loadConfig_() {
    const sheet = getSheet_(SHEET_SETTINGS);
    if (!sheet) {
        throw new Error('「設定」シートがありません。メニュー「📁 ドライブ移行」→「① 設定シートを準備 / 初期化」を実行してください。');
    }
    const values = sheet.getDataRange().getValues();
    const byLabel = {};
    for (let r = 0; r < values.length; r++) {
        const label = String(values[r][COL_LABEL - 1]).trim();
        if (label)
            byLabel[label] = values[r][COL_VALUE - 1];
    }
    const cfg = {};
    const missing = [];
    for (const def of SETTING_DEFS) {
        const raw = byLabel[def.label];
        const value = coerceValue_(raw, def);
        if (def.required && (value === '' || value === null || value === undefined)) {
            missing.push(def.label);
        }
        cfg[def.key] = value;
    }
    if (missing.length > 0) {
        throw new Error(`「設定」シートの必須項目が未入力です: ${missing.join(' / ')}`);
    }
    const result = cfg;
    if (result.SOURCE_FOLDER_ID === result.DEST_FOLDER_ID) {
        throw new Error('移行元と移行先が同じ ID です。');
    }
    return result;
}
/** 設定を読み込む。失敗したらダイアログ/ログにエラーを出し null を返す。 */
function loadConfigOrAlert_() {
    try {
        ACTIVE_CONFIG = loadConfig_();
        return ACTIVE_CONFIG;
    }
    catch (e) {
        alertOrLog_('設定エラー', errorMessage_(e));
        return null;
    }
}
/** セル値を設定項目の型に変換する。 */
function coerceValue_(raw, def) {
    if (def.type === 'boolean') {
        if (typeof raw === 'boolean')
            return raw;
        const s = String(raw === null || raw === undefined ? '' : raw)
            .trim()
            .toLowerCase();
        if (s === '')
            return def.default;
        return s === 'true' || s === 'はい' || s === 'yes' || s === '1' || s === 'on' || s === '✓';
    }
    if (def.type === 'number') {
        if (raw === '' || raw === null || raw === undefined)
            return def.default;
        const n = Number(raw);
        return isNaN(n) ? def.default : n;
    }
    return raw === null || raw === undefined ? '' : String(raw).trim();
}
// =====================================================================
// シートの構築 (setup)
// =====================================================================
/** 設定シートを作成/補修する。既存の入力値は保持する。 */
function buildSettingsSheet_(ss) {
    let sheet = ss.getSheetByName(SHEET_SETTINGS);
    const existingValues = {};
    if (sheet) {
        const values = sheet.getDataRange().getValues();
        for (let r = 0; r < values.length; r++) {
            const label = String(values[r][COL_LABEL - 1]).trim();
            if (label)
                existingValues[label] = values[r][COL_VALUE - 1];
        }
        sheet.clear();
    }
    else {
        sheet = ss.insertSheet(SHEET_SETTINGS, 0);
    }
    // タイトル行
    sheet.getRange(1, 1, 1, 3).merge();
    sheet
        .getRange(1, 1)
        .setValue('📁 ドライブ移行ツール 設定  （黄色い「入力値」列だけを編集してください）')
        .setFontWeight('bold')
        .setFontSize(12)
        .setBackground('#1a73e8')
        .setFontColor('#ffffff');
    // 見出し行
    const header = ['設定項目', '入力値', '説明'];
    sheet.getRange(2, 1, 1, 3).setValues([header]).setFontWeight('bold').setBackground('#e8eaed');
    // 各設定行
    const rows = SETTING_DEFS.map((def) => {
        const kept = existingValues[def.label];
        const value = kept === undefined || kept === '' ? def.default : kept;
        return [def.label, value, def.description];
    });
    sheet.getRange(SETTINGS_HEADER_ROWS + 1, 1, rows.length, 3).setValues(rows);
    // boolean 行はチェックボックスにする
    for (let i = 0; i < SETTING_DEFS.length; i++) {
        if (SETTING_DEFS[i].type === 'boolean') {
            sheet.getRange(SETTINGS_HEADER_ROWS + 1 + i, COL_VALUE).insertCheckboxes();
        }
    }
    // 見た目
    sheet.setColumnWidth(COL_LABEL, 280);
    sheet.setColumnWidth(COL_VALUE, 320);
    sheet.setColumnWidth(COL_DESC, 560);
    sheet.getRange(SETTINGS_HEADER_ROWS + 1, COL_VALUE, SETTING_DEFS.length, 1).setBackground('#fff8e1');
    sheet.getRange(SETTINGS_HEADER_ROWS + 1, COL_DESC, SETTING_DEFS.length, 1).setWrap(true);
    sheet.setFrozenRows(SETTINGS_HEADER_ROWS);
    // 入力値以外の列を保護 (警告のみ・誤編集防止)
    protectSettingsLayout_(sheet);
}
/**
 * 進捗シートに出す [ラベル, 値] の並び (唯一の定義元)。
 * 「失敗（合計）」の下に FAILURE_CATEGORIES ごとの内訳行を出し、
 * 「スキップ（他人所有）」を独立集計する。buildStatusSheet_ と
 * writeStatusToSheet_ はどちらもこの関数を使うため、行の並びが必ず一致する。
 */
function statusRows_(state) {
    const s = state.stats;
    const byCat = s.failuresByCategory || {};
    const rows = [
        ['状態', state.status + (state.dryRun ? '（ドライラン）' : '')],
        ['モード', state.dryRun ? 'ドライラン（変更なし）' : '本実行'],
        ['開始', state.startedAt],
        ['最終更新', state.updatedAt],
        ['処理フォルダ', s.foldersVisited],
        ['作成フォルダ', s.foldersCreated],
        ['再利用フォルダ', s.foldersReused],
        ['移動ファイル', s.filesMoved],
        ['コピー救済', s.filesCopied],
        ['スキップ（他人所有）', s.filesSkipped],
        ['失敗（合計）', s.filesFailed],
    ];
    for (const c of FAILURE_CATEGORIES) {
        rows.push(['　└ ' + c.label, byCat[c.code] || 0]);
    }
    rows.push(['残りフォルダ', state.queue.length]);
    return rows;
}
/** 進捗シートを作成/初期化する。 */
function buildStatusSheet_(ss) {
    let sheet = ss.getSheetByName(SHEET_STATUS);
    if (!sheet)
        sheet = ss.insertSheet(SHEET_STATUS);
    sheet.clear();
    sheet.getRange(1, 1, 1, 2).merge();
    sheet
        .getRange(1, 1)
        .setValue('📊 進捗（「③ 進捗を更新して表示」または実行中に自動更新）')
        .setFontWeight('bold')
        .setBackground('#188038')
        .setFontColor('#ffffff');
    const rows = statusRows_(newState_(false)).map((r) => [r[0], '']);
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    sheet.getRange(2, 1, rows.length, 1).setFontWeight('bold').setBackground('#e6f4ea');
    sheet.setColumnWidth(1, 260);
    sheet.setColumnWidth(2, 420);
    sheet.setFrozenRows(1);
}
/** 失敗一覧シートを作成/初期化する。 */
function buildFailuresSheet_(ss) {
    let sheet = ss.getSheetByName(SHEET_FAILURES);
    if (!sheet)
        sheet = ss.insertSheet(SHEET_FAILURES);
    sheet.clear();
    const header = ['種別', 'パス', 'ファイル名', 'ファイルID', '理由'];
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#fce8e6');
    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 280);
    sheet.setColumnWidth(3, 240);
    sheet.setColumnWidth(4, 260);
    sheet.setColumnWidth(5, 520);
    sheet.setFrozenRows(1);
}
/** スキップ一覧シートを作成/初期化する (他人所有などで処理しなかったファイル)。 */
function buildSkippedSheet_(ss) {
    let sheet = ss.getSheetByName(SHEET_SKIPPED);
    if (!sheet)
        sheet = ss.insertSheet(SHEET_SKIPPED);
    sheet.clear();
    const header = ['パス', 'ファイル名', '所有者', 'ファイルID', '理由'];
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#fef7e0');
    sheet.setColumnWidth(1, 280);
    sheet.setColumnWidth(2, 240);
    sheet.setColumnWidth(3, 240);
    sheet.setColumnWidth(4, 260);
    sheet.setColumnWidth(5, 320);
    sheet.setFrozenRows(1);
}
/**
 * 入力値の列 (B) 以外 — ラベル列(A)・説明列(C)・ヘッダ行 — を警告付き保護する
 * (誤編集防止)。保護は「あると親切」な機能であり、環境によって適用に失敗しても
 * シートの利用自体には影響しないため、失敗はログに留めて続行する。
 */
function protectSettingsLayout_(sheet) {
    try {
        // 既存の保護を一旦解除
        const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
        for (const p of existing)
            p.remove();
        const lastRow = sheet.getLastRow();
        const ranges = [
            sheet.getRange(1, COL_LABEL, lastRow, 1),
            sheet.getRange(1, COL_DESC, lastRow, 1),
            sheet.getRange(1, 1, SETTINGS_HEADER_ROWS, 3),
        ];
        for (const r of ranges) {
            r.protect().setDescription('編集不可（入力値の列のみ編集してください）').setWarningOnly(true);
        }
    }
    catch (e) {
        Logger.log(`⚠ 設定シートの保護設定に失敗しました (無視して続行): ${errorMessage_(e)}`);
    }
}
// =====================================================================
// 進捗シートへの書き出し
// =====================================================================
/** 一定間隔を空けて進捗シートを更新する (書き込み過多を防ぐ)。 */
function maybeWriteStatus_(state) {
    const now = Date.now();
    if (now - LAST_STATUS_WRITE_MS >= STATUS_WRITE_INTERVAL_MS) {
        writeStatusToSheet_(state);
    }
}
/** 進捗・失敗一覧・スキップ一覧シートへ現在の状態を書き出す。 */
function writeStatusToSheet_(state) {
    try {
        const ss = getSpreadsheet_();
        // 進捗 (ラベル+値を毎回まとめて書き込み、行の並びを statusRows_ に一致させる)
        let statusSheet = ss.getSheetByName(SHEET_STATUS);
        if (!statusSheet) {
            buildStatusSheet_(ss);
            statusSheet = ss.getSheetByName(SHEET_STATUS);
        }
        const rows = statusRows_(state).map((r) => [r[0], r[1]]);
        statusSheet.getRange(2, 1, rows.length, 2).setValues(rows);
        // 失敗一覧 (種別つき)
        let failSheet = ss.getSheetByName(SHEET_FAILURES);
        if (!failSheet) {
            buildFailuresSheet_(ss);
            failSheet = ss.getSheetByName(SHEET_FAILURES);
        }
        if (failSheet.getLastRow() > 1) {
            failSheet.getRange(2, 1, failSheet.getLastRow() - 1, 5).clearContent();
        }
        if (state.failures.length > 0) {
            const frows = state.failures.map((f) => [
                categoryLabel_(f.category),
                f.path,
                f.name,
                f.fileId,
                f.reason,
            ]);
            failSheet.getRange(2, 1, frows.length, 5).setValues(frows);
        }
        // スキップ一覧 (他人所有などで処理しなかったファイル)
        let skipSheet = ss.getSheetByName(SHEET_SKIPPED);
        if (!skipSheet) {
            buildSkippedSheet_(ss);
            skipSheet = ss.getSheetByName(SHEET_SKIPPED);
        }
        if (skipSheet.getLastRow() > 1) {
            skipSheet.getRange(2, 1, skipSheet.getLastRow() - 1, 5).clearContent();
        }
        if (state.skipped.length > 0) {
            const krows = state.skipped.map((k) => [
                k.path,
                k.name,
                k.ownerEmail || '(不明)',
                k.fileId,
                k.reason,
            ]);
            skipSheet.getRange(2, 1, krows.length, 5).setValues(krows);
        }
        LAST_STATUS_WRITE_MS = Date.now();
    }
    catch (e) {
        Logger.log(`⚠ 進捗シートの更新に失敗しました: ${errorMessage_(e)}`);
    }
}
// =====================================================================
// 状態の保存と読み込み (スクリプトプロパティ + チャンク分割)
// =====================================================================
function newState_(dryRun) {
    const now = new Date().toISOString();
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
            filesSkipped: 0,
            filesFailed: 0,
            failuresByCategory: {},
        },
        failures: [],
        skipped: [],
        errorStreak: 0,
        startedAt: now,
        updatedAt: now,
    };
}
function saveState_(state) {
    state.updatedAt = new Date().toISOString();
    const json = JSON.stringify(state);
    if (json.length > STATE_TOTAL_LIMIT) {
        throw new Error(`移行状態が大きくなりすぎました (${json.length} 文字)。フォルダ数が非常に多い場合は、` +
            'サブフォルダごとに移行元フォルダ ID を変えて分割実行してください。');
    }
    const props = PropertiesService.getScriptProperties();
    const prevMetaRaw = props.getProperty(STATE_META_KEY);
    const prevChunkCount = prevMetaRaw ? JSON.parse(prevMetaRaw).chunkCount : 0;
    const payload = {};
    let chunkCount = 0;
    for (let i = 0; i < json.length; i += STATE_CHUNK_SIZE) {
        payload[STATE_CHUNK_KEY_PREFIX + chunkCount] = json.substring(i, i + STATE_CHUNK_SIZE);
        chunkCount += 1;
    }
    payload[STATE_META_KEY] = JSON.stringify({ chunkCount: chunkCount });
    props.setProperties(payload);
    for (let i = chunkCount; i < prevChunkCount; i++) {
        props.deleteProperty(STATE_CHUNK_KEY_PREFIX + i);
    }
}
function trySaveState_(state) {
    try {
        saveState_(state);
    }
    catch (e) {
        Logger.log(`⚠ 状態の保存に失敗しました: ${errorMessage_(e)}`);
    }
}
function loadState_() {
    const props = PropertiesService.getScriptProperties();
    const metaRaw = props.getProperty(STATE_META_KEY);
    if (!metaRaw)
        return null;
    const chunkCount = JSON.parse(metaRaw).chunkCount;
    let json = '';
    for (let i = 0; i < chunkCount; i++) {
        const chunk = props.getProperty(STATE_CHUNK_KEY_PREFIX + i);
        if (chunk === null) {
            Logger.log(`⚠ 状態データの一部 (チャンク ${i}) が見つかりません。状態を破棄します。`);
            return null;
        }
        json += chunk;
    }
    return JSON.parse(json);
}
function clearStateStorage_() {
    const props = PropertiesService.getScriptProperties();
    const metaRaw = props.getProperty(STATE_META_KEY);
    if (metaRaw) {
        const chunkCount = JSON.parse(metaRaw).chunkCount;
        for (let i = 0; i < chunkCount; i++) {
            props.deleteProperty(STATE_CHUNK_KEY_PREFIX + i);
        }
        props.deleteProperty(STATE_META_KEY);
    }
}
// =====================================================================
// スプレッドシート / UI ユーティリティ
// =====================================================================
/** 紐づくスプレッドシートを返す (トリガー実行時も可)。 */
function getSpreadsheet_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
        throw new Error('スプレッドシートに紐づいていません。このスクリプトはスプレッドシートの' +
            '「拡張機能 → Apps Script」から作成/実行してください。');
    }
    return ss;
}
function getSheet_(name) {
    return getSpreadsheet_().getSheetByName(name);
}
/** UI を返す。トリガー実行など UI が無い文脈では null。 */
function getUiOrNull_() {
    try {
        return SpreadsheetApp.getUi();
    }
    catch (e) {
        return null;
    }
}
/** OK/キャンセルの確認。UI が無ければ true (開発時などはそのまま進める)。 */
function confirm_(title, message) {
    const ui = getUiOrNull_();
    if (!ui)
        return true;
    return ui.alert(title, message, ui.ButtonSet.OK_CANCEL) === ui.Button.OK;
}
/** ダイアログ表示。UI が無ければログに出す。 */
function alertOrLog_(title, message) {
    const ui = getUiOrNull_();
    if (ui) {
        ui.alert(title, message, ui.ButtonSet.OK);
    }
    else {
        Logger.log(`[${title}] ${message}`);
    }
}
/** トースト通知 (シートを開いているときだけ表示される)。 */
function toast_(message, title, seconds) {
    try {
        getSpreadsheet_().toast(message, title, seconds || 5);
    }
    catch (e) {
        // トースト不可の文脈 (トリガー等) では無視
    }
}
// =====================================================================
// 汎用ユーティリティ
// =====================================================================
/** Drive API の一時エラーを指数バックオフでリトライする。 */
function withRetry_(label, fn) {
    const maxRetries = cfg_().MAX_RETRIES;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
            const waitMs = Math.min(Math.pow(2, attempt - 1) * 1000, 32000) + Math.floor(Math.random() * 500);
            Utilities.sleep(waitMs);
        }
        try {
            return fn();
        }
        catch (e) {
            lastError = e;
            if (!isTransientError_(e))
                throw e;
            Logger.log(`  ↻ 一時エラーのためリトライ (${attempt + 1}/${maxRetries}): ${label}`);
        }
    }
    throw new Error(`リトライ上限に達しました: ${label} / 最後のエラー: ${errorMessage_(lastError)}`);
}
function isTransientError_(e) {
    const msg = errorMessage_(e);
    return /(429|500|502|503|rate ?limit|ratelimitexceeded|userratelimitexceeded|quota|internal error|backend error|timed? ?out|transient)/i.test(msg);
}
function errorMessage_(e) {
    if (e instanceof Error)
        return e.message;
    return String(e);
}
/** 現在時刻をスクリプトのタイムゾーンで 'yyyy-MM-dd HH:mm' に整形する。 */
function formatNow_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}
function escapeForQuery_(value) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function recordFailure_(state, failure) {
    state.stats.filesFailed += 1;
    if (!state.stats.failuresByCategory)
        state.stats.failuresByCategory = {};
    const cat = failure.category || 'OTHER';
    state.stats.failuresByCategory[cat] = (state.stats.failuresByCategory[cat] || 0) + 1;
    if (state.failures.length < MAX_RECORDED_FAILURES) {
        state.failures.push(failure);
    }
    else if (state.failures.length === MAX_RECORDED_FAILURES) {
        state.failures.push({
            category: 'OTHER',
            fileId: '-',
            name: '-',
            path: '-',
            reason: `(これ以上の失敗詳細は記録上限 ${MAX_RECORDED_FAILURES} 件を超えたため省略)`,
        });
    }
    Logger.log(`  ✖ 失敗[${categoryLabel_(cat)}]: ${failure.path}/${failure.name} — ${failure.reason}`);
}
/** 他人所有などで処理せずスキップしたファイルを記録する。 */
function recordSkip_(state, skip) {
    state.stats.filesSkipped += 1;
    if (state.skipped.length < MAX_RECORDED_FAILURES) {
        state.skipped.push(skip);
    }
    else if (state.skipped.length === MAX_RECORDED_FAILURES) {
        state.skipped.push({
            fileId: '-',
            name: '-',
            path: '-',
            ownerEmail: '',
            reason: `(これ以上のスキップ詳細は記録上限 ${MAX_RECORDED_FAILURES} 件を超えたため省略)`,
        });
    }
    const who = skip.ownerEmail ? ` (所有者: ${skip.ownerEmail})` : '';
    Logger.log(`  ⏭ スキップ: ${skip.path}/${skip.name}${who} — ${skip.reason}`);
}
function buildReport_(state) {
    const s = state.stats;
    const byCat = s.failuresByCategory || {};
    const lines = [
        '================ 移行レポート ================',
        `状態        : ${state.status}${state.dryRun ? ' (DRY_RUN)' : ''}`,
        `開始        : ${state.startedAt}`,
        `最終更新    : ${state.updatedAt}`,
        `処理フォルダ: ${s.foldersVisited}`,
        `作成フォルダ: ${s.foldersCreated} (既存を再利用: ${s.foldersReused})`,
        `移動ファイル: ${s.filesMoved}`,
        `コピー救済  : ${s.filesCopied}`,
        `スキップ(他人所有): ${s.filesSkipped}`,
        `失敗(合計)  : ${s.filesFailed}`,
    ];
    for (const c of FAILURE_CATEGORIES) {
        lines.push(`  └ ${c.label}: ${byCat[c.code] || 0}`);
    }
    lines.push(`残りフォルダ: ${state.queue.length}`);
    lines.push('=============================================');
    if (state.skipped.length > 0) {
        lines.push('--- スキップ一覧 (他人所有など・移動元に残置) ---');
        for (const k of state.skipped) {
            lines.push(`- ${k.path}/${k.name} (所有者: ${k.ownerEmail || '不明'})`);
        }
    }
    if (state.failures.length > 0) {
        lines.push('--- 失敗一覧 ---');
        for (const f of state.failures) {
            lines.push(`- [${categoryLabel_(f.category)}] ${f.path}/${f.name} (${f.fileId}): ${f.reason}`);
        }
    }
    return lines.join('\n');
}
function notify_(subject, body) {
    const email = cfg_().NOTIFY_EMAIL;
    if (!email)
        return;
    try {
        MailApp.sendEmail(email, subject, body);
    }
    catch (e) {
        Logger.log(`⚠ メール通知に失敗しました: ${errorMessage_(e)}`);
    }
}
