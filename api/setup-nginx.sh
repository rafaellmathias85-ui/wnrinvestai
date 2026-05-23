#!/bin/bash
# setup-nginx.sh — Configura proxy /api/ no nginx para o InvestAI.
# Chamado pelo deploy.yml a cada push.

SNIPPET="/etc/nginx/snippets/investai-api.conf"
LOG="/var/www/InvestAI/nginx-setup.log"
DEBUG_WEB="/var/www/InvestAI/investai/nginx-debug.txt"

log() {
    local msg="$1"
    echo "$msg" | tee -a "$LOG"
    echo "$msg" >> "$DEBUG_WEB" 2>/dev/null
}

# Limpa logs anteriores
: > "$LOG" 2>/dev/null || true
: > "$DEBUG_WEB" 2>/dev/null || true

log "=== setup-nginx.sh iniciado em $(date) ==="
log "Usuario: $(whoami) | EUID=$EUID | PATH=$PATH"

# ── Detecta se pode usar sudo para nginx ──────────────────────
SUDO=""
NGINX_BIN=$(which nginx 2>/dev/null || echo "/usr/sbin/nginx")
if [ "$EUID" -ne 0 ]; then
    if sudo -n "$NGINX_BIN" -v 2>/dev/null; then
        SUDO="sudo"
        log "Modo: sudo nginx disponivel"
    elif sudo -n true 2>/dev/null; then
        SUDO="sudo"
        log "Modo: sudo total disponivel"
    else
        log "AVISO: sem privilegios nginx (rode setup-vps.sh como root para corrigir)"
    fi
else
    log "Modo: root"
fi

# ── 1. Cria snippet com location /api/ ───────────────────────
if $SUDO mkdir -p /etc/nginx/snippets 2>&1 | tee -a "$LOG"; then
    log "OK: diretorio /etc/nginx/snippets existe"
else
    log "ERRO: nao foi possivel criar /etc/nginx/snippets"
fi

# Usa tee para escrita privilegiada se necessario
$SUDO tee "$SNIPPET" > /dev/null << 'NGINXEOF'
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
SNIPPET_RC=$?

if [ $SNIPPET_RC -eq 0 ] && $SUDO test -f "$SNIPPET"; then
    log "Snippet escrito com sucesso: $SNIPPET"
else
    log "ERRO: falha ao escrever snippet (rc=$SNIPPET_RC)"
fi

# ── 2. Salva config atual para debug ─────────────────────────
$SUDO nginx -T 2>/dev/null > /var/www/InvestAI/nginx-dump.txt || true
DUMP_LINES=$(wc -l < /var/www/InvestAI/nginx-dump.txt 2>/dev/null || echo "0")
log "nginx -T: $DUMP_LINES linhas"

# Copia dump para debug web (primeiros 200 linhas para nao encher)
head -200 /var/www/InvestAI/nginx-dump.txt >> "$DEBUG_WEB" 2>/dev/null || true

# ── 3. Verifica se ja esta configurado ───────────────────────
if $SUDO nginx -T 2>/dev/null | grep -q "location /api/"; then
    log "Proxy /api/ ja ativo — apenas recarregando nginx"
    $SUDO nginx -t 2>&1 | tee -a "$LOG"
    $SUDO nginx -s reload && log "Nginx recarregado OK" || log "ERRO ao recarregar nginx"
    exit 0
fi

log "Proxy /api/ NAO encontrado — iniciando configuracao automatica"

# ── 4. Encontra e modifica o config correto via Python ───
python3 << 'PYEOF'
import subprocess, re, os, sys

LOG      = "/var/www/InvestAI/nginx-setup.log"
WEB_LOG  = "/var/www/InvestAI/investai/nginx-debug.txt"

def log(msg):
    print(msg)
    for path in [LOG, WEB_LOG]:
        try:
            with open(path, 'a') as f:
                f.write(msg + "\n")
        except Exception:
            pass

# Roda nginx -T (tenta sudo se nginx nao retornar nada sem ele)
result = subprocess.run(['nginx', '-T'], capture_output=True, text=True)
full = result.stdout
if not full.strip():
    result = subprocess.run(['sudo', 'nginx', '-T'], capture_output=True, text=True)
    full = result.stdout
    log("nginx -T sem saida, tentou com sudo")

# Extrai lista de arquivos de config
config_files = re.findall(r'# configuration file (.+?):', full)
log(f"Arquivos nginx encontrados ({len(config_files)}): {config_files}")

snippet = '/etc/nginx/snippets/investai-api.conf'

# Prioridade: arquivo com ssl/443 + referencia ao site
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

# Le o conteudo do arquivo (possivelmente via sudo)
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
    # Detecta abertura de server block no nivel 0
    if re.match(r'^server\s*\{', stripped) and brace_depth == 0:
        last_server_open = i
    # Contagem de chaves (simples, ignora strings/comentarios)
    brace_depth += stripped.count('{') - stripped.count('}')
    if brace_depth == 0 and last_server_open >= 0:
        last_server_close = i
        # Nao break — queremos o ULTIMO server block

log(f"Ultimo server block: abertura linha {last_server_open}, fechamento linha {last_server_close}")

if last_server_close < 0:
    idx = content.rfind('}')
    new_content = content[:idx] + f'\n    include {snippet};\n' + content[idx:]
    log("Fallback: inserindo antes do ultimo } do arquivo")
else:
    lines.insert(last_server_close, f'    include {snippet};')
    new_content = '\n'.join(lines)
    log(f"Include inserido antes da linha {last_server_close}")

# Escreve o arquivo (tenta direto, depois via sudo tee)
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
        log(f"ERRO ao escrever via sudo cp: {r.stderr}")

if not write_ok:
    sys.exit(1)

log(f"Configuracao concluida. Include adicionado em {target}")
PYEOF

RC=$?
if [ $RC -ne 0 ]; then
    log "Python script falhou com codigo $RC"
    exit 1
fi

# ── 5. Testa e recarrega nginx ────────────────────────────────
log "Testando configuracao nginx..."
if $SUDO nginx -t 2>&1 | tee -a "$LOG"; then
    $SUDO nginx -s reload
    log "Nginx recarregado com sucesso"
    log "Verificacao: $($SUDO nginx -T 2>/dev/null | grep 'location /api' || echo 'NAO ENCONTRADO')"
else
    log "ERRO: nginx config invalido apos modificacao"
    $SUDO tail -20 "$($SUDO grep -rl 'investai-api.conf' /etc/nginx/ 2>/dev/null | head -1)" 2>/dev/null | tee -a "$LOG" || true
    exit 1
fi
