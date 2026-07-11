/**
 * エントリーポイント集。
 * Apps Script エディタ上部の関数選択メニューからこれらの関数を選んで実行する。
 *
 * 基本の流れ:
 *   1. countOwnedFiles()  … 事前に対象規模を把握する
 *   2. startTransfer()    … まず DRY RUN(config.ts の dryRun = true)で確認
 *   3. config.ts の dryRun を false にして push し、もう一度 startTransfer()
 *   4. showStatus()       … 進捗確認(長時間かかる場合)
 *   5. 完了後 countOwnedFiles() で残数を確認
 */

/**
 * 【メイン】ツリー走査で一括譲渡を開始する。
 * CONFIG.rootFolderId のフォルダ(未指定ならマイドライブのルート)を起点に、
 * サブフォルダを再帰的にたどりながら処理する。
 */
function startTransfer(): void {
  startTransferWithStrategy('tree');
}

/**
 * 【別方式】検索走査で一括譲渡を開始する。
 * フォルダ階層に関係なく「自分が所有する」全アイテムを Drive 全体から
 * 検索して処理する(他人のフォルダに置いた自分のファイルなども対象になる)。
 */
function startTransferAllOwned(): void {
  startTransferWithStrategy('search');
}

/**
 * 中断した処理を再開する。
 * 通常は時間主導トリガーが自動で呼び出すため、手動で実行する必要はない。
 * (トリガーを誤って消してしまった場合などは手動実行でも再開できる)
 */
function resumeTransfer(): void {
  // 発火済みの一回限りのトリガーは自動では消えないため、まず掃除する
  deleteResumeTriggers();
  const lock = LockService.getScriptLock();
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

/** 実行中の処理を止めて、保存された状態と再開トリガーをリセットする */
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

/** 現在の進捗を表示する(実行状態は変更しない) */
function showStatus(): void {
  const state = loadState();
  if (state === null) {
    console.log('実行中の処理はありません。');
    return;
  }
  logProgress(state, '現在の進捗');
}

/**
 * 自分が所有するアイテム数を数える(上限 1,000 件)。
 * 実行前の規模把握と、実行後の「残っていないか」の確認に使う。
 */
function countOwnedFiles(): void {
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
  console.log(`自分が所有するアイテム: ファイル ${format(fileCount)} / フォルダ ${format(folderCount)}`);
}
