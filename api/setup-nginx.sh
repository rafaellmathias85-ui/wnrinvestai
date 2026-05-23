#!/bin/bash
# setup-nginx.sh - Configura o proxy /investai/api/ no nginx.
# Escopo: somente server blocks de wnrtecnologia.com.br que servem /investai.

set -u

APP_DIR="/var/www/InvestAI"
LOG="$APP_DIR/nginx-setup.log"
DEBUG_WEB="$APP_DIR/investai/nginx-debug.txt"
TARGET="/etc/nginx/sites-enabled/wnrtecnologia"
BACKUP_DIR="$APP_DIR/backups"

log() {
    local msg="$1"
    echo "$msg" | tee -a "$LOG"
    echo "$msg" >> "$DEBUG_WEB" 2>/dev/null || true
}

mkdir -p "$BACKUP_DIR" 2>/dev/null || true
: > "$LOG" 2>/dev/null || true
: > "$DEBUG_WEB" 2>/dev/null || true

log "=== setup-nginx.sh em $(date) ==="
log "Usuario: $(whoami) | EUID=$EUID"

NGINX_BIN=$(which nginx 2>/dev/null || echo "/usr/sbin/nginx")
if [ "$EUID" -eq 0 ]; then
    NGINX="$NGINX_BIN"
    SUDO=""
    log "Modo: root"
elif sudo -n "$NGINX_BIN" -v 2>/dev/null; then
    NGINX="sudo $NGINX_BIN"
    SUDO="sudo"
    log "Modo: sudo nginx disponivel"
else
    NGINX="$NGINX_BIN"
    SUDO=""
    log "AVISO: sem sudo para nginx"
fi

if [ ! -f "$TARGET" ]; then
    log "ERRO: arquivo alvo nao encontrado: $TARGET"
    exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="$BACKUP_DIR/wnrtecnologia.$STAMP.bak"
if ! $SUDO cp "$TARGET" "$BACKUP" 2>/dev/null; then
    log "ERRO: nao foi possivel criar backup em $BACKUP"
    exit 1
fi
log "Backup: $BACKUP"

TMP=$(mktemp /tmp/investai-nginx.XXXXXX)
$SUDO python3 - "$TARGET" "$TMP" <<'PYEOF'
import re
import sys

source, dest = sys.argv[1], sys.argv[2]
text = open(source, encoding='utf-8').read()

begin = '    # BEGIN INVESTAI API PROXY'
end = '    # END INVESTAI API PROXY'

proxy_block = f'''{begin}
    location /investai/api/auth/ {{
        proxy_pass http://127.0.0.1:3001/api/auth/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 64k;
    }}

    location /investai/api/health   {{ proxy_pass http://127.0.0.1:3001/api/health;   }}
    location /investai/api/plan     {{ proxy_pass http://127.0.0.1:3001/api/plan;     }}
    location /investai/api/ai       {{ proxy_pass http://127.0.0.1:3001/api/ai;       }}
    location /investai/api/checkout {{ proxy_pass http://127.0.0.1:3001/api/checkout; }}
    location /investai/api/webhook  {{ proxy_pass http://127.0.0.1:3001/api/webhook;  }}
    location /investai/api/b3quote  {{ proxy_pass http://127.0.0.1:3001/api/b3quote;  }}
{end}
'''

# Remove blocos gerenciados anteriores e includes antigos que causavam conflitos.
text = re.sub(
    r'\n?[ \t]*# BEGIN INVESTAI API PROXY.*?[ \t]*# END INVESTAI API PROXY\n?',
    '\n',
    text,
    flags=re.S,
)
text = '\n'.join(
    line for line in text.splitlines()
    if '/etc/nginx/snippets/investai-api.conf' not in line
) + '\n'

lines = text.splitlines()
blocks = []
start = None
depth = 0
for i, line in enumerate(lines):
    stripped = line.strip()
    if start is None and stripped.startswith('server') and '{' in stripped:
        start = i
        depth = stripped.count('{') - stripped.count('}')
        continue
    if start is not None:
        depth += stripped.count('{') - stripped.count('}')
        if depth == 0:
            blocks.append((start, i))
            start = None

insertions = []
for start, stop in blocks:
    block = '\n'.join(lines[start:stop + 1])
    if 'server_name wnrtecnologia.com.br' not in block and 'server_name www.wnrtecnologia.com.br' not in block:
        continue
    if '/investai' not in block and '/var/www/InvestAI' not in block:
        continue

    insert_at = stop
    for j in range(start, stop + 1):
        if re.search(r'^\s*location\s+/investai/', lines[j]):
            insert_at = j
            break
    insertions.append(insert_at)

if not insertions:
    raise SystemExit('nenhum server block wnrtecnologia com /investai encontrado')

for idx in sorted(insertions, reverse=True):
    lines.insert(idx, proxy_block.rstrip('\n'))

open(dest, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'inserido em {len(insertions)} server block(s)')
PYEOF

if [ $? -ne 0 ]; then
    log "ERRO: falha ao preparar configuracao"
    rm -f "$TMP"
    exit 1
fi

if ! $SUDO cp "$TMP" "$TARGET" 2>/dev/null; then
    log "ERRO: sem permissao para atualizar $TARGET"
    rm -f "$TMP"
    exit 1
fi
rm -f "$TMP"

log "Testando configuracao nginx..."
TEST_LOG=$(mktemp /tmp/investai-nginx-test.XXXXXX)
if ! $NGINX -t > "$TEST_LOG" 2>&1; then
    cat "$TEST_LOG" | tee -a "$LOG"
    log "ERRO: nginx -t falhou; revertendo backup"
    $SUDO cp "$BACKUP" "$TARGET" 2>/dev/null || true
    rm -f "$TEST_LOG"
    exit 1
fi
cat "$TEST_LOG" | tee -a "$LOG"
rm -f "$TEST_LOG"

if $NGINX -s reload 2>>"$LOG"; then
    log "OK: nginx recarregado"
else
    log "ERRO: nginx -s reload falhou"
    exit 1
fi

HTTP=$(curl -sS --max-time 5 -o /tmp/investai-nginx-health.out -w '%{http_code}' http://127.0.0.1/investai/api/health 2>/dev/null || true)
log "Validacao /investai/api/health: HTTP $HTTP"
cat /tmp/investai-nginx-health.out >> "$LOG" 2>/dev/null || true
rm -f /tmp/investai-nginx-health.out

if [ "$HTTP" != "200" ]; then
    log "ERRO: proxy /investai/api/health nao respondeu 200"
    exit 1
fi

log "OK: proxy /investai/api/ ativo"
