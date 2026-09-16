import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const layout = readFileSync(resolve(repoRoot, 'apps/web/src/app/layout.tsx'), 'utf8');

assert.match(
  layout,
  /metadataBase:\s*new URL\(['"]https:\/\/tutorprofessor\.vercel\.app['"]\)/,
  'o layout precisa declarar a URL pública usada nos metadados absolutos',
);
assert.match(layout, /openGraph:\s*\{[\s\S]*?title:/, 'o Open Graph precisa ter título');
assert.match(layout, /openGraph:\s*\{[\s\S]*?description:/, 'o Open Graph precisa ter descrição');
assert.match(
  layout,
  /openGraph:\s*\{[\s\S]*?url:\s*['"]https:\/\/tutorprofessor\.vercel\.app['"]/,
  'o Open Graph precisa ter a URL pública absoluta',
);
assert.match(
  layout,
  /openGraph:\s*\{[\s\S]*?images:\s*\[[\s\S]*?url:\s*['"]\/icons\/icon-512\.png['"]/,
  'o Open Graph precisa apontar para a imagem pública do preview',
);
assert.match(layout, /twitter:\s*\{[\s\S]*?images:/, 'o Twitter Card também precisa receber a imagem');

const imagePath = resolve(repoRoot, 'apps/web/public/icons/icon-512.png');
assert.ok(existsSync(imagePath), 'a imagem usada pelo WhatsApp precisa existir no diretório público');

console.log('social metadata checks passed');
