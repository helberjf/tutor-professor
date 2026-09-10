import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperUrl = new URL('../src/lib/manual-study-import.ts', import.meta.url);

let source;
try {
  source = readFileSync(helperUrl, 'utf8');
} catch {
  assert.fail('Expected manual-study-import.ts to exist');
}

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);

const { buildManualStudyPrompt, parseManualStudyImport } = module.exports;

const prompt = buildManualStudyPrompt('Sistema Solar', 8);
assert.match(prompt, /Sistema Solar/);
assert.match(prompt, /8 questões/);
assert.match(prompt, /"materia"/);
assert.match(prompt, /"aulas"/);
assert.match(prompt, /"questoes"/);
assert.match(prompt, /somente o JSON/i);

let subjectIds = 0;
let lessonIds = 0;
let questionIds = 0;
const imported = parseManualStudyImport(
  '```json\n' + JSON.stringify({
    materia: 'Sistema Solar',
    aulas: [
      {
        titulo: 'Planetas rochosos',
        questoes: [
          { pergunta: 'Quais são os planetas rochosos?', resposta: 'Mercúrio, Vênus, Terra e Marte.' },
          { pergunta: 'Qual planeta é o mais próximo do Sol?', resposta: 'Mercúrio.' },
        ],
      },
      {
        titulo: 'Planetas gasosos',
        questoes: [
          { pergunta: 'Quais são os planetas gasosos?', resposta: 'Júpiter, Saturno, Urano e Netuno.' },
        ],
      },
    ],
  }) + '\n```',
  {
    createSubjectId: () => `subject-${++subjectIds}`,
    createLessonId: () => `lesson-${++lessonIds}`,
    createQuestionId: () => `question-${++questionIds}`,
  },
);

assert.equal(imported.name, 'Sistema Solar');
assert.equal(imported.topics.length, 3);
assert.equal(imported.lessons.length, 2);
assert.deepEqual(imported.lessons[0].topic_ids, ['question-1', 'question-2']);
assert.deepEqual(imported.lessons[1].topic_ids, ['question-3']);
assert.equal(imported.topics[0].done, false);
assert.equal(imported.topics[0].answer, 'Mercúrio, Vênus, Terra e Marte.');

const english = parseManualStudyImport(JSON.stringify({
  subject: 'Biology',
  lessons: [{ title: 'Cells', questions: [{ question: 'What is a cell?', answer: 'The basic unit of life.' }] }],
}));
assert.equal(english.name, 'Biology');
assert.equal(english.lessons[0].title, 'Cells');
assert.equal(english.topics[0].topic, 'What is a cell?');

const unicodeQuestions = parseManualStudyImport(JSON.stringify({
  materia: '日本語',
  aulas: [{ titulo: '文字', questoes: [
    { pergunta: '漢字とは何ですか？', resposta: '表意文字です。' },
    { pergunta: 'ひらがなとは何ですか？', resposta: '日本語の音節文字です。' },
  ] }],
}));
assert.equal(unicodeQuestions.topics.length, 2, 'distinct non-Latin questions remain distinct');

assert.throws(
  () => parseManualStudyImport('{not json}'),
  /JSON válido/i,
);
assert.throws(
  () => parseManualStudyImport('x'.repeat(150_001)),
  /150\.000 caracteres/i,
);
assert.throws(
  () => parseManualStudyImport(JSON.stringify({ materia: 'Vazio', aulas: [] })),
  /pelo menos uma aula/i,
);
assert.throws(
  () => parseManualStudyImport(JSON.stringify({
    materia: 'Título longo',
    aulas: [{ titulo: 'A'.repeat(81), questoes: [{ pergunta: 'Pergunta?', resposta: 'Resposta.' }] }],
  })),
  /máximo 80 caracteres/i,
);
assert.throws(
  () => parseManualStudyImport(JSON.stringify({
    materia: 'Duplicada',
    aulas: [{ titulo: 'Uma', questoes: [
      { pergunta: 'O que é energia?', resposta: 'Capacidade de realizar trabalho.' },
      { pergunta: 'O que e energia?', resposta: 'Capacidade de realizar trabalho.' },
    ] }],
  })),
  /repetida/i,
);
assert.throws(
  () => parseManualStudyImport(JSON.stringify({
    materia: 'Grande',
    aulas: [{ titulo: 'Uma', questoes: Array.from({ length: 51 }, (_, index) => ({
      pergunta: `Pergunta ${index + 1}?`,
      resposta: `Resposta ${index + 1}`,
    })) }],
  })),
  /máximo 50/i,
);

console.log('Manual study import checks passed.');
