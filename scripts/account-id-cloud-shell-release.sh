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

# Cloud Shell sets CLOUDSDK_CONFIG to a per-tab temporary directory. Do not
# assume ~/.config/gcloud: find the effective gcloud directory instead.
config_dir="$(gcloud info --format='value(config.paths.global_config_dir)')"
if [[ ! "$config_dir" = /* || -z "$config_dir" ]]; then
  echo "Cannot determine Cloud Shell's active gcloud config directory." >&2
  exit 1
fi
adc_path="$config_dir/application_default_credentials.json"

# Reuse a verified impersonated ADC file to avoid unnecessary OAuth prompts.
if node scripts/account-id-cloud-shell-credentials.mjs "$adc_path" "$sa" >/dev/null 2>&1; then
  echo "Reusing existing verified, keyless Firebase Admin credentials."
else
  echo "Configuring keyless Application Default Credentials for Firebase Admin..."
  if ! gcloud auth application-default login --impersonate-service-account="$sa"; then
    echo "Google credential setup failed; no migration or activation started." >&2
    exit 1
  fi
  if ! node scripts/account-id-cloud-shell-credentials.mjs "$adc_path" "$sa"; then
    echo "The saved Firebase Admin credentials did not match the approved account." >&2
    echo "No migration or activation started." >&2
    exit 1
  fi
fi

echo "Credentials verified. Checking production accounts before any writes..."
GOOGLE_APPLICATION_CREDENTIALS="$adc_path" \
  node scripts/account-id-coordinated-release.mjs --project "$PROJECT"
