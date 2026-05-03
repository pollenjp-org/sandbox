import type { BookNode } from "../types";

const BASE = "https://sre.google/sre-book";

/**
 * Google SRE Book (Site Reliability Engineering, O'Reilly 2016) のマインドマップデータ。
 *
 * 構成は https://sre.google/sre-book/table-of-contents/ をベースに、
 * よく参照される章には「主要概念」を子ノードとしてぶら下げて深掘りできるようにしている。
 */
export const sreBook: BookNode = {
  id: "root",
  kind: "root",
  title: "Google SRE Book",
  summary: "Site Reliability Engineering — How Google Runs Production Systems",
  detail: `Google が公開している SRE のバイブル本。
本サイトでは TOC を起点にマインドマップ的に展開し、各章の主要概念を辿って読書することができる。
クリックで子ノードを展開し、もう一度クリックで折りたたむ。「原文を開く」リンクから本文に飛べる。`,
  url: `${BASE}/table-of-contents/`,
  children: [
    {
      id: "foreword",
      kind: "part",
      title: "Foreword & Preface",
      summary: "Mark Burgess / Vint Cerf による前書きと、編者からのまえがき",
      detail: `本書がなぜ生まれたか、SRE という職能が Google でどう発展したかの導入部分。
読まずに飛ばしても本編は理解できるが、SRE の歴史的背景を知りたい人向け。`,
      url: `${BASE}/foreword/`,
    },
    {
      id: "part1",
      kind: "part",
      title: "Part I — Introduction",
      summary: "SRE とは何か、どんな環境で働いているか",
      detail: "SRE という職能の定義と Google のプロダクション環境を概観する導入パート。",
      children: [
        {
          id: "ch1",
          kind: "chapter",
          title: "Ch. 1: Introduction",
          summary: "SRE = ソフトウェアエンジニアに運用業務を任せるとどうなるか",
          detail: `Ben Treynor による章。SRE のコア原則:
- **運用作業は 50% 以下**に保ち、残りはエンジニアリングに使う
- **エラーバジェット**で「100% を目指さない」を制度化
- **ポストモーテムは非難なし** (blameless)
- **トイル削減**を測定し続ける`,
          url: `${BASE}/introduction/`,
          children: [
            {
              id: "ch1-error-budget",
              kind: "concept",
              title: "Error Budget",
              summary: "100% 信頼性は不可能。許容できる失敗予算を制度化する",
              detail: `**Error Budget = 1 − SLO** で表される失敗の許容枠。
- 予算が残っていれば積極的に新機能リリース
- 予算を使い切ったらリリース凍結 → 信頼性改善に振り向ける
- 開発と SRE のインセンティブを揃える仕組みになる`,
            },
            {
              id: "ch1-toil",
              kind: "concept",
              title: "Toil",
              summary: "手作業・繰り返し・自動化可能・価値を生まない作業",
              detail: `Toil の定義 (Ch. 5 で詳述):
- 手作業 (manual)、繰り返し (repetitive)
- 自動化可能 (automatable)、戦術的 (tactical)
- 永続的価値がない (no enduring value)
- サービス成長に対して O(n) で増える (scales with service)`,
            },
          ],
        },
        {
          id: "ch2",
          kind: "chapter",
          title: "Ch. 2: The Production Environment at Google",
          summary: "Borg, Chubby, Colossus, Spanner... Google のスタックを俯瞰",
          detail: `本書を読むうえで前提となる Google 内部のインフラ用語集。
- **Borg**: クラスタマネージャ (Kubernetes の祖先)
- **Chubby**: 分散ロックサービス
- **Colossus / GFS**: 分散ファイルシステム
- **Spanner / Bigtable**: 分散データベース
- **Stubby**: RPC (gRPC の元)`,
          url: `${BASE}/production-environment/`,
        },
      ],
    },
    {
      id: "part2",
      kind: "part",
      title: "Part II — Principles",
      summary: "SRE が拠って立つ原則",
      detail: "リスクの引き受け方、SLO、トイル削減、モニタリング、自動化、リリース、シンプリシティの 7 原則。",
      children: [
        {
          id: "ch3",
          kind: "chapter",
          title: "Ch. 3: Embracing Risk",
          summary: "リスクをゼロにせず、ちょうどよく引き受ける",
          detail: `信頼性は高ければ高いほどコストが指数関数的に増える。
ユーザーが体感できる以上の信頼性を提供するのは無駄。
リスク許容度をプロダクトごとに合意し、その範囲で速く動く。`,
          url: `${BASE}/embracing-risk/`,
        },
        {
          id: "ch4",
          kind: "chapter",
          title: "Ch. 4: Service Level Objectives",
          summary: "SLI / SLO / SLA を設計する",
          detail: `SRE 文化の中核となる章。SLO の定義・選び方・運用方法を扱う。`,
          url: `${BASE}/service-level-objectives/`,
          children: [
            {
              id: "ch4-sli",
              kind: "concept",
              title: "SLI (Service Level Indicator)",
              summary: "サービスの「健康」を表す定量指標",
              detail: `例: リクエストの成功率、レイテンシの 99 パーセンタイル、スループット、可用性。
**ユーザー視点**で測れること、**集計の窓**を明示することが重要。`,
            },
            {
              id: "ch4-slo",
              kind: "concept",
              title: "SLO (Service Level Objective)",
              summary: "SLI に対する目標値 (例: 99.9% / 30 日)",
              detail: `数を多く設定しすぎないこと。SLO は信頼性に関する **意思決定の基準** になる。
SLO に対する達成度がエラーバジェットを生み、リリース速度を制御する。`,
            },
            {
              id: "ch4-sla",
              kind: "concept",
              title: "SLA (Service Level Agreement)",
              summary: "SLO に違反したときの対外的な契約・ペナルティ",
              detail: `SLA は契約。SLO は社内目標。一般に **SLO は SLA より厳しく** 設定する (バッファを持たせる)。`,
            },
          ],
        },
        {
          id: "ch5",
          kind: "chapter",
          title: "Ch. 5: Eliminating Toil",
          summary: "トイルは病。測って、削って、エンジニアリングに振る",
          detail: `SRE の運用負荷を 50% 以下に保つための章。
- トイルを定義し、計測する
- 自動化・セルフサービス化で削減
- 削減できないトイルは異動・採用・キューイングで管理`,
          url: `${BASE}/eliminating-toil/`,
        },
        {
          id: "ch6",
          kind: "chapter",
          title: "Ch. 6: Monitoring Distributed Systems",
          summary: "ホワイトボックス + ブラックボックス、4 ゴールデンシグナル",
          detail: `モニタリングの第一原則を扱う有名な章。`,
          url: `${BASE}/monitoring-distributed-systems/`,
          children: [
            {
              id: "ch6-golden-signals",
              kind: "concept",
              title: "Four Golden Signals",
              summary: "Latency / Traffic / Errors / Saturation",
              detail: `ユーザー向けシステムを監視する際にまず見るべき 4 指標:
1. **Latency** — 成功/失敗を区別したレスポンスタイム
2. **Traffic** — 需要 (QPS, セッション数)
3. **Errors** — 失敗率
4. **Saturation** — リソースの逼迫度 (CPU, メモリ, I/O)`,
            },
            {
              id: "ch6-symptom-vs-cause",
              kind: "concept",
              title: "Symptom vs. Cause",
              summary: "アラートは症状で、ダッシュボードは原因で",
              detail: `**ページャー (人を起こすアラート)** はユーザー影響のある症状で出す。
原因ベースのアラートは誤検知が多く、運用負荷を増やすだけになりがち。`,
            },
          ],
        },
        {
          id: "ch7",
          kind: "chapter",
          title: "Ch. 7: The Evolution of Automation at Google",
          summary: "手作業 → 外部スクリプト → 自律システムへの段階",
          detail: `自動化の階層 (manual → externally maintained → generic → autonomous) と、
Google 内での失敗事例・成功事例を混ぜて紹介。`,
          url: `${BASE}/automation-at-google/`,
        },
        {
          id: "ch8",
          kind: "chapter",
          title: "Ch. 8: Release Engineering",
          summary: "ビルド・パッケージ・リリースを再現可能に",
          detail: `**Hermetic builds**, **設定管理**, **段階的ロールアウト** の重要性。
SRE と Release Engineer の役割分担についても言及。`,
          url: `${BASE}/release-engineering/`,
        },
        {
          id: "ch9",
          kind: "chapter",
          title: "Ch. 9: Simplicity",
          summary: "退屈なコードはよいコード。複雑性を意識的に管理する",
          detail: `偶発的複雑性を削ぎ落とし、本質的複雑性だけを残す。
削除されたコード行数も生産性指標になる、という考え方を示す。`,
          url: `${BASE}/simplicity/`,
        },
      ],
    },
    {
      id: "part3",
      kind: "part",
      title: "Part III — Practices",
      summary: "実際の運用プラクティス (18 章)",
      detail: "オンコール、ポストモーテム、負荷分散、過負荷対応、データ整合性など実務的トピック。",
      children: [
        {
          id: "ch10",
          kind: "chapter",
          title: "Ch. 10: Practical Alerting",
          summary: "時系列データを使った実用的アラート",
          url: `${BASE}/practical-alerting/`,
        },
        {
          id: "ch11",
          kind: "chapter",
          title: "Ch. 11: Being On-Call",
          summary: "オンコールの心理面・運用面",
          url: `${BASE}/being-on-call/`,
        },
        {
          id: "ch12",
          kind: "chapter",
          title: "Ch. 12: Effective Troubleshooting",
          summary: "仮説検証ループでの障害対応",
          url: `${BASE}/effective-troubleshooting/`,
        },
        {
          id: "ch13",
          kind: "chapter",
          title: "Ch. 13: Emergency Response",
          summary: "緊急対応のケーススタディ",
          url: `${BASE}/emergency-response/`,
        },
        {
          id: "ch14",
          kind: "chapter",
          title: "Ch. 14: Managing Incidents",
          summary: "Incident Command System (ICS) ベースの体制",
          url: `${BASE}/managing-incidents/`,
        },
        {
          id: "ch15",
          kind: "chapter",
          title: "Ch. 15: Postmortem Culture",
          summary: "Blameless postmortem で学習する組織を作る",
          detail: `失敗から学ぶ文化の作り方。`,
          url: `${BASE}/postmortem/`,
          children: [
            {
              id: "ch15-blameless",
              kind: "concept",
              title: "Blameless",
              summary: "個人を責めず、システム・プロセスを責める",
              detail: `「誰が悪かったか」ではなく「なぜそういう判断をしてしまうシステムだったか」を問う。
人を責めると失敗が隠蔽され、学習機会が失われる。`,
            },
            {
              id: "ch15-action-items",
              kind: "concept",
              title: "Action Items",
              summary: "実行可能で追跡可能な改善アクションを伴うこと",
              detail: `教訓だけ書いても改善は起きない。担当者・期日・優先度のついたチケットに落とすことが必須。`,
            },
          ],
        },
        {
          id: "ch16",
          kind: "chapter",
          title: "Ch. 16: Tracking Outages",
          summary: "障害をデータとして集約し傾向を見る",
          url: `${BASE}/tracking-outages/`,
        },
        {
          id: "ch17",
          kind: "chapter",
          title: "Ch. 17: Testing for Reliability",
          summary: "信頼性のためのテスト戦略",
          url: `${BASE}/testing-reliability/`,
        },
        {
          id: "ch18",
          kind: "chapter",
          title: "Ch. 18: Software Engineering in SRE",
          summary: "SRE が書くソフトウェア (Auxon の例)",
          url: `${BASE}/software-engineering-in-sre/`,
        },
        {
          id: "ch19",
          kind: "chapter",
          title: "Ch. 19: Load Balancing at the Frontend",
          summary: "DNS / Anycast / GSLB でのフロント負荷分散",
          url: `${BASE}/load-balancing-frontend/`,
        },
        {
          id: "ch20",
          kind: "chapter",
          title: "Ch. 20: Load Balancing in the Datacenter",
          summary: "Subsetting, Weighted Round Robin など",
          url: `${BASE}/load-balancing-datacenter/`,
        },
        {
          id: "ch21",
          kind: "chapter",
          title: "Ch. 21: Handling Overload",
          summary: "過負荷時の優雅な劣化",
          url: `${BASE}/handling-overload/`,
        },
        {
          id: "ch22",
          kind: "chapter",
          title: "Ch. 22: Addressing Cascading Failures",
          summary: "カスケード障害のパターンと対策",
          url: `${BASE}/addressing-cascading-failures/`,
        },
        {
          id: "ch23",
          kind: "chapter",
          title: "Ch. 23: Managing Critical State",
          summary: "Paxos などの分散合意で重要状態を扱う",
          url: `${BASE}/managing-critical-state/`,
        },
        {
          id: "ch24",
          kind: "chapter",
          title: "Ch. 24: Distributed Periodic Scheduling with Cron",
          summary: "信頼できる分散 cron の作り方",
          url: `${BASE}/distributed-periodic-scheduling/`,
        },
        {
          id: "ch25",
          kind: "chapter",
          title: "Ch. 25: Data Processing Pipelines",
          summary: "バッチ・ストリーミングパイプラインの運用",
          url: `${BASE}/data-processing-pipelines/`,
        },
        {
          id: "ch26",
          kind: "chapter",
          title: "Ch. 26: Data Integrity",
          summary: "データ消失を防ぎ、復旧可能にする",
          url: `${BASE}/data-integrity/`,
        },
        {
          id: "ch27",
          kind: "chapter",
          title: "Ch. 27: Reliable Product Launches at Scale",
          summary: "Launch Coordination Engineering (LCE)",
          url: `${BASE}/reliable-product-launches/`,
        },
      ],
    },
    {
      id: "part4",
      kind: "part",
      title: "Part IV — Management",
      summary: "SRE 組織のマネジメント",
      detail: "オンコール育成、割り込み対応、組織ローテーション、コミュニケーション。",
      children: [
        {
          id: "ch28",
          kind: "chapter",
          title: "Ch. 28: Accelerating SREs to On-Call",
          summary: "新人 SRE をオンコールに乗せるまで",
          url: `${BASE}/accelerating-sre-on-call/`,
        },
        {
          id: "ch29",
          kind: "chapter",
          title: "Ch. 29: Dealing with Interrupts",
          summary: "割り込み駆動の業務をどう構造化するか",
          url: `${BASE}/dealing-with-interrupts/`,
        },
        {
          id: "ch30",
          kind: "chapter",
          title: "Ch. 30: Embedding an SRE",
          summary: "過負荷チームに SRE を一時派遣する手法",
          url: `${BASE}/embedded-sre/`,
        },
        {
          id: "ch31",
          kind: "chapter",
          title: "Ch. 31: Communication and Collaboration in SRE",
          summary: "プロダクションミーティング、文書文化",
          url: `${BASE}/communication-collaboration/`,
        },
        {
          id: "ch32",
          kind: "chapter",
          title: "Ch. 32: The Evolving SRE Engagement Model",
          summary: "PRR (Production Readiness Review) など関与モデル",
          url: `${BASE}/evolving-sre-engagement-model/`,
        },
      ],
    },
    {
      id: "part5",
      kind: "part",
      title: "Part V — Conclusions",
      summary: "他産業からの教訓と総括",
      detail: "航空・医療など高信頼性産業から SRE が学べることと、本書全体のまとめ。",
      children: [
        {
          id: "ch33",
          kind: "chapter",
          title: "Ch. 33: Lessons Learned from Other Industries",
          summary: "航空・医療・原子力からの示唆",
          url: `${BASE}/lessons-learned/`,
        },
        {
          id: "ch34",
          kind: "chapter",
          title: "Ch. 34: Conclusion",
          summary: "本書全体のまとめ",
          url: `${BASE}/conclusion/`,
        },
      ],
    },
    {
      id: "appendix",
      kind: "part",
      title: "Appendices",
      summary: "可用性表、ポストモーテム例、インシデント記録テンプレ等",
      url: `${BASE}/availability-table/`,
    },
  ],
};
