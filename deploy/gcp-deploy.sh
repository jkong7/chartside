#!/bin/sh
set -e
PROJECT="${1:-persona-onboarding-jk}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-chartside}"
BUCKET="${BUCKET:-$PROJECT-chartside-data}"
TAG="$(date +%Y%m%d-%H%M%S)"
NUM="$(gcloud projects describe "$PROJECT" --format 'value(projectNumber)')"
URL="https://$SERVICE-$NUM.$REGION.run.app"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/chartside/app:$TAG"
gcloud artifacts repositories describe chartside --project "$PROJECT" --location "$REGION" >/dev/null 2>&1 || gcloud artifacts repositories create chartside --project "$PROJECT" --location "$REGION" --repository-format docker
gcloud builds submit --project "$PROJECT" --tag "$IMAGE" --machine-type e2-highcpu-8 .
gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" --image "$IMAGE" \
  --service-account "chartside-run@$PROJECT.iam.gserviceaccount.com" \
  --allow-unauthenticated --port 8080 --memory 2Gi --cpu 2 --no-cpu-throttling \
  --min-instances 0 --max-instances 1 --concurrency 80 --timeout 3600 --session-affinity \
  --set-secrets "ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,DEEPGRAM_API_KEY=DEEPGRAM_API_KEY:latest,CHARTSIDE_SECRET=CHARTSIDE_SECRET:latest,CHARTSIDE_VAPID_PUBLIC=CHARTSIDE_VAPID_PUBLIC:latest,CHARTSIDE_VAPID_PRIVATE=CHARTSIDE_VAPID_PRIVATE:latest,CHARTSIDE_CRON_SECRET=CHARTSIDE_CRON_SECRET:latest" \
  --set-env-vars "LITESTREAM_BUCKET=$BUCKET,CHARTSIDE_TZ=America/Chicago,CHARTSIDE_LINE_DISPLAY=Demo line,CHARTSIDE_PUBLIC_URL=$URL"
echo "$URL"
