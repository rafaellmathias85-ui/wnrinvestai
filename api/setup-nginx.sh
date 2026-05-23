#!/bin/bash
# setup-nginx.sh — Configura o proxy /api/ no nginx para o InvestAI.
# Executado automaticamente pelo deploy.yml a cada push.

set -e

SNIPPET="/etc/nginx/snippets/investai-api.conf"
mkdir -p /etc/nginx/snippets

# Escreve o bloco location /api/ -> Node.js 3001
cat > "$SNIPPET" << 'NGINXEOF'
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    add_header X-Content-Type-Options  "nosniff" always;
    client_max_body_size 64k;
}
NGINXEOF

echo "Snippet escrito: $SNIPPET"

# Se o location /api/ já está ativo no nginx, só recarrega
if nginx -T 2>/dev/null | grep -q "location /api/"; then
    echo "Proxy /api/ já configurado no nginx"
else
    # Encontra o arquivo de configuração do site
    NGINX_CONF=""
    for f in \
        /etc/nginx/sites-enabled/wnrtecnologia.com.br \
        /etc/nginx/conf.d/wnrtecnologia.conf \
        /etc/nginx/sites-enabled/default \
        $(ls /etc/nginx/sites-enabled/ 2>/dev/null | head -3); do
        if [ -f "$f" ] && grep -q "server_name\|wnrtecnologia" "$f" 2>/dev/null; then
            NGINX_CONF="$f"
            break
        fi
    done

    if [ -z "$NGINX_CONF" ]; then
        NGINX_CONF=$(grep -rl "server_name" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -1)
    fi

    if [ -n "$NGINX_CONF" ] && [ -f "$NGINX_CONF" ]; then
        echo "Adicionando include em: $NGINX_CONF"
        # Usa Python3 para inserir o include antes do último } do arquivo
        python3 - "$NGINX_CONF" "$SNIPPET" <<'PYEOF'
import sys
conf_file, snippet = sys.argv[1], sys.argv[2]
content = open(conf_file).read()
include = '\n    include ' + snippet + ';\n'
if snippet not in content:
    idx = content.rfind('}')
    if idx != -1:
        content = content[:idx] + include + content[idx:]
        open(conf_file, 'w').write(content)
        print('Include adicionado: ' + conf_file)
    else:
        print('ERRO: nao encontrou } em ' + conf_file)
        sys.exit(1)
else:
    print('Include ja existe em ' + conf_file)
PYEOF
    else
        echo "AVISO: nenhum arquivo nginx encontrado."
        echo "Adicione manualmente em /etc/nginx/sites-enabled/ o bloco:"
        cat "$SNIPPET"
        exit 0
    fi
fi

# Valida config e recarrega nginx
nginx -t 2>&1
nginx -s reload
echo "Nginx recarregado com sucesso"
