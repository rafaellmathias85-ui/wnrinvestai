#!/bin/bash
# Diagnose InvestAI deploy/auth without changing other services.

set -u

APP_DIR="/var/www/InvestAI"
LOG_DIR="$APP_DIR/logs"
REPORT="$LOG_DIR/deploy-diagnose-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$LOG_DIR" 2>/dev/null || true

run() {
  echo ""
  echo "## $*"
  "$@" 2>&1 || true
}

{
  echo "InvestAI deploy diagnose"
  echo "Date: $(date -Is)"
  echo "Host: $(hostname)"
  echo "User: $(whoami)"
  echo "App dir: $APP_DIR"

  run pwd
  run ls -la "$APP_DIR"

  if [ -d "$APP_DIR/.git" ]; then
    echo ""
    echo "## git"
    git -C "$APP_DIR" log -1 --format='commit=%h subject=%s date=%ci'
    git -C "$APP_DIR" status --short
  fi

  echo ""
  echo "## pm2"
  pm2 describe investai-api 2>&1 || true

  echo ""
  echo "## node/api"
  curl -sS --max-time 5 -i http://127.0.0.1:3001/api/health 2>&1 || true

  echo ""
  echo "## node/auth-prefix"
  curl -sS --max-time 5 -i \
    -X POST http://127.0.0.1:3001/investai/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"deploy-probe@investai.local","password":"123456"}' 2>&1 || true

  echo ""
  echo "## nginx/local-health"
  curl -sS --max-time 5 -i http://127.0.0.1/investai/api/health 2>&1 || true

  echo ""
  echo "## nginx/local-auth"
  curl -sS --max-time 5 -i \
    -X POST http://127.0.0.1/investai/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"deploy-probe@investai.local","password":"123456"}' 2>&1 || true

  echo ""
  echo "## nginx/snippet"
  cat /etc/nginx/snippets/investai-api.conf 2>&1 || true

  echo ""
  echo "## nginx/config-investai"
  nginx -T 2>&1 | grep -nE 'server_name wnrtecnologia|location /investai|investai-api.conf|/var/www/InvestAI' || true

  echo ""
  echo "## sqlite"
  (cd "$APP_DIR/api" && NODE_ENV=production node -e "require('./db'); console.log('sqlite ok')" && ls -lh data.sqlite) 2>&1 || true
} | tee "$REPORT"

echo ""
echo "Report saved: $REPORT"
