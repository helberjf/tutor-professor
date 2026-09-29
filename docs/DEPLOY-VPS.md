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

Gere os três segredos com:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # SESSION_SECRET
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # AI_ENCRYPTION_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # POSTGRES_PASSWORD
```

> **`SESSION_SECRET`** assina as sessões: trocá-lo desloga todo mundo. A API se
> **recusa a iniciar** com um valor placeholder — isso é proposital.
>
> **`AI_ENCRYPTION_KEY`** criptografa as chaves de IA que cada conta salva. Perdê-la
> torna essas chaves ilegíveis, então guarde um backup dela. Sem ela, a API usa o
> `SESSION_SECRET` no lugar, e aí trocar o `SESSION_SECRET` também inutiliza as
> chaves salvas.

Todo valor do `.env.prod` chega à API: o Compose usa o arquivo para preencher o
`docker-compose.prod.yml` e também o entrega ao contêiner. Chaves opcionais da
aplicação (Gemini, Google OAuth, TTS) podem ir em `apps/api/.env` — copie de
`apps/api/.env.example`. Se você não usa nenhuma, pode pular: o arquivo é
opcional. **Uma chave presente nos dois arquivos fica com o valor do `.env.prod`**,
mesmo vazio (`KOKORO_URL=` apaga o que estiver no outro). Deixe cada chave num
arquivo só. `DATABASE_URL`, `APP_ENV` e os cookies são fixados pelo próprio
`docker-compose.prod.yml` e ignoram os dois arquivos.

Preencha também `ADMIN_EMAIL` no `.env.prod`: é a conta que aprova cadastros
novos em `/admin`. Quem se cadastra fica aguardando até ela liberar.

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

### Criar a conta de administrador

Com a stack no ar, crie a conta que aprova cadastros novos:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api python admin_bootstrap.py --email admin@seudominio.com
```

O script pede a senha, cria a conta já aprovada e imprime o
`ADMIN_PASSWORD_HASH` — cole-o no `.env.prod` como senha de recuperação e
reinicie a stack. Depois entre em `/login` com esse e-mail e abra `/admin`,
onde os cadastros novos ficam esperando aprovação.

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

**Atualizar uma VPS instalada antes de o `.env.prod` chegar à API**

Até esta correção, o contêiner da API recebia do `.env.prod` só `SESSION_SECRET`,
`CORS_ALLOWED_ORIGINS`, `FRONTEND_BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` e
a senha do banco (dentro de `DATABASE_URL`). Todo o resto — `AI_ENCRYPTION_KEY`,
`SIGNUP_MODE`, `EMAIL_PROVIDER`/`SMTP_*`, `TRUST_PROXY_HEADERS`, `LOG_FORMAT`,
limites, billing, Kokoro — era ignorado, e a API rodava com os padrões do código.
No primeiro `up -d` depois do `git pull`, esses valores passam a valer de uma vez.
Antes de subir:

1. **Chaves repetidas.** Liste as que existem nos dois arquivos; em cada uma, o
   valor do `.env.prod` vai ganhar. Apague a linha do arquivo que não deve valer —
   principalmente se você tinha contornado o problema pondo `EMAIL_PROVIDER`,
   `AI_ENCRYPTION_KEY` ou `KOKORO_URL` no `apps/api/.env`, porque o `.env.prod`
   copiado do exemplo tem `EMAIL_PROVIDER=console`, `AI_ENCRYPTION_KEY=` e
   `KOKORO_URL=` e passaria por cima.

   ```bash
   comm -12 <(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' .env.prod | sort -u) \
            <(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' apps/api/.env 2>/dev/null | sort -u)
   ```

2. **`SIGNUP_MODE`.** Se o `.env.prod` diz `open`, cadastros novos deixam de
   esperar em `/admin`: basta verificar o e-mail. Isso exige `EMAIL_PROVIDER=smtp`
   funcionando (que também passa a valer agora); com `console` ninguém recebe o
   link. Quem já estava na fila continua pendente — aprove em `/admin`. Se não era
   isso que você queria, deixe `SIGNUP_MODE=manual`.

3. **`ALLOW_GUEST_ACCESS`.** Confirme que está `false`. Ligado, todo visitante sem
   sessão passa a compartilhar um mesmo perfil de estudante.

4. **`AI_ENCRYPTION_KEY`.** Se você preencheu, ela passa a criptografar as chaves
   de IA salvas daqui em diante. As que já estavam salvas foram criptografadas com o
   `SESSION_SECRET` (a chave nunca chegou ao contêiner) e **continuam legíveis sem
   nada a fazer**: a API ainda tenta o `SESSION_SECRET` nelas. Não troque o
   `SESSION_SECRET` antes de migrá-las para a chave nova:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm \
     -v "$PWD/scripts:/scripts:ro" -e PYTHONPATH=/app \
     api python /scripts/reencrypt_ai_keys.py
   ```

   O script termina com "Verified: no stored AI key depends on SESSION_SECRET any
   more." Se ele disser que uma linha não pôde ser lida, **não** rode de novo com
   `--skip-unreadable` antes de entender o porquê: essa opção apaga as linhas.
   Se o `AI_ENCRYPTION_KEY` está vazio, nada muda — mas gere um e siga este passo.

5. **O que muda sozinho**, com o `.env.prod` igual ao exemplo:
   - `LOG_FORMAT=json`: o `logs api` passa a mostrar um objeto JSON por linha (o
     padrão era texto).
   - `GEMINI_REQUEST_TIMEOUT_SECONDS=45`: a geração de livros espera 45 s pela
     IA, não 60.
   - `TRUST_PROXY_HEADERS=true`: nenhum efeito atrás do Caddy. O uvicorn do
     contêiner já usa o `X-Forwarded-For` (`--proxy-headers`), e o Caddy troca o
     cabeçalho que vem do cliente pelo IP real, então o limite de login já era por
     cliente. Por isso mesmo, **nunca publique a porta 8001**: direto na API,
     qualquer um escolhe o próprio endereço.

Para conferir o que a API recebeu depois de subir (mostra os valores na tela):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  printenv SIGNUP_MODE ALLOW_GUEST_ACCESS EMAIL_PROVIDER TRUST_PROXY_HEADERS LOG_FORMAT
```

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
