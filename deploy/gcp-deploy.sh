#!/bin/sh
set -e
PROJECT="${1:-persona-onboarding-jk}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-chartside}"
BUCKET="${BUCKET:-$PROJECT-chartside-data}"
TAG="$(date +%Y%m%d-%H%M%S)"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/chartside/app:$TAG"
gcloud artifacts repositories describe chartside --project "$PROJECT" --location "$REGION" >/dev/null 2>&1 || gcloud artifacts repositories create chartside --project "$PROJECT" --location "$REGION" --repository-format docker
gcloud storage buckets describe "gs://$BUCKET" --project "$PROJECT" >/dev/null 2>&1 || gcloud storage buckets create "gs://$BUCKET" --project "$PROJECT" --location "$REGION" --uniform-bucket-level-access --public-access-prevention
gcloud builds submit --project "$PROJECT" --tag "$IMAGE" --machine-type e2-highcpu-8 .
URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)"
gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" --image "$IMAGE" \
  --allow-unauthenticated --port 8080 --memory 2Gi --cpu 2 --no-cpu-throttling \
  --min-instances 0 --max-instances 1 --concurrency 80 --timeout 3600 --session-affinity \
  --set-secrets "ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,DEEPGRAM_API_KEY=DEEPGRAM_API_KEY:latest,CHARTSIDE_SECRET=CHARTSIDE_SECRET:latest" \
  --set-env-vars "LITESTREAM_BUCKET=$BUCKET,CHARTSIDE_TZ=America/Chicago,CHARTSIDE_LINE_DISPLAY=Demo line${URL:+,CHARTSIDE_PUBLIC_URL=$URL}"
URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" --update-env-vars "CHARTSIDE_PUBLIC_URL=$URL" >/dev/null
echo "$URL"
