# Guia: frontend na Vercel e backend no seu computador

Este guia mostra o fluxo recomendado para publicar o frontend do English Kids Tutor na Vercel enquanto o backend continua rodando na sua maquina, exposto com Cloudflare Tunnel.

## Visao geral da arquitetura

Fluxo final:

1. O usuario abre o frontend em `https://seu-projeto.vercel.app`
2. O frontend chama a API publica, por exemplo `https://api.seudominio.com`
3. O Cloudflare Tunnel encaminha as requisicoes para `http://localhost:8001` na sua maquina
4. O FastAPI responde usando o banco SQLite local e, se configurado, o Kokoro local

## O que voce precisa antes

- Conta na Vercel
- Conta na Cloudflare
- Um dominio gerenciado pela Cloudflare
- `cloudflared` instalado no seu computador
- Python e Node instalados
- O repositorio clonado localmente

## Etapa 1: preparar o backend local

### 1.1 Criar ambiente e instalar dependencias

No PowerShell, na raiz do projeto:

```powershell
python -m pip install -r apps\api\requirements.txt
python scripts\init_db.py
```

### 1.2 Criar o arquivo `apps/api/.env`

```powershell
Copy-Item apps\api\.env.example apps\api\.env
```

Edite o arquivo e use algo proximo disso:

```env
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8001
DATABASE_URL=sqlite:///./kids_tutor.sqlite
PARENT_PASSWORD=troque-esta-senha
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://seu-projeto.vercel.app
TTS_PROVIDER=kokoro
KOKORO_DEFAULT_VOICE=af_heart
AUDIO_CACHE_DIR=./audio_cache
SESSION_SECRET=troque-isto-para-um-valor-grande
PARENT_COOKIE_SECURE=true
PARENT_COOKIE_SAMESITE=none
PARENT_COOKIE_DOMAIN=
PARENT_COOKIE_MAX_AGE=604800
```

### 1.3 Observacoes importantes sobre esse `.env`

- `CORS_ALLOWED_ORIGINS` precisa ter a URL exata do frontend na Vercel
- se voce usar dominio proprio no frontend, troque `https://seu-projeto.vercel.app` por ele
- `PARENT_COOKIE_SECURE=true` e `PARENT_COOKIE_SAMESITE=none` sao importantes para a area de pais funcionar com frontend e backend em dominios diferentes
- `PARENT_COOKIE_DOMAIN` pode ficar vazio na maioria dos casos
- se voce nao tiver Kokoro rodando, pode manter `TTS_PROVIDER=kokoro` que o app faz fallback sem audio, ou mudar para `TTS_PROVIDER=none`

### 1.4 Subir o backend

```powershell
Set-Location apps\api
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Teste local:

- `http://localhost:8001/health`
- `http://localhost:8001/api/lesson/today`

Se isso nao responder, pare aqui e resolva antes de seguir.

## Etapa 2: expor o backend com Cloudflare Tunnel

### 2.1 Fazer login no Cloudflare Tunnel

```powershell
cloudflared tunnel login
```

### 2.2 Criar um tunnel

```powershell
cloudflared tunnel create english-kids-tutor
```

Guarde:

- o nome do tunnel
- o `TUNNEL_ID`
- o caminho do arquivo de credenciais gerado pelo `cloudflared`

### 2.3 Criar o DNS publico da API

Exemplo usando `api.seudominio.com`:

```powershell
cloudflared tunnel route dns english-kids-tutor api.seudominio.com
```

### 2.4 Criar a configuracao do tunnel

Use o exemplo ja existente:

```powershell
Copy-Item infra\cloudflare\config.yml.example infra\cloudflare\config.yml
```

Edite `infra/cloudflare/config.yml` para algo assim:

```yaml
tunnel: SEU_TUNNEL_ID
credentials-file: C:\Users\seu-usuario\.cloudflared\SEU_TUNNEL_ID.json

ingress:
  - hostname: api.seudominio.com
    service: http://localhost:8001
  - service: http_status:404
```

### 2.5 Rodar o tunnel

```powershell
cloudflared tunnel run --config infra\cloudflare\config.yml english-kids-tutor
```

Agora teste:

- `https://api.seudominio.com/health`

Se o retorno for `{"status":"ok",...}`, o backend publico esta pronto.

## Etapa 3: publicar o frontend na Vercel

### 3.1 Importar o repositorio

Na Vercel:

1. Crie um novo projeto
2. Conecte o repositorio
3. Configure o `Root Directory` como `apps/web`
4. Deixe o preset como `Next.js`

### 3.2 Configurar a variavel de ambiente da Vercel

Adicione:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.seudominio.com
```

Isso faz o frontend publicado chamar o backend no seu computador via tunnel.

### 3.3 Fazer o deploy

Clique em deploy e aguarde a URL final do frontend, por exemplo:

- `https://seu-projeto.vercel.app`

## Etapa 4: alinhar CORS no backend

Depois que a URL final da Vercel existir, confira novamente `apps/api/.env`.

Exemplo:

```env
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://seu-projeto.vercel.app
```

Se alterar esse valor, reinicie o backend local.

## Etapa 5: teste completo

Com tudo rodando:

1. Abra a URL da Vercel
2. Verifique se a home carrega progresso
3. Entre em uma licao
4. Finalize a licao e abra o quiz
5. Teste a revisao
6. Teste o chat
7. Teste a area de pais

## Checklist rapido

- backend local rodando em `localhost:8001`
- `https://api.seudominio.com/health` responde
- Vercel esta usando `apps/web` como raiz
- `NEXT_PUBLIC_API_BASE_URL` aponta para a URL publica da API
- `CORS_ALLOWED_ORIGINS` contem a URL exata do frontend publicado
- cookies de pais configurados com `PARENT_COOKIE_SECURE=true` e `PARENT_COOKIE_SAMESITE=none`

## Problemas comuns

### O frontend abre, mas nada carrega

Verifique:

- backend local esta rodando
- tunnel esta ativo
- `NEXT_PUBLIC_API_BASE_URL` esta certo
- `CORS_ALLOWED_ORIGINS` contem a URL exata do frontend

### A area de pais nao permanece logada

Quase sempre e uma destas causas:

- backend publico nao esta em HTTPS
- `PARENT_COOKIE_SECURE` nao esta `true`
- `PARENT_COOKIE_SAMESITE` nao esta `none`
- o navegador bloqueou cookies de terceiros

### O audio nao toca

Verifique:

- o Kokoro local esta rodando
- a URL `KOKORO_URL` esta correta
- se o Kokoro nao estiver disponivel, o app continua sem audio, mas sem quebrar

### Os deploys preview da Vercel falham com CORS

Isso pode acontecer porque cada preview tem uma URL diferente.

As opcoes mais simples sao:

1. usar apenas a URL de producao da Vercel no backend
2. usar um dominio proprio fixo no frontend
3. atualizar `CORS_ALLOWED_ORIGINS` sempre que precisar testar um preview especifico

## Comandos uteis

### Backend

```powershell
python scripts\init_db.py
Set-Location apps\api
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend local

```powershell
Set-Location apps\web
pnpm install
pnpm dev
```

### Tunnel

```powershell
cloudflared tunnel login
cloudflared tunnel create english-kids-tutor
cloudflared tunnel route dns english-kids-tutor api.seudominio.com
cloudflared tunnel run --config infra\cloudflare\config.yml english-kids-tutor
```

## Arquivos que voce provavelmente vai editar

- `apps/api/.env`
- `apps/web/.env.local` para desenvolvimento local
- `infra/cloudflare/config.yml`
- variaveis de ambiente do projeto na Vercel

## Resumo final

O modelo mais estavel para este projeto e:

- frontend em producao na Vercel
- backend local rodando no seu computador
- API publica via Cloudflare Tunnel
- CORS configurado com a URL exata do frontend
- cookies de sessao ajustados para cross-site

Se voce seguir essa sequencia, o projeto fica funcional sem precisar abrir portas no roteador ou hospedar o backend em outro servidor.
