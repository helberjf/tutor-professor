/**
 * The "Controle de estudos" reads .md, .txt and .docx in the browser, with no
 * library: a .docx is a ZIP, and its word/document.xml is turned into Markdown.
 *
 * The .docx here is built byte by byte, deflated with zlib the way Word does,
 * so the ZIP reader is exercised on a real archive layout rather than a mock.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// The form's limits live in api.ts next to the types; the import module only
// needs the one constant, so it is handed over instead of loading the client.
const apiSource = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const limitsBlock = /export const STUDY_LOG_LIMITS = \{([\s\S]*?)\}/.exec(apiSource);
assert.ok(limitsBlock, 'STUDY_LOG_LIMITS must be exported by src/lib/api.ts');
const STUDY_LOG_LIMITS = Object.fromEntries(
  [...limitsBlock[1].matchAll(/(\w+):\s*([\d_]+)/g)].map(([, key, value]) => [key, Number(value.replace(/_/g, ''))]),
);

function loadStudyLogImport() {
  const source = readFileSync(new URL('../src/lib/study-log-import.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const scopedRequire = (specifier) => {
    if (specifier === '@/lib/api') return { STUDY_LOG_LIMITS };
    return require(specifier);
  };
  new Function('exports', 'module', 'require', compiled)(module.exports, module, scopedRequire);
  return module.exports;
}

const {
  STUDY_FILE_ACCEPT,
  StudyFileError,
  browserInflateRaw,
  docxXmlToMarkdown,
  studyFileKind,
  studyTextFromBytes,
} = loadStudyLogImport();

const zlibInflate = async (data) => new Uint8Array(zlib.inflateRawSync(Buffer.from(data)));

function buildZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data, 'utf8');
    const payload = entry.stored ? data : zlib.deflateRawSync(data);
    const method = entry.stored ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, payload);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(payload.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += 30 + name.length + payload.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, directory, end]));
}

const LIST = '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>';
const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>Controle de constitucionalidade</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Difuso &amp; concentrado </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>são</w:t></w:r><w:r><w:t xml:space="preserve"> dois modelos.</w:t></w:r></w:p>
<w:p>${LIST}<w:r><w:t>Difuso: qualquer juiz</w:t></w:r></w:p>
<w:p>${LIST}<w:r><w:t>Concentrado: STF</w:t></w:r></w:p>
<w:p/>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Exemplo</w:t></w:r></w:p>
<w:p><w:r><w:t>Linha</w:t></w:r><w:r><w:br/><w:t>quebrada &#x2014; fim</w:t></w:r><w:r><w:delText>apagado</w:delText></w:r></w:p>
<w:sectPr/></w:body></w:document>`;

const EXPECTED_MARKDOWN = [
  '# Controle de constitucionalidade',
  '',
  'Difuso & concentrado são dois modelos.',
  '',
  '- Difuso: qualquer juiz',
  '- Concentrado: STF',
  '',
  '## Exemplo',
  '',
  'Linha\nquebrada — fim',
].join('\n');

// ── Word's XML becomes Markdown ───────────────────────────────────────────────
assert.equal(docxXmlToMarkdown(DOCUMENT_XML), EXPECTED_MARKDOWN);

// ── A real .docx, deflated like Word writes it ────────────────────────────────
const docx = buildZip([
  { name: '[Content_Types].xml', data: '<Types/>', stored: true },
  { name: 'word/document.xml', data: DOCUMENT_XML },
]);
const fromDocx = await studyTextFromBytes('aula-3.docx', docx, zlibInflate);
assert.equal(fromDocx.text, EXPECTED_MARKDOWN);
assert.equal(fromDocx.filename, 'aula-3.docx');
assert.equal(fromDocx.truncated, false);

const storedDocx = buildZip([{ name: 'word/document.xml', data: DOCUMENT_XML, stored: true }]);
assert.equal((await studyTextFromBytes('guardado.DOCX', storedDocx, zlibInflate)).text, EXPECTED_MARKDOWN);

await assert.rejects(
  studyTextFromBytes('sem-texto.docx', buildZip([{ name: 'word/styles.xml', data: '<x/>' }]), zlibInflate),
  (error) => error instanceof StudyFileError && /Não encontrei o texto/.test(error.message),
);
await assert.rejects(
  studyTextFromBytes('quebrado.docx', new Uint8Array([1, 2, 3]), zlibInflate),
  (error) => error instanceof StudyFileError,
);

// ── Markdown and plain text pass through ──────────────────────────────────────
const markdown = new TextEncoder().encode('# Resumo\r\n\r\n\r\n\r\nTexto\u0000 colado\r\n');
assert.equal((await studyTextFromBytes('notas.md', markdown)).text, '# Resumo\n\nTexto colado');
assert.equal((await studyTextFromBytes('notas.txt', new TextEncoder().encode('ok'))).text, 'ok');

// ── What cannot be read says so ───────────────────────────────────────────────
await assert.rejects(
  studyTextFromBytes('antigo.doc', new Uint8Array([0xd0, 0xcf])),
  (error) => error instanceof StudyFileError && /\.doc antigos/.test(error.message),
);
await assert.rejects(
  studyTextFromBytes('foto.png', new Uint8Array([1])),
  (error) => error instanceof StudyFileError && /\.md, \.txt ou \.docx/.test(error.message),
);
await assert.rejects(
  studyTextFromBytes('vazio.txt', new TextEncoder().encode('   \n  ')),
  (error) => error instanceof StudyFileError && /não tem texto/.test(error.message),
);

// ── Longer than an entry holds: cut, and said ─────────────────────────────────
const huge = new TextEncoder().encode('a'.repeat(STUDY_LOG_LIMITS.content + 10));
const cut = await studyTextFromBytes('livro.txt', huge);
assert.equal(cut.text.length, STUDY_LOG_LIMITS.content);
assert.equal(cut.truncated, true);

// ── Accepted types and kinds ──────────────────────────────────────────────────
for (const extension of ['.md', '.txt', '.docx']) {
  assert.ok(STUDY_FILE_ACCEPT.split(',').includes(extension), `${extension} is offered by the file picker`);
}
assert.equal(studyFileKind('A.Markdown'), 'text');
assert.equal(studyFileKind('x.pdf'), null);

// ── The browser path, where this Node has it ──────────────────────────────────
if (typeof DecompressionStream !== 'undefined') {
  let supported = true;
  try {
    new DecompressionStream('deflate-raw');
  } catch {
    supported = false;
  }
  if (supported) {
    const viaStream = await studyTextFromBytes('stream.docx', docx, browserInflateRaw);
    assert.equal(viaStream.text, EXPECTED_MARKDOWN, 'DecompressionStream reads what zlib wrote');
  }
}

console.log('study log import: ok');
