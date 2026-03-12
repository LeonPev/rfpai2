gcloud run deploy rfpai \
  --source . \
  --memory 1G \
  --cpu 1 \
  --timeout=1000 \
  --set-env-vars="GEMINI_API_KEY=AIzaSyCioACxvlUHemWSuQ0DlFBKMiySpsfE5-c,WORKFLOW_BUCKET=rfpai-jobs,WORKFLOW_PREFIX=workflows,FILE_BUCKET=rfpai-files,FILE_PREFIX=files,FILE_LOCAL_FALLBACK=false"
