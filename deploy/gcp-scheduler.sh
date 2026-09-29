#!/bin/sh
set -e
PROJECT="${1:-persona-onboarding-jk}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-chartside}"
URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
SECRET="$(gcloud secrets versions access latest --secret CHARTSIDE_CRON_SECRET --project "$PROJECT")"
gcloud services enable cloudscheduler.googleapis.com --project "$PROJECT"
if gcloud scheduler jobs describe chartside-nudges --project "$PROJECT" --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http chartside-nudges --project "$PROJECT" --location "$REGION" --schedule "5 * * * *" --uri "$URL/api/cron/nudges" --http-method POST --update-headers "Authorization=Bearer $SECRET"
else
  gcloud scheduler jobs create http chartside-nudges --project "$PROJECT" --location "$REGION" --schedule "5 * * * *" --time-zone "America/Chicago" --uri "$URL/api/cron/nudges" --http-method POST --headers "Authorization=Bearer $SECRET"
fi
echo "Hourly nudges and morning briefs call $URL/api/cron/nudges"
