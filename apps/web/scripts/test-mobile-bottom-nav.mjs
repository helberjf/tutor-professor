import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/bottom-nav.tsx', import.meta.url), 'utf8');

assert.match(source, /href: '\/lesson'[^\n]*label: 'Hoje'/, 'mobile nav should expose the current-day lesson first');
assert.match(source, /href: '\/study'[^\n]*label: 'Estudar'/, 'mobile nav should expose the study hub');
assert.match(source, /href: '\/quiz'[^\n]*label: 'Questões'/, 'mobile nav should expose questions directly');
assert.match(source, /href: '\/review'[^\n]*label: 'Revisão'/, 'mobile nav should expose review directly');
assert.match(source, /href: '\/exams'[^\n]*label: 'Simulado'/, 'mobile nav should expose exams directly');
assert.doesNotMatch(source, /href: '\/chat'/, 'secondary chat should stay in the hamburger menu on mobile');
assert.match(source, /min-h-\[4rem\]/, 'mobile nav targets should be at least 64px high');
assert.match(source, /touch-manipulation/, 'mobile nav links should avoid the 300ms touch delay');
assert.match(source, /env\(safe-area-inset-bottom\)/, 'mobile nav must respect the iPhone safe area');

console.log('mobile bottom navigation checks passed.');
