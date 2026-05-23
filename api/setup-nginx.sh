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
    $NGINX -t > /tmp/investai_nginx_t.log 2>&1; _RC=$?
    cat /tmp/investai_nginx_t.log | tee -a "$LOG"
    if [ $_RC -eq 0 ]; then
        $NGINX -s reload && log "Nginx recarregado OK" || log "ERRO ao recarregar nginx"
    else
        log "ERRO: nginx config invalido — verifique o snippet"
    fi
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

snippet  = '/etc/nginx/snippets/investai-api.conf'
keywords = ['wnrtecnologia', '/var/www/InvestAI', 'investai']
CONF_DIRS = ['/etc/nginx/sites-enabled', '/etc/nginx/conf.d']

# ── Passo 1: remove include de qualquer lugar antes de rodar nginx -T ──
# Se o include esta em posicao errada (fora do server block), nginx -T falha
# completamente e o script nao consegue encontrar os arquivos de config.
# Limpando primeiro, nginx -T volta a funcionar.
def read_file(path):
    try:
        return open(path).read()
    except Exception:
        try:
            return subprocess.run(['sudo','cat',path], capture_output=True, text=True).stdout
        except Exception:
            return ''

def write_file(path, content):
    try:
        with open(path, 'w') as f: f.write(content)
        return True
    except PermissionError:
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.nginx', delete=False) as tf:
            tf.write(content); tmp = tf.name
        r = subprocess.run(['sudo','cp',tmp,path], capture_output=True, text=True)
        os.unlink(tmp)
        return r.returncode == 0

def list_conf_files(dirs):
    files = []
    for d in dirs:
        if not os.path.isdir(d): continue
        for f in os.listdir(d):
            fp = os.path.join(d, f)
            if os.path.exists(fp): files.append(fp)
    return files

for cf in list_conf_files(CONF_DIRS):
    content = read_file(cf)
    if snippet in content:
        cleaned = '\n'.join(l for l in content.split('\n') if snippet not in l)
        if write_file(cf, cleaned):
            log(f"Include removido de {cf} (limpeza pre-nginx-T)")
        else:
            log(f"AVISO: nao conseguiu limpar {cf}")

# ── Passo 2: nginx -T com fallback para scan de diretorios ────────────
result = subprocess.run(['nginx', '-T'], capture_output=True, text=True)
full = result.stdout
if not full.strip():
    result = subprocess.run(['sudo', 'nginx', '-T'], capture_output=True, text=True)
    full = result.stdout
    if full.strip(): log("nginx -T funcionou com sudo")

# Combina arquivos do nginx -T com scan direto de diretorios
config_files = re.findall(r'# configuration file (.+?):', full) if full.strip() else []
for cf in list_conf_files(CONF_DIRS):
    if cf not in config_files: config_files.append(cf)
log(f"Arquivos nginx ({len(config_files)}): {config_files}")

# ── Passo 3: encontra arquivo alvo (tem site keywords + ssl) ──────────
target = None
for ssl_required in [True, False]:
    for cf in config_files:
        content = read_file(cf)
        if not content: continue
        has_site = any(k in content for k in keywords)
        has_ssl  = ('443' in content or 'ssl_certificate' in content)
        log(f"  {cf}: has_site={has_site}, has_ssl={has_ssl}")
        if has_site and (not ssl_required or has_ssl):
            target = cf
            log(f"Arquivo alvo: {cf} (ssl={has_ssl})")
            break
    if target: break

if not target:
    log("ERRO: nenhum arquivo nginx adequado encontrado")
    sys.exit(1)

# ── Passo 4: brace-counting — encontra ultimo server block ────────────
content = read_file(target)
lines   = content.split('\n')
log(f"Arquivo {target}: {len(lines)} linhas")

brace_depth = 0
last_server_open = -1
last_server_close = -1

for i, line in enumerate(lines):
    stripped = line.strip()
    if not stripped or stripped.startswith('#'): continue
    if re.match(r'^server\s*\{', stripped) and brace_depth == 0:
        last_server_open = i
    brace_depth += stripped.count('{') - stripped.count('}')
    # so marca fechamento quando um } realmente trouxe depth a zero
    if brace_depth == 0 and last_server_open >= 0 and '}' in stripped:
        last_server_close = i

log(f"Ultimo server block: open={last_server_open}, close={last_server_close}")
if last_server_close >= 0:
    log(f"Linha no fechamento: {repr(lines[last_server_close])}")

if last_server_close < 0:
    idx = content.rfind('}')
    new_content = content[:idx] + f'\n    include {snippet};\n' + content[idx:]
    log("Fallback: inserindo antes do ultimo } do arquivo")
else:
    lines.insert(last_server_close, f'    include {snippet};')
    new_content = '\n'.join(lines)
    log(f"Include inserido antes da linha {last_server_close}")
    for j in range(max(0, last_server_close-1), min(len(lines), last_server_close+3)):
        log(f"  [{j}] {lines[j]}")

if not write_file(target, new_content):
    log("ERRO: nao foi possivel escrever o arquivo — execute como root")
    sys.exit(1)

log(f"OK: include adicionado em {target}")
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
$NGINX -t > /tmp/investai_nginx_t.log 2>&1; NGINX_RC=$?
cat /tmp/investai_nginx_t.log | tee -a "$LOG"
if [ $NGINX_RC -eq 0 ]; then
    $NGINX -s reload
    log "Nginx recarregado com sucesso"
    log "Verificacao: $($NGINX -T 2>/dev/null | grep 'location /investai/api/auth' || echo 'NAO ENCONTRADO')"
else
    log "ERRO: nginx config invalido apos modificacao — verifique /etc/nginx/snippets/investai-api.conf"
    exit 1
fi
