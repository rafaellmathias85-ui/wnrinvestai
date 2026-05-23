#!/bin/bash
# setup-vps.sh — Configuracao unica do VPS para InvestAI.
#
# Execute UMA VEZ como root:
#   sudo bash /var/www/InvestAI/api/setup-vps.sh
#
# Apos este script, todos os deploys via GitHub Actions serao autonomos:
#   - nginx configurado automaticamente a cada push
#   - Express gerenciado pelo PM2 (inicia no boot)

set -euo pipefail

ACTIONS_DIR="/var/www/InvestAI"
RUNNER_USER="${1:-deploy}"

echo "=== InvestAI VPS — Configuracao Inicial ==="
echo "Diretorio do projeto : $ACTIONS_DIR"
echo "Usuario do runner    : $RUNNER_USER"
echo ""

if [ "$EUID" -ne 0 ]; then
    echo "ERRO: execute como root: sudo bash $0"
    exit 1
fi

# ── 1. Cria estrutura de diretorios ──────────────────────────
mkdir -p "$ACTIONS_DIR/logs" "$ACTIONS_DIR/backups"
chown "$RUNNER_USER:$RUNNER_USER" "$ACTIONS_DIR/logs" "$ACTIONS_DIR/backups" 2>/dev/null || true
echo "OK: diretorios de logs e backups criados"

# ── 2. Permissao de escrita no diretorio de snippets nginx ───
mkdir -p /etc/nginx/snippets
chown root:"$RUNNER_USER" /etc/nginx/snippets
chmod 775 /etc/nginx/snippets
echo "OK: permissao em /etc/nginx/snippets (grupo $RUNNER_USER pode escrever)"

# ── 3. Sudoers: nginx sem senha para o runner ─────────────────
NGINX_BIN=$(which nginx 2>/dev/null || echo "/usr/sbin/nginx")
SUDOERS_FILE="/etc/sudoers.d/investai-deploy"
cat > "$SUDOERS_FILE" << SUDOEOF
$RUNNER_USER ALL=(ALL) NOPASSWD: $NGINX_BIN
SUDOEOF
chmod 440 "$SUDOERS_FILE"
visudo -c
echo "OK: sudoers configurado — $RUNNER_USER pode executar nginx sem senha"

# ── 4. Configura nginx agora (sem esperar o proximo push) ─────
echo ""
echo "Configurando nginx..."
bash "$ACTIONS_DIR/api/setup-nginx.sh"

echo ""
echo "=== Configuracao concluida! ==="
echo "O sistema e agora 100% autonomo via GitHub Actions."
echo "Proximos pushes para main irao:"
echo "  - Atualizar o codigo"
echo "  - Reiniciar o Express/PM2"
echo "  - Configurar/recarregar nginx automaticamente"
