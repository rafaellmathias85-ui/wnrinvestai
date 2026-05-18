# Deploy InvestAI no VPS Hostinger

## Visão geral do fluxo

```
Você edita no VS Code
    ↓ git push
GitHub (repositório)
    ↓ GitHub Actions (automático)
VPS Hostinger (nginx serve o site)
```

---

## 1. Preparar o VPS (apenas uma vez)

SSH no servidor:
```bash
ssh root@SEU_IP_VPS
```

Instalar nginx e git:
```bash
apt update && apt install -y nginx git
```

Criar diretório e clonar o repositório:
```bash
mkdir -p /var/www/investai
cd /var/www
git clone https://github.com/SEU_USUARIO/investai.git investai
```

Configurar nginx:
```bash
cp /var/www/investai/nginx.conf /etc/nginx/sites-available/investai
ln -s /etc/nginx/sites-available/investai /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## 2. Criar repositório no GitHub

1. Acesse github.com → New repository → nome: `investai`
2. Marque como **Private** (recomendado)
3. No VS Code terminal:

```bash
cd c:\VS-Code_Investai\investai
git init
git add .
git commit -m "feat: InvestAI SaaS inicial"
git remote add origin https://github.com/SEU_USUARIO/investai.git
git push -u origin main
```

---

## 3. Configurar Secrets no GitHub

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Nome          | Valor                                      |
|---------------|--------------------------------------------|
| `VPS_HOST`    | IP do seu VPS (ex: `45.67.89.123`)         |
| `VPS_USER`    | Usuário SSH (normalmente `root`)           |
| `VPS_SSH_KEY` | Conteúdo da chave privada SSH (ver abaixo) |
| `VPS_PATH`    | `/var/www/investai`                        |
| `VPS_PORT`    | `22` (ou a porta SSH do seu VPS)           |

### Gerar chave SSH para o GitHub Actions:

No VPS:
```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions -N ""
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_actions   # copie este conteúdo para o secret VPS_SSH_KEY
```

---

## 4. Testar o deploy automático

Faça qualquer alteração no código e execute:
```bash
git add .
git commit -m "test: deploy automático"
git push
```

Acesse **github.com → Actions** para acompanhar o deploy em tempo real.

---

## 5. SSL gratuito com Let's Encrypt (HTTPS)

No VPS:
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d seudominio.com.br -d www.seudominio.com.br
```

Depois, edite o `nginx.conf` e descomente o bloco HTTPS.

---

## 6. Ativar plano de um usuário manualmente (enquanto não há integração de pagamento)

Abra o console do navegador no site e execute:
```javascript
Auth.setPlan('pro')      // ativa plano Pro por 365 dias
Auth.setPlan('premium')  // ativa plano Premium por 365 dias
Auth.setPlan('free')     // retorna ao plano gratuito
```

---

## Integração de pagamento (próximos passos)

Para automatizar a ativação de planos após pagamento, recomendamos:
- **Stripe** (cartão internacional)
- **Mercado Pago** (PIX + cartão Brasil)
- **Hotmart** ou **Kirvano** (infoprodutos - mais simples de configurar)

O fluxo seria: usuário paga → webhook chama seu backend → backend chama `Auth.setPlan()` via API própria.
