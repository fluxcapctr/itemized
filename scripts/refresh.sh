#!/bin/bash
# refresh.sh — full pipeline run for scheduled monthly/quarterly updates.
#
# What this does:
#   1. Re-downloads any MRF older than REFRESH_DAYS days (default 30)
#   2. Re-extracts tall + wide
#   3. Re-fetches CMS Care Compare ratings (always fresh; CMS publishes 2-3x/year)
#   4. Rebuilds the per-procedure UI data
#   5. Builds the prod bundle
#   6. Writes a status report
#
# Run:        bash scripts/refresh.sh
# Force-all:  bash scripts/refresh.sh --force
# Schedule:   see scripts/com.itemized.refresh.plist (launchd)

set -uo pipefail  # don't fail on missing vars; we want to keep going on errors

# Resolve repo root from this script's location
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$REPO_ROOT"

LOG_DIR="/tmp"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/itemized-refresh-${TS}.log"
REPORT_FILE="$LOG_DIR/itemized-refresh-${TS}.report.md"

# Default refresh window. Override by exporting REFRESH_DAYS before invocation.
export REFRESH_DAYS="${REFRESH_DAYS:-30}"

# Force flag passes through to download-mrfs.mjs
FORCE_FLAG=""
if [[ "${1:-}" == "--force" ]]; then
  FORCE_FLAG="--force"
fi

echo "===================================================" | tee -a "$LOG_FILE"
echo "Itemized refresh — start $(date -u)"                  | tee -a "$LOG_FILE"
echo "REFRESH_DAYS=$REFRESH_DAYS  force=${FORCE_FLAG:-no}"   | tee -a "$LOG_FILE"
echo "Repo: $REPO_ROOT"                                      | tee -a "$LOG_FILE"
echo "Log:  $LOG_FILE"                                       | tee -a "$LOG_FILE"
echo "==================================================="  | tee -a "$LOG_FILE"

step() {
  local label="$1"
  shift
  echo ""                                                    | tee -a "$LOG_FILE"
  echo "── STEP: $label ──"                                  | tee -a "$LOG_FILE"
  if "$@" >> "$LOG_FILE" 2>&1; then
    echo "  ✓ $label"                                        | tee -a "$LOG_FILE"
    STEP_RESULTS+=("✓ $label")
  else
    local code=$?
    echo "  ✗ $label exited $code"                           | tee -a "$LOG_FILE"
    STEP_RESULTS+=("✗ $label (exit $code)")
  fi
}

STEP_RESULTS=()

# Some commands are tolerant of failure (one bad hospital shouldn't kill the run);
# others are fatal. The script logs both kinds and continues.
step "download MRFs"      node scripts/download-mrfs.mjs $FORCE_FLAG
step "extract tall + JSON" node scripts/extract-mri.mjs
step "extract wide"       node scripts/extract-mri-wide.mjs
step "fetch CMS ratings"  node scripts/fetch-cms-ratings.mjs
step "build UI data"      node scripts/build-ui-data.mjs
step "build prod bundle"  node scripts/build-ui-prod.mjs

# Coverage check — count procedures and unique hospitals in the result set
PROC_COUNT=$(ls raw-files/results/*.json 2>/dev/null | wc -l | tr -d ' ')
HOSP_COUNT=$(node -e "
  const fs=require('fs');
  const set=new Set();
  for (const f of fs.readdirSync('raw-files/results')) {
    if (!f.endsWith('.json')) continue;
    const d=JSON.parse(fs.readFileSync('raw-files/results/'+f,'utf8'));
    for (const r of d.rows) set.add(r.hospital);
  }
  console.log(set.size);
" 2>/dev/null || echo "?")

# Report
{
  echo "# Itemized refresh report"
  echo ""
  echo "Run finished: $(date -u)"
  echo "Refresh window: $REFRESH_DAYS days"
  echo "Force flag: ${FORCE_FLAG:-no}"
  echo ""
  echo "## Steps"
  for r in "${STEP_RESULTS[@]}"; do echo "- $r"; done
  echo ""
  echo "## Coverage"
  echo "- Procedures with results: $PROC_COUNT"
  echo "- Unique hospitals in result set: $HOSP_COUNT"
  echo ""
  echo "## Log"
  echo "Full output: \`$LOG_FILE\`"
} > "$REPORT_FILE"

echo ""                                                      | tee -a "$LOG_FILE"
echo "Report: $REPORT_FILE"                                  | tee -a "$LOG_FILE"
cat "$REPORT_FILE"

# Exit non-zero if any step failed (so launchd can flag it)
for r in "${STEP_RESULTS[@]}"; do
  [[ "$r" == ✗* ]] && exit 1
done
exit 0
