# Guia: frontend na Vercel e backend no seu computador com URL configuravel

Este guia mostra o fluxo pratico para deixar o frontend do English Kids Tutor publicado na Vercel enquanto o backend continua rodando no seu computador, exposto por uma URL HTTPS temporaria do Cloudflare Tunnel.

O frontend agora tem uma pagina publica em `/connect` para salvar a URL atual do backend no navegador do aparelho que vai usar o site.

## Visao geral da arquitetura

Fluxo final:

1. O usuario abre o frontend em `https://seu-projeto.vercel.app`
2. O frontend usa a URL da API salva no navegador, por exemplo `https://nome-aleatorio.trycloudflare.com`
3. O Cloudflare Tunnel encaminha as requisicoes para `http://localhost:8001` na sua maquina
4. O FastAPI responde usando o banco SQLite local e, se configurado, o Kokoro local

## O que voce precisa antes

- Conta na Vercel
- `cloudflared` instalado no seu computador
- Python e Node instalados
- O repositorio clonado localmente

## Fluxo rapido para desenvolvimento local

Se voce quiser validar tudo na sua maquina antes do deploy, este e o caminho mais simples.

### Backend local

```powershell
Copy-Item apps\api\.env.example apps\api\.env
python -m pip install -r apps\api\requirements.txt
python scripts\init_db.py
Set-Location apps\api
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Teste no navegador:

- `http://localhost:8001/health`
- `http://localhost:8001/api/lesson/today`

### Frontend local

```powershell
Copy-Item apps\web\.env.example apps\web\.env.local
Set-Location apps\web
pnpm install
pnpm dev
```

Use em `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
```

Abra:

- `http://localhost:3000`

## Etapa 1: preparar o backend local

### 1.1 Criar ambiente e instalar dependencias

No PowerShell, na raiz do projeto:

```powershell
Copy-Item apps\api\.env.example apps\api\.env
python -m pip install -r apps\api\requirements.txt
python scripts\init_db.py
```

### 1.2 Configurar `apps/api/.env`

Use algo proximo disso:

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

## Etapa 2: publicar o frontend na Vercel

### 2.1 Importar o repositorio

Na Vercel:

1. Crie um novo projeto
2. Conecte o repositorio
3. Configure o `Root Directory` como `apps/web`
4. Deixe o preset como `Next.js`

### 2.2 Variavel de ambiente da Vercel

Para este fluxo com URL variavel do tunnel, voce pode deixar `NEXT_PUBLIC_API_BASE_URL` vazio na Vercel.

O frontend publicado vai usar a URL salva em `/connect` no navegador do aparelho.

### 2.3 Fazer o deploy

Clique em deploy e aguarde a URL final do frontend, por exemplo:

- `https://seu-projeto.vercel.app`

## Etapa 3: expor o backend com Cloudflare Tunnel

Rode no seu computador:

```powershell
cloudflared tunnel --url http://localhost:8001
```

O `cloudflared` vai mostrar uma URL publica HTTPS, algo como:

- `https://nome-aleatorio.trycloudflare.com`

Guarde essa URL. Ela e a URL real da API para esse momento.

Observacoes:

- use a URL HTTPS completa
- nao use o `TUNNEL_ID`
- nao use o seu IP publico
- se essa URL mudar em outro dia, voce precisa atualizar o frontend em `/connect`

## Etapa 4: conectar o frontend publicado ao backend atual

No aparelho que vai usar o site:

1. Abra `https://seu-projeto.vercel.app/connect`
2. Cole a URL HTTPS gerada pelo `cloudflared`
3. Clique em `Save Connection`
4. Aguarde a validacao do endpoint `/health`
5. Volte para a home

Depois disso, esse navegador passa a usar a URL salva para todas as chamadas da API.

## Etapa 5: teste completo

Com tudo rodando:

1. Abra a URL da Vercel
2. Verifique se a home carrega progresso
3. Entre em uma licao
4. Finalize a licao e abra o quiz
5. Teste a revisao
6. Teste o chat
7. Teste a area de pais

## Como usar no dia a dia

Toda vez que seu filho for entrar de outro lugar:

1. Ligue o seu computador
2. Suba o backend em `localhost:8001`
3. Rode `cloudflared tunnel --url http://localhost:8001`
4. Copie a nova URL HTTPS
5. Se a URL mudou, abra `/connect` no aparelho e salve a nova URL
6. So depois abra as paginas normais do app

## Checklist rapido

- backend local rodando em `localhost:8001`
- `cloudflared tunnel --url http://localhost:8001` ativo
- frontend publicado na Vercel
- URL do backend salva em `/connect` no aparelho que vai usar o site
- `CORS_ALLOWED_ORIGINS` contem a URL exata do frontend publicado
- cookies de pais configurados com `PARENT_COOKIE_SECURE=true` e `PARENT_COOKIE_SAMESITE=none`

## Problemas comuns

### O frontend abre, mas nada carrega

Verifique:

- backend local esta rodando
- tunnel esta ativo
- a URL salva em `/connect` e a URL atual do tunnel
- `CORS_ALLOWED_ORIGINS` contem a URL exata do frontend

### A pagina `/connect` nao salva a URL

Verifique:

- a URL comeca com `https://`
- a URL e a do tunnel atual
- `http://localhost:8001/health` responde no seu computador
- o `cloudflared` esta encaminhando para `http://localhost:8001`

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

### Tunnel do backend

```powershell
cloudflared tunnel --url http://localhost:8001
```

## Arquivos que voce provavelmente vai editar

- `apps/api/.env`
- `apps/web/.env.local` para desenvolvimento local
- variaveis de ambiente do projeto na Vercel

## Resumo final

O modelo mais pratico para este projeto, sem VPS agora, e:

- frontend em producao na Vercel
- backend local rodando no seu computador
- API publica por uma URL temporaria do Cloudflare Tunnel
- URL da API salva por aparelho em `/connect`
- CORS configurado com a URL exata do frontend
- cookies de sessao ajustados para cross-site

Se voce seguir essa sequencia, o projeto fica funcional para acesso remoto sem precisar redeployar a Vercel sempre que a URL do tunnel mudar.
