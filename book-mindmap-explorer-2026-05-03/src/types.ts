export type BookNode = {
  id: string;
  title: string;
  /** 1-2 行のキャッチー要約。ノードに直接表示する。 */
  summary?: string;
  /** ノードを選択したときに右ペインで表示する詳細マークダウン。 */
  detail?: string;
  /** 元の本の該当ページへの URL。 */
  url?: string;
  /** ノード種別。表示スタイルを切り替えるのに使う。 */
  kind: "root" | "part" | "chapter" | "concept";
  children?: BookNode[];
};
