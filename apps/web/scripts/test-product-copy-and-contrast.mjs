/**
 * Product-level guardrails for the two regressions reported by users:
 * readable action text and correctly accented Portuguese copy on the new
 * session/objectives surfaces.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptsDir, '..');
const sourceRoot = path.join(webRoot, 'src');

function source(relativePath) {
  return readFileSync(path.join(webRoot, relativePath), 'utf8');
}

function collectFiles(directory, result = []) {
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) collectFiles(fullPath, result);
    else if (/\.(?:ts|tsx)$/.test(entry)) result.push(fullPath);
  }
  return result;
}

const keyUiFiles = [
  'src/app/session/page.tsx',
  'src/app/objectives/page.tsx',
  'src/components/objectives/ObjectivesBoard.tsx',
];
const unaccented = /\b(?:nao|voce|sessao|licao|revisao|questao|questoes|inicio|possivel|configuracao|proxima|ingles|conteudo|descricao|titulo)\b/i;
for (const relativePath of keyUiFiles) {
  const content = source(relativePath);
  const visibleLines = content
    .split(/\r?\n/)
    .filter((line) => /['"`>]/.test(line))
    .join('\n');
  assert.doesNotMatch(visibleLines, unaccented, `${relativePath} should use accented Portuguese copy`);
}

const css = source('src/app/globals.css');
assert.match(
  css,
  /button\[class~=['"]text-white['"]\]:disabled/,
  'disabled white-text actions need an explicit readable state',
);

const lowContrastAction = /(?:bg-(?:sky|emerald|amber|rose)-500|bg-primary)(?:[^\n]*\btext-white\b)/;
for (const fullPath of collectFiles(sourceRoot)) {
  const content = readFileSync(fullPath, 'utf8');
  assert.doesNotMatch(
    content,
    lowContrastAction,
    `${path.relative(webRoot, fullPath)} should not pair white text with a light action background`,
  );
}

console.log('product copy and contrast checks passed.');
