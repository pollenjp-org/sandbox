/**
 * プロジェクト全体で使う型定義。
 *
 * `.d.ts` ファイルは「型情報だけ」を持ち、コンパイルしても JavaScript を
 * 出力しない。GAS 側には一切アップロードされず、開発時の型チェックのために
 * だけ存在する。
 */

/** 走査戦略の種別。tree = フォルダツリーを再帰的に走査 / search = 所有物を Drive 全体から検索 */
type TransferStrategy = 'tree' | 'search';

/** DriveApp のファイルとフォルダをまとめて扱うための型(どちらも getOwner / setOwner を持つ) */
type DriveItem = GoogleAppsScript.Drive.File | GoogleAppsScript.Drive.Folder;

/** config.ts で定義する、動作チューニング用の設定 */
interface TransferConfig {
  /** フォルダ自体の所有権も譲渡するかどうか */
  includeFolders: boolean;
  /** 1 回の実行で使う時間の上限(ミリ秒) */
  maxRuntimeMs: number;
  /** メニューから開始したときの、最初のバッチの時間予算(ミリ秒) */
  uiFirstBatchMs: number;
  /** 中断後、次のバッチを開始するまでの待ち時間(ミリ秒) */
  resumeDelayMs: number;
  /** ユーザーロックの取得を待つ時間(ミリ秒) */
  lockWaitMs: number;
}

/**
 * 開始時に渡す実行設定。
 * 値はスプレッドシートの「設定」シートから読み取られる(sheet.ts)。
 */
interface TransferStartOptions {
  /** 譲渡先メールアドレス(必須。未指定はエラー) */
  newOwnerEmail: string;
  /** 走査の起点フォルダ ID。ツリー走査では必須(未指定はエラー)。検索走査では使われない */
  rootFolderId: string;
  /** DRY RUN かどうか */
  dryRun: boolean;
  /** 最初のバッチの時間予算(ミリ秒)。メニューのダイアログを素早く返すために短くする */
  maxRuntimeMs?: number;
}

/** 処理件数の集計 */
interface TransferStats {
  /** 走査したアイテムの総数 */
  scanned: number;
  /** 実際に所有権を譲渡した数 */
  transferred: number;
  /** DRY RUN で「譲渡対象」と判定した数 */
  planned: number;
  /** 自分の所有物ではないためスキップした数 */
  skippedNotOwned: number;
  /** 譲渡に失敗した数 */
  errors: number;
}

/** ツリー走査で現在処理中のフォルダの進捗 */
interface FolderProgress {
  /** 処理中のフォルダ ID */
  folderId: string;
  /** files = フォルダ直下のファイルを処理中 / subfolders = サブフォルダを処理中 */
  phase: 'files' | 'subfolders';
  /** イテレータの続きを表す継続トークン(中断していなければ null) */
  token: string | null;
}

/** バッチをまたいでユーザープロパティに永続化する実行状態(利用者ごとに独立) */
interface TransferState {
  strategy: TransferStrategy;
  /** 実行者(現在の所有者)のメールアドレス */
  myEmail: string;
  /** 譲渡先のメールアドレス(開始時点の「設定」シートの値のスナップショット) */
  newOwnerEmail: string;
  dryRun: boolean;
  includeFolders: boolean;
  /** 開始時刻(ISO 8601 形式) */
  startedAt: string;
  /** 実行したバッチの回数(初回 = 1) */
  batchCount: number;
  /** ツリー走査: これから処理するフォルダ ID のキュー */
  folderQueue: string[];
  /** ツリー走査: 処理中フォルダの進捗(なければ null) */
  current: FolderProgress | null;
  /** 検索走査: files = ファイルを処理中 / folders = フォルダを処理中 */
  searchPhase: 'files' | 'folders';
  /** 検索走査: イテレータの継続トークン */
  searchToken: string | null;
  stats: TransferStats;
}
