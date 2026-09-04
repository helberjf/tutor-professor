# Deploy: Supabase + Vercel

Banco no Supabase, backend e frontend na Vercel, Kokoro na sua máquina alcançado por
túnel. O caminho da VPS ([DEPLOY-VPS.md](DEPLOY-VPS.md)) continua válido e usa o mesmo
código — a diferença é só quais variáveis de ambiente estão ligadas.

> **Antes de começar:** o plano Hobby da Vercel proíbe uso comercial nos termos deles.
> Se a intenção é cobrar dos usuários (veja [TODO-SAAS.md](../TODO-SAAS.md)), isso é
> uma decisão contratual sua, não um impedimento técnico.

---

## 1. As duas connection strings do Supabase

Você vai usar **duas**, e usar a errada no lugar errado é a causa mais comum de
problema nesta migração:

| Uso | String | Porta |
|---|---|---|
| Runtime (Vercel) | `postgresql://postgres.<ref>:<SENHA>@aws-0-<região>.pooler.supabase.com:6543/postgres` | **6543**, pooler em modo transação |
| Migrations, dump/restore | `postgresql://postgres:<SENHA>@db.<ref>.supabase.co:5432/postgres` | **5432**, conexão direta |

O pooler em modo transação não preserva estado de sessão, e `pg_advisory_lock` (usado
pelo `database_bootstrap`) e `pg_restore --single-transaction` dependem disso. Por
isso migrations e restore vão **sempre** pela direta.

**Se a direta não conectar:** projetos novos do Supabase têm o host direto só em IPv6.
Teste antes com `psql "<url direta>" -c "select 1"`. Se falhar com "network
unreachable", use o **session pooler** (mesmo host do pooler, porta **5432**) — ele é
escopo de sessão e portanto serve para restore e migrations.

---

## 2. Migrar os dados

**2.1 Antes de qualquer coisa, tire as chaves de IA de cima do `SESSION_SECRET`.**
Elas usam o envelope legado, cuja chave deriva dele; trocar o segredo depois as torna
ilegíveis para sempre.

```bash
cd apps/api
DATABASE_URL="postgresql://kids_tutor:<PW>@127.0.0.1:5433/kids_tutor" \
SESSION_SECRET="<o valor ANTIGO>" \
AI_ENCRYPTION_KEY="<o valor NOVO>" \
APP_ENV=development \
python ../scripts/reencrypt_ai_keys.py
```

O script termina provando o resultado: reconstrói um cofre com um segredo
deliberadamente errado e decifra todas as linhas de novo. Só depois que ele imprimir
"Verified" o `SESSION_SECRET` pode ser girado.

**2.2 Dump do Postgres local** (cliente `pg_dump` ≥ versão do servidor Supabase):

```bash
pg_dump "postgresql://kids_tutor:<PW>@127.0.0.1:5433/kids_tutor" \
  --format=custom --no-owner --no-privileges --no-acl --schema=public \
  --file=kids_tutor.dump
```

`--no-owner --no-privileges` é o que torna o dump restaurável: sem eles ele carrega
`ALTER ... OWNER TO kids_tutor` e `GRANT` para um papel que não existe no Supabase.

**2.3 Restore na conexão direta:**

```bash
pg_restore --dbname="postgresql://postgres:<PW>@db.<ref>.supabase.co:5432/postgres" \
  --no-owner --no-privileges --schema=public \
  --single-transaction --exit-on-error \
  kids_tutor.dump
```

**2.4 Conferir — os três que importam:**

```sql
-- 1. Tem que ser a revisão corrente. O dump traz alembic_version junto, e é isso
--    que faz o bootstrap reconhecer o banco em vez de tentar detectar a forma.
SELECT version_num FROM alembic_version;

-- 2. Sequences. Se alguma ficou em 1, o primeiro insert depois do corte falha com
--    chave duplicada e parece bug aleatório.
SELECT sequencename, last_value FROM pg_sequences WHERE schemaname = 'public';

-- 3. Contagem exata por tabela, para comparar com o banco local.
--    (n_live_tup é estimativa e mente logo depois de um restore.)
SELECT table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text::bigint AS rows
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

Se `alembic_version` vier vazio, **pare**. Não rode o bootstrap: ele vai tentar
detectar um schema sem versão e falhar na validação de forma sem um motivo claro.

**2.5 O checkpoint que vale mais que o resto.** Antes de tocar na Vercel, aponte o
backend **do seu PC** para o Supabase (`DATABASE_URL` em `apps/api/.env`) e rode como
você roda hoje. Se funciona ponta a ponta a partir do notebook, a única variável
restante no passo seguinte é a Vercel.

---

## 3. Migrations, daqui em diante

Deixam de rodar sozinhas no boot quando a variável `VERCEL` existe (ou com
`RUN_STARTUP_MIGRATIONS=false`). Viram um passo explícito, contra a **direta**:

```bash
cd apps/api
DATABASE_URL="<url direta>" python database_bootstrap.py
```

Rode **antes** do deploy que precisa delas. No caminho da VPS nada muda: o `CMD` do
Dockerfile já roda o bootstrap antes do uvicorn.

---

## 4. Projeto da API na Vercel

Novo projeto, **Root Directory = `apps/api`**. Os arquivos já estão no repositório:
`api/index.py` (entrypoint), `vercel.json` (rewrite catch-all + `maxDuration`) e
`.vercelignore`.

Se você migrar para o plano Pro, suba `maxDuration` para 300 no `vercel.json` e
afrouxe os valores da tabela em §5.

### Variáveis de ambiente

**Obrigatórias — sem elas o app não funciona ou não é seguro:**

| Variável | Valor |
|---|---|
| `DATABASE_URL` | pooler, porta 6543, usuário `postgres.<ref>` |
| `SESSION_SECRET` | token novo de 48 bytes |
| `AI_ENCRYPTION_KEY` | token novo de 48 bytes (o mesmo usado no passo 2.1) |
| `APP_ENV` | `production` |
| `RUN_STARTUP_MIGRATIONS` | `false` |
| `AUDIO_CACHE_DIR` | `/tmp/audio_cache` — o bundle é somente leitura |
| `TRUST_PROXY_HEADERS` | `true` — sem isso o limite por IP vira um teto global |
| `CORS_ALLOWED_ORIGINS` | `https://tutorprofessor.vercel.app` |
| `FRONTEND_BASE_URL` | `https://tutorprofessor.vercel.app` |
| `PARENT_COOKIE_SECURE` | `true` |
| `PARENT_COOKIE_SAMESITE` | `none` |
| `ALLOW_GUEST_ACCESS` | `false` |

**Não** defina `DIRECT_DATABASE_URL` na Vercel. Não existe caminho de código que
deva usá-la lá, e a ausência é uma trava.

**Carregadas do que você já tem:** `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
`GEMINI_API_KEY`, `GEMINI_MODEL`, `SIGNUP_MODE`, `MAX_FAILED_LOGINS`,
`LOGIN_LOCK_MINUTES`, `EMAIL_PROVIDER` + `SMTP_*`, `BILLING_PROVIDER`,
`BILLING_WEBHOOK_SECRET`, `AI_GENERATION_COST_MICROS`, `AUTH_RATE_LIMIT`,
`AI_RATE_LIMIT`, `LOG_FORMAT=json`.

**Google OAuth:** `GOOGLE_REDIRECT_URI` passa a ser `https://<api>/api/auth/google/callback`,
e esse endereço precisa ser adicionado no console do Google. Veja a limitação
conhecida em §7.

---

## 5. Limites de tempo

O Hobby corta a requisição em 60s. Os valores ficam em variáveis para você afrouxar
sem mexer em código se mudar de plano:

| Variável | Hobby | Pro |
|---|---|---|
| `maxDuration` (vercel.json) | 60 | 300 |
| `GEMINI_REQUEST_TIMEOUT_SECONDS` | 25 | 40 |
| `MAX_LESSONS_PER_REQUEST` | 1 | 5 |
| `REQUEST_TIME_BUDGET_SECONDS` | 45 | 270 |
| `BOOK_GENERATION_MAX_RETRIES` | 2 | 2 |
| `KOKORO_TIMEOUT_SECONDS` | 20 | 20 |

`KOKORO_TIMEOUT_SECONDS` sobe de 8 para 20 porque a chamada agora atravessa
Vercel → borda Cloudflare → seu notebook; 8s foi calibrado para localhost.

---

## 6. Kokoro pelo túnel

O túnel deixa de expor a API (porta 8001) e passa a expor o Kokoro (porta 8880).

**Se você tiver um domínio no Cloudflare**, use um túnel nomeado com hostname fixo e
defina `KOKORO_URL` como variável estática. Acabou — o resto desta seção não se aplica.

**Com quick tunnel** a URL rotaciona, e variáveis da Vercel são estáticas por deploy.
Então a URL corrente vive numa linha de configuração no banco: o script de publicação
manda a URL nova para `POST /api/runtime/tts-backend` (protegido por
`RUNTIME_SYNC_TOKEN`), e o backend lê com cache de 60s.

> **Segurança, e isto não é opcional.** Hoje o túnel expõe a API, que autentica
> tudo. Apontá-lo para a porta 8880 expõe o **Kokoro sem autenticação nenhuma** —
> quem descobrir o hostname sintetiza no seu notebook à vontade, e a URL fica guardada
> numa linha de banco e nos logs da Vercel. Um hostname aleatório é obscuridade, não
> segurança. Coloque o proxy de segredo compartilhado na frente do Kokoro antes de
> abrir o túnel.

Quando o Kokoro não responde, o comportamento já existente assume: o backend devolve
`audio_url: null` com `fallback_text`, e o navegador lê com `speechSynthesis`. Ou seja,
com o seu PC desligado o app continua funcionando, só com voz de menor qualidade.

---

## 7. Limitações conhecidas

- **Login com Google fica quebrado entre domínios** — e já está hoje, entre a Vercel e
  o túnel. `.vercel.app` está na Public Suffix List, então não existe domínio de cookie
  compartilhado a nenhum preço, e o callback grava o cookie no domínio da API, que o
  frontend não consegue ler. Login por e-mail e senha não é afetado. O conserto é
  trocar o cookie por um código de uso único no redirect; está escopado e fora desta
  migração.
- **Preview deployments do frontend serão bloqueados por CORS**, porque
  `allow_origins` é comparação exata de string. Suportá-los exige `allow_origin_regex`.
- **Cold start** de 1 a 3 segundos depois de ociosidade: o `main.py` é grande e carrega
  SQLAlchemy e cryptography junto.
- **Um domínio próprio resolve os dois primeiros de uma vez** (`app.` e `api.` do mesmo
  domínio tornam os cookies first-party) e ainda dá o hostname fixo do §6. Se em algum
  momento você registrar um, é a melhoria de maior alcance por menos trabalho.
