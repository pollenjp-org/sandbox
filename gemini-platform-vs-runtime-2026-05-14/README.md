# Gemini on Agent Platform vs Agent Runtime

April 22, 2026 の Google Cloud Next '26 で **Vertex AI** が
**Gemini Enterprise Agent Platform** にリブランドされ、その中の
managed runtime である **Agent Engine** が **Agent Runtime** に改名された。
このリポジトリは、この 2 つの面の使い分けを Go の最小実装で示す。

| 観点 | Gemini on Agent Platform | Agent Runtime |
| --- | --- | --- |
| 形 | モデル呼び出し API (1 関数) | デプロイ済みエージェントの managed host |
| エンドポイント | `POST /v1/models/{model}:generateContent` | `POST /v1/reasoningEngines/{id}/sessions/{sid}:query` |
| 状態 | 完全ステートレス | サーバ側にセッション + Memory Bank |
| 履歴 | 毎回クライアントが全件送る | サーバが保持 |
| ツール実行 | クライアント側で実装 | サーバ側で実行 (A2A orchestration 含む) |
| メモリ | クライアントが管理 | Memory Bank / Memory Profile |
| デプロイ単位 | なし(モデル直叩き) | `adk deploy` でホストされた reasoning engine |
| 典型 SDK 呼び出し (Go) | `client.Models.GenerateContent(ctx, model, contents, cfg)` | `client.ReasoningEngines.Query(ctx, id, sessionID, input)` |
| 何を自前で実装するか | 履歴・メモリ・ツール・永続化・スケール | (基本的に) 何も |

要点は、**Platform = 素の Gemini モデルにアクセスするための面**、
**Runtime = ADK で書いたエージェントを動かす managed host**、ということ。
両者は対立する選択肢ではなく、Runtime の中で動くエージェントが Platform を
呼び出すという階層関係になっている。

## レイアウト

```
.
├── cmd/
│   ├── mockserver/   両方のエンドポイントを模した HTTP サーバ
│   ├── platform/     "Gemini on Agent Platform" デモ (ステートレス)
│   └── runtime/      "Agent Runtime" デモ (managed session)
└── internal/api/     共有 JSON 型 (リクエスト/レスポンス)
```

`mockserver` は実 API を再現するためのもので、決定的な fake model を
使っているので API key なしで動く。実 SDK に置き換えるときは、
`generateContent`/`query` を `google.golang.org/genai` および
ADK Go client に差し替えれば構造はそのまま使える。

## 動かす

3 つのターミナル(または `&`)で:

```sh
# 1. mock サーバ起動
go run ./cmd/mockserver

# 2. Agent Platform クライアント (履歴は自分で持つ)
go run ./cmd/platform

# 3. Agent Runtime クライアント (履歴はサーバが持つ)
go run ./cmd/runtime
```

### 期待出力 (Platform)

```
=== Gemini on Agent Platform: WITH client-side history ===
user [1]:  add 30 for taxi
model[1]:  Recorded. Running total: 30.
user [2]:  add 50 for lunch
model[2]:  Recorded. Running total: 80.
user [3]:  what is the total?
model[3]:  Total spent: 80 (breakdown: taxi=30, lunch=50)

=== Gemini on Agent Platform: WITHOUT client-side history (broken) ===
user [1]:  add 30 for taxi
model[1]:  Recorded. Running total: 30.
user [2]:  add 50 for lunch
model[2]:  Recorded. Running total: 50.   <-- 前ターンの 30 が忘却されている
user [3]:  what is the total?
model[3]:  Total spent: 0 (breakdown: )   <-- 履歴を送らないと完全に忘れる
```

ポイント: 「ちゃんと動くケース」はクライアントが履歴をローカルに溜めて
**毎回全部送り直している**。「壊れたケース」は最新ターンしか送らないので、
サーバから見るとそれまでの会話が存在しない。

### 期待出力 (Runtime)

```
=== Agent Runtime: session sess-1 opened ===
user [1]: add 30 for taxi
model[1]: Recorded. Running total: 30.
           tools=[record_expense]  memory=map[taxi:30]  turn=1
user [2]: add 50 for lunch
model[2]: Recorded. Running total: 80.
           tools=[record_expense]  memory=map[lunch:50 taxi:30]  turn=2
user [3]: what is the total?
model[3]: Total spent: 80 (breakdown: lunch=50, taxi=30)
           tools=[]  memory=map[lunch:50 taxi:30]  turn=3
```

ポイント: クライアントは **毎ターン 1 メッセージしか送っていない**。
履歴・running total・ツール実行 (`record_expense`) はすべて runtime 側で
発生している。`memory=` で Memory Bank のスナップショットも返ってくる。

## どう使い分けるか

- 単発の補完・分類・要約・RAG の最後の generate 部分: **Platform** 直叩きで十分。
  自前で書く orchestration が少なく、レイテンシも 1 hop。
- マルチターン対話・長期記憶・ツール実行・A2A 連携・本番運用 (オートスケール,
  observability, IAM, セッション永続化): **Runtime** にデプロイする。
  自前で書かなくていいものが激増する代わりに、エージェントを ADK で書いて
  `adk deploy` する必要がある。

## 参考

- [Introducing Gemini Enterprise Agent Platform](https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform)
- [The new Gemini Enterprise: one platform for agent development](https://cloud.google.com/blog/products/ai-machine-learning/the-new-gemini-enterprise-one-platform-for-agent-development)
- [Gemini Enterprise Agent Platform (formerly Vertex AI)](https://cloud.google.com/products/gemini-enterprise-agent-platform)
- [Deploy to Vertex AI Agent Engine (ADK docs)](https://google.github.io/adk-docs/deploy/agent-engine/)
- [Vertex AI Agent Builder 2026 guide](https://uibakery.io/blog/vertex-ai-agent-builder)
