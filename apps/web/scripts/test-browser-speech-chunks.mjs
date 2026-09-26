import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Normalise line endings: a Windows checkout has CRLF, CI has LF.
const source = (await readFile(new URL('../src/lib/browser-speech.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

// Stopping the audio cancels the engine; that must not show the
// "could not play" error.
assert.match(source, /event\.error === 'interrupted' \|\| event\.error === 'canceled' \? 'stopped' : 'failed'/);

// Run the pure splitter as JS: strip its TypeScript annotations.
const splitterSource = source
  .match(/const MAX_CHUNK_LENGTH[^\n]*\n/)[0]
  + source.match(/export function splitSpeechIntoChunks[\s\S]*?\n}\n/)[0]
    .replace('export ', '')
    .replace('(text: string): string[]', '(text)')
    .replace('const chunks: string[] = []', 'const chunks = []');
const splitSpeechIntoChunks = new Function(`${splitterSource}; return splitSpeechIntoChunks;`)();

const paragraph = 'No exame DVA-C02, é crucial entender que funções Lambda executadas dentro de uma VPC não possuem acesso automático à internet pública. '
  + 'Você precisa configurar NAT Gateways ou VPC Endpoints para acessar serviços AWS ou APIs externas. '
  + 'O foco da prova está no uso de Security Groups, Subnets e o impacto na latência de Cold Start.';
const chunks = splitSpeechIntoChunks(`Parte 1: Resumo.  ${paragraph}`);
assert.ok(chunks.length > 1, 'a long paragraph must be read in several chunks');
assert.ok(chunks.every((chunk) => chunk.length <= 220), 'no chunk may exceed the Chrome-safe length');
assert.equal(chunks.join(' '), `Parte 1: Resumo. ${paragraph}`, 'chunking must not lose or reorder text');
assert.deepEqual(splitSpeechIntoChunks('Use Node.js 20.'), ['Use Node.js 20.']);
assert.deepEqual(splitSpeechIntoChunks('   '), []);

console.log('browser speech chunk checks passed');
