#!/bin/bash
# setup-vps.sh — Configuracao unica do VPS para InvestAI.
#
# Execute UMA VEZ como root:
#   sudo bash /var/www/InvestAI/api/setup-vps.sh
#
# Apos este script, todos os deploys via GitHub Actions serao autonomos.

set -uo pipefail

ACTIONS_DIR="/var/www/InvestAI"
RUNNER_USER="${1:-deploy}"

echo "=== InvestAI VPS — Configuracao Inicial ==="
echo "Diretorio : $ACTIONS_DIR"
echo "Runner    : $RUNNER_USER"
echo ""

if [ "$EUID" -ne 0 ]; then
    echo "ERRO: execute como root: sudo bash $0"
    exit 1
fi

# ── 1. Diretorios ─────────────────────────────────────────────
mkdir -p "$ACTIONS_DIR/logs" "$ACTIONS_DIR/backups"
chown "$RUNNER_USER:$RUNNER_USER" "$ACTIONS_DIR/logs" "$ACTIONS_DIR/backups" 2>/dev/null || true
echo "OK: diretorios de logs e backups"

# ── 2. Permissao no diretorio de snippets nginx ───────────────
mkdir -p /etc/nginx/snippets
chown root:"$RUNNER_USER" /etc/nginx/snippets
chmod 775 /etc/nginx/snippets
echo "OK: /etc/nginx/snippets gravavel pelo grupo $RUNNER_USER"

# ── 3. Sudoers: nginx sem senha para o runner ─────────────────
NGINX_BIN=$(which nginx 2>/dev/null || echo "/usr/sbin/nginx")
SUDOERS_FILE="/etc/sudoers.d/investai-deploy"
cat > "$SUDOERS_FILE" << SUDOEOF
$RUNNER_USER ALL=(ALL) NOPASSWD: $NGINX_BIN
SUDOEOF
chmod 440 "$SUDOERS_FILE"
if visudo -cf "$SUDOERS_FILE" 2>&1; then
    echo "OK: sudoers — $RUNNER_USER pode executar nginx sem senha"
else
    echo "AVISO: visudo reportou erro — verifique $SUDOERS_FILE"
fi

# ── 4. Configura nginx (insere include no server block) ───────
echo ""
echo "Configurando nginx..."
bash "$ACTIONS_DIR/api/setup-nginx.sh"
NGINX_RC=$?

# ── 5. Permissao no arquivo de config nginx ───────────────────
# Torna o arquivo de config do site gravavel pelo runner para que
# deploys futuros possam atualizar o include de forma autonoma.
TARGET=""
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*; do
    [ -f "$f" ] || continue
    if grep -qE "wnrtecnologia|InvestAI|investai" "$f" 2>/dev/null; then
        TARGET="$f"
        break
    fi
done

if [ -n "$TARGET" ]; then
    chown root:"$RUNNER_USER" "$TARGET"
    chmod 664 "$TARGET"
    echo "OK: $TARGET — grupo $RUNNER_USER pode modificar"
else
    echo "AVISO: arquivo de config nginx nao encontrado para ajustar permissoes"
fi

# Permissao no snippet (caso nao tenha sido criado ainda)
SNIPPET="/etc/nginx/snippets/investai-api.conf"
if [ -f "$SNIPPET" ]; then
    chown root:"$RUNNER_USER" "$SNIPPET"
    chmod 664 "$SNIPPET"
    echo "OK: $SNIPPET — grupo $RUNNER_USER pode modificar"
fi

# ── 6. Cria usuario admin no banco de dados ───────────────────
echo ""
echo "Verificando banco de dados..."
API_DIR="$ACTIONS_DIR/api"

if [ -f "$API_DIR/db.js" ] && command -v node >/dev/null 2>&1; then
    cd "$API_DIR"
    node -e "
      try {
        const db     = require('./db');
        const bcrypt = require('./node_modules/bcryptjs');
        const email  = 'rafaellmathias85@gmail.com';
        if (!db.getUserByEmail(email)) {
          db.createUser(email, 'Rafael Mathias', bcrypt.hashSync('InvestAI@2026', 10));
          console.log('Admin criado: ' + email);
        } else {
          console.log('Admin ja existe: ' + email);
        }
      } catch(e) { console.log('AVISO DB: ' + e.message); }
    "
    cd -
else
    echo "AVISO: api/db.js nao encontrado"
fi

# ── Resumo ─────────────────────────────────────────────────────
echo ""
echo "=== Configuracao concluida ==="
if [ $NGINX_RC -eq 0 ]; then
    echo "  nginx  : OK (proxy /investai/api/ ativo)"
else
    echo "  nginx  : AVISO — proxy pode nao estar ativo (verifique nginx-setup.log)"
fi
echo "  runner : $RUNNER_USER"
echo ""
echo "Proximos pushes para main serao 100% autonomos."
