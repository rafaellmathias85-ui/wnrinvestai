#!/usr/bin/env bash
# Aplica o nginx.conf do InvestAI no servidor e recarrega o nginx.
# Execute UMA VEZ na VPS após o primeiro deploy (ou sempre que nginx.conf mudar).
#
# Uso: bash /var/www/wnrinvestai/scripts/apply-nginx.sh
#
# O script detecta automaticamente o arquivo de configuração nginx do domínio.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/wnrinvestai}"
NGINX_CONF="$APP_DIR/nginx.conf"

if [ ! -f "$NGINX_CONF" ]; then
  echo "ERRO: $NGINX_CONF não encontrado. Execute após o deploy."
  exit 1
fi

# Detecta o arquivo de config do domínio nginx
CANDIDATES=(
  /etc/nginx/sites-available/wnrtecnologia.com.br
  /etc/nginx/conf.d/wnrtecnologia.conf
  /etc/nginx/conf.d/default.conf
  /etc/nginx/sites-available/default
)

NGINX_SITE=""
for f in "${CANDIDATES[@]}"; do
  if [ -f "$f" ]; then
    NGINX_SITE="$f"
    break
  fi
done

if [ -z "$NGINX_SITE" ]; then
  echo "Arquivo de config nginx não encontrado automaticamente."
  echo "Informe o caminho (ex: /etc/nginx/sites-available/wnrtecnologia.com.br):"
  read -r NGINX_SITE
fi

echo "Usando: $NGINX_SITE"

# Faz backup do atual
BACKUP="${NGINX_SITE}.bak.$(date +%Y%m%d-%H%M%S)"
cp "$NGINX_SITE" "$BACKUP"
echo "Backup salvo em: $BACKUP"

# Extrai o bloco de locations do nginx.conf (linhas sem comentários #)
# e insere dentro do server block existente — apenas se ainda não existir
if grep -q '/wnrinvestai/api/auth/' "$NGINX_SITE"; then
  echo "Configuração /wnrinvestai já presente em $NGINX_SITE — pulando inserção."
else
  # Remove entradas antigas de /investai/ que possam existir
  sed -i '/location \/investai\//d' "$NGINX_SITE" 2>/dev/null || true
  sed -i '/location = \/investai/d'  "$NGINX_SITE" 2>/dev/null || true
  sed -i '/~\* \^\/investai\//d'     "$NGINX_SITE" 2>/dev/null || true

  # Insere o conteúdo do nginx.conf antes do último } do arquivo
  CONTENT=$(grep -v '^\s*#' "$NGINX_CONF" | grep -v '^\s*$')
  # Insere antes do último fechamento de bloco
  python3 - "$NGINX_SITE" <<PYEOF
import sys, re
path = sys.argv[1]
text = open(path).read()
insert = open('$NGINX_CONF').read()
# Remove comment-only lines
insert = '\n'.join(l for l in insert.splitlines() if not l.strip().startswith('#'))
# Find last closing brace and insert before it
idx = text.rfind('}')
new_text = text[:idx] + '\n' + insert + '\n' + text[idx:]
open(path, 'w').write(new_text)
print('Blocos inseridos com sucesso.')
PYEOF
fi

# Testa e recarrega
if nginx -t 2>&1; then
  nginx -s reload
  echo "nginx recarregado com sucesso."
else
  echo "ERRO: nginx -t falhou. Restaurando backup..."
  cp "$BACKUP" "$NGINX_SITE"
  exit 1
fi

echo ""
echo "Teste: curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/wnrinvestai/api/health"
curl -s -o /dev/null -w 'HTTP: %{http_code}\n' "http://127.0.0.1/wnrinvestai/api/health" || true
