#!/bin/bash
# setup-nginx.sh — Configura proxy /api/ no nginx para o InvestAI.
# Chamado pelo deploy.yml a cada push.

SNIPPET="/etc/nginx/snippets/investai-api.conf"
LOG="/var/www/InvestAI/nginx-setup.log"

log() { echo "$1" | tee -a "$LOG"; }

log "=== setup-nginx.sh iniciado em $(date) ==="

# ── 1. Cria snippet com location /api/ ───────────────────
mkdir -p /etc/nginx/snippets
cat > "$SNIPPET" << 'NGINXEOF'
location /api/ {
    proxy_pass         http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    add_header         X-Content-Type-Options "nosniff" always;
    client_max_body_size 64k;
}
NGINXEOF
log "Snippet escrito: $SNIPPET"

# ── 2. Salva config atual para debug ─────────────────────
nginx -T 2>/dev/null > /var/www/InvestAI/nginx-dump.txt || true
log "Config nginx salvo em nginx-dump.txt ($(wc -l < /var/www/InvestAI/nginx-dump.txt) linhas)"

# ── 3. Verifica se já está configurado ───────────────────
if nginx -T 2>/dev/null | grep -q "location /api/"; then
    log "Proxy /api/ ja ativo — apenas recarregando nginx"
    nginx -t 2>&1 | tee -a "$LOG"
    nginx -s reload
    log "Nginx recarregado OK"
    exit 0
fi

log "Proxy /api/ NAO encontrado — iniciando configuracao automatica"

# ── 4. Encontra e modifica o config correto via Python ───
python3 << 'PYEOF'
import subprocess, re, os, sys

LOG = "/var/www/InvestAI/nginx-setup.log"
def log(msg):
    print(msg)
    open(LOG, 'a').write(msg + "\n")

# Roda nginx -T e captura saida
result = subprocess.run(['nginx', '-T'], capture_output=True, text=True)
full = result.stdout

# Extrai lista de arquivos de config
config_files = re.findall(r'# configuration file (.+?):', full)
log(f"Arquivos nginx encontrados: {config_files}")

snippet = '/etc/nginx/snippets/investai-api.conf'

# Prioridade: arquivo com ssl/443 + referencia ao site
keywords = ['wnrtecnologia', '/var/www/InvestAI', 'investai']
target = None

for ssl_required in [True, False]:
    for cf in config_files:
        try:
            content = open(cf).read()
            has_site = any(k in content for k in keywords)
            has_ssl  = ('443' in content or 'ssl_certificate' in content)
            if has_site and (not ssl_required or has_ssl):
                target = cf
                log(f"Arquivo alvo encontrado: {cf} (ssl={has_ssl})")
                break
        except Exception as e:
            log(f"  erro ao ler {cf}: {e}")
    if target:
        break

if not target:
    log("ERRO: nenhum arquivo nginx adequado encontrado")
    log("Conteudo de nginx-dump.txt:")
    log(open('/var/www/InvestAI/nginx-dump.txt').read()[:3000])
    sys.exit(1)

content = open(target).read()
if snippet in content:
    log("Include ja existe no arquivo")
    sys.exit(0)

include_line = f'\n    include {snippet};\n'

# Encontra o servidor block HTTPS (tem 443 ou ssl_certificate)
# e insere o include antes do seu ultimo }
# Estrategia: encontra a ultima ocorrencia de } que fecha um server block com ssl
lines = content.split('\n')
log(f"Total de linhas no arquivo: {len(lines)}")

# Encontra o ultimo } do arquivo (fecha o ultimo server block)
# Faz brace-counting para achar o fechamento correto do ultimo server block
brace_depth = 0
last_server_open = -1
last_server_close = -1

for i, line in enumerate(lines):
    stripped = line.strip()
    if re.match(r'^server\s*\{', stripped):
        if brace_depth == 0:
            last_server_open = i
    opens  = stripped.count('{')
    closes = stripped.count('}')
    brace_depth += opens - closes
    if brace_depth == 0 and last_server_open >= 0:
        last_server_close = i
        # Nao break — queremos o ULTIMO server block

log(f"Ultimo server block: abertura linha {last_server_open}, fechamento linha {last_server_close}")

if last_server_close < 0:
    # Fallback: insere antes do ultimo }
    idx = content.rfind('}')
    new_content = content[:idx] + include_line + content[idx:]
    log("Fallback: inserindo antes do ultimo } do arquivo")
else:
    # Insere antes do fechamento do ultimo server block
    lines.insert(last_server_close, f'    include {snippet};')
    new_content = '\n'.join(lines)
    log(f"Include inserido na linha {last_server_close}")

open(target, 'w').write(new_content)
log(f"Arquivo atualizado: {target}")
PYEOF

RC=$?
if [ $RC -ne 0 ]; then
    log "Python script falhou com codigo $RC"
    exit 1
fi

# ── 5. Testa e recarrega nginx ────────────────────────────
log "Testando configuracao nginx..."
if nginx -t 2>&1 | tee -a "$LOG"; then
    nginx -s reload
    log "Nginx recarregado com sucesso"
    log "Verificacao final: $(nginx -T 2>/dev/null | grep 'location /api' || echo 'NAO ENCONTRADO')"
else
    log "ERRO: nginx config invalido apos modificacao"
    # Mostra as ultimas linhas do config para debug
    log "--- ultimas 20 linhas do arquivo modificado ---"
    tail -20 "$(grep -rl 'investai-api.conf' /etc/nginx/ 2>/dev/null | head -1)" 2>/dev/null | tee -a "$LOG" || true
    exit 1
fi
