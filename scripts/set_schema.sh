#!/usr/bin/env bash
# Point the notebook, job, app SQL and app text at a different catalog.schema.
# Usage: ./scripts/set_schema.sh my_catalog.genie_monitoring
set -euo pipefail
NEW="${1:?usage: set_schema.sh <catalog.schema>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
grep -rl --exclude-dir=node_modules --exclude-dir=docs "main\.genie_monitoring" . | while read -r f; do
  sed -i.bak "s/main\.genie_monitoring/${NEW//\//\\/}/g" "$f" && rm -f "$f.bak" && echo "updated $f"
done
sed -i.bak "s/CATALOG:-main}/CATALOG:-${NEW%%.*}}/; s/SCHEMA:-genie_monitoring}/SCHEMA:-${NEW#*.}}/" scripts/grant_app_sp.sh && rm -f scripts/grant_app_sp.sh.bak
