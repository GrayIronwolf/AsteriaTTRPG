#!/usr/bin/env bash
# Keyless, one-command Cloud Shell launcher for the existing Firebase project.
# This script never creates IAM roles, service accounts or private keys.
set -euo pipefail

PROJECT="asteria-ttrpg"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(printenv GITHUB_ACTIONS || true)" == "true" || "$(printenv CI || true)" == "true" ]]; then
  echo "Run from your own Google Cloud Shell, not a CI runner." >&2
  exit 1
fi
if ! command -v gcloud >/dev/null 2>&1; then
  echo "Google Cloud CLI not found; open https://shell.cloud.google.com/." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required in Cloud Shell." >&2
  exit 1
fi

echo "Finding the existing Firebase Admin SDK service account in $PROJECT..."
if ! accounts="$(gcloud iam service-accounts list --project="$PROJECT" --filter='email~^firebase-adminsdk-' --format='value(email)')"; then
  echo "Cannot list service accounts. Check your project access; no changes made." >&2
  exit 1
fi

sa="$(printf '%s\n' "$accounts" | head -n 1)"
if [[ ! "$sa" =~ ^firebase-adminsdk-[a-z0-9-]+@asteria-ttrpg\.iam\.gserviceaccount\.com$ ]]; then
  echo "Existing Firebase Admin SDK service account not found. Stop; no changes made." >&2
  exit 1
fi
if [[ "$(printf '%s\n' "$accounts" | grep -c '@' || true)" -ne 1 ]]; then
  echo "More than one Firebase Admin SDK account was found. Review before proceeding." >&2
  exit 1
fi

echo "Checking short-lived impersonation permission..."
if ! gcloud auth print-access-token --impersonate-service-account="$sa" >/dev/null; then
  echo "Your Google account cannot impersonate the existing Firebase Admin SDK service account." >&2
  echo "An administrator must grant Service Account Token Creator on THIS account only." >&2
  echo "No IAM policy, accounts or Firebase data were changed." >&2
  exit 1
fi

echo "Configuring keyless Application Default Credentials for Firebase Admin..."
if ! gcloud auth application-default login --impersonate-service-account="$sa"; then
  echo "Service account credential setup failed; no migration or activation started." >&2
  exit 1
fi

# The Admin SDK's Firestore client requires ADC, not an arbitrary token object.
export ASTERIA_ACCOUNT_ID_EXPECTED_SERVICE_ACCOUNT="$sa"
if ! env -u GOOGLE_APPLICATION_CREDENTIALS node --input-type=module -e '
  import {readFileSync} from "node:fs";
  import {join} from "node:path";
  const path=join(process.env.HOME||"", ".config/gcloud/application_default_credentials.json");
  let data;
  try { data=JSON.parse(readFileSync(path,"utf8")); } catch { process.exit(2); }
  const account=process.env.ASTERIA_ACCOUNT_ID_EXPECTED_SERVICE_ACCOUNT;
  const target=data?.service_account_impersonation_url||"";
  const ok=data?.type==="impersonated_service_account" &&
    (target.includes(account+":generateAccessToken") ||
     target.includes(encodeURIComponent(account)+":generateAccessToken"));
  if(!ok)process.exit(2);
'; then
  echo "The Firebase Admin credential did not match the approved service account." >&2
  echo "No migration or activation started." >&2
  exit 1
fi
unset ASTERIA_ACCOUNT_ID_EXPECTED_SERVICE_ACCOUNT

echo "Credentials verified. Checking production accounts before any writes..."
env -u GOOGLE_APPLICATION_CREDENTIALS \
  node scripts/account-id-coordinated-release.mjs --project "$PROJECT"
