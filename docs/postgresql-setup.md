# PostgreSQL — Setup Local e VPS

## Por que PostgreSQL?

O projeto migrou de SQLite para PostgreSQL para suportar múltiplos usuários simultâneos, isolamento de dados por conta e uma base sólida para escalar para VPS no futuro.

---

## Setup Local (este computador — backend)

### Pré-requisitos
- PostgreSQL 14+ instalado: https://www.postgresql.org/download/windows/

### 1. Criar banco de dados (uma única vez)

Abra o **psql** como superusuário e execute:

```sql
CREATE USER kids_tutor WITH PASSWORD 'kids_tutor_secret';
CREATE DATABASE kids_tutor OWNER kids_tutor;
```

Ou via linha de comando:

```powershell
psql -U postgres -c "CREATE USER kids_tutor WITH PASSWORD 'kids_tutor_secret';"
psql -U postgres -c "CREATE DATABASE kids_tutor OWNER kids_tutor;"
```

### 2. Configurar local.secrets

No arquivo `local.secrets`, defina:

```
DATABASE_URL=postgresql://kids_tutor:kids_tutor_secret@localhost:5432/kids_tutor
```

> Troque `kids_tutor_secret` pela senha que você criou.

### 3. Criar as tabelas (migração inicial)

```powershell
cd apps/api
pip install -r requirements.txt   # instala psycopg2-binary e alembic
python database_bootstrap.py
```

### 4. Iniciar o backend normalmente

```powershell
.\start-project.cmd
```

---

## Alternativa: PostgreSQL via Docker (mais fácil)

Se preferir não instalar PostgreSQL localmente, use o Docker:

```powershell
# Sobe apenas o banco de dados
docker-compose up db -d

# Em seguida rode as migrações
cd apps/api
python database_bootstrap.py
```

O `docker-compose.yml` já tem o serviço `db` configurado com usuário, senha e volume persistente.

---

## Revisão Espaçada (Spaced Repetition)

A revisão de palavras usa um algoritmo SM-2 adaptado:

| Desempenho | Próxima revisão |
|------------|-----------------|
| Acerto (streak 1) | 4 horas |
| Acerto (streak 2) | 12 horas |
| Acerto (streak 3) | 24 horas |
| Acerto (streak 4) | 72 horas |
| Acerto (streak 5+) | 168 horas (1 semana) |
| Erro | 5–15 minutos |

Palavras mais difíceis (alta `difficulty_score`) aparecem com mais frequência. A interface de revisão fica em `/review`.

---

## Login por Usuário

Cada responsável cria uma conta em `/register` com nome, e-mail, CPF e senha.  
Cada conta tem seus próprios **filhos** e **progresso independente**.

### Endpoints de autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register` | Criar conta |
| POST | `/api/auth/login` | Fazer login (cookie de sessão) |
| GET  | `/api/auth/me` | Dados do usuário logado |
| POST | `/api/auth/logout` | Encerrar sessão |

### Gerenciamento de filhos (requer login)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/api/parent/children` | Listar filhos do usuário logado |
| POST | `/api/parent/children` | Criar filho vinculado ao usuário |
| POST | `/api/parent/settings` | Atualizar configurações do filho |

---

## Migração para VPS (futuro)

Quando você contratar um VPS (ex: DigitalOcean, Hetzner, Oracle Free):

### 1. Instalar PostgreSQL no VPS

```bash
sudo apt update && sudo apt install postgresql -y
sudo -u postgres psql -c "CREATE USER kids_tutor WITH PASSWORD 'SENHA_FORTE';"
sudo -u postgres psql -c "CREATE DATABASE kids_tutor OWNER kids_tutor;"
```

### 2. Atualizar DATABASE_URL no servidor

```
DATABASE_URL=postgresql://kids_tutor:SENHA_FORTE@localhost:5432/kids_tutor
```

### 3. Executar migrações no VPS

```bash
cd /app/apps/api
python database_bootstrap.py
```

### 4. Adicionar novas migrações no futuro

Quando você alterar os modelos em `models/database.py`:

```powershell
# Gerar nova migração automaticamente (comparando modelos com banco atual)
cd apps/api
alembic revision --autogenerate -m "descricao da mudanca"

# Aplicar no banco
python database_bootstrap.py
```

### 5. Backups automáticos (recomendado)

```bash
# Backup diário via cron
pg_dump -U kids_tutor kids_tutor > backup_$(date +%Y%m%d).sql
```

---

## Variáveis de ambiente relevantes

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DATABASE_URL` | URL de conexão PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `POSTGRES_PASSWORD` | Senha usada pelo docker-compose | `kids_tutor_secret` |
| `SESSION_SECRET` | Segredo para tokens de sessão | string aleatória longa |
| `PARENT_PASSWORD` | Senha legada para área de pais | (opcional, use login por conta) |
