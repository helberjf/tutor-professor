# Daily Activity Tracking

## Overview

O sistema de rastreamento de atividades diárias foi implementado para registrar automaticamente todas as atividades de estudo da criança. Isso permite que pais e educadores vejam um histórico completo do que foi estudado em cada dia.

## Features

### ✅ Atividades Rastreadas

- **Lições**: Registra quando uma lição é completada
- **Revisões**: Registra cada palavra revisada (correto/incorreto)
- **Quizzes**: Registra submissões de quiz com pontuação
- **Programação**: Registra atividades de codificação (pronto para expansão)

### 📊 Informações Registradas

Para cada atividade, o sistema captura:
- Tipo de atividade
- Título/Descrição da atividade
- Timestamp (hora exata)
- Pontuação/Resultado (percentual ou sim/não)
- Detalhes adicionais em JSON (ex: score e total de um quiz)
- Duração (opcional)

### 🔍 Endpoints da API

#### Log de Atividade
```bash
POST /api/activity/log
Content-Type: application/json

{
  "activity_type": "lesson|review|quiz|coding",
  "activity_title": "Lesson 1: Colors",
  "activity_id": 123,
  "result_score": 95.5,
  "result_details": {...},
  "duration_seconds": 300
}
```

#### Obter Atividades de Hoje
```bash
GET /api/activity/today
```

Retorna:
```json
{
  "activity_date": "2026-07-09",
  "total_activities": 5,
  "activities_by_type": {
    "lesson": 1,
    "review": 3,
    "quiz": 1
  },
  "activities": [...]
}
```

#### Obter Atividades de Data Específica
```bash
GET /api/activity/day/2026-07-09
```

#### Obter Atividades da Semana
```bash
GET /api/activity/week
```

Retorna array com resumo de cada dia dos últimos 7 dias.

## Como Funciona

### Backend (FastAPI)

1. **Modelo**: `DailyActivity` em `models/database.py`
   - Armazena todas as atividades com timestamps
   - Relacionada com `ChildProfile` por `child_id`

2. **Endpoints**: Em `main.py` linhas ~3330+
   - POST `/api/activity/log` - registra atividade manualmente
   - GET `/api/activity/today` - atividades de hoje
   - GET `/api/activity/day/{date}` - atividades de data específica
   - GET `/api/activity/week` - atividades dos últimos 7 dias

3. **Auto-registro**: Modificado em:
   - `POST /api/lesson/complete` - registra quando lição é completada
   - `POST /api/quiz/submit` - registra submissão de quiz
   - `POST /api/review/attempt` - registra tentativa de review

### Frontend (React/Next.js)

1. **Componente**: `apps/web/src/components/daily-activity-log.tsx`
   - Exibe histórico de atividades
   - Mostra estatísticas por tipo de atividade
   - Cards com ícones e cores por tipo
   - Timestamp de cada atividade

2. **Página**: `/activity-log`
   - Rota dedicada para visualizar o histórico
   - Acessível do dashboard de estudo

3. **API Client**: Em `lib/api.ts`
   - `logActivity()` - registra atividade manualmente
   - `getTodayActivities()` - busca atividades de hoje
   - `getDayActivities(date)` - busca atividades de data
   - `getWeekActivities()` - busca semana

## Banco de Dados

### Schema

```sql
CREATE TABLE daily_activity (
  id INTEGER PRIMARY KEY,
  child_id INTEGER NOT NULL,
  activity_date DATE NOT NULL,
  activity_type VARCHAR(40),
  activity_title VARCHAR(200),
  activity_id INTEGER,
  result_score FLOAT,
  result_details JSON,
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_child_date 
  ON daily_activity(child_id, activity_date);
```

### Índices

- `child_id`: para filtrar por criança
- `activity_date`: para filtrar por data
- `activity_type`: para filtrar por tipo

## Fluxo de Dados

```
Criança completa uma lição
         ↓
Aplicação frontend chama POST /api/lesson/complete
         ↓
Backend marca lição como completa
         ↓
Backend cria registro DailyActivity automaticamente
         ↓
Pai acessa GET /api/activity/today
         ↓
Frontend exibe histórico com timestamp, tipo e pontuação
```

## Próximas Melhorias

- [ ] Widget de histórico na página principal de estudo
- [ ] Filtro por tipo de atividade
- [ ] Gráficos de evolução semanal/mensal
- [ ] Notificações quando meta diária é atingida
- [ ] Exportar histórico em PDF
- [ ] Comparação com semana anterior

## Migração

O banco de dados cria a tabela automaticamente na primeira execução via `SQLModel.metadata.create_all()` no script `init_db.py`.

Não é necessário fazer migração manual com Alembic.

## Testing

Para testar manualmente:

```bash
# 1. Acessar o backend
curl http://localhost:8001/api/activity/today

# 2. Completar uma lição (vai auto-registrar)
curl -X POST http://localhost:8001/api/lesson/complete -d '{"lesson_id": 1}'

# 3. Verificar se foi registrado
curl http://localhost:8001/api/activity/today
```

## Notas

- Atividades são registradas com a data local da criança
- Timestamp é UTC (criado_em)
- Dados sensíveis (pontuações, etc) são armazenados no banco privado
- API requer autenticação de sessão de pai

---

Implementado em: 2026-07-09
Status: ✅ Production Ready
