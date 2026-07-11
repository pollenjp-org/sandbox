/**
 * 所有権譲渡の中核ロジック。
 *
 * GAS には「1 回の実行は最大 6 分」という制限があるため、
 *   1. 制限時間内で処理できるところまで進める(= 1 バッチ)
 *   2. 時間切れが近づいたら進捗をスクリプトプロパティに保存する
 *   3. 時間主導トリガーで自分自身を起動し直して続きを処理する
 * という「バッチ処理 + チェックポイント + 自動再開」の構成をとる。
 */

/** 走査戦略を指定して一括譲渡を開始する(main.ts のエントリーポイントから呼ばれる) */
function startTransferWithStrategy(strategy: TransferStrategy): void {
  // 手動実行とトリガー実行が同時に走らないよう、スクリプトロックで排他する
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.lockWaitMs)) {
    throw new Error(
      '別の実行が進行中のためロックを取得できませんでした。しばらく待ってから再実行してください。'
    );
  }
  try {
    if (loadState() !== null) {
      throw new Error(
        '未完了の処理が残っています。resumeTransfer() で再開するか、stopTransfer() でリセットしてください。'
      );
    }
    // 前回の実行の残骸(再開トリガー)が残っていれば掃除する
    deleteResumeTriggers();

    const state = createInitialState(strategy);
    if (strategy === 'tree') {
      const root = resolveRootFolder();
      state.folderQueue.push(root.getId());
      // 明示的に指定したルートフォルダ自身は走査中に列挙されないため、ここで譲渡する。
      // マイドライブのルート(rootFolderId が空文字)は譲渡できないので対象外。
      if (state.includeFolders && CONFIG.rootFolderId !== '') {
        transferOwnershipIfOwned(root, state, 'folder');
      }
    }
    logStartBanner(state);
    runBatch(state);
  } finally {
    lock.releaseLock();
  }
}

/** CONFIG を検証し、実行状態の初期値を作る */
function createInitialState(strategy: TransferStrategy): TransferState {
  const myEmail = Session.getEffectiveUser().getEmail();
  const newOwnerEmail = CONFIG.newOwnerEmail.trim();
  if (newOwnerEmail === '' || newOwnerEmail.indexOf('@') === -1) {
    throw new Error('CONFIG.newOwnerEmail に譲渡先のメールアドレスを設定してください。');
  }
  if (newOwnerEmail.toLowerCase() === myEmail.toLowerCase()) {
    throw new Error('譲渡先が自分自身になっています。CONFIG.newOwnerEmail を確認してください。');
  }
  return {
    strategy,
    myEmail,
    newOwnerEmail,
    dryRun: CONFIG.dryRun,
    includeFolders: CONFIG.includeFolders,
    startedAt: new Date().toISOString(),
    batchCount: 1,
    folderQueue: [],
    current: null,
    searchPhase: 'files',
    searchToken: null,
    stats: { scanned: 0, transferred: 0, planned: 0, skippedNotOwned: 0, errors: 0 },
  };
}

/** CONFIG.rootFolderId から走査の起点となるフォルダを解決する */
function resolveRootFolder(): GoogleAppsScript.Drive.Folder {
  if (CONFIG.rootFolderId === '') {
    return DriveApp.getRootFolder();
  }
  try {
    return DriveApp.getFolderById(CONFIG.rootFolderId);
  } catch (e) {
    throw new Error(
      `CONFIG.rootFolderId のフォルダが見つかりません: ${CONFIG.rootFolderId}(アクセス権と ID を確認してください)`
    );
  }
}

/**
 * 1 バッチ分の処理を実行する。
 * 時間切れで中断した場合は状態を保存して再開トリガーを予約し、
 * 最後まで到達した場合は完了処理を行う。
 */
function runBatch(state: TransferState): void {
  const deadline = Date.now() + CONFIG.maxRuntimeMs;
  const suspended =
    state.strategy === 'tree' ? runTreeBatch(state, deadline) : runSearchBatch(state, deadline);
  if (suspended) {
    saveState(state);
    scheduleResume();
    logProgress(state, '制限時間が近づいたため、いったん中断しました');
  } else {
    finishTransfer(state);
  }
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
 * 完了後に countOwnedFiles() で残数を確認し、必要なら再実行する。
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
 * アイテムが自分の所有物であれば所有権を譲渡する。
 * DRY RUN 中はログ出力のみ。個々の失敗は記録して処理を続行する。
 */
function transferOwnershipIfOwned(item: DriveItem, state: TransferState, kind: 'file' | 'folder'): void {
  state.stats.scanned++;
  let label = kind === 'file' ? 'ファイル' : 'フォルダ';
  try {
    label = `${label}「${item.getName()}」(id: ${item.getId()})`;
    // 共有ドライブ内のアイテムには所有者がいないため null が返ることがある
    const owner: GoogleAppsScript.Base.User | null = item.getOwner();
    const ownerEmail = owner === null ? '' : owner.getEmail();
    if (ownerEmail.toLowerCase() !== state.myEmail.toLowerCase()) {
      state.stats.skippedNotOwned++;
      return;
    }
    if (state.dryRun) {
      state.stats.planned++;
      console.log(`[DRY RUN] 譲渡対象: ${label}`);
      return;
    }
    item.setOwner(state.newOwnerEmail);
    state.stats.transferred++;
    console.log(`譲渡完了: ${label}`);
  } catch (e) {
    state.stats.errors++;
    const message = e instanceof Error ? e.message : String(e);
    console.error(`譲渡失敗: ${label}: ${message}`);
  }
}

/** すべて処理し終えたときの完了処理 */
function finishTransfer(state: TransferState): void {
  clearState();
  deleteResumeTriggers();
  logProgress(state, 'すべての処理が完了しました');
  if (state.strategy === 'search' && !state.dryRun) {
    console.log(
      '検索走査では譲渡により検索結果が変化するため、取りこぼしが残ることがあります。' +
        'countOwnedFiles() で残数を確認し、残っていれば startTransferAllOwned() をもう一度実行してください。'
    );
  }
}

/** 開始時の告知ログ */
function logStartBanner(state: TransferState): void {
  const mode = state.strategy === 'tree' ? 'ツリー走査' : '検索走査';
  console.log(`所有権の一括譲渡を開始します: ${state.myEmail} → ${state.newOwnerEmail}(${mode})`);
  if (state.dryRun) {
    console.log('[DRY RUN] 実際の譲渡は行いません。対象の列挙とログ出力のみ行います。');
  } else {
    console.warn('本番モードです。所有権の譲渡を実際に実行します。');
  }
}

/** 進捗・結果のサマリをログに出力する */
function logProgress(state: TransferState, headline: string): void {
  const s = state.stats;
  const lines = [
    `=== ${headline} ===`,
    `モード: ${state.strategy === 'tree' ? 'ツリー走査' : '検索走査'}${state.dryRun ? ' (DRY RUN)' : ''}`,
    `譲渡先: ${state.newOwnerEmail}`,
    `バッチ回数: ${state.batchCount}`,
    `走査済み: ${s.scanned} 件`,
    state.dryRun ? `譲渡対象 (DRY RUN): ${s.planned} 件` : `譲渡済み: ${s.transferred} 件`,
    `スキップ(自分の所有物でない): ${s.skippedNotOwned} 件`,
    `エラー: ${s.errors} 件`,
  ];
  if (state.strategy === 'tree') {
    lines.push(`未処理のフォルダキュー: ${state.folderQueue.length} 件`);
  }
  lines.push(`開始時刻: ${state.startedAt}`);
  console.log(lines.join('\n'));
}
