# Correção global do webapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atualizar API e frontend para que Sessão e Objetivos funcionem, corrigir o português de produto e eliminar textos com contraste insuficiente em todos os temas.

**Architecture:** O trabalho parte de `origin/main` em um worktree isolado. A API recebe as migrations e é publicada antes do frontend; a UI mantém os endpoints atuais, mas converte incompatibilidades `404` em estados orientativos. O contraste será corrigido por tokens/classes compartilhados e casos dinâmicos serão cobertos por uma auditoria automatizada.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, FastAPI, SQLModel/Alembic, SQLite/PostgreSQL, Vercel, scripts Node/Python existentes.

---

### Task 1: Preparar a base isolada e confirmar o estado publicado

**Files:**
- Create: worktree irmão `../english-kids-tutor-webapp-fix` a partir de `origin/main`
- Read: `apps/api/alembic/versions/0025_study_sessions_and_auto_day.py`
- Read: `apps/api/alembic/versions/0026_child_profile_birth_date.py`
- Read: `apps/api/alembic/versions/0027_objectives.py`
- Read: `apps/api/vercel.json`
- Read: `apps/web/package.json`

- [ ] **Step 1: Criar o worktree sem tocar no checkout atual**

Run:

```powershell
git fetch origin main
git worktree add ..\english-kids-tutor-webapp-fix origin/main
Set-Location ..\english-kids-tutor-webapp-fix
```

Expected: o novo worktree está em `origin/main`; `git status --short` não mostra alterações.

- [ ] **Step 2: Registrar o baseline de testes**

Run:

```powershell
Set-Location apps\web
pnpm typecheck
pnpm lint
Set-Location ..\..
python scripts/test_dark_mode_coverage.py
python scripts/test_accessibility_baseline.py
```

Expected: os testes existentes passam antes das mudanças; qualquer falha deve ser registrada como baseline, não mascarada.

- [ ] **Step 3: Confirmar a defasagem da API publicada**

Run:

```powershell
curl.exe -sS -o $null -w "%{http_code}`n" https://tutor-professor-api.vercel.app/api/study/session/start -X POST -H "Content-Type: application/json" -d "{}"
curl.exe -sS -o $null -w "%{http_code}`n" https://tutor-professor-api.vercel.app/api/objectives
```

Expected: ambos respondem `404` no baseline; depois do deploy da Task 7 ambos devem responder `401` sem token ou `200` com autenticação.

- [ ] **Step 4: Commitar apenas a preparação, se houver arquivo de registro**

Run:

```powershell
git status --short
```

Expected: nenhum arquivo de produto é alterado nesta tarefa.

### Task 2: Criar testes de regressão antes das correções

**Files:**
- Create: `apps/web/scripts/test-product-copy-and-contrast.mjs`
- Modify: `apps/web/scripts/test-objectives-ui.mjs`
- Test: `apps/web/scripts/test-product-copy-and-contrast.mjs`

- [ ] **Step 1: Escrever o teste vermelho de fallback de API antiga**

Adicionar a `test-objectives-ui.mjs` as asserções:

```js
assert.match(
  objectivesBoard,
  /err instanceof ApiError && err.status === 404/,
  'objectives must identify an API version mismatch',
);
assert.match(
  objectivesBoard,
  /servidor.*vers[aã]o anterior|API.*atualizada/i,
  'objectives must explain the version mismatch in Portuguese',
);
```

- [ ] **Step 2: Escrever o teste vermelho de copy e contraste**

Criar o script com este comportamento:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const sourceRoots = [path.join(root, 'src'), path.join(root, '..', 'api', 'main.py')];
const forbidden = /\b(nao|voce|sessao|licao|revisao|questao|questoes|inicio|possivel|configuracao|proxima|ingles|conteudo|descricao|titulo)\b/g;
const files = [];
function collect(entry) {
  if (fs.statSync(entry).isDirectory()) {
    for (const child of fs.readdirSync(entry)) collect(path.join(entry, child));
  } else if (/\.(tsx?|py)$/.test(entry)) files.push(entry);
}
for (const entry of sourceRoots) collect(entry);
const copyFailures = files.flatMap((file) => {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(forbidden)].map((match) => `${file}:${match.index}:${match[0]}`);
});
assert.deepEqual(copyFailures, [], `unaccented product copy found:\n${copyFailures.join('\n')}`);

const css = fs.readFileSync(path.join(root, 'src', 'app', 'globals.css'), 'utf8');
assert.match(css, /button:disabled|\[disabled\]/, 'disabled controls need an explicit contrast rule');
assert.match(css, /disabled.*background|background.*disabled/i, 'disabled controls need an explicit background');
const sourceText = files.filter((file) => file.endsWith('.tsx')).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
assert.doesNotMatch(sourceText, /bg-(?:sky|emerald|amber|rose)-500[^\n]*text-white|text-white[^\n]*bg-(?:sky|emerald|amber|rose)-500/i, 'text-white actions need dark enough surfaces');
console.log('product copy and contrast checks passed');
```

- [ ] **Step 3: Rodar os testes e confirmar falha pelo motivo certo**

Run:

```powershell
Set-Location apps\web
node scripts/test-objectives-ui.mjs
node scripts/test-product-copy-and-contrast.mjs
```

Expected: os testes falham apontando a ausência do fallback em `ObjectivesBoard`, as grafias sem acento e a regra de contraste; não devem falhar por caminho inexistente ou sintaxe.

- [ ] **Step 4: Commitar os testes vermelhos**

Run:

```powershell
git add apps/web/scripts/test-objectives-ui.mjs apps/web/scripts/test-product-copy-and-contrast.mjs
git commit -m "test: cover product copy and UI contrast regressions"
```

### Task 3: Corrigir o tratamento de servidor antigo em Objetivos e Sessão

**Files:**
- Modify: `apps/web/src/components/objectives/ObjectivesBoard.tsx`
- Modify: `apps/web/src/app/objectives/page.tsx`
- Modify: `apps/web/src/app/session/page.tsx`
- Test: `apps/web/scripts/test-objectives-ui.mjs`

- [ ] **Step 1: Implementar o estado explícito de incompatibilidade em `ObjectivesBoard`**

Adicionar um estado `serverOutdated`, limpar ambos os estados no início de `load`, e tratar o erro antes do fallback genérico:

```tsx
const [serverOutdated, setServerOutdated] = useState(false);

const load = useCallback(async (includeArchived: boolean) => {
  setLoading(true);
  setError('');
  setServerOutdated(false);
  try {
    const data = await api.getObjectives({ includeArchived });
    setObjectives(sortObjectives(data));
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 404) {
      setServerOutdated(true);
    } else {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar seus objetivos.');
    }
  } finally {
    setLoading(false);
  }
}, []);
```

Renderizar antes do erro comum:

```tsx
{serverOutdated ? (
  <StatusCard
    tone="offline"
    title="Servidor em versão anterior"
    message="A tela de objetivos já está no aplicativo, mas a API ainda precisa ser atualizada. Enquanto isso, suas lições e revisões continuam disponíveis."
    primaryAction={<button type="button" onClick={() => void load(showArchived)} className="app-button bg-primary hover:bg-primary-dark">Tentar novamente</button>}
    secondaryHref="/lesson"
    secondaryLabel="Abrir lição"
  />
) : null}
```

O bloco deve ocultar o erro genérico e o estado vazio enquanto `serverOutdated` for verdadeiro.

- [ ] **Step 2: Atualizar os textos da tela de Sessão**

Substituir as mensagens sem acento em `session/page.tsx` por `não`, `sessão`, `lição`, `revisão`, `questões`, `início`, `possível` e `já`, mantendo a lógica de `phase === 'outdated-server'` intacta.

- [ ] **Step 3: Rodar os testes da tela**

Run:

```powershell
Set-Location apps\web
node scripts/test-objectives-ui.mjs
```

Expected: PASS.

- [ ] **Step 4: Commitar o fallback**

```powershell
git add apps/web/src/components/objectives/ObjectivesBoard.tsx apps/web/src/app/objectives/page.tsx apps/web/src/app/session/page.tsx apps/web/scripts/test-objectives-ui.mjs
git commit -m "fix(web): explain stale API versions on study screens"
```

### Task 4: Padronizar contraste de ações e estados desabilitados

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/onboarding/page.tsx`
- Modify: `apps/web/src/components/objectives/CreateObjectiveModal.tsx`
- Modify: `apps/web/src/components/objectives/ObjectiveCard.tsx`
- Modify: `apps/web/src/app/session/page.tsx`
- Modify: action components found by `git grep -l 'text-white.*disabled:opacity' origin/main -- apps/web/src/**/*.tsx`
- Test: `apps/web/scripts/test-product-copy-and-contrast.mjs`

- [ ] **Step 1: Add shared disabled-control colors**

Append to `globals.css` after the dark-mode utility remaps:

```css
button[class~='text-white']:disabled {
  opacity: 1 !important;
  background-color: #cbd5e1 !important;
  color: #334155 !important;
  box-shadow: none !important;
}

html[data-theme='dark'] button[class~='text-white']:disabled {
  background-color: #334155 !important;
  color: #e2e8f0 !important;
}
```

This is limited to disabled buttons that explicitly request white text, leaving selected answer feedback and non-button icon states unchanged.

- [ ] **Step 2: Replace low-contrast normal action colors**

Update text-bearing action buttons and links to use these pairs:

```tsx
bg-sky-700 text-white hover:bg-sky-800
bg-primary text-white hover:bg-primary-dark
bg-emerald-700 text-white hover:bg-emerald-800
bg-amber-700 text-white hover:bg-amber-800
bg-rose-700 text-white hover:bg-rose-800
```

For amber actions whose background must remain amber-500 for a visual status tile, use `text-slate-950` instead of `text-white`. Do not change icon-only tiles without readable text.

- [ ] **Step 3: Add explicit classes to dynamic objective controls**

Use `disabled:opacity-100 disabled:bg-slate-200 disabled:text-slate-600` on the modal's `Adicionar` and `Criar objetivo` buttons and on the checklist action in `ObjectiveCard`, so the component remains legible even if Tailwind class composition changes.

- [ ] **Step 4: Run the contrast tests**

Run:

```powershell
Set-Location apps\web
node scripts/test-product-copy-and-contrast.mjs
python ..\..\scripts\test_dark_mode_coverage.py
```

Expected: PASS; no new uncovered dark-mode utility appears.

- [ ] **Step 5: Commit the contrast fix**

```powershell
git add apps/web/src/app/globals.css apps/web/src/app/onboarding/page.tsx apps/web/src/app/session/page.tsx apps/web/src/app/objectives/page.tsx apps/web/src/components/objectives apps/web/src/app/study apps/web/src/components apps/web/scripts/test-product-copy-and-contrast.mjs
git commit -m "fix(web): make actions readable in both themes"
```

### Task 5: Revisar o português de produto e do conteúdo versionado

**Files:**
- Modify: product-copy files under the exact roots `apps/web/src`, `apps/api/main.py`, `apps/api/schemas/schemas.py`, and `apps/api/services`
- Modify: Portuguese fields in the exact content roots `apps/api/content/lessons`, `apps/api/content/quizzes`, and `apps/api/content/admin-learn`
- Test: `apps/web/scripts/test-product-copy-and-contrast.mjs`
- Create: `scripts/test_portuguese_product_copy.py`

- [ ] **Step 1: Build the inventory without changing identifiers**

Run from the isolated worktree:

```powershell
git grep -n -I -E '\\b(nao|voce|sessao|licao|revisao|questao|questoes|inicio|possivel|configuracao|proxima|ingles|conteudo|descricao|titulo|aonde|alcanca|faca|ate|tambem)\\b' -- apps/web/src apps/api/main.py apps/api/schemas apps/api/services apps/api/content
```

Review each match in context. Only user-facing Portuguese text and Portuguese content fields are changed; Python/TypeScript property names, endpoint paths, English text, proper names and user-authored values remain unchanged.

- [ ] **Step 2: Apply contextual corrections**

Use the following canonical spellings in UI/API copy: `não`, `você`, `sessão`, `lição`, `revisão`, `questão`, `questões`, `início`, `possível`, `configuração`, `próxima`, `inglês`, `conteúdo`, `descrição`, `título`, `aonde`, `alcance`, `faça`, `até`, `também`, `está`, `estão`, `já`, `são`, `há`, `opção`, `prática`, `gramática`, `módulo`, `certificação`, `segurança`, `operação`, `mensageria` and `resposta` according to sentence context.

Use `git diff --word-diff=porcelain` to ensure only copy values changed.

- [ ] **Step 3: Add a focused regression checker**

Create `scripts/test_portuguese_product_copy.py` with a denylist of the same unambiguous spellings used by the Node check. It must inspect only quoted values in Python/TypeScript and values of Portuguese JSON fields (`title`, `theme`, `objective`, `daily_goal`, `phrase_pt`, `example_sentence_pt`, `word_pt`, `question`, `answer`, `explanation`), exclude identifiers/comments and other-language fields, and print each file/line when a forbidden spelling remains.

- [ ] **Step 4: Run copy validation and JSON parsing**

Run:

```powershell
python scripts/test_portuguese_product_copy.py
Set-Location apps\web
node scripts/test-product-copy-and-contrast.mjs
Set-Location ..\..
python -m compileall apps/api
```

Expected: PASS with no forbidden copy and no invalid JSON/Python files.

- [ ] **Step 5: Commit the copy correction**

```powershell
git add apps/web/src apps/api/main.py apps/api/schemas apps/api/services apps/api/content scripts/test_portuguese_product_copy.py
git commit -m "fix(copy): correct Portuguese product and lesson text"
```

### Task 6: Validate API functionality and database migrations locally

**Files:**
- Read: `apps/api/database_bootstrap.py`
- Read: `scripts/test_study_session_flow.py`
- Read: `scripts/test_objectives_progress.py`
- Read: `apps/api/alembic/versions/0025_study_sessions_and_auto_day.py`
- Read: `apps/api/alembic/versions/0026_child_profile_birth_date.py`
- Read: `apps/api/alembic/versions/0027_objectives.py`

- [ ] **Step 1: Run the isolated API tests against temporary databases**

Run:

```powershell
python scripts/test_study_session_flow.py
python scripts/test_objectives_progress.py
```

Expected: PASS, including session resume, day close, objective percentage, checklist updates and archive behavior.

- [ ] **Step 2: Verify migration head**

Run with the deployment database URL loaded through the repository's existing environment file, without printing the URL:

```powershell
Set-Location apps\api
python database_bootstrap.py
Set-Location ..\..
```

Expected: the bootstrap reaches Alembic head `0027` and reports no schema mismatch. Stop if it proposes destructive changes or reports a missing prior migration.

- [ ] **Step 3: Run the API route and security checks**

```powershell
python scripts/test_api_routes.py
python scripts/test_database_security.py
python scripts/test_serverless_readiness.py
```

Expected: PASS.

- [ ] **Step 4: Commit any API-only correction discovered by tests**

```powershell
git status --short
```

If tests identify a product defect, add its failing assertion first, implement the smallest fix, rerun the focused test and commit it as a separate `fix(api): ...` commit.

### Task 7: Publish API first, then frontend

**Files:**
- Read: `apps/api/vercel.json`
- Read: `apps/web/vercel.json` or the linked frontend project configuration
- Read: `docs/deploy-vercel-supabase.md`

- [ ] **Step 1: Deploy the API project from the isolated worktree**

Run from `apps/api`:

```powershell
vercel --prod --yes
```

Expected: a Ready production deployment for `tutor-professor-api.vercel.app` built from the isolated worktree's commit. Do not deploy until Task 6's migration check passes.

- [ ] **Step 2: Verify public route presence without exposing credentials**

```powershell
curl.exe -sS -o $null -w "%{http_code}`n" https://tutor-professor-api.vercel.app/api/study/session/start -X POST -H "Content-Type: application/json" -d "{}"
curl.exe -sS -o $null -w "%{http_code}`n" https://tutor-professor-api.vercel.app/api/objectives
```

Expected: neither endpoint returns `404`; unauthenticated requests may return `401`.

- [ ] **Step 3: Deploy the frontend after the API is Ready**

Run from `apps/web`:

```powershell
vercel --prod --yes
```

Expected: a Ready production deployment aliased to `https://tutorprofessor.vercel.app`.

- [ ] **Step 4: Record deployment commit and health URLs**

```powershell
vercel inspect https://tutor-professor-api.vercel.app
vercel inspect https://tutorprofessor.vercel.app
```

Expected: both deployments show the current isolated worktree commit and Ready status.

### Task 8: Run authenticated smoke tests and final verification

**Files:**
- Test: `apps/web/scripts/test-objectives-ui.mjs`
- Test: `apps/web/scripts/test-study-session-resume.mjs`
- Test: `scripts/test_study_session_flow.py`
- Test: `scripts/test_objectives_progress.py`
- Read: `apps/web/src/app/globals.css`

- [ ] **Step 1: Run the complete local verification suite**

```powershell
Set-Location apps\web
pnpm typecheck
pnpm lint
pnpm build
node scripts/test-objectives-ui.mjs
node scripts/test-product-copy-and-contrast.mjs
Set-Location ..\..
python scripts/test_portuguese_product_copy.py
python scripts/test_dark_mode_coverage.py
python scripts/test_accessibility_baseline.py
python scripts/test_study_session_flow.py
python scripts/test_objectives_progress.py
```

Expected: every command exits zero.

- [ ] **Step 2: Smoke test the published UI in light and dark themes**

With an existing authenticated account, open `/objectives` and `/session` on `https://tutorprofessor.vercel.app`. In the light theme, open the objective modal and verify readable labels, disabled `Adicionar` and `Criar objetivo`, then create one objective with one checklist item. Mark it done and confirm the percentage changes. In `/session`, answer one card, reload, and confirm the queue resumes. Repeat the visual check in dark theme and open `/lesson` and `/review` to ensure their primary actions remain readable.

Expected: no `Not Found`, no stale-server warning after the API deploy, no white text on a white surface, and all Portuguese copy is accented in the visible screens.

- [ ] **Step 3: Inspect production logs only for new errors**

```powershell
vercel logs https://tutor-professor-api.vercel.app --since 10m
vercel logs https://tutorprofessor.vercel.app --since 10m
```

Expected: no new 5xx responses or migration errors associated with the smoke test.

- [ ] **Step 4: Commit final test or documentation adjustments**

```powershell
git status --short
git add docs/superpowers/plans/2026-09-14-webapp-contrast-portuguese-deploy.md apps/web/scripts apps/web/src scripts
git commit -m "test: verify global webapp quality fixes"
```

Expected: only files belonging to this plan are committed; the original checkout's dirty files remain untouched in its own worktree.

## Fora de escopo

- Alterar dados pessoais ou textos criados pelos usuários.
- Renomear endpoints, campos JSON ou identificadores internos.
- Introduzir internacionalização completa.
- Refatorar módulos sem relação com contraste, português, objetivos, sessão ou publicação coordenada.
