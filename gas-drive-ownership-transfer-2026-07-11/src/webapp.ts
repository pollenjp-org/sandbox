/**
 * Web アプリ UI(HtmlService)。
 *
 * デプロイすると、ブラウザからボタン操作で開始・進捗確認・停止ができる。
 * 「誰がこのページを開けるか」「誰の権限で動くか」はデプロイ時の設定で決まり、
 * 既定は appsscript.json の webapp 設定(自分として実行 × 自分のみアクセス可)。
 * 詳細と安全な設定の組み合わせは docs/textbook/07-webapp.md を参照。
 */

/**
 * Web アプリからの開始時、最初のバッチに使う時間(ミリ秒)。
 * ブラウザへの応答を素早く返すために短くしてある。
 * 残りは通常どおりトリガー再開の連鎖(1 バッチ = CONFIG.maxRuntimeMs)で処理される。
 */
const WEBAPP_FIRST_BATCH_MS = 45 * 1000;

/** GET リクエストで UI ページを返す(Web アプリのエントリーポイント) */
function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Drive 所有権一括譲渡')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** UI に表示する現在の状況をまとめて返す */
function webAppGetStatus(): WebAppStatus {
  const state = loadState();
  return {
    myEmail: Session.getEffectiveUser().getEmail(),
    newOwnerEmail: CONFIG.newOwnerEmail,
    dryRun: CONFIG.dryRun,
    rootFolderId: CONFIG.rootFolderId,
    running: state !== null,
    summary:
      state === null
        ? null
        : {
            strategy: state.strategy,
            dryRun: state.dryRun,
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

/** UI から: ツリー走査で開始する */
function webAppStartTree(): WebAppStatus {
  startTransferWithStrategy('tree', WEBAPP_FIRST_BATCH_MS);
  return webAppGetStatus();
}

/** UI から: 検索走査で開始する */
function webAppStartSearch(): WebAppStatus {
  startTransferWithStrategy('search', WEBAPP_FIRST_BATCH_MS);
  return webAppGetStatus();
}

/** UI から: 処理を中止して状態をリセットする */
function webAppStop(): WebAppStatus {
  stopTransfer();
  return webAppGetStatus();
}

/** UI から: 自分が所有するアイテム数の概算を返す */
function webAppCountOwned(): string {
  return describeOwnedItems();
}
