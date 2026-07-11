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

/** config.ts で定義するツール全体の設定 */
interface TransferConfig {
  /** 譲渡先(新しい所有者)のメールアドレス */
  newOwnerEmail: string;
  /** 走査を開始するフォルダの ID。空文字ならマイドライブのルート */
  rootFolderId: string;
  /** true の間は実際の譲渡を行わず、対象の列挙とログ出力だけを行う */
  dryRun: boolean;
  /** フォルダ自体の所有権も譲渡するかどうか */
  includeFolders: boolean;
  /** 1 回の実行で使う時間の上限(ミリ秒) */
  maxRuntimeMs: number;
  /** 中断後、次のバッチを開始するまでの待ち時間(ミリ秒) */
  resumeDelayMs: number;
  /** スクリプトロックの取得を待つ時間(ミリ秒) */
  lockWaitMs: number;
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

/** Web アプリ UI に返す、実行中ジョブのサマリ */
interface WebAppRunSummary {
  strategy: TransferStrategy;
  dryRun: boolean;
  batchCount: number;
  scanned: number;
  transferred: number;
  planned: number;
  skippedNotOwned: number;
  errors: number;
  /** ツリー走査での未処理フォルダキュー数(検索走査では 0) */
  queueLength: number;
  startedAt: string;
}

/** Web アプリ UI に返す現在の状況(google.script.run で HTML 側へ渡る) */
interface WebAppStatus {
  /** 実行者(このスクリプトが動いている権限)のメールアドレス */
  myEmail: string;
  newOwnerEmail: string;
  dryRun: boolean;
  rootFolderId: string;
  /** 未完了の処理が保存されているか */
  running: boolean;
  /** running のときの進捗サマリ(なければ null) */
  summary: WebAppRunSummary | null;
}

/** バッチをまたいでスクリプトプロパティに永続化する実行状態 */
interface TransferState {
  strategy: TransferStrategy;
  /** 実行者(現在の所有者)のメールアドレス */
  myEmail: string;
  /** 譲渡先のメールアドレス(開始時点の CONFIG のスナップショット) */
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
