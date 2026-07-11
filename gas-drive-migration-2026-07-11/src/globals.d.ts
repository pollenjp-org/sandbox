/**
 * Drive API v3「高度なサービス」の最小限の型定義。
 *
 * `@types/google-apps-script` は組み込みサービス (DriveApp / Logger /
 * PropertiesService など) の型だけを提供しており、GAS エディタの
 * 「サービス」から有効化する高度なサービス Drive (v3) のグローバル
 * `Drive` オブジェクトの型は含まれない。
 * そこで、このプロジェクトで実際に使うメソッドとフィールドに限定して
 * 自前で宣言する (使う範囲だけ型を付けるのが保守しやすい)。
 *
 * 参考: https://developers.google.com/apps-script/advanced/drive
 */
declare namespace DriveV3 {
  /** files リソース (使用するフィールドのみ) */
  interface File {
    id?: string;
    name?: string;
    mimeType?: string;
    parents?: string[];
    /** 共有ドライブ内のアイテムにのみ設定される。マイドライブ内なら undefined */
    driveId?: string;
    ownedByMe?: boolean;
    trashed?: boolean;
  }

  /** files.list のレスポンス */
  interface FileList {
    nextPageToken?: string;
    files?: File[];
  }

  /** drives リソース (共有ドライブ) */
  interface DriveResource {
    id?: string;
    name?: string;
  }

  interface FilesCollection {
    get(fileId: string, optionalArgs?: Record<string, unknown>): File;
    list(optionalArgs?: Record<string, unknown>): FileList;
    create(
      resource: File,
      mediaData?: GoogleAppsScript.Base.Blob | null,
      optionalArgs?: Record<string, unknown>
    ): File;
    update(
      resource: File,
      fileId: string,
      mediaData?: GoogleAppsScript.Base.Blob | null,
      optionalArgs?: Record<string, unknown>
    ): File;
    copy(
      resource: File,
      fileId: string,
      optionalArgs?: Record<string, unknown>
    ): File;
  }

  interface DrivesCollection {
    get(driveId: string): DriveResource;
  }
}

/** 高度なサービスとして有効化した Drive API v3 のグローバルシンボル */
declare const Drive: {
  Files: DriveV3.FilesCollection;
  Drives: DriveV3.DrivesCollection;
};
