# sample cloud run

- terraform: enable apis (`sample_cloud_run_enabling_apis`)
- **manual**: connect the target github repository (at GCP console)
- terraform: create an artifact registry
- terraform: create a cloud builder (trigger)
- **manual**: run the trigger manually (push some image to the artifact registry)
- terraform: create a cloud run resource
- terraform: create an eventarc trigger resource
  - Eventarc requires
    - Eventarc API:
    - Cloud Pub/Sub API
  - cloud run を trigger するには "Cloud Run Admin API" も必要
    - https://console.cloud.google.com/apis/library/run.googleapis.com?project=civil-array-485708-k5
