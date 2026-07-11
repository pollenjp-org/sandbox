/**
 * Web アプリ UI(HtmlService)。
 *
 * デプロイ設定は「アクセスしているユーザーとして実行 × Google アカウントを
 * 持つ全員」(appsscript.json の webapp 設定)。ページを開いた本人の権限で
 * 動き、譲渡されるのは本人が所有するファイルだけ。譲渡先・対象フォルダ・
 * モード(DRY RUN / 本番)は画面から利用者ごとに入力する。
 *
 * 進捗の保存先はユーザープロパティ(state.ts)、排他はユーザーロック、
 * 再開トリガーも利用者ごとに作られるため、複数人が同時に使っても互いに
 * 干渉しない。詳細は docs/textbook/07-webapp.md を参照。
 */

/** GET リクエストで UI ページを返す(Web アプリのエントリーポイント) */
function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Drive 所有権一括譲渡')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** UI に表示する現在の状況(ページを開いている本人の分)を返す */
function webAppGetStatus(): WebAppStatus {
  const state = loadState();
  return {
    myEmail: Session.getEffectiveUser().getEmail(),
    running: state !== null,
    summary:
      state === null
        ? null
        : {
            strategy: state.strategy,
            dryRun: state.dryRun,
            newOwnerEmail: state.newOwnerEmail,
            batchCount: state.batchCount,
            scanned: state.stats.scanned,
            transferred: state.stats.transferred,
            planned: state.stats.planned,
            skippedNotOwned: state.stats.skippedNotOwned,
            errors: state.stats.errors,
            queueLength: state.folderQueue.length,
            startedAt: state.startedAt,
          },
  };
}

/**
 * UI の入力値を検証しやすい形に正規化する。
 * dryRun は「明示的に false のときだけ本番」とし、想定外の値は安全側(DRY RUN)に倒す。
 */
function normalizeWebAppOptions(
  newOwnerEmail: string,
  rootFolderId: string,
  dryRun: boolean
): TransferStartOptions {
  return {
    maxRuntimeMs: CONFIG.uiFirstBatchMs,
    newOwnerEmail: String(newOwnerEmail === undefined || newOwnerEmail === null ? '' : newOwnerEmail).trim(),
    rootFolderId: normalizeFolderIdInput(
      String(rootFolderId === undefined || rootFolderId === null ? '' : rootFolderId)
    ),
    dryRun: dryRun === false ? false : true,
  };
}

/** UI から: ツリー走査で開始する */
function webAppStartTree(newOwnerEmail: string, rootFolderId: string, dryRun: boolean): WebAppStatus {
  startTransferWithStrategy('tree', normalizeWebAppOptions(newOwnerEmail, rootFolderId, dryRun));
  return webAppGetStatus();
}

/** UI から: 検索走査で開始する(rootFolderId は使われない) */
function webAppStartSearch(newOwnerEmail: string, rootFolderId: string, dryRun: boolean): WebAppStatus {
  startTransferWithStrategy('search', normalizeWebAppOptions(newOwnerEmail, rootFolderId, dryRun));
  return webAppGetStatus();
}

/** UI から: 自分の処理を中止して状態をリセットする */
function webAppStop(): WebAppStatus {
  stopTransfer();
  return webAppGetStatus();
}

/** UI から: 自分が所有するアイテム数の概算を返す */
function webAppCountOwned(): string {
  return describeOwnedItems();
}
