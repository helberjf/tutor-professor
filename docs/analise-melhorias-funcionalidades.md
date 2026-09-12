# Análise de melhorias de funcionalidades

Data: 2026-09-11. Base: leitura do código (`apps/api`, `apps/web`), do banco de
produção no Supabase (só catálogo), do `TODO-SAAS.md`, da
[auditoria de 2026-05-31](auditoria-funcionalidades-viabilidade-criancas.md) e de
uma execução local do CI.

Cada item diz **o que foi observado** (com onde está), **o que propor** e uma
estimativa de **impacto** e **esforço** (P = dias, M = 1–2 semanas, G = mais).
O que o `TODO-SAAS.md` já lista não é repetido em detalhe; aparece só quando
muda de prioridade.

---

## Resumo: as que mais mudam o produto

| # | Melhoria | Por quê | Impacto | Esforço |
|---|---|---|---|---|
| 0 | **Uma fila só, com "continuar de onde parou"** | Eram três telas de escolha antes da primeira questão e quatro filas de revisão que ninguém somava. | Muito alto | P–M — **feito em 2026-09-11** |
| 1 | **Conteúdo base de verdade sem IA** | O conteúdo fixo era 1 lição de 3 itens por nível — 120 itens no acervo inteiro — e o plano gratuito não acrescenta franquia mensal: sobra o crédito diário da conta, 3 por padrão. | Muito alto | M — **feito em 2026-09-11** |
| 2 | **Modo criança com PIN para a área de pais** | Hoje a mesma sessão abre a área de pais, onde dá para trocar a chave de IA, apagar alunos e excluir a conta. | Alto | P |
| 3 | **Relatório semanal para o responsável** | É o que faz o pagante perceber valor. O serviço de e-mail já existe. | Alto | P–M |
| 4 | **Simulado de qualquer matéria** | O modo simulado é genérico, mas só tinha acervo para a certificação AWS DVA-C02, vindo de script; nenhuma outra matéria virava prova. | Alto | P — feito em 2026-09-11 |
| 5 | **Tutor de chat com IA de verdade, com limites** | O chat atual casa palavras da lição por regra; não conversa. | Alto | M |

---

## 1. Experiência da criança

### 1.0 Sessão única de estudo — feito em 2026-09-11
- **Observado:** para chegar à primeira questão a criança passava por três telas
  de escolha (home com 8 cards → `/study` com 3 abas → `study-start-section` com
  mais 5 cards), e havia **quatro filas de revisão separadas** sem nenhuma soma:
  `/api/review`, `/api/coding/review`, o deck FSRS e o "modo questões". O
  `PracticeQuestionsModal` recomeçava sempre do índice 0 com todas as questões do
  tópico, mesmo as já acertadas, embora `attempt_count`, `error_count` e
  `last_answered_at` já existissem em cada linha. Nada guardava a posição: fechar
  o app perdia o lugar.
- **Feito:**
  - `StudySession` (migration `0025`) guarda a fila montada, a posição, quantas
    foram respondidas e quantas acertou. A fila é um **retrato**, não uma consulta
    refeita a cada visita — é isso que faz "continuar de onde parou" ser verdade.
  - `GET /api/study/session` diz o que falta **sem criar nada**;
    `POST /api/study/session/start` retoma a sessão aberta (ou monta outra com
    `?restart=true`); `/progress` move o marcador só para frente;
    `/finish` encerra e fecha o dia.
  - `services/study_queue_service.py` monta a fila: lição de hoje primeiro
    (ensinar antes de perguntar), depois a revisão vencida, depois as questões
    devidas. Nada que já foi dominado volta — `is_mastered` = dois acertos com o
    último também certo, a mesma regra que o front aplica em
    `lib/question-queue.ts`.
  - Tela `/session`: barra de progresso, um card por vez, áudio, e nada para
    escolher. Cada resposta vai pelo endpoint que já era dono daquele tipo de
    card, então métricas, nível e log diário continuam iguais.
  - A home ganhou **"Continuar de onde parou"** ao lado de "Iniciar estudos",
    com "faltam N · <assunto>". O botão só aparece quando há algo a continuar.
- **Impacto:** muito alto (é o atrito que segurava todo o resto). **Esforço:** P–M.

### 1.1 Conteúdo base que funcione sem IA — feito em 2026-09-11
- **Observado:** `apps/api/content/lessons/` tem 40 arquivos, **uma lição por
  nível por idioma, cada uma com 3 itens**. Quizzes fixos: 5, só inglês.
  Histórias fixas: 1 — 120 itens de lição no acervo inteiro. O plano Gratuito tem
  `monthly_ai_generations=0` (`services/billing_service.py`), ou seja, nenhuma
  franquia mensal; o que resta é o crédito diário da conta (3 por padrão), e só
  quando o administrador libera a chave dele.
- **Consequência:** a proposta de valor depende de IA, e justamente a conta que
  mais precisa ser convencida (gratuita, em trial) é a que tem menos IA.
- **Feito:**
  1. **Pacote curado de inglês A1–A2:** 30 lições × 8 frases (240 no total,
     níveis 1 a 4), com tradução, frase de exemplo e decomposição palavra a
     palavra em 100% das frases. Os dados ficam em
     `scripts/english_core_pack_data.py` e viram JSON com
     `python scripts/build_english_core_pack.py`; `scripts/init_db.py` semeia como
     sempre. Gerar em vez de escrever 30 arquivos à mão é o que mantém o
     glossário consistente — "my" é traduzido igual nas trinta lições.
  2. **Questões sem IA:** `services/offline_question_service.py` deriva da própria
     lição as perguntas de revisão (`LessonQuestion`) e as de múltipla escolha
     (`StudyQuestion`), determinísticas e sem gastar crédito.
     `POST /api/study/questions/ensure` preenche um tópico vazio, e o painel de
     questões chama isso sozinho antes de mostrar tela vazia.
  3. **Fila de reposição em segundo plano:** `POST /api/study/questions/prefetch`
     completa o banco antes de acabar — primeiro de graça, pela lição; só depois,
     se houver chave e crédito, agenda uma geração que roda **depois** da resposta
     já ter voltado. A criança nunca espera o provedor.
  4. O cache compartilhado de lições geradas já existia (`auto_generate_lesson_for_child`
     reaproveita a lição do nível e materializa as perguntas por criança).
- **Impacto:** muito alto. **Esforço:** M.

### 1.2 Pronúncia com reconhecimento de fala
- **Observado:** há TTS (Kokoro, com fallback do navegador), mas nenhum uso de
  `SpeechRecognition` ou `MediaRecorder` no front. A criança ouve, mas nunca fala.
- **Proposta:** botão "Fale a palavra" na lição e na revisão, usando a Web Speech
  API e comparando o texto reconhecido com o esperado (tolerante a acento e
  caixa). Onde o navegador não suporta (Firefox, parte do iOS), o botão
  simplesmente não aparece. Nada de áudio sai do aparelho nessa primeira versão,
  o que evita a questão de dado de voz de criança.
- **Atenção:** o `Permissions-Policy` do `next.config.mjs` hoje bloqueia
  `microphone=()`; precisa passar a `microphone=(self)`.
- **Impacto:** alto (é o que falta num app de idioma). **Esforço:** M.

### 1.3 Tutor de chat com IA contextual
- **Observado:** `services/tutor_service.py` responde por regra, procurando
  palavras conhecidas em `LessonItem`. Existe `prompts/tutor_system_prompt.txt`,
  mas o fluxo não chama nenhum modelo.
- **Proposta:** chat com o modelo já configurado na conta, usando como contexto a
  lição do dia e os itens com mais erro, com:
  - respostas curtas e no nível da criança;
  - filtro de tema (recusa o que foge do estudo);
  - consumo de crédito igual às outras gerações;
  - histórico visível para o responsável.
- **Impacto:** alto. **Esforço:** M.

### 1.4 Gamificação leve, sem vício
- **Observado:** só existem `streak_count` e a animação de celebração
  (`components/celebration.tsx`). Não há metas, conquistas nem proteção de sequência.
- **Proposta:**
  - **Meta diária** escolhida pelo responsável (ex.: 10 min ou 1 lição + 1 revisão),
    com anel de progresso na tela inicial;
  - **Conquistas** por marco pedagógico (primeiras 50 palavras, 7 dias,
    primeira revisão perfeita), não por tempo de tela;
  - **Proteção de sequência:** 1 dia de folga por semana, para a criança não
    desanimar ao perder um dia.
  - Sem ranking entre crianças (a auditoria já apontou isso como inadequado).
- **Impacto:** médio–alto (retenção). **Esforço:** P–M.

### 1.5 Revisão espaçada unificada no FSRS
- **Observado:** a revisão de idiomas (`services/review_service.py`) usa uma
  prioridade própria; o FSRS (`services/fsrs_service.py`) só atende os decks de
  programação.
- **Proposta:** migrar `ReviewItem` e `LessonQuestion` para o FSRS, com os
  parâmetros ajustados para sessões curtas de criança. É um algoritmo só para
  manter, e o intervalo passa a se adaptar ao desempenho real.
- **Impacto:** médio (qualidade pedagógica). **Esforço:** M.

### 1.6 Onboarding guiado — feito em 2026-09-11
- **Observado:** não havia fluxo de primeiros passos no front (estava no `TODO-SAAS.md`).
- **Feito:** `/onboarding` em 3 passos — nome e idade, idioma, e um teste de
  nivelamento de 5 perguntas que sobe de "Hello" a um passado simples. O banco do
  teste é fixo (`build_placement_questions`), porque um teste que dependesse de
  conteúdo semeado falharia justamente no primeiro minuto da conta. Acertar até o
  nível 3 começa no 4; o nível colocado é **fixado** (`level_override`), senão a
  escada automática — que conta questões respondidas — puxaria de volta para 1 na
  primeira leitura. A área de pais devolve ao automático quando quiser.
  O primeiro login cai em `/onboarding`; um `?next=` explícito sempre ganha.
- **Impacto:** alto (ativação). **Esforço:** P.

---

## 2. Responsáveis

### 2.1 Modo criança com PIN
- **Observado:** nenhum PIN ou modo criança no modelo (`ChildProfile`,
  `ParentSettings`) nem nas rotas. A área de pais (`/parents`) abre na mesma sessão
  em que a criança estuda.
- **Proposta:** PIN de 4 dígitos (guardado com hash, com o mesmo freio de
  tentativas do login) para entrar em `/parents`, `/admin` e em ações
  destrutivas. A navegação da criança esconde "Área de pais" até o PIN.
- **Impacto:** alto (segurança da própria família). **Esforço:** P.

### 2.2 Relatório semanal
- **Observado:** `DailyActivity` já registra tudo por dia; `EmailService` já envia
  e-mail. Não há envio semanal, nem job agendado.
- **Proposta:** e-mail de domingo por criança com dias estudados, minutos,
  palavras novas, as 5 com mais erro e uma sugestão concreta ("revisar cores").
  Na Vercel, dá para disparar com Vercel Cron numa rota protegida por segredo.
  Inclua link para desligar o envio.
- **Impacto:** alto (renovação). **Esforço:** P–M.

### 2.2b O dia fecha estudando, não digitando — feito em 2026-09-11
- **Observado:** na aba English a meta do dia só fechava com texto escrito
  (`goalMet = hasStudyText`), e `is_study_day` era `bool(studied_text)`. Um diário
  de adulto no caminho de uma criança que já tinha feito o trabalho.
- **Feito:** `is_study_day` passou a significar "este dia foi estudado": sessão
  concluída (`StudyDay.auto_completed_at`), atividade registrada, ou o texto —
  o que vier primeiro. A sequência de dias (`compute_study_streak`) segue a mesma
  regra. O registro escrito continua existindo, como registro e não como pedágio.

### 2.3 Painel de pais mais útil
- **Observado:** o card por aluno em `/parents` mostra 3 números (Dias, Temas, Frases).
- **Proposta:** acrescentar tempo estudado por dia (gráfico da semana, o
  componente `weekly-activity-chart.tsx` já existe), taxa de acerto por tipo de
  atividade, palavras com mais erro e "o que fazer agora".
- **Impacto:** médio–alto. **Esforço:** P.

### 2.4 Limite de tempo e horário
- **Observado:** não existe limite de tempo de uso nem janela de horário.
- **Proposta:** limite diário opcional por criança e horário permitido (ex.: não
  depois das 21h), com aviso amigável e sem cortar no meio de uma atividade.
- **Impacto:** médio (argumento de venda para pais). **Esforço:** P.

### 2.5 Aprovação de conteúdo gerado por IA
- **Observado:** o conteúdo gerado passa por validação de formato, mas vai
  direto para a criança. A auditoria de maio já recomendava curadoria.
- **Proposta:** opção "revisar antes de liberar". Lições geradas ficam em
  rascunho até o responsável aprovar, com pré-visualização. Desligada por padrão,
  para não travar quem não quer o trabalho.
- **Impacto:** médio (confiança). **Esforço:** P–M.

### 2.6 Lembretes no celular
- **Observado:** o app é PWA com service worker, mas notificação só existe no
  timer do Pomodoro (`app/study/page.tsx`), e não há Web Push.
- **Proposta:** lembrete diário no horário escolhido pelo responsável, via Web
  Push (funciona no Android e no iOS 16.4+ quando o app está instalado).
- **Impacto:** médio (retenção). **Esforço:** M.

---

## 3. Produto e negócio

### 3.1 Simulado para toda matéria
- **Observado:** o modo simulado (`Exam`, `ExamQuestion`, `ExamAttempt`) já era
  genérico — sem blueprint ele sorteia do acervo inteiro —, mas o acervo só era
  preenchido pelo script da certificação AWS DVA-C02. Não havia rota nem tela para
  montar o simulado de outra matéria.
- **Feito em 2026-09-11:** `GET /api/exams/sources` lista toda matéria da criança
  que já tem questões de múltipla escolha (inglês, matérias livres e, com o módulo
  ligado, programação). `POST /api/exams/from-subject` cria ou atualiza o
  "Simulado de <matéria>" copiando essas questões para o acervo, com cada tópico
  como domínio, então o resultado sai por tópico. A tela `/exams` ganhou o painel
  "Simulado de uma matéria". Sem migration.
- **Próximo passo:** gerar questões de simulado com IA na própria tela, para a
  matéria que ainda tem poucas; hoje elas vêm do modo questões.
- **Continua valendo:** separar público infantil e adulto para programação e
  LeetCode, com um tipo de perfil na criação ("criança" ou "estudante/adulto").

### 3.2 Cobrança com Pix
- **Observado:** tudo pronto menos o gateway (`start_checkout`), conforme o `TODO-SAAS.md`.
- **Proposta:** Mercado Pago ou Pagar.me, porque Pix pesa no Brasil. É o único
  bloqueador para receber dinheiro.
- **Impacto:** muito alto. **Esforço:** M.

### 3.3 Métricas de produto
- **Observado:** `DailyActivity` e `UsageRecord` já têm os eventos, mas não há
  painel de ativação e retenção.
- **Proposta:** painel no `/admin` com cadastros → primeira lição → D7 → D30 e
  trial → pago, calculado a partir das tabelas existentes, sem ferramenta externa.
- **Impacto:** alto (decidir com número). **Esforço:** P–M.

### 3.4 Mensagem certa quando a IA falha
- **Observado:** quando o provedor está fora, o usuário vê a mensagem de crédito
  (listado no `TODO-SAAS.md`).
- **Proposta:** distinguir "sem crédito", "provedor fora do ar" e "chave
  inválida", cada um com a ação correspondente. Barato e evita suporte.
- **Impacto:** médio. **Esforço:** P.

### 3.5 Login com Google em produção
- **Observado:** documentado como quebrado entre domínios em
  `docs/deploy-vercel-supabase.md` §7 (cookie gravado no domínio da API).
- **Proposta:** trocar o cookie por código de uso único no redirect, ou usar
  domínio próprio (`app.` e `api.`). Login social reduz atrito de cadastro.
- **Impacto:** médio–alto. **Esforço:** P–M.

---

## 4. Base técnica que afeta funcionalidades

| Item | Observado | Situação |
|---|---|---|
| CI vermelho na main | 4 testes `.mjs` presos a layout e login antigos, e `pnpm audit` com 8 vulnerabilidades — 2 **críticas** de execução remota de código no Next.js 15.5.22. | **Feito em 2026-09-11:** Next 15.5.24, overrides para `sharp`, `js-yaml`, `browserslist`, `baseline-browser-mapping` e `postcss-selector-parser` (audit limpo); testes atualizados para o comportamento atual, incluindo a checagem de open redirect do `?next=`. |
| Hash de senha | PBKDF2-SHA256 com 260 mil iterações; a OWASP pede 600 mil. | **Feito:** 600 mil, formato versionado (`pbkdf2_sha256:<iter>:<salt>:<hash>`), hashes antigos continuam válidos e são atualizados no próximo login. |
| Mensagem de erro da IA | Falha de provedor chegava ao usuário como `"Gemini request failed: <exceção crua>"`, em inglês e com detalhes de transporte. | **Feito:** mensagem em português que distingue chave recusada, limite atingido, instabilidade e sem conexão, sem a exceção crua (3.4). |
| README desatualizado | Falava em Next.js 14 e backend no PC via túnel. | **Feito:** stack, arquitetura, demo e limitações refletem Vercel + Supabase. |
| Dependências do backend | `fastapi==0.109.2` (Starlette antigo) e `requests==2.31.0` têm correções de segurança publicadas depois. | **Pendente:** não deu para validar localmente (o Python 3.10 da máquina conflita com as versões novas). Fazer num branch com o CI em Python 3.11 antes de ir para a main. |
| `main.py` com ~9.600 linhas | 131 rotas num arquivo. | Pendente: quebrar em routers por domínio, um por PR, com `test_api_routes.py` e `test_tenant_isolation.py` como rede. |
| Monitoramento | Sem alerta de exceção (listado no `TODO-SAAS.md`). | Pendente: Sentry ou equivalente antes de ter clientes pagantes. |

---

## 5. Roteiro sugerido

**Feito em 2026-09-11:** CI (testes + `pnpm audit`, incluindo o RCE do Next.js),
hash de senha, mensagens de erro de IA (3.4), README, simulado para toda matéria
(3.1), sessão única com "continuar de onde parou" (1.0), fila que não repete o
que já foi acertado (1.0), reposição de questões em segundo plano (1.1), pacote
curado de inglês A1–A2 e questões sem IA (1.1), dia que fecha estudando (2.2b) e
onboarding em 3 telas com nivelamento (1.6).

**Antes do próximo deploy**
1. Rodar a migration `0025` no Supabase pelo bootstrap e conferir as colunas
   (`studysession`, `studyday.auto_completed_at`, `user.onboarding_completed_at`),
   não só o `alembic_version`.
2. `python scripts/init_db.py --dry-run` contra produção antes de semear as 30
   lições novas; depois sem `--dry-run`.

**Agora (1–2 semanas)**
3. PIN da área de pais (2.1). Precisa de migration (a próxima livre é a `0026`).
4. Atualizar FastAPI/requests validando no CI (seção 4).
5. Gerar questões de simulado com IA na própria tela (3.1).

**Próximo (2–6 semanas)**
6. Relatório semanal por e-mail (2.2) e painel de pais mais rico (2.3).
7. Gateway com Pix (3.2).
8. Meta diária, conquistas e proteção de sequência (1.4).

**Depois**
9. Pronúncia com reconhecimento de fala (1.2).
10. Tutor com IA contextual (1.3).
11. FSRS na revisão de idiomas (1.5) — a fila única já é o lugar natural para ele.
12. Lembretes por Web Push (2.6), limite de tempo (2.4), curadoria de IA (2.5).
13. Perfil criança × adulto completo (3.1) e quebra do `main.py` em routers.
