# Readable AI Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the ephemeral `Aprofundar com IA` answer as large, safe, formatted reading content in the modal's main pane while preserving exact Markdown copying.

**Architecture:** Add a pure Markdown-to-block parser with a narrow, tested syntax surface and a React renderer that never injects AI HTML. `ReadingStudyModal` keeps the current API and state ownership, but moves the deepening form and answer from the fixed header into the scrollable main pane and toggles between lesson and deepening views.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Node assertion scripts, existing `SyntaxCodeBlock` component.

---

## File map

- Create `apps/web/src/components/coding/deepening-markdown.ts`: pure parser for headings, paragraphs, lists, inline emphasis/code, and fenced code blocks.
- Create `apps/web/src/components/coding/DeepeningMarkdown.tsx`: safe React presentation of parsed blocks.
- Create `apps/web/scripts/test-topic-deepening-reader.mjs`: behavior tests for parsing plus source-level integration and safety checks.
- Modify `apps/web/src/components/coding/TopicView.tsx`: move the form and response into the main reading pane and add lesson/deepening navigation.
- Modify `apps/web/package.json`: expose the focused regression test as `test:topic-deepening`.

### Task 1: Parse the supported Markdown safely

**Files:**
- Create: `apps/web/src/components/coding/deepening-markdown.ts`
- Create: `apps/web/scripts/test-topic-deepening-reader.mjs`

- [ ] **Step 1: Write the failing parser test**

Create `apps/web/scripts/test-topic-deepening-reader.mjs` with the parser section below. The source-level checks shown in Task 3 will be appended later.

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const scriptDir = dirname(fileURLToPath(import.meta.url));
const parserPath = resolve(scriptDir, '../src/components/coding/deepening-markdown.ts');

assert.equal(existsSync(parserPath), true, 'the deepening Markdown parser must exist');

const parserSource = readFileSync(parserPath, 'utf8');
const compiled = ts.transpileModule(parserSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const parserModule = { exports: {} };
new Function('exports', 'module', compiled)(parserModule.exports, parserModule);
const { parseDeepeningMarkdown, parseInlineMarkdown } = parserModule.exports;

assert.deepEqual(parseInlineMarkdown('Use **EventBridge**, *regras* e `default`.'), [
  { type: 'text', value: 'Use ' },
  { type: 'strong', value: 'EventBridge' },
  { type: 'text', value: ', ' },
  { type: 'emphasis', value: 'regras' },
  { type: 'text', value: ' e ' },
  { type: 'code', value: 'default' },
  { type: 'text', value: '.' },
]);

assert.deepEqual(
  parseDeepeningMarkdown(`# EventBridge\n\nTexto objetivo.\n\n1. Event Bus\n2. Rules\n\n\`\`\`json\n{"source": ["aws.ec2"]}\n\`\`\``),
  [
    { type: 'heading', level: 1, content: [{ type: 'text', value: 'EventBridge' }] },
    { type: 'paragraph', content: [{ type: 'text', value: 'Texto objetivo.' }] },
    {
      type: 'list',
      ordered: true,
      items: [
        [{ type: 'text', value: 'Event Bus' }],
        [{ type: 'text', value: 'Rules' }],
      ],
    },
    { type: 'code', language: 'json', code: '{"source": ["aws.ec2"]}' },
  ],
);

assert.deepEqual(parseDeepeningMarkdown('Texto com **marcador incompleto'), [
  { type: 'paragraph', content: [{ type: 'text', value: 'Texto com **marcador incompleto' }] },
]);
```

- [ ] **Step 2: Run the parser test and verify RED**

Run:

```powershell
node apps/web/scripts/test-topic-deepening-reader.mjs
```

Expected: FAIL with `the deepening Markdown parser must exist`.

- [ ] **Step 3: Implement the pure parser**

Create `apps/web/src/components/coding/deepening-markdown.ts`:

```ts
export type DeepeningInline = {
  type: 'text' | 'strong' | 'emphasis' | 'code';
  value: string;
};

export type DeepeningBlock =
  | { type: 'heading'; level: 1 | 2 | 3; content: DeepeningInline[] }
  | { type: 'paragraph'; content: DeepeningInline[] }
  | { type: 'list'; ordered: boolean; items: DeepeningInline[][] }
  | { type: 'code'; language: string; code: string };

const INLINE_MARK = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;

export function parseInlineMarkdown(value: string): DeepeningInline[] {
  const result: DeepeningInline[] = [];
  let cursor = 0;

  for (const match of value.matchAll(INLINE_MARK)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push({ type: 'text', value: value.slice(cursor, index) });
    const token = match[0];
    if (token.startsWith('**')) result.push({ type: 'strong', value: token.slice(2, -2) });
    else if (token.startsWith('`')) result.push({ type: 'code', value: token.slice(1, -1) });
    else result.push({ type: 'emphasis', value: token.slice(1, -1) });
    cursor = index + token.length;
  }

  if (cursor < value.length) result.push({ type: 'text', value: value.slice(cursor) });
  return result.length ? result : [{ type: 'text', value }];
}

export function parseDeepeningMarkdown(markdown: string): DeepeningBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: DeepeningBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([^\s`]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language: fence[1] || '', code: code.join('\n') });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        content: parseInlineMarkdown(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    const list = line.match(/^\s*(?:(\d+)\.|[-*])\s+(.+)$/);
    if (list) {
      const ordered = Boolean(list[1]);
      const items: DeepeningInline[][] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:(\d+)\.|[-*])\s+(.+)$/);
        if (!item || Boolean(item[1]) !== ordered) break;
        items.push(parseInlineMarkdown(item[2].trim()));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,3})\s+/.test(lines[index])
      && !/^```/.test(lines[index])
      && !/^\s*(?:(\d+)\.|[-*])\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', content: parseInlineMarkdown(paragraph.join(' ')) });
  }

  return blocks;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node apps/web/scripts/test-topic-deepening-reader.mjs
```

Expected: PASS with no assertion output.

- [ ] **Step 5: Commit the parser and its test**

```powershell
git add apps/web/src/components/coding/deepening-markdown.ts apps/web/scripts/test-topic-deepening-reader.mjs
git commit -m "test: define deepening markdown behavior"
```

### Task 2: Render parsed content as a readable React view

**Files:**
- Modify: `apps/web/scripts/test-topic-deepening-reader.mjs`
- Create: `apps/web/src/components/coding/DeepeningMarkdown.tsx`

- [ ] **Step 1: Append failing renderer safety checks**

Append to `apps/web/scripts/test-topic-deepening-reader.mjs`:

```js
const rendererPath = resolve(scriptDir, '../src/components/coding/DeepeningMarkdown.tsx');
assert.equal(existsSync(rendererPath), true, 'the formatted deepening renderer must exist');
const rendererSource = readFileSync(rendererPath, 'utf8');
assert.match(rendererSource, /parseDeepeningMarkdown\(content\)/);
assert.match(rendererSource, /<SyntaxCodeBlock/);
assert.match(rendererSource, /<strong/);
assert.match(rendererSource, /<em/);
assert.match(rendererSource, /<code/);
assert.doesNotMatch(rendererSource, /dangerouslySetInnerHTML/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node apps/web/scripts/test-topic-deepening-reader.mjs
```

Expected: FAIL with `the formatted deepening renderer must exist`.

- [ ] **Step 3: Implement the renderer**

Create `apps/web/src/components/coding/DeepeningMarkdown.tsx`:

```tsx
import { Fragment } from 'react';

import { SyntaxCodeBlock } from './SyntaxCodeBlock';
import { parseDeepeningMarkdown, type DeepeningInline } from './deepening-markdown';

interface DeepeningMarkdownProps {
  content: string;
  fallbackLanguage?: string;
}

function InlineContent({ content }: { content: DeepeningInline[] }) {
  return content.map((part, index) => {
    const key = `${part.type}-${index}-${part.value}`;
    if (part.type === 'strong') return <strong key={key} className="font-black text-slate-900">{part.value}</strong>;
    if (part.type === 'emphasis') return <em key={key}>{part.value}</em>;
    if (part.type === 'code') {
      return <code key={key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.88em] text-rose-700">{part.value}</code>;
    }
    return <Fragment key={key}>{part.value}</Fragment>;
  });
}

export function DeepeningMarkdown({ content, fallbackLanguage }: DeepeningMarkdownProps) {
  const blocks = parseDeepeningMarkdown(content);

  return (
    <article className="mx-auto w-full max-w-[76ch] text-slate-700">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'heading') {
          if (block.level === 1) return <h3 key={key} className="mt-8 text-[1.7em] font-black leading-tight text-slate-950 first:mt-0"><InlineContent content={block.content} /></h3>;
          if (block.level === 2) return <h4 key={key} className="mt-8 text-[1.35em] font-black leading-tight text-slate-900"><InlineContent content={block.content} /></h4>;
          return <h5 key={key} className="mt-6 text-[1.1em] font-black leading-tight text-slate-900"><InlineContent content={block.content} /></h5>;
        }
        if (block.type === 'code') {
          return <SyntaxCodeBlock key={key} code={block.code} language={block.language || fallbackLanguage} className="mt-5 text-[0.8em]" />;
        }
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={key} className={`mt-4 space-y-2 pl-7 text-[1em] font-medium leading-[1.75] ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
              {block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}><InlineContent content={item} /></li>)}
            </List>
          );
        }
        return <p key={key} className="mt-4 text-[1em] font-medium leading-[1.8]"><InlineContent content={block.content} /></p>;
      })}
    </article>
  );
}
```

- [ ] **Step 4: Run the focused test and TypeScript verification**

Run:

```powershell
node apps/web/scripts/test-topic-deepening-reader.mjs
pnpm --dir apps/web exec tsc --noEmit
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the renderer**

```powershell
git add apps/web/src/components/coding/DeepeningMarkdown.tsx apps/web/scripts/test-topic-deepening-reader.mjs
git commit -m "feat: render AI deepening markdown safely"
```

### Task 3: Move deepening into the main reading pane

**Files:**
- Modify: `apps/web/scripts/test-topic-deepening-reader.mjs`
- Modify: `apps/web/src/components/coding/TopicView.tsx`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Append failing integration assertions**

Append to `apps/web/scripts/test-topic-deepening-reader.mjs`:

```js
const topicViewPath = resolve(scriptDir, '../src/components/coding/TopicView.tsx');
const topicViewSource = readFileSync(topicViewPath, 'utf8');
assert.match(topicViewSource, /import \{ DeepeningMarkdown \} from '\.\/DeepeningMarkdown';/);
assert.match(topicViewSource, /showDeepening \? \(/, 'the main pane must switch between lesson and deepening');
assert.match(topicViewSource, />Voltar à aula</);
assert.match(topicViewSource, /<DeepeningMarkdown content=\{deepeningAnswer\}/);
assert.match(topicViewSource, /navigator\.clipboard\.writeText\(deepeningAnswer\)/);
assert.doesNotMatch(topicViewSource, /readOnly[\s\S]{0,100}value=\{deepeningAnswer\}/, 'the answer must not remain in a small textarea');

console.log('topic deepening reader checks passed');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node apps/web/scripts/test-topic-deepening-reader.mjs
```

Expected: FAIL because `TopicView.tsx` does not import or render `DeepeningMarkdown`.

- [ ] **Step 3: Move the form out of the header**

In `apps/web/src/components/coding/TopicView.tsx`, import the renderer:

```tsx
import { DeepeningMarkdown } from './DeepeningMarkdown';
```

Keep the header action, but change its click behavior so it opens the view without clearing an existing result:

```tsx
onClick={() => {
  setShowDeepening(true);
  setDeepeningError('');
}}
```

Delete the complete `{showDeepening && (<form ...>...</form>)}` block from the header. Keep the speech error and progress bar there.

- [ ] **Step 4: Render deepening as the main-pane branch**

Inside the existing scrollable `<main>`, put this branch before the current `step.type === 'section'` branch:

```tsx
{showDeepening ? (
  <section className="mx-auto w-full max-w-[76ch]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <div>
        <p className="text-[0.72em] font-black uppercase tracking-widest text-violet-600">Aprofundamento com IA</p>
        <h3 className="mt-1 text-[1.45em] font-black leading-tight text-slate-950">Explore esta parte da aula</h3>
      </div>
      <button
        type="button"
        onClick={() => setShowDeepening(false)}
        className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-[0.8em] font-black text-slate-700 hover:bg-slate-100"
      >
        <ChevronLeft size={16} />
        Voltar à aula
      </button>
    </div>

    <form onSubmit={handleDeepenCurrentStep} className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4">
      <label className="block">
        <span className="text-[0.82em] font-black text-violet-900">Qual dúvida você tem sobre este assunto?</span>
        <textarea
          value={deepeningQuestion}
          onChange={(event) => setDeepeningQuestion(event.target.value)}
          placeholder="Padrão: ensinar os conceitos importantes de forma resumida e objetiva, com exemplos de cada conceito, pronto para copiar no Notion."
          maxLength={1000}
          rows={3}
          className="mt-2 w-full resize-y rounded-2xl border-2 border-violet-100 bg-white px-4 py-3 text-[0.9em] leading-relaxed text-slate-800 outline-none focus:border-violet-400"
        />
      </label>
      {deepeningError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[0.8em] font-bold text-rose-700">{deepeningError}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={deepeningLoading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-[0.8em] font-black text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {deepeningLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {deepeningLoading ? 'Aprofundando...' : deepeningAnswer ? 'Gerar novamente' : 'Gerar aprofundamento'}
        </button>
        {deepeningAnswer && (
          <button
            type="button"
            onClick={() => void handleCopyDeepening()}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-2 text-[0.8em] font-black text-violet-700 hover:bg-violet-100"
          >
            <Copy size={16} />
            {deepeningCopied ? 'Copiado!' : 'Copiar para Notion'}
          </button>
        )}
      </div>
    </form>

    {deepeningLoading && !deepeningAnswer ? (
      <div role="status" className="mt-8 flex items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-12 text-[0.95em] font-bold text-slate-600">
        <Loader2 size={22} className="animate-spin text-violet-600" />
        Preparando um aprofundamento claro e objetivo...
      </div>
    ) : deepeningAnswer ? (
      <div className="mt-8 pb-4">
        <DeepeningMarkdown content={deepeningAnswer} fallbackLanguage={subjectName} />
      </div>
    ) : (
      <p className="mt-6 rounded-2xl bg-slate-50 px-5 py-4 text-[0.9em] font-medium leading-relaxed text-slate-600">
        Você pode escrever uma dúvida específica ou deixar o campo vazio para receber os conceitos mais importantes desta etapa, com exemplos.
      </p>
    )}
  </section>
) : step.type === 'section' ? (
  // Keep the existing section article unchanged.
) : (
  // Keep the existing quiz article unchanged.
)}
```

The two comments above identify the unchanged existing JSX branches; retain their current content verbatim rather than inserting the comments into production code.

- [ ] **Step 5: Add the focused package script**

In `apps/web/package.json`, add:

```json
"test:topic-deepening": "node scripts/test-topic-deepening-reader.mjs"
```

- [ ] **Step 6: Run focused and existing regression tests**

Run:

```powershell
pnpm --dir apps/web run test:topic-deepening
node apps/web/scripts/test-topic-reading-mobile-layout.mjs
python scripts/test_topic_context_reading_ai.py
python scripts/test_reading_study_modal.py
pnpm --dir apps/web exec tsc --noEmit
```

Expected: every command exits 0, the Node scripts print their pass messages, and the Python suites report `OK`.

- [ ] **Step 7: Inspect the combined diff without disturbing prior work**

Run:

```powershell
git diff --check -- apps/web/src/components/coding/deepening-markdown.ts apps/web/src/components/coding/DeepeningMarkdown.tsx apps/web/src/components/coding/TopicView.tsx apps/web/scripts/test-topic-deepening-reader.mjs apps/web/package.json
git diff -- apps/web/src/components/coding/deepening-markdown.ts apps/web/src/components/coding/DeepeningMarkdown.tsx apps/web/src/components/coding/TopicView.tsx apps/web/scripts/test-topic-deepening-reader.mjs apps/web/package.json
```

Expected: no whitespace errors; only the deepening reader changes plus the already-present responsive `TopicView` and package changes appear.

- [ ] **Step 8: Commit only files owned by this feature**

Because `TopicView.tsx` and `package.json` already contain unrelated working-tree edits, do not make a broad commit that captures them without review. Commit the new isolated files first:

```powershell
git add apps/web/src/components/coding/deepening-markdown.ts apps/web/src/components/coding/DeepeningMarkdown.tsx apps/web/scripts/test-topic-deepening-reader.mjs
git commit -m "feat: add readable AI deepening view"
```

Leave the shared-file edits in `TopicView.tsx` and `package.json` visible in the working tree unless their pre-existing changes have been separately approved for the same commit.

### Task 4: Final verification

**Files:**
- Verify: all files listed in the file map

- [ ] **Step 1: Run the full frontend quality gate**

```powershell
pnpm --dir apps/web run test:topic-deepening
node apps/web/scripts/test-topic-reading-mobile-layout.mjs
python scripts/test_topic_context_reading_ai.py
python scripts/test_reading_study_modal.py
pnpm --dir apps/web exec tsc --noEmit
pnpm --dir apps/web run lint
```

Expected: all commands exit 0. If lint reports pre-existing errors outside the touched files, record their exact paths and keep the focused tests plus TypeScript result separate from that existing debt.

- [ ] **Step 2: Verify acceptance criteria against the source and UI structure**

Confirm all of the following in the final diff:

- no answer `textarea` renders `deepeningAnswer`;
- the Markdown string remains unchanged in state and clipboard copying;
- the main pane branches on `showDeepening`;
- `Voltar à aula` only changes the view and does not clear the answer;
- switching reading steps still clears the temporary deepening state;
- the rendered content uses `em`-based sizes under the existing `fontPx` main pane;
- no AI content is passed to `dangerouslySetInnerHTML`;
- mobile header and footer compaction edits already in the worktree remain intact.

- [ ] **Step 3: Record final status**

Run:

```powershell
git status --short
git log -3 --oneline
```

Expected: new isolated feature files are committed; only known pre-existing/shared-file changes remain uncommitted.
