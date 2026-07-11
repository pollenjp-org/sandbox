/**
 * スプレッドシート UI(コンテナバインド用)。
 *
 * このスクリプトをスプレッドシートに紐付けてデプロイすると、
 *   - シートを開いたときにカスタムメニュー「所有権譲渡」が追加され、
 *   - 「設定」シートのセルから譲渡先・対象フォルダ・モードを読み取り、
 *   - 実行結果が「譲渡ログ」シート(台帳)に記録される
 * という、コードを触らずに使えるインターフェースになる。
 *
 * メニューから実行した処理は「メニューを押した本人」の権限で動くため、
 * 譲渡されるのは本人が所有するファイルだけ。進捗(ユーザープロパティ)・
 * ロック・再開トリガーも本人専用で、他の利用者と干渉しない。
 * セットアップ手順と共有の考え方は docs/textbook/08-spreadsheet.md を参照。
 */

/** 設定を書くシートの名前 */
const SETTINGS_SHEET_NAME = '設定';
/** 実行結果の台帳シートの名前 */
const LOG_SHEET_NAME = '譲渡ログ';
/** モード選択セルの選択肢 */
const MODE_DRY_LABEL = 'DRY RUN(予行演習)';
const MODE_LIVE_LABEL = '本番(実際に譲渡する)';
/** 台帳シートのヘッダー行 */
const LOG_HEADERS = ['日時', '実行者', '結果', '種別', '名前', 'ID', '譲渡先', '詳細'];

/**
 * 台帳シートへの書き込み待ち行のバッファ。
 * 1 件ずつ appendRow すると遅すぎるため、バッチ中はメモリにためておき、
 * バッチの終わりに flushSheetLog() でまとめて書き込む。
 */
let sheetLogPendingRows: (string | Date)[][] = [];

/** シートを開いたときに自動実行され、カスタムメニューを追加する(シンプルトリガー) */
function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('所有権譲渡')
    .addItem('初期設定(設定・ログシートを準備)', 'sheetSetup')
    .addSeparator()
    .addItem('所有アイテム数を確認', 'sheetCountOwned')
    .addItem('開始(ツリー走査)', 'sheetStartTree')
    .addItem('開始(検索走査)', 'sheetStartSearch')
    .addSeparator()
    .addItem('進捗を確認', 'sheetShowStatus')
    .addItem('停止(リセット)', 'sheetStop')
    .addToUi();
}

/** バインド先のスプレッドシートを返す(スタンドアロン実行時は null) */
function getContainerSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet | null {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** メニュー: 設定・ログシートを作成して整える(何度実行してもよい) */
function sheetSetup(): void {
  const ss = getContainerSpreadsheet();
  if (ss === null) {
    throw new Error('スプレッドシートに紐付いていません(スタンドアロンのプロジェクトではシート UI は使えません)。');
  }

  // 設定シート
  let settings = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (settings === null) {
    settings = ss.insertSheet(SETTINGS_SHEET_NAME, 0);
    settings.getRange('A1').setValue('Google Drive 所有権一括譲渡: 実行設定').setFontWeight('bold');
    settings.getRange('A2').setValue('譲渡先メールアドレス(必須)');
    settings.getRange('A3').setValue('対象フォルダ ID または URL(空欄 = マイドライブ全体)');
    settings.getRange('A4').setValue('モード');
    settings.getRange('B4').setValue(MODE_DRY_LABEL);
    settings.getRange('A6').setValue('※ メニュー「所有権譲渡」から実行します。設定はメニューを押した本人の実行に使われます。');
    settings.setColumnWidth(1, 340);
    settings.setColumnWidth(2, 340);
  }
  // モードのプルダウン(既存シートにも毎回かけ直す)
  const modeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([MODE_DRY_LABEL, MODE_LIVE_LABEL], true)
    .setAllowInvalid(false)
    .build();
  settings.getRange('B4').setDataValidation(modeRule);

  // 台帳シート
  ensureLogSheet(ss);

  SpreadsheetApp.getUi().alert(
    '初期設定が完了しました',
    `「${SETTINGS_SHEET_NAME}」シートの B2(譲渡先)・B3(対象フォルダ)・B4(モード)を入力してから、メニューの「開始」を実行してください。`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/** 台帳シートを取得する(なければヘッダー付きで作成する) */
function ensureLogSheet(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet
): GoogleAppsScript.Spreadsheet.Sheet {
  let log = ss.getSheetByName(LOG_SHEET_NAME);
  if (log === null) {
    log = ss.insertSheet(LOG_SHEET_NAME);
    log.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
    log.setFrozenRows(1);
    log.setColumnWidth(5, 280); // 名前列
    log.setColumnWidth(8, 280); // 詳細列
  }
  return log;
}

/** 「設定」シートから実行設定を読み取る */
function readSheetSettings(): SheetSettings {
  const ss = getContainerSpreadsheet();
  if (ss === null) {
    throw new Error('スプレッドシートに紐付いていません。');
  }
  const sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (sheet === null) {
    throw new Error(`「${SETTINGS_SHEET_NAME}」シートがありません。メニューの「初期設定」を実行してください。`);
  }
  const mode = String(sheet.getRange('B4').getValue()).trim();
  return {
    newOwnerEmail: String(sheet.getRange('B2').getValue()).trim(),
    rootFolderId: normalizeFolderIdInput(String(sheet.getRange('B3').getValue())),
    // 想定外の値は安全側(DRY RUN)に倒す
    dryRun: mode !== MODE_LIVE_LABEL,
  };
}

/** メニュー: 所有アイテム数を確認 */
function sheetCountOwned(): void {
  const ui = SpreadsheetApp.getUi();
  ui.alert('所有アイテム数', describeOwnedItems(), ui.ButtonSet.OK);
}

/** メニュー: ツリー走査で開始 */
function sheetStartTree(): void {
  sheetStartWithStrategy('tree');
}

/** メニュー: 検索走査で開始 */
function sheetStartSearch(): void {
  sheetStartWithStrategy('search');
}

/** 設定シートの値で確認ダイアログを出し、開始する */
function sheetStartWithStrategy(strategy: TransferStrategy): void {
  const ui = SpreadsheetApp.getUi();
  try {
    const settings = readSheetSettings();
    if (settings.newOwnerEmail === '' || settings.newOwnerEmail.indexOf('@') === -1) {
      ui.alert(
        '設定エラー',
        `「${SETTINGS_SHEET_NAME}」シートの B2 に譲渡先のメールアドレスを入力してください。`,
        ui.ButtonSet.OK
      );
      return;
    }
    const strategyLabel = strategy === 'tree' ? 'ツリー走査' : '検索走査';
    const modeLabel = settings.dryRun ? MODE_DRY_LABEL : MODE_LIVE_LABEL;
    const first = ui.alert(
      '開始の確認',
      `${strategyLabel} / ${modeLabel}\n` +
        `実行者(あなた): ${Session.getEffectiveUser().getEmail()}\n` +
        `譲渡先: ${settings.newOwnerEmail}\n` +
        `対象: ${settings.rootFolderId === '' ? 'マイドライブ全体' : settings.rootFolderId}\n\n` +
        '開始しますか?(対象になるのは、あなたが所有するアイテムだけです)',
      ui.ButtonSet.OK_CANCEL
    );
    if (first !== ui.Button.OK) {
      return;
    }
    if (!settings.dryRun) {
      const second = ui.alert(
        '⚠️ 本番モードの最終確認',
        `あなたが所有するファイル/フォルダの所有権が、実際に ${settings.newOwnerEmail} へ譲渡されます。` +
          '元に戻すには新しい所有者側の操作が必要です。\n本当に開始しますか?',
        ui.ButtonSet.OK_CANCEL
      );
      if (second !== ui.Button.OK) {
        return;
      }
    }

    startTransferWithStrategy(strategy, {
      maxRuntimeMs: CONFIG.uiFirstBatchMs,
      newOwnerEmail: settings.newOwnerEmail,
      rootFolderId: settings.rootFolderId,
      dryRun: settings.dryRun,
      sheetLog: true,
    });

    const state = loadState();
    ui.alert(
      '開始しました',
      state === null
        ? `処理が完了しました。結果は「${LOG_SHEET_NAME}」シートを確認してください。`
        : '最初のバッチが完了しました。続きはサーバー側で自動実行されます(シートやブラウザを閉じても止まりません)。\n' +
            `進捗はメニューの「進捗を確認」または「${LOG_SHEET_NAME}」シートで確認できます。`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ui.alert('開始できませんでした', message, ui.ButtonSet.OK);
  }
}

/** メニュー: 進捗を確認 */
function sheetShowStatus(): void {
  const ui = SpreadsheetApp.getUi();
  const state = loadState();
  if (state === null) {
    ui.alert('進捗', '実行中の処理はありません。', ui.ButtonSet.OK);
    return;
  }
  ui.alert('進捗', formatProgress(state, '現在の進捗'), ui.ButtonSet.OK);
}

/** メニュー: 停止(リセット) */
function sheetStop(): void {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert(
    '停止の確認',
    'あなたの処理を中止して進捗をリセットします。よろしいですか?\n(すでに譲渡した分は戻りません)',
    ui.ButtonSet.OK_CANCEL
  );
  if (res !== ui.Button.OK) {
    return;
  }
  stopTransfer();
  ui.alert('停止しました', '保存された進捗と再開トリガーをリセットしました。', ui.ButtonSet.OK);
}

/**
 * 台帳シートへ記録する 1 行をバッファへ追加する(transfer.ts から呼ばれる)。
 * シート UI から開始した実行(state.sheetLog = true)でなければ何もしない。
 */
function recordSheetLog(
  state: TransferState,
  result: string,
  kindLabel: string,
  name: string,
  id: string,
  detail: string
): void {
  if (!state.sheetLog) {
    return;
  }
  sheetLogPendingRows.push([new Date(), state.myEmail, result, kindLabel, name, id, state.newOwnerEmail, detail]);
}

/** バッファの行を台帳シートへまとめて書き込む(バッチの終わりに transfer.ts から呼ばれる) */
function flushSheetLog(state: TransferState): void {
  if (!state.sheetLog || sheetLogPendingRows.length === 0) {
    return;
  }
  const rows = sheetLogPendingRows;
  sheetLogPendingRows = [];
  const ss = getContainerSpreadsheet();
  if (ss === null) {
    console.warn('台帳シートが見つからないため、シートへのログ記録をスキップしました。');
    return;
  }
  const log = ensureLogSheet(ss);
  log.getRange(log.getLastRow() + 1, 1, rows.length, LOG_HEADERS.length).setValues(rows);
}
