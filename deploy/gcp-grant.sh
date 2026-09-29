#!/bin/sh
set -e
PROJECT="${1:-persona-onboarding-jk}"
REGION="${REGION:-us-central1}"
SA="chartside-run@$PROJECT.iam.gserviceaccount.com"
BUCKET="$PROJECT-chartside-data"
gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 || gcloud iam service-accounts create chartside-run --project "$PROJECT" --display-name "Chartside Cloud Run"
for S in ANTHROPIC_API_KEY DEEPGRAM_API_KEY CHARTSIDE_SECRET; do
  gcloud secrets add-iam-policy-binding "$S" --project "$PROJECT" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor >/dev/null
  echo "granted $S to $SA"
done
NUM="$(gcloud projects describe "$PROJECT" --format 'value(projectNumber)')"
gcloud secrets remove-iam-policy-binding CHARTSIDE_SECRET --project "$PROJECT" --member "serviceAccount:$NUM-compute@developer.gserviceaccount.com" --role roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 || gcloud storage buckets create "gs://$BUCKET" --project "$PROJECT" --location "$REGION" --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$SA" --role roles/storage.objectAdmin >/dev/null
echo "chartside-run can read its three secrets and write gs://$BUCKET"
