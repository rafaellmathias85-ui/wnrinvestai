#!/bin/bash
# setup-nginx.sh — Configura proxy /investai/api/ no nginx.
# Chamado pelo deploy.yml a cada push (user deploy) e pelo setup-vps.sh (root).

SNIPPET="/etc/nginx/snippets/investai-api.conf"
LOG="/var/www/InvestAI/nginx-setup.log"
DEBUG_WEB="/var/www/InvestAI/investai/nginx-debug.txt"

log() {
    local msg="$1"
    echo "$msg" | tee -a "$LOG"
    echo "$msg" >> "$DEBUG_WEB" 2>/dev/null || true
}

: > "$LOG" 2>/dev/null || true
: > "$DEBUG_WEB" 2>/dev/null || true

log "=== setup-nginx.sh em $(date) ==="
log "Usuario: $(whoami) | EUID=$EUID"

# ── nginx command ──────────────────────────────────────────────
NGINX_BIN=$(which nginx 2>/dev/null || echo "/usr/sbin/nginx")
if [ "$EUID" -eq 0 ]; then
    NGINX="$NGINX_BIN"
    log "Modo: root"
elif sudo -n "$NGINX_BIN" -v 2>/dev/null; then
    NGINX="sudo $NGINX_BIN"
    log "Modo: sudo nginx disponivel"
else
    NGINX="$NGINX_BIN"
    log "AVISO: sem privilegios nginx"
fi

# ── 1. Atualiza snippet ────────────────────────────────────────
mkdir -p /etc/nginx/snippets 2>/dev/null || true
TMPSNIPPET=$(mktemp /tmp/investai-snippet.XXXXXX)
cat > "$TMPSNIPPET" << 'NGINXEOF'
    # InvestAI API — porta 3001
    # Prefixo /investai/api/ — isolado de /api/ (WNR Audit/MKT)

    location /investai/api/auth/ {
        proxy_pass         http://127.0.0.1:3001/api/auth/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 64k;
    }
    location /investai/api/ai {
        proxy_pass         http://127.0.0.1:3001/api/ai;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
        proxy_read_timeout 35s;
    }
    location /investai/api/checkout {
        proxy_pass         http://127.0.0.1:3001/api/checkout;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
        client_max_body_size 64k;
    }
    location /investai/api/webhook {
        proxy_pass         http://127.0.0.1:3001/api/webhook;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
    }
    location /investai/api/health  { proxy_pass http://127.0.0.1:3001/api/health;  }
    location /investai/api/plan    { proxy_pass http://127.0.0.1:3001/api/plan;    }
    location /investai/api/b3quote { proxy_pass http://127.0.0.1:3001/api/b3quote; }
NGINXEOF

if cp "$TMPSNIPPET" "$SNIPPET" 2>/dev/null; then
    log "Snippet atualizado: $SNIPPET"
else
    log "AVISO: nao foi possivel escrever snippet"
fi
rm -f "$TMPSNIPPET"

# ── 2. Verifica se include ja esta ativo ──────────────────────
$NGINX -T 2>/dev/null > /tmp/investai_nginx_dump.txt || true
DUMP_LINES=$(wc -l < /tmp/investai_nginx_dump.txt 2>/dev/null || echo 0)
log "nginx -T: $DUMP_LINES linhas"
head -200 /tmp/investai_nginx_dump.txt >> "$DEBUG_WEB" 2>/dev/null || true

if grep -q "location /investai/api/auth/" /tmp/investai_nginx_dump.txt 2>/dev/null; then
    log "Include ativo — recarregando nginx"
    $NGINX -t > /tmp/investai_nginx_t.log 2>&1; _RC=$?
    cat /tmp/investai_nginx_t.log | tee -a "$LOG"
    if [ $_RC -eq 0 ]; then
        $NGINX -s reload && log "OK: nginx recarregado" || log "ERRO ao recarregar nginx"
    else
        log "ERRO: config nginx invalida"
    fi
    log "Continuando para garantir include em todos os server blocks InvestAI"
fi

log "Include NAO ativo — iniciando configuracao"

# ── 3. Python: localiza arquivo alvo e insere include ─────────
# Estrategia SEGURA:
#   a) Encontra o arquivo alvo PRIMEIRO
#   b) Remove includes mal-posicionados de arquivos nao-alvo
#   c) Modifica o arquivo alvo em memoria (remove + reinsere no lugar certo)
#   d) Escreve o arquivo alvo UMA VEZ — se falhar, original fica intacto
python3 << 'PYEOF'
import subprocess, re, os, sys

LOG     = "/var/www/InvestAI/nginx-setup.log"
WEB_LOG = "/var/www/InvestAI/investai/nginx-debug.txt"

def log(msg):
    print(msg)
    for path in [LOG, WEB_LOG]:
        try:
            with open(path, 'a') as f: f.write(msg + "\n")
        except Exception:
            pass

def read_file(path):
    try:
        return open(path).read()
    except Exception:
        try:
            r = subprocess.run(['sudo', 'cat', path], capture_output=True, text=True, timeout=5)
            return r.stdout
        except Exception:
            return ''

def write_file(path, content):
    try:
        with open(path, 'w') as f: f.write(content)
        return True
    except PermissionError:
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.nginx', delete=False) as tf:
            tf.write(content)
            tmp = tf.name
        r = subprocess.run(['sudo', 'cp', tmp, path], capture_output=True, text=True)
        os.unlink(tmp)
        return r.returncode == 0
    except Exception as e:
        log(f"ERRO write_file {path}: {e}")
        return False

def list_conf_files(dirs):
    files = []
    for d in dirs:
        if not os.path.isdir(d): continue
        for f in sorted(os.listdir(d)):
            fp = os.path.join(d, f)
            if os.path.isfile(fp):
                files.append(fp)
    return files

snippet   = '/etc/nginx/snippets/investai-api.conf'
keywords  = ['wnrtecnologia', '/var/www/InvestAI', 'investai']
CONF_DIRS = ['/etc/nginx/sites-enabled', '/etc/nginx/conf.d']

# Coleta arquivos via scan de diretorios + nginx -T
all_files = list_conf_files(CONF_DIRS)
try:
    result = subprocess.run(['nginx', '-T'], capture_output=True, text=True, timeout=10)
    if not result.stdout.strip():
        result = subprocess.run(['sudo', 'nginx', '-T'], capture_output=True, text=True, timeout=10)
        if result.stdout.strip():
            log("nginx -T funcionou com sudo")
    for f in re.findall(r'# configuration file (.+?):', result.stdout or ''):
        if f not in all_files:
            all_files.append(f)
except Exception as e:
    log(f"AVISO nginx -T: {e}")

log(f"Arquivos ({len(all_files)}): {all_files}")

# Encontra arquivo alvo (contem keywords + SSL, ou somente keywords)
target = None
for ssl_req in [True, False]:
    for cf in all_files:
        content = read_file(cf)
        if not content: continue
        has_site = any(k in content for k in keywords)
        has_ssl  = '443' in content or 'ssl_certificate' in content
        log(f"  {cf}: site={has_site} ssl={has_ssl}")
        if has_site and (not ssl_req or has_ssl):
            target = cf
            log(f"Alvo: {cf} (ssl={has_ssl})")
            break
    if target: break

if not target:
    log("ERRO: nenhum arquivo nginx adequado encontrado")
    sys.exit(1)

# Salva caminho do alvo para rollback em caso de nginx -t falhar
try:
    with open('/tmp/investai_nginx_target.txt', 'w') as f:
        f.write(target)
except Exception:
    pass

# Remove include de arquivos NAO-alvo (inclues mal-posicionados)
for cf in all_files:
    if cf == target: continue
    content = read_file(cf)
    if snippet in content:
        cleaned = '\n'.join(l for l in content.split('\n') if snippet not in l)
        if write_file(cf, cleaned):
            log(f"Include removido (posicao errada): {cf}")
        else:
            log(f"AVISO: nao conseguiu limpar {cf}")

# Edita arquivo alvo: em memoria (remove + reinsere)
content = read_file(target)
log(f"Arquivo alvo: {target} ({len(content.splitlines())} linhas)")

# Remove qualquer include existente do alvo (em memoria — disco intacto)
lines = [l for l in content.split('\n') if snippet not in l]

# Insere o include em cada server block do dominio que serve /investai.
server_blocks = []
start = None
depth = 0
for i, line in enumerate(lines):
    stripped = line.strip()
    if start is None and stripped.startswith('server') and '{' in stripped:
        start = i
        depth = stripped.count('{') - stripped.count('}')
        if depth == 0:
            server_blocks.append((start, i))
            start = None
        continue
    if start is not None:
        depth += stripped.count('{') - stripped.count('}')
        if depth == 0:
            server_blocks.append((start, i))
            start = None

insert_at = []
for sidx, eidx in server_blocks:
    block = '\n'.join(lines[sidx:eidx + 1])
    is_wnr = 'server_name wnrtecnologia.com.br' in block or 'server_name www.wnrtecnologia.com.br' in block
    has_investai = '/investai' in block or '/var/www/InvestAI' in block
    if is_wnr and has_investai:
        insert_at.append(eidx)

if not insert_at:
    log(f"ERRO: nao encontrou server block wnrtecnologia com /investai em {target}")
    sys.exit(1)

for idx in sorted(insert_at, reverse=True):
    lines.insert(idx, f'    include {snippet};')

new_content = '\n'.join(lines)

log(f"Inserindo include em {len(insert_at)} server block(s):")
for idx in insert_at:
    log(f"  antes da linha {idx+1}")

# Escrita atomica: se falhar, original fica intacto no disco
if not write_file(target, new_content):
    log("ERRO: sem permissao de escrita — execute: sudo bash /var/www/InvestAI/api/setup-vps.sh")
    sys.exit(1)

log(f"OK: include inserido em {target}")
PYEOF

RC=$?
if [ $RC -ne 0 ]; then
    log "Configuracao nginx requer permissao — execute: sudo bash /var/www/InvestAI/api/setup-vps.sh"
    exit 1
fi

# ── 4. Testa configuracao e recarrega ─────────────────────────
log "Testando configuracao nginx..."
$NGINX -t > /tmp/investai_nginx_t.log 2>&1; NGINX_RC=$?
cat /tmp/investai_nginx_t.log | tee -a "$LOG"

if [ $NGINX_RC -ne 0 ]; then
    log "ERRO: config invalida apos insercao — revertendo include..."
    TARGET_FILE=$(cat /tmp/investai_nginx_target.txt 2>/dev/null || echo "")
    if [ -n "$TARGET_FILE" ] && [ -f "$TARGET_FILE" ]; then
        python3 -c "
snippet = '/etc/nginx/snippets/investai-api.conf'
target  = '$TARGET_FILE'
try:
    content = open(target).read()
    cleaned = '\n'.join(l for l in content.split('\n') if snippet not in l)
    open(target, 'w').write(cleaned)
    print('Revertido:', target)
except Exception as e:
    print('ERRO ao reverter:', e)
" | tee -a "$LOG" || true
    fi
    exit 1
fi

$NGINX -s reload && log "Nginx recarregado com sucesso" || log "ERRO ao recarregar nginx"

# Confirmacao final
if $NGINX -T 2>/dev/null | grep -q "location /investai/api/auth/"; then
    log "OK: proxy /investai/api/ confirmado ativo"
else
    log "AVISO: proxy ainda nao aparece em nginx -T"
fi
