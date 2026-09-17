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
  parseDeepeningMarkdown(`# EventBridge

Texto objetivo.

1. Event Bus
2. Rules

\`\`\`json
{"source": ["aws.ec2"]}
\`\`\``),
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

const rendererPath = resolve(scriptDir, '../src/components/coding/DeepeningMarkdown.tsx');
assert.equal(existsSync(rendererPath), true, 'the formatted deepening renderer must exist');
const rendererSource = readFileSync(rendererPath, 'utf8');
assert.match(rendererSource, /parseDeepeningMarkdown\(content\)/);
assert.match(rendererSource, /<SyntaxCodeBlock/);
assert.match(rendererSource, /<strong/);
assert.match(rendererSource, /<em/);
assert.match(rendererSource, /<code/);
assert.doesNotMatch(rendererSource, /dangerouslySetInnerHTML/);

const topicViewPath = resolve(scriptDir, '../src/components/coding/TopicView.tsx');
const topicViewSource = readFileSync(topicViewPath, 'utf8');
assert.match(topicViewSource, /import \{ DeepeningMarkdown \} from '\.\/DeepeningMarkdown';/);
assert.match(topicViewSource, /showDeepening \? \(/, 'the main pane must switch between lesson and deepening');
assert.match(topicViewSource, /Voltar à aula/);
assert.match(topicViewSource, /<DeepeningMarkdown content=\{deepeningAnswer\}/);
assert.match(topicViewSource, /navigator\.clipboard\.writeText\(deepeningAnswer\)/);
assert.doesNotMatch(
  topicViewSource,
  /readOnly[\s\S]{0,100}value=\{deepeningAnswer\}/,
  'the answer must not remain in a small textarea',
);

console.log('topic deepening reader checks passed');
