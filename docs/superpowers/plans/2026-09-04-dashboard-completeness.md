# Dashboard do Cliente — Completude e Indicadores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar todas as ações relevantes de estudo no backend e apresentar no dashboard uma visão diária consistente, atualizada e útil.

**Architecture:** O backend continua sendo a fonte de verdade para `DailyActivity`. Tentativas de questões e finalização de simulados criam eventos na mesma transação da ação principal; o fuso da atividade é configurável. O frontend consulta resumos diários para uma linha do tempo, métricas de tempo/desempenho e uma grade de 30 dias baseada no mesmo feed.

**Tech Stack:** FastAPI/SQLModel, Pydantic, Next.js/React, TypeScript, Tailwind, scripts de smoke test.

---

### Task 1: Completar o registro no backend

**Files:**
- Modify: `apps/api/main.py`
- Modify: `apps/api/schemas/schemas.py`
- Modify: `apps/api/.env.example`
- Test: `scripts/test_daily_activity_completeness.py`

- [x] **Step 1: Escrever testes que falham** para tentativas de questões, finalização de simulado, agregados do resumo e data no fuso configurado.
- [x] **Step 2: Rodar o teste e confirmar falha** por ausência dos eventos/campos.
- [x] **Step 3: Implementar o helper de data/fuso, agregação de resumo, tipos `question`/`exam`, log de questões e log único na finalização do simulado.
- [x] **Step 4: Rodar os testes novos e o smoke test de rotas.**
- [x] **Step 5: Refatorar somente após os testes verdes.**

### Task 2: Unificar e enriquecer o dashboard

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/daily-activity-widget.tsx`
- Modify: `apps/web/src/components/daily-activity-log.tsx`
- Modify: `apps/web/src/components/weekly-activity-chart.tsx`
- Modify: `apps/web/src/components/activity-log-section.tsx`
- Modify: `apps/web/src/components/dashboard-overview.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Test: `scripts/test_client_dashboard_ui.py`

- [x] **Step 1: Escrever checks de UI que falham** para novos tipos, linha do tempo, métricas e endpoint mensal.
- [x] **Step 2: Rodar o check e confirmar falha.**
- [x] **Step 3: Implementar linha do tempo completa com rolagem, tempo/pontuação, atualização em foco/visibilidade e parsing UTC correto.
- [x] **Step 4: Implementar resumo mensal baseado em `DailyActivity` e indicadores de dias/atividade/tempo.
- [x] **Step 5: Rodar checks, typecheck, lint e build.**

### Task 3: Verificação e entrega

- [x] **Step 1: Executar testes backend e frontend completos.**
- [x] **Step 2: Revisar diff, preservar alterações de cadastro existentes e executar `git diff --check`.**
- [ ] **Step 3: Solicitar revisão de código e corrigir problemas críticos/importantes.**
- [ ] **Step 4: Commitar apenas os arquivos desta melhoria e reportar a branch para integração.**
