# Deploy do backend numa VPS

O frontend continua na Vercel. Este guia coloca **apenas o backend** (API +
PostgreSQL) numa VPS com HTTPS, substituindo o Cloudflare Tunnel que dependia do
seu PC estar ligado.

O que sobe na VPS:

| Serviço | Papel | Exposto na internet |
|---|---|---|
| `caddy` | Termina TLS e faz proxy para a API. Emite e renova o certificado sozinho. | 80, 443 |
| `api` | FastAPI + uvicorn | não (só via Caddy) |
| `db` | PostgreSQL 16 | não |

---

## Pré-requisitos

- Uma VPS com Ubuntu 22.04+ (1 vCPU / 1 GB já roda; 2 GB é confortável).
- Um domínio ou subdomínio, ex.: `api.seudominio.com`.
- Docker Engine + plugin Compose.

---

## 1. DNS

Crie um registro **A** apontando o subdomínio para o IP público da VPS:

```
api.seudominio.com.   A   203.0.113.10
```

Confirme antes de seguir — o Caddy só consegue emitir o certificado se o domínio
já resolver para a VPS:

```bash
dig +short api.seudominio.com
```

## 2. Servidor

```bash
# Docker (script oficial)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER" && newgrp docker

# Firewall: libere só SSH e HTTP/HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 3. Código e variáveis

```bash
git clone https://github.com/helberjf/tutor-professor.git
cd tutor-professor

cp .env.prod.example .env.prod
chmod 600 .env.prod
nano .env.prod
```

Gere os dois segredos com:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # SESSION_SECRET
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # POSTGRES_PASSWORD
```

> **`SESSION_SECRET` é permanente.** Ele assina as sessões e deriva a chave que
> criptografa as chaves de IA de cada usuário. Se você trocá-lo depois, todo
> mundo é deslogado e as chaves de IA já salvas ficam impossíveis de
> descriptografar. Guarde um backup. A API se **recusa a iniciar** com um valor
> placeholder — isso é proposital.

Chaves opcionais da aplicação (Gemini, Google OAuth, TTS) vão em
`apps/api/.env` — copie de `apps/api/.env.example`. Se você não usa nenhuma,
pode pular: o arquivo é opcional.

## 4. Subir

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

O primeiro start aplica as migrações do Alembic antes de servir tráfego, e o
Caddy emite o certificado (leva de segundos a ~1 minuto).

Verifique:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl https://api.seudominio.com/health
# {"status":"ok","timestamp":"..."}
```

Se `/health` não responder, veja os logs — o motivo quase sempre está ali:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api caddy
```

## 5. Apontar o frontend

Na Vercel → **Settings → Environment Variables**:

```
NEXT_PUBLIC_API_BASE_URL = https://api.seudominio.com
```

Faça um **redeploy** (variáveis `NEXT_PUBLIC_*` entram no build, não em tempo de
execução). Essa variável tem prioridade sobre a URL do túnel que porventura ainda
esteja publicada, então não é preciso limpar nada — mas se quiser, apague o
arquivo `runtime-backend.json` do branch `runtime-state`.

Depois disso o Cloudflare Tunnel não é mais necessário: pode parar o
`cloudflared` e os scripts `ativar-tudo` / `run-tunnel`.

> Se algum aparelho tiver uma URL manual salva (tela **Conectar**), ela continua
> valendo só nele e ignora a nova. Use "Usar backend global" nessa tela para
> limpar.

## 6. CORS

`CORS_ALLOWED_ORIGINS` no `.env.prod` precisa listar **todos** os domínios do
frontend, separados por vírgula e sem barra no final:

```
CORS_ALLOWED_ORIGINS=https://tutorprofessor.vercel.app,https://www.seudominio.com
```

Domínio faltando aparece no navegador como erro de CORS, não como erro do
servidor. Depois de mudar, recrie a API:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api
```

---

## Operação

**Atualizar para a última versão**

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

As migrações rodam sozinhas no start do contêiner. Há uma janela curta de
indisponibilidade enquanto a API reinicia.

**Backup do banco** (faça antes de qualquer atualização com mudança de schema)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_dump -U kids_tutor kids_tutor | gzip > backup-$(date +%F).sql.gz
```

Restaurar:

```bash
gunzip -c backup-2026-08-02.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  psql -U kids_tutor -d kids_tutor
```

Automatize com cron (3h da manhã, mantendo 14 dias):

```cron
0 3 * * * cd /home/USER/tutor-professor && docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db pg_dump -U kids_tutor kids_tutor | gzip > backups/db-$(date +\%F).sql.gz && find backups -name 'db-*.sql.gz' -mtime +14 -delete
```

**Logs** — rotacionam em 10 MB × 5 arquivos por serviço, então não enchem o disco.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f --tail=100 api
```

**Parar / reiniciar**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod restart api
docker compose -f docker-compose.prod.yml --env-file .env.prod down          # mantém os dados
docker compose -f docker-compose.prod.yml --env-file .env.prod down -v       # APAGA o banco
```

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Caddy não emite certificado | DNS ainda não propagou, ou 80/443 bloqueados no firewall/provedor. |
| API reinicia em loop | `SESSION_SECRET` vazio ou placeholder — o log diz exatamente isso. |
| Erro de CORS no navegador | Domínio do frontend fora de `CORS_ALLOWED_ORIGINS`. |
| Frontend ainda chama o túnel antigo | `NEXT_PUBLIC_API_BASE_URL` definida mas sem redeploy, ou URL manual salva no aparelho. |
| Login não persiste | Cookie cross-site exige HTTPS nos dois lados; confira que o frontend usa `https://`. |
| `password authentication failed` | `POSTGRES_PASSWORD` mudou depois do primeiro start; ele só é aplicado ao criar o cluster. |
