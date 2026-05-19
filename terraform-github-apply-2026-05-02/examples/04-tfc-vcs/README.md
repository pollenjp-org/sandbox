# 例 4: Terraform Cloud / HCP Terraform (VCS-driven)

## フロー

```
PR open  ──▶ TFC が plan を自動実行 (Speculative plan)
              │
              └─ 結果を PR の checks に表示 + TFC UI に Run 作成
push to main ──▶ TFC が plan を実行 → "Confirm & Apply" ボタン
              │
人間が承認 ──▶ TFC が apply
              │
              └─ Slack/Email 通知
```

## メリット

- **State / lock / 履歴 / 監査ログ** がすべて TFC 内に統合
- **Sentinel / OPA** でポリシー違反を apply 前に止められる (ex: t3.xlarge 以上禁止)
- **Dynamic Provider Credentials** (OIDC) で AWS / GCP / Vault のクレデンシャルを TFC が短期発行
  - `TFC_AWS_RUN_ROLE_ARN` を env var に入れるだけで OIDC 連携が動く
- **Run task** で TFLint / Checkov / Snyk / カスタム Webhook をフックできる
- **No-Code モジュール** で開発者がフォームから workspace を作れる

## デメリット

- 月額課金 (Standard / Plus tier で機能差)
- TFC が落ちると apply できない
- カスタムが効きにくい部分は GH Actions と併用

## ハイブリッド: GH Actions から TFC API を叩く

```yaml
- name: Trigger TFC run
  run: |
    curl -X POST https://app.terraform.io/api/v2/runs \
      -H "Authorization: Bearer ${{ secrets.TFC_TOKEN }}" \
      -H "Content-Type: application/vnd.api+json" \
      -d '{
        "data": {
          "attributes": {"is-destroy": false, "message": "from gha"},
          "type": "runs",
          "relationships": {
            "workspace": {"data": {"type": "workspaces", "id": "ws-xxx"}}
          }
        }
      }'
```

これで Actions の workflow_dispatch から TFC の Run を発火できる。
