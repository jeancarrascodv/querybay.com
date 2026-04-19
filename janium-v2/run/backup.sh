#!/usr/bin/env bash

# set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
ENV_FILE="/var/lib/janium/.env"
source "${ENV_FILE}"

STAGING_DIR="/tmp/janium-backup-$$"
JANIUM_DIR="/var/lib/janium"
IMAGE_NAME="janium-xpra"
LAST_IMAGE_ID_FILE="/var/lib/janium/.last_backup_image_id"
# rsync.net destination — update when account is ready
RSYNC_DEST="${RSYNC_NET_DEST:-user@ch-s011.rsync.net:${BACKUP_DIR}}"
# Retention: at least 14 days, and at most 200 GB
RETENTION_DAYS=14
RETENTION_BYTES=$((200 * 1024 * 1024 * 1024)) # 200 GB

DATE="$(date +%Y-%m-%d_%H%M%S)"
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# ── Helpers ──────────────────────────────────────────────────────────────────
function log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

function cleanup_local() {
  if $DRY_RUN; then
    log "Dry run — staging left at ${STAGING_DIR}"
  else
    log "Cleaning up local staging directory"
    rm -rf "${STAGING_DIR}"
  fi
}
trap cleanup_local EXIT

mkdir -p "${STAGING_DIR}"

# ── 1. Postgres dump ────────────────────────────────────────────────────────
function backup_postgres() {
  log "Starting postgres backup"
  podman run --rm \
    docker.io/library/postgres:17-alpine \
    pg_dump "${DB_CONNECT_URL}" \
      --no-owner \
      --no-privileges \
      --exclude-table-data=log_entries \
    | zstd -T0 -9 > "${STAGING_DIR}/postgres_${DATE}.sql.zst"
  log "Postgres backup complete"
}

# ── 2. /var/lib/janium ──────────────────────────────────────────────────────
function backup_filesystem() {
  log "Starting filesystem backup"
  podman run --rm \
    -v "${JANIUM_DIR}:/backup:ro" \
    -v "${STAGING_DIR}:/out:rw" \
    docker.io/library/fedora:latest \
    bash -c "tar cf - --warning=no-file-ignored -C /backup . | zstd -T0 -9 > /out/janium_files_${DATE}.tar.zst"
  log "Filesystem backup complete"
}

# ── 3. Docker/Podman image (only if changed since last backup) ──────────────
function backup_image() {
  IMAGE_ID="$(podman inspect --format '{{.Id}}' "${IMAGE_NAME}" 2>/dev/null || true)"
  LAST_IMAGE_ID="$(cat "${LAST_IMAGE_ID_FILE}" 2>/dev/null || true)"

  if [[ -n "${IMAGE_ID}" && "${IMAGE_ID}" != "${LAST_IMAGE_ID}" ]]; then
    log "Image changed (${IMAGE_ID:0:12}), saving"
    podman save "${IMAGE_NAME}" | zstd -T0 -9 > "${STAGING_DIR}/janium-xpra-image_${DATE}.tar.zst"
    log "Image backup complete"
  else
    log "Image unchanged, skipping"
  fi
}

# Export functions/vars needed by background subshells
export -f backup_postgres backup_filesystem backup_image log
export DB_CONNECT_URL STAGING_DIR DATE JANIUM_DIR IMAGE_NAME LAST_IMAGE_ID_FILE

# Run all three in parallel, fail if any fails
pids=()
backup_postgres & pids+=($!)
backup_filesystem & pids+=($!)
backup_image & pids+=($!)

failed=false
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failed=true
  fi
done
if $failed; then
  log "One or more backups failed"
  exit 1
fi

# ── 4. Summary ───────────────────────────────────────────────────────────────
log "Staging contents:"
ls -lh "${STAGING_DIR}/"

if $DRY_RUN; then
  log "Dry run — skipping upload and retention pruning"
  log "Backup files are at ${STAGING_DIR}/"
  exit 0
fi

# ── 5. Upload to rsync.net ──────────────────────────────────────────────────
log "Uploading to rsync.net"
rsync -avz --progress \
  "${STAGING_DIR}/" \
  "${RSYNC_DEST}/"

log "Upload complete"

# Update image ID tracker only after successful upload
IMAGE_ID="$(podman inspect --format '{{.Id}}' "${IMAGE_NAME}" 2>/dev/null || true)"
if [[ -n "${IMAGE_ID}" ]]; then
  echo "${IMAGE_ID}" > "${LAST_IMAGE_ID_FILE}"
fi

# ── 6. Remote retention pruning ─────────────────────────────────────────────
# List remote files sorted oldest-first with sizes, prune oldest beyond limits.
# rsync.net supports a POSIX environment with standard coreutils.
log "Pruning old backups on rsync.net"
ssh "${RSYNC_DEST%%:*}" bash -s -- "${RSYNC_DEST#*:}" "${RETENTION_DAYS}" "${RETENTION_BYTES}" << 'PRUNE_EOF'
  REMOTE_DIR="$1"
  KEEP_DAYS="$2"
  MAX_BYTES="$3"
  CUTOFF="$(date -d "-${KEEP_DAYS} days" +%s 2>/dev/null || date -v-${KEEP_DAYS}d +%s)"

  cd "${REMOTE_DIR}" || exit 0

  # Build list: mtime_epoch size filename (newest first)
  files=()
  total=0
  for f in $(ls -t *.zst 2>/dev/null); do
    mtime="$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f")"
    size="$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")"
    files+=("${mtime}:${size}:${f}")
    total=$((total + size))
  done

  for entry in "${files[@]}"; do
    IFS=: read -r mtime size fname <<< "${entry}"
    # Keep if within retention window
    if [[ "${mtime}" -ge "${CUTOFF}" ]]; then
      continue
    fi
    # Keep if total is within size budget
    if [[ "${total}" -le "${MAX_BYTES}" ]]; then
      break
    fi
    echo "Removing old backup: ${fname}"
    rm -f "${fname}"
    total=$((total - size))
  done
PRUNE_EOF

log "Retention pruning complete"
log "Backup finished successfully"
