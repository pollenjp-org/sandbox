# sample_cloud_run_init

## 実行前に必要な作業

- コンソール上で Cloud Build Repositories を開き対象の GitHub repository の認証・登録を行う
  - 1st gen と 2nd gen があるが **1st gen** 推奨 (2026-02-03 現在)
  - 今回 region は project で統一させているためそれと同じものを選ぶ (例: `asia-northeast1`)

## 実行後に必要な作業

- 今回定義した Cloud Build Trigger を一度だけ実行し、container image を作成する

  - 理由: Cloud Run 側で実行する際に container image を指定するが、
    少なくとも Artifact Registry Repository に存在しなくてはならない
  - 実行方法

    - Case 1: (推奨) GCP コンソールから実行
    - Case 2: 以下のコマンドから実行

      ```bash
      gcloud builds triggers run <trigger-name> \
        --branch main --project <project-id> --region=asia-northeast1
      ```
