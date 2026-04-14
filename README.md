# English Kids Tutor

English Kids Tutor e um monorepo com frontend em Next.js e backend em FastAPI para aulas curtas de ingles infantil, com quiz, revisao por repeticao espacada, chat guiado e suporte a audio.

## Stack

- Frontend: Next.js 14, React, TypeScript, Tailwind CSS
- Backend: FastAPI, SQLModel, SQLite, Pydantic
- Audio: Kokoro TTS local com fallback
- Infra: Vercel no frontend e Cloudflare Tunnel para expor o backend local

## Funcionalidades atuais

- Licao do dia com mini-atividade
- Quiz com pontuacao e feedback infantil
- Revisao com palavras dificeis salvas no banco
- Chat simples com tutor e prompt de sistema
- Area de pais com configuracoes basicas
- Estados amigaveis de loading, vazio e backend offline

## Estrutura do projeto

```text
english-kids-tutor/
  apps/
    api/                  # FastAPI
    web/                  # Next.js
  content/
    lessons/              # Conteudo das licoes
    quizzes/              # Conteudo dos quizzes
    stories/              # Historias
  docs/                   # Documentacao adicional
  infra/cloudflare/       # Exemplo de config do tunnel
  scripts/init_db.py      # Seed inicial do banco
```

## Rodando tudo localmente

### 1. Backend

Crie o arquivo de ambiente:

```powershell
Copy-Item apps\api\.env.example apps\api\.env
```

Instale as dependencias:

```powershell
python -m pip install -r apps\api\requirements.txt
```

Inicialize o banco:

```powershell
python scripts\init_db.py
```

Suba a API:

```powershell
Set-Location apps\api
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 2. Frontend

Crie o arquivo de ambiente:

```powershell
Copy-Item apps\web\.env.example apps\web\.env.local
```

Instale as dependencias:

```powershell
Set-Location apps\web
pnpm install
```

Suba o frontend:

```powershell
pnpm dev
```

Frontend local: `http://localhost:3000`  
Backend local: `http://localhost:8001`

## Variaveis de ambiente importantes

### Backend (`apps/api/.env`)

```env
APP_HOST=0.0.0.0
APP_PORT=8001
DATABASE_URL=sqlite:///./kids_tutor.sqlite
PARENT_PASSWORD=tutor123
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://seu-projeto.vercel.app
TTS_PROVIDER=kokoro
KOKORO_DEFAULT_VOICE=af_heart
AUDIO_CACHE_DIR=./audio_cache
SESSION_SECRET=troque-isto
PARENT_COOKIE_SECURE=false
PARENT_COOKIE_SAMESITE=lax
PARENT_COOKIE_DOMAIN=
PARENT_COOKIE_MAX_AGE=604800
```

### Frontend (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
```

## Fluxo recomendado de deploy

Se voce quer usar:

- frontend publicado na Vercel
- backend rodando no seu computador

use este fluxo:

1. Rode a API localmente na sua maquina.
2. Exponha a API com Cloudflare Tunnel.
3. Configure a URL publica do backend em `NEXT_PUBLIC_API_BASE_URL` na Vercel.
4. Ajuste `CORS_ALLOWED_ORIGINS` no backend com a URL exata do seu frontend na Vercel.
5. Para a area de pais funcionar entre dominios diferentes, use HTTPS no backend publico e configure:

```env
PARENT_COOKIE_SECURE=true
PARENT_COOKIE_SAMESITE=none
```

Guia completo: [guia.md](./guia.md)

## Documentacao adicional

- [guia.md](./guia.md): passo a passo para Vercel + backend local
- [docs/cloudflare-tunnel.md](./docs/cloudflare-tunnel.md): configuracao do tunnel
- [docs/vercel-deploy.md](./docs/vercel-deploy.md): deploy do frontend
- [docs/setup-local.md](./docs/setup-local.md): setup local
- [docs/kokoro-setup.md](./docs/kokoro-setup.md): audio com Kokoro

## Comandos uteis

```powershell
python scripts\init_db.py
python -m compileall apps\api
Set-Location apps\web
pnpm exec tsc --noEmit
pnpm build
```

## Observacoes

- O backend usa SQLite local em `apps/api/kids_tutor.sqlite`.
- O frontend usa `fetch` com `credentials: include`, entao CORS e cookies precisam estar corretos quando frontend e backend estiverem em dominios diferentes.
- Se o Kokoro nao estiver ativo, a aplicacao continua funcionando com fallback de audio.
