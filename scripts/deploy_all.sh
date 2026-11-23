#!/usr/bin/env bash
# End-to-end deploy: ingest notebook -> scheduled job -> app -> service-principal grants.
#
# Required:  PROFILE       Databricks CLI profile (workspace host + auth)
#            SPACE_ID      Genie Agent (space) ID to monitor  (URL: /genie/rooms/<SPACE_ID>)
#            WAREHOUSE_ID  SQL warehouse the app queries through
# Optional:  SCHEMA        target catalog.schema (default main.genie_monitoring) - run scripts/set_schema.sh first if you change it
#
# Usage: PROFILE=my-ws SPACE_ID=01f1... WAREHOUSE_ID=abc123 ./scripts/deploy_all.sh
set -euo pipefail
PROFILE="${PROFILE:?set PROFILE}"; SPACE_ID="${SPACE_ID:?set SPACE_ID}"; WAREHOUSE_ID="${WAREHOUSE_ID:?set WAREHOUSE_ID}"
SCHEMA="${SCHEMA:-main.genie_monitoring}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ME=$(databricks current-user me --profile "$PROFILE" -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['userName'])")
NB_DIR="/Workspace/Users/$ME/genie_monitoring"

echo "== 1/4 notebook -> $NB_DIR"
databricks workspace mkdirs "$NB_DIR" --profile "$PROFILE"
databricks workspace import "$NB_DIR/01_genie_trace_ingest" --file "$ROOT/01_genie_trace_ingest.py" \
  --format SOURCE --language PYTHON --overwrite --profile "$PROFILE"

echo "== 2/4 scheduled job"
JOB_JSON=$(python3 - "$ROOT/jobs/genie_trace_ingest.job.json" "$NB_DIR" "$SPACE_ID" "$SCHEMA" <<'PY'
import json, sys
path, nb_dir, space_id, schema = sys.argv[1:]
job = json.load(open(path))
job["tasks"][0]["notebook_task"]["notebook_path"] = f"{nb_dir}/01_genie_trace_ingest"
for p in job["parameters"]:
    if p["name"] == "space_id": p["default"] = space_id
    if p["name"] == "target_schema": p["default"] = schema
print(json.dumps(job))
PY
)
JOB_ID=$(databricks jobs list --name genie_trace_ingest --profile "$PROFILE" -o json | python3 -c "import json,sys;j=json.load(sys.stdin);print(j[0]['job_id'] if j else '')")
if [ -z "$JOB_ID" ]; then
  echo "$JOB_JSON" | databricks jobs create --json @/dev/stdin --profile "$PROFILE"
else
  echo "{\"job_id\": $JOB_ID, \"new_settings\": $JOB_JSON}" | databricks jobs reset --json @/dev/stdin --profile "$PROFILE"
fi

echo "== 3/4 app (first deploy may fail until the app SP has grants; retried below)"
(cd "$ROOT/genie-monitor" && databricks apps deploy --var="sql_warehouse_id=$WAREHOUSE_ID" --profile "$PROFILE") || true

echo "== 4/4 grants + redeploy"
PROFILE="$PROFILE" CATALOG="${SCHEMA%%.*}" SCHEMA="${SCHEMA#*.}" "$ROOT/scripts/grant_app_sp.sh"
(cd "$ROOT/genie-monitor" && databricks apps deploy --var="sql_warehouse_id=$WAREHOUSE_ID" --profile "$PROFILE")
