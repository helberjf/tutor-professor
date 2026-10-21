# Study Content Scroll Implementation Plan

> **For agentic workers:** Execute inline using executing-plans, following the user-approved behavior.

**Goal:** Posicionar o conteúdo aberto em cada etapa até o botão “Iniciar estudo”.

**Architecture:** Usar um hook com ref, chave de destino e sinal de prontidão. Rolar no próximo frame e cancelar no cleanup. Cada raiz recebe `scroll-mt-24` para manter espaço sob o menu fixo.

**Tech Stack:** React, TypeScript, Next.js, Node assert.

## Task 1: Rolagem após renderização

- [x] Criar `apps/web/scripts/test-study-content-scroll.mjs` executando o hook com efeitos e frames controlados: aguardar prontidão, rolar uma vez por destino, cancelar frames obsoletos e aceitar refs ausentes.
- [x] Executar `node scripts/test-study-content-scroll.mjs` em `apps/web` e confirmar falha por ausência do hook.
- [x] Criar `apps/web/src/hooks/use-study-content-scroll.ts` com `useRef`, efeito dependente de `[destination, ready]`, `requestAnimationFrame`, `scrollIntoView({ block: 'start', behavior: 'auto' })` e cancelamento.

## Task 2: Integrar os destinos

- [x] Em `CodingCurriculum.tsx`, usar chave formada por modo, tipo de view e matéria; aguardar a lista correspondente carregar e anexar ref às raízes de matérias, tópicos, revisão, flashcards e LeetCode.
- [x] Em `TopicView.tsx`, substituir `window.scrollTo({ top: 0 })` pelo hook ligado ao id da aula e anexar a ref ao cabeçalho.
- [x] Em `CodingTab.tsx`, posicionar o modo simulado em um wrapper com o hook habilitado somente quando esse modo estiver aberto.
- [x] Atualizar o teste existente de layout que exigia rolagem ao topo geral para exigir o cabeçalho da aula.

## Task 3: Validar

- [x] Executar teste do hook, navegação, retomada e layout da leitura.
- [x] Executar `pnpm typecheck` e `pnpm lint` em `apps/web`.
- [x] Conferir a navegação com dados de teste em viewport de computador e celular, incluindo carregamento atrasado e abertura explícita do modal.
- [x] Revisar o diff e manter alterações locais para revisão do usuário.

Validação final: cinco scripts de regressão passaram, assim como TypeScript, lint e git diff --check. Fluxo completo conferido em Chromium com dados locais de teste e carregamento atrasado, em 1366×900 e 390×844. Revisão de código concluída sem pendências. Alterações mantidas locais na branch codex/study-content-scroll.
