#!/bin/bash
# setup-nginx.sh — Configura proxy /api/ no nginx para o InvestAI.
# Chamado pelo deploy.yml a cada push (user deploy) e pelo setup-vps.sh (root).

SNIPPET="/etc/nginx/snippets/investai-api.conf"
LOG="/var/www/InvestAI/nginx-setup.log"
DEBUG_WEB="/var/www/InvestAI/investai/nginx-debug.txt"

log() {
    local msg="$1"
    echo "$msg" | tee -a "$LOG"
    echo "$msg" >> "$DEBUG_WEB" 2>/dev/null || true
}

# Limpa logs anteriores
: > "$LOG" 2>/dev/null || true
: > "$DEBUG_WEB" 2>/dev/null || true

log "=== setup-nginx.sh iniciado em $(date) ==="
log "Usuario: $(whoami) | EUID=$EUID | PATH=$PATH"

# ── Comando nginx: root usa direto, outros usam sudo ─────────
NGINX_BIN=$(which nginx 2>/dev/null || echo "/usr/sbin/nginx")
if [ "$EUID" -eq 0 ]; then
    NGINX="$NGINX_BIN"
    log "Modo: root"
elif sudo -n "$NGINX_BIN" -v 2>/dev/null; then
    NGINX="sudo $NGINX_BIN"
    log "Modo: sudo nginx disponivel"
else
    NGINX="$NGINX_BIN"
    log "AVISO: sem privilegios nginx — operacoes podem falhar (rode setup-vps.sh como root)"
fi

# ── 1. Garante diretorio de snippets ─────────────────────────
mkdir -p /etc/nginx/snippets 2>/dev/null || true
if [ -d /etc/nginx/snippets ]; then
    log "OK: diretorio /etc/nginx/snippets existe"
else
    log "ERRO: /etc/nginx/snippets nao encontrado — execute setup-vps.sh como root primeiro"
fi

# ── 2. Escreve snippet via arquivo temporario ─────────────────
# Usa cat + heredoc (previne expansao de variaveis nginx como $host, $remote_addr)
# depois copia para o destino — nao requer sudo (deploy tem permissao de grupo 664)
TMPSNIPPET=$(mktemp /tmp/investai-snippet.XXXXXX)
cat > "$TMPSNIPPET" << 'NGINXEOF'
    # InvestAI API — porta 3001
    # Prefixo /investai/api/ — completamente isolado de /api/ (WNR Audit/MKT)
    # proxy_pass com URI reescreve o caminho: /investai/api/X -> /api/X no Express
    location /investai/api/auth/ {
        proxy_pass         http://127.0.0.1:3001/api/auth/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 64k;
    }
    location /investai/api/ai       { proxy_pass http://127.0.0.1:3001/api/ai;       proxy_read_timeout 35s; }
    location /investai/api/health   { proxy_pass http://127.0.0.1:3001/api/health;   }
    location /investai/api/plan     { proxy_pass http://127.0.0.1:3001/api/plan;     }
    location /investai/api/checkout { proxy_pass http://127.0.0.1:3001/api/checkout; client_max_body_size 64k; }
    location /investai/api/webhook  { proxy_pass http://127.0.0.1:3001/api/webhook;  }
    location /investai/api/b3quote  { proxy_pass http://127.0.0.1:3001/api/b3quote;  }
NGINXEOF

if cp "$TMPSNIPPET" "$SNIPPET" 2>/dev/null; then
    log "Snippet escrito: $SNIPPET"
elif [ "$EUID" -eq 0 ]; then
    log "ERRO: falha inesperada ao escrever snippet como root"
else
    log "AVISO: sem permissao para escrever snippet — execute setup-vps.sh como root para corrigir"
fi
rm -f "$TMPSNIPPET"

# ── 2b. Salva dump nginx para debug ──────────────────────────
$NGINX -T 2>/dev/null > /var/www/InvestAI/nginx-dump.txt || true
DUMP_LINES=$(wc -l < /var/www/InvestAI/nginx-dump.txt 2>/dev/null || echo "0")
log "nginx -T: $DUMP_LINES linhas"
head -200 /var/www/InvestAI/nginx-dump.txt >> "$DEBUG_WEB" 2>/dev/null || true

# ── 3. Verifica se include ja esta ativo ─────────────────────
if $NGINX -T 2>/dev/null | grep -q "location /investai/api/auth/"; then
    log "Proxy InvestAI /investai/api/auth/ ja ativo — apenas recarregando nginx"
    $NGINX -t 2>&1 | tee -a "$LOG"
    $NGINX -s reload && log "Nginx recarregado OK" || log "ERRO ao recarregar nginx"
    exit 0
fi

log "Proxy InvestAI NAO encontrado — iniciando configuracao automatica (requer root)"

# ── 4. Insere include no config nginx via Python (funciona como root) ──
python3 << 'PYEOF'
import subprocess, re, os, sys

LOG     = "/var/www/InvestAI/nginx-setup.log"
WEB_LOG = "/var/www/InvestAI/investai/nginx-debug.txt"

def log(msg):
    print(msg)
    for path in [LOG, WEB_LOG]:
        try:
            with open(path, 'a') as f:
                f.write(msg + "\n")
        except Exception:
            pass

# Roda nginx -T (tenta sudo se retornar vazio)
result = subprocess.run(['nginx', '-T'], capture_output=True, text=True)
full = result.stdout
if not full.strip():
    result = subprocess.run(['sudo', 'nginx', '-T'], capture_output=True, text=True)
    full = result.stdout
    log("nginx -T sem saida, tentou com sudo")

config_files = re.findall(r'# configuration file (.+?):', full)
log(f"Arquivos nginx encontrados ({len(config_files)}): {config_files}")

snippet = '/etc/nginx/snippets/investai-api.conf'
keywords = ['wnrtecnologia', '/var/www/InvestAI', 'investai']
target = None

for ssl_required in [True, False]:
    for cf in config_files:
        try:
            content = open(cf).read()
        except PermissionError:
            try:
                r = subprocess.run(['sudo', 'cat', cf], capture_output=True, text=True)
                content = r.stdout
            except Exception as e2:
                log(f"  erro de permissao ao ler {cf}: {e2}")
                continue
        except Exception as e:
            log(f"  erro ao ler {cf}: {e}")
            continue
        has_site = any(k in content for k in keywords)
        has_ssl  = ('443' in content or 'ssl_certificate' in content)
        log(f"  {cf}: has_site={has_site}, has_ssl={has_ssl}")
        if has_site and (not ssl_required or has_ssl):
            target = cf
            log(f"Arquivo alvo encontrado: {cf} (ssl={has_ssl})")
            break
    if target:
        break

if not target:
    log("ERRO: nenhum arquivo nginx adequado encontrado")
    log(f"Primeiras 3000 chars do nginx -T:\n{full[:3000]}")
    sys.exit(1)

try:
    content = open(target).read()
except PermissionError:
    r = subprocess.run(['sudo', 'cat', target], capture_output=True, text=True)
    content = r.stdout
    log("Arquivo lido via sudo cat")

if snippet in content:
    log("Include ja existe no arquivo — nada a fazer")
    sys.exit(0)

lines = content.split('\n')
log(f"Total de linhas no arquivo: {len(lines)}")

# Brace-counting para encontrar o ultimo server block ao nivel 0
brace_depth = 0
last_server_open = -1
last_server_close = -1

for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('#'):
        continue
    if re.match(r'^server\s*\{', stripped) and brace_depth == 0:
        last_server_open = i
    brace_depth += stripped.count('{') - stripped.count('}')
    if brace_depth == 0 and last_server_open >= 0:
        last_server_close = i

log(f"Ultimo server block: abertura linha {last_server_open}, fechamento linha {last_server_close}")

if last_server_close < 0:
    idx = content.rfind('}')
    new_content = content[:idx] + f'\n    include {snippet};\n' + content[idx:]
    log("Fallback: inserindo antes do ultimo } do arquivo")
else:
    lines.insert(last_server_close, f'    include {snippet};')
    new_content = '\n'.join(lines)
    log(f"Include inserido antes da linha {last_server_close}")

# Escreve o arquivo (direto como root, ou sudo cp como fallback)
write_ok = False
try:
    with open(target, 'w') as f:
        f.write(new_content)
    log(f"Arquivo escrito diretamente: {target}")
    write_ok = True
except PermissionError:
    import tempfile
    with tempfile.NamedTemporaryFile(mode='w', suffix='.nginx', delete=False) as tf:
        tf.write(new_content)
        tmp = tf.name
    r = subprocess.run(['sudo', 'cp', tmp, target], capture_output=True, text=True)
    os.unlink(tmp)
    if r.returncode == 0:
        log(f"Arquivo escrito via sudo cp: {target}")
        write_ok = True
    else:
        log(f"ERRO ao escrever via sudo cp: {r.stderr.strip()}")
        log("SOLUCAO: execute 'sudo bash /var/www/InvestAI/api/setup-vps.sh' no VPS")

if not write_ok:
    sys.exit(1)

log(f"Configuracao concluida. Include adicionado em {target}")
PYEOF

RC=$?
if [ $RC -ne 0 ]; then
    log "Configuracao nginx requer root — execute: sudo bash /var/www/InvestAI/api/setup-vps.sh"
    # Nao faz exit 1: snippet foi atualizado, apenas o include nao foi inserido ainda
    # O deploy.yml tem continue-on-error=true para este step
    exit 1
fi

# ── 5. Testa e recarrega nginx ────────────────────────────────
log "Testando configuracao nginx..."
if $NGINX -t 2>&1 | tee -a "$LOG"; then
    $NGINX -s reload
    log "Nginx recarregado com sucesso"
    log "Verificacao: $($NGINX -T 2>/dev/null | grep 'location /investai/api/auth' || echo 'NAO ENCONTRADO')"
else
    log "ERRO: nginx config invalido apos modificacao"
    tail -20 "$($NGINX -T 2>/dev/null | grep -o '# configuration file [^:]*' | grep 'investai-api' | head -1 | cut -d' ' -f4)" 2>/dev/null | tee -a "$LOG" || true
    exit 1
fi
