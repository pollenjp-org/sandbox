/**
 * プロジェクト全体で使う型定義。
 *
 * `.d.ts` ファイルは「型情報だけ」を持ち、コンパイルしても JavaScript を
 * 出力しない。GAS 側には一切アップロードされず、開発時の型チェックのために
 * だけ存在する。
 */

/** 走査戦略の種別。tree = フォルダツリーを再帰的に走査 / search = 所有物を Drive 全体から検索 */
type TransferStrategy = 'tree' | 'search';

/**
 * 譲渡方式。
 * - direct: DriveApp.setOwner() による即時譲渡。Google Workspace の同一ドメイン間向け。
 * - invite: Drive API v3 の pendingOwner による「招待 → 相手が承諾」の 2 段階。個人アカウント間向け。
 *   個人アカウントで移転できるのは Google ネイティブ形式(ドキュメント/スプレッドシート等)のファイルのみで、
 *   フォルダや非ネイティブ形式(PDF/Office 等)は対象外。
 */
type TransferMethod = 'direct' | 'invite';

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
  /** 譲渡方式(direct = 即時譲渡 / invite = 招待方式) */
  method: TransferMethod;
  /** 最初のバッチの時間予算(ミリ秒)。メニューのダイアログを素早く返すために短くする */
  maxRuntimeMs?: number;
}

/** 処理件数の集計 */
interface TransferStats {
  /** 走査したアイテムの総数 */
  scanned: number;
  /** 実際に所有権を譲渡した数(direct 方式) */
  transferred: number;
  /** 招待方式で pendingOwner の招待を送った数(invite 方式) */
  invited: number;
  /** DRY RUN で「譲渡対象/招待対象」と判定した数 */
  planned: number;
  /** 自分の所有物ではないためスキップした数 */
  skippedNotOwned: number;
  /** 招待方式で移転できない種別(フォルダ・非ネイティブ形式)のためスキップした数 */
  skippedUnsupported: number;
  /** 譲渡・招待に失敗した数 */
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
  /** 譲渡方式(direct = 即時譲渡 / invite = 招待方式)。開始時点の「設定」シートの値のスナップショット */
  method: TransferMethod;
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

/** 招待方式の承諾対象(台帳の「招待済み」行から取り出した 1 ファイル) */
interface InviteCandidate {
  /** ファイル ID */
  id: string;
  /** ファイル名(台帳に記録済みの値。ログ表示用) */
  name: string;
}

/** 招待方式の一括承諾(accept.ts)の実行結果 */
interface AcceptResult {
  /** 承諾対象として台帳から抽出した件数 */
  total: number;
  /** 実際に承諾(所有権を受領)した件数 */
  accepted: number;
  /** 既に所有者・招待が見つからない等でスキップした件数 */
  skipped: number;
  /** 承諾に失敗した件数 */
  errors: number;
  /** 時間制限で処理しきれず残った件数 */
  remaining: number;
  /** 台帳へ追記するログ行 */
  rows: (string | Date)[][];
}
