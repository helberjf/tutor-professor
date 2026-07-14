import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const booksPage = readFileSync(new URL('../src/app/books/page.tsx', import.meta.url), 'utf8');
const schemas = readFileSync(new URL('../../../apps/api/schemas/schemas.py', import.meta.url), 'utf8');
const apiMain = readFileSync(new URL('../../../apps/api/main.py', import.meta.url), 'utf8');

assert.match(booksPage, /const \[bookContext, setBookContext\] = useState\(''\)/);
assert.match(booksPage, /if \(!bookContext\.trim\(\)\)/);
assert.match(booksPage, /type="range" min=\{1\} max=\{5\} value=\{numPages\}/);
assert.match(booksPage, /theme: bookContext\.trim\(\)/);

assert.match(schemas, /num_pages: int = Field\(default=5, ge=1, le=5\)/);
assert.match(schemas, /theme: str = Field\(min_length=1, max_length=300\)/);
assert.match(schemas, /page_number: int = Field\(ge=1, le=5\)/);
assert.match(schemas, /context_pages: list\[GeneratedBookPageDraftSchema\] = Field\(default_factory=list, max_length=5\)/);

assert.match(apiMain, /if payload\.page_number > book\.num_pages:/);
assert.match(apiMain, /if len\(existing_pages\) >= book\.num_pages:/);

console.log('book generation rule checks passed.');
