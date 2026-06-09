#!/usr/bin/env bash
set -euo pipefail

APP_SOURCE="${APP_SOURCE:-$(pwd)}"
APP_DIR="${APP_DIR:-/var/www/wnrinvestai}"
APP_PREFIX="${APP_PREFIX:-/wnrinvestai}"
API_PORT="${API_PORT:-3001}"
APP_NAME="${APP_NAME:-investai-api}"

LOG_DIR="$APP_DIR/logs"
WEB_DIR="$APP_DIR/investai"
ARTIFACT_DIR="$APP_DIR/deploy-artifacts"
DEPLOY_LOG="$LOG_DIR/deploy.log"
PROGRESS_FILE="$WEB_DIR/deploy-progress.txt"

mkdir -p "$APP_DIR" "$LOG_DIR" "$WEB_DIR" "$ARTIFACT_DIR"

log() {
  printf '%s %s\n' "$(date -Is)" "$*" | tee -a "$DEPLOY_LOG"
}

mark() {
  local step="$1"
  local status="${2:-started}"
  local line
  line="$(date -Is) step=$step status=$status"
  printf '%s\n' "$line" | tee "$PROGRESS_FILE" >> "$LOG_DIR/deploy-progress.log"
}

fail() {
  log "ERRO: $*"
  mark deploy failed
  exit 1
}

run_nginx() {
  if [ "$(id -u)" -eq 0 ]; then
    nginx "$@"
  elif sudo -n true 2>/dev/null; then
    sudo nginx "$@"
  else
    nginx "$@"
  fi
}

copy_if_missing() {
  local rel="$1"
  if [ ! -f "$APP_DIR/$rel" ] && [ -f "$APP_SOURCE/$rel" ]; then
    mkdir -p "$(dirname "$APP_DIR/$rel")"
    cp "$APP_SOURCE/$rel" "$APP_DIR/$rel"
  fi
}

set_env_value() {
  local key="$1"
  local value="${2:-}"
  local mode="${3:-always}"
  local env_file="$APP_DIR/api/.env"
  local tmp

  [ -n "$value" ] || return 0
  mkdir -p "$APP_DIR/api"
  touch "$env_file"

  if [ "$mode" = "default" ] && grep -q "^${key}=" "$env_file"; then
    return 0
  fi

  tmp="$(mktemp)"
  grep -v "^${key}=" "$env_file" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$env_file"
  chmod 600 "$env_file"
}

write_status() {
  local job_status="${1:-ok}"
  local api_http="${2:-unknown}"
  local nginx_http="${3:-unknown}"
  local commit

  commit="$(cat "$APP_DIR/.deploy-version" 2>/dev/null || echo "${GITHUB_SHA:-unknown}")"

  cat > "$WEB_DIR/deploy-status.json" <<EOF
{
  "generatedAt": "$(date -Is)",
  "status": "$job_status",
  "repository": "${GITHUB_REPOSITORY:-unknown}",
  "branch": "${GITHUB_REF_NAME:-unknown}",
  "githubSha": "${GITHUB_SHA:-unknown}",
  "serverCommit": "$commit",
  "appDir": "$APP_DIR",
  "appPrefix": "$APP_PREFIX",
  "apiHealthHttp": "$api_http",
  "nginxHealthHttp": "$nginx_http"
}
EOF
  cp "$WEB_DIR/deploy-status.json" "$ARTIFACT_DIR/deploy-status.json" 2>/dev/null || true
}

trap 'write_status failed unknown unknown' ERR

mark deploy started
log "Iniciando deploy do InvestAI em $APP_DIR"

[ -d "$APP_SOURCE" ] || fail "APP_SOURCE nao existe: $APP_SOURCE"
[ -d "$APP_SOURCE/api" ] || fail "Pasta api nao encontrada em $APP_SOURCE"
[ -d "$APP_SOURCE/investai" ] || fail "Pasta investai nao encontrada em $APP_SOURCE"

mark backup started
mkdir -p "$APP_DIR/backups"
if [ -d "$APP_DIR/investai" ]; then
  tar -czf "$APP_DIR/backups/backup-$(date +%Y%m%d-%H%M%S).tar.gz" \
    -C "$APP_DIR" investai api/package.json api/package-lock.json 2>/dev/null || true
  ls -t "$APP_DIR"/backups/backup-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -- || true
fi
mark backup ok

mark sync started
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude ".git/" \
    --exclude ".github/" \
    --exclude "node_modules/" \
    --exclude "api/node_modules/" \
    --exclude ".env" \
    --exclude "api/.env" \
    --exclude "api/data.sqlite" \
    --exclude "api/data.sqlite-shm" \
    --exclude "api/data.sqlite-wal" \
    --exclude "investai/js/config.js" \
    --exclude "logs/" \
    --exclude "backups/" \
    --exclude "deploy-artifacts/" \
    "$APP_SOURCE"/ "$APP_DIR"/
else
  log "rsync nao encontrado; usando tar como fallback sem limpeza completa de arquivos antigos"
  tar \
    --exclude=".git" \
    --exclude=".github" \
    --exclude="node_modules" \
    --exclude="api/node_modules" \
    --exclude=".env" \
    --exclude="api/.env" \
    --exclude="api/data.sqlite" \
    --exclude="api/data.sqlite-shm" \
    --exclude="api/data.sqlite-wal" \
    --exclude="investai/js/config.js" \
    --exclude="logs" \
    --exclude="backups" \
    --exclude="deploy-artifacts" \
    -C "$APP_SOURCE" -cf - . | tar -C "$APP_DIR" -xf -
fi

copy_if_missing ".env"
copy_if_missing "api/.env"
copy_if_missing "investai/js/config.js"
mark sync ok
printf '%s\n' "${GITHUB_SHA:-manual-deploy}" > "$APP_DIR/.deploy-version"

mark env started
set_env_value PORT "$API_PORT" default
set_env_value NODE_ENV production default
set_env_value APP_BASE_URL "${APP_BASE_URL:-https://wnrtecnologia.com.br${APP_PREFIX}}" default
set_env_value ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}" always
set_env_value MP_ACCESS_TOKEN "${MP_ACCESS_TOKEN:-}" always
set_env_value SMTP_HOST "${SMTP_HOST:-}" always
set_env_value SMTP_PORT "${SMTP_PORT:-}" always
set_env_value SMTP_USER "${SMTP_USER:-}" always
set_env_value SMTP_PASS "${SMTP_PASS:-}" always
set_env_value SMTP_FROM "${SMTP_FROM:-}" always
mark env ok

mark dependencies started
cd "$APP_DIR/api"
if [ -f package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund
else
  npm install --omit=dev --no-audit --no-fund
fi
npm rebuild better-sqlite3
mark dependencies ok

mark restart-api started
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

pm2 startOrRestart ecosystem.config.js --only "$APP_NAME" --update-env || {
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  pm2 start ecosystem.config.js --only "$APP_NAME" --update-env
}
pm2 save --force || true
mark restart-api ok

mark health-api started
api_http="000"
for _ in $(seq 1 30); do
  api_http="$(curl -sS --max-time 3 -o /tmp/wnrinvestai-api-health.out -w '%{http_code}' "http://127.0.0.1:${API_PORT}/api/health" 2>/dev/null || echo 000)"
  [ "$api_http" = "200" ] && break
  sleep 1
done
[ "$api_http" = "200" ] || fail "API local nao respondeu 200 em /api/health"
mark health-api ok

mark nginx started
if command -v nginx >/dev/null 2>&1; then
  run_nginx -t
  run_nginx -s reload || true
fi

nginx_http="$(curl -sS --max-time 5 -o /tmp/wnrinvestai-nginx-health.out -w '%{http_code}' "http://127.0.0.1${APP_PREFIX}/api/health" 2>/dev/null || echo 000)"
if [ "$nginx_http" != "200" ]; then
  log "AVISO: nginx nao respondeu 200 em ${APP_PREFIX}/api/health (HTTP $nginx_http). Verifique o bloco nginx do dominio."
else
  log "Nginx OK em ${APP_PREFIX}/api/health"
fi
mark nginx ok

write_status ok "$api_http" "$nginx_http"
mark deploy ok
log "Deploy concluido com sucesso"
