#!/usr/bin/env bash
# Grant the genie-monitor app's service principal read-only access to the trace schema.
# Usage: PROFILE=<profile> ./scripts/grant_app_sp.sh
set -euo pipefail
PROFILE="${PROFILE:?set PROFILE to your Databricks CLI profile}"
APP="${APP:-genie-monitor}"
CATALOG="${CATALOG:-main}"
SCHEMA="${SCHEMA:-genie_monitoring}"

SP=$(databricks apps get "$APP" --profile "$PROFILE" -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['service_principal_client_id'])")
echo "App SP: $SP"
databricks grants update catalog "$CATALOG" --profile "$PROFILE" \
  --json "{\"changes\":[{\"principal\":\"$SP\",\"add\":[\"USE_CATALOG\"]}]}" >/dev/null
databricks grants update schema "$CATALOG.$SCHEMA" --profile "$PROFILE" \
  --json "{\"changes\":[{\"principal\":\"$SP\",\"add\":[\"USE_SCHEMA\",\"SELECT\"]}]}" >/dev/null
databricks grants get schema "$CATALOG.$SCHEMA" --principal "$SP" --profile "$PROFILE"
