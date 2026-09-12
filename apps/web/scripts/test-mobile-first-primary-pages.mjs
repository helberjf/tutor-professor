import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = {
  home: '../src/app/page.tsx',
  login: '../src/app/login/page.tsx',
  register: '../src/app/register/page.tsx',
  connect: '../src/app/connect/page.tsx',
  dashboard: '../src/app/dashboard/page.tsx',
  account: '../src/app/account/page.tsx',
  lesson: '../src/app/lesson/page.tsx',
  books: '../src/app/books/page.tsx',
};

const source = Object.fromEntries(
  Object.entries(files).map(([name, path]) => [
    name,
    readFileSync(new URL(path, import.meta.url), 'utf8'),
  ]),
);

assert.match(source.home, /text-\[1\.7rem\][^"]*font-semibold leading-tight[^"]*sm:text-4xl/);
assert.match(source.home, /grid grid-cols-1 gap-2\.5[^"]*sm:grid-cols-2[^"]*lg:grid-cols-3/);
assert.match(source.login, /px-3 py-5 sm:px-4 sm:py-6/);
assert.match(source.register, /grid gap-3 sm:grid-cols-2/);
assert.match(source.register, /grid grid-cols-2 gap-2 sm:grid-cols-3/);
assert.match(source.connect, /mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between/);
assert.match(source.dashboard, /px-3 py-5 sm:px-4 sm:py-6 md:px-8 md:py-10/);
assert.match(source.account, /grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6/);
assert.match(source.account, /relative inline-flex w-full items-center justify-center/);
assert.match(source.lesson, /grid w-full grid-cols-1 gap-3 sm:grid-cols-2/);
assert.match(source.lesson, /relative inline-flex w-full items-center justify-center/);
assert.match(source.books, /mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between/);
assert.match(source.books, /mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between/);

console.log('mobile-first primary page checks passed.');
