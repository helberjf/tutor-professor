import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const curriculum = readFileSync(new URL('../src/components/coding/CodingCurriculum.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');

assert.match(curriculum, /const SUBJECTS_PER_PAGE = 10/, 'the curriculum fixes the page size at 10');
assert.match(curriculum, /api\.getCodingSubjectPage/, 'the curriculum requests paged subjects');
assert.doesNotMatch(curriculum, /api\.getCodingSubjects\(\)/, 'the curriculum no longer downloads every subject');
assert.match(curriculum, /Último uso \(padrão\)/, 'last-used ordering is explicit and the default');
assert.match(
  curriculum,
  /useState<CodingSubjectSort>\('last_used'\)/,
  'every fresh visit starts with last-used ordering',
);
assert.match(
  curriculum,
  /loadSubjects\(1, 'last_used', true\)/,
  'the initial page request always asks for last-used ordering',
);
assert.match(curriculum, /Data de criação/, 'creation-date ordering is available');
assert.match(curriculum, /Ordem alfabética/, 'alphabetical ordering is available');
assert.match(curriculum, /Relevância/, 'relevance ordering is available');
assert.match(curriculum, /Definir relevância/, 'cards expose an accessible relevance control');
assert.match(curriculum, /Array\.from\(\{ length: 5 \}/, 'relevance has five levels');
assert.match(curriculum, /SubjectCardSkeleton/, 'initial and page loading use card skeletons');
assert.match(curriculum, /Página \{subjectPage\.page\} de \{subjectPage\.total_pages\}/, 'the lazy paginator reports its position');
assert.match(curriculum, /api\.markCodingSubjectUsed/, 'opening a subject records last use');
assert.match(
  curriculum,
  /session\.total_due[\s\S]*api\.markCodingSubjectUsed\(subject\.id\)[\s\S]*setView\(\{ type: 'review'/,
  'starting a review also records last use',
);

assert.match(api, /ProgrammingSubjectPage/, 'the API client types the paginated response');
assert.match(api, /\/api\/coding\/subjects\/page/, 'the API client uses the page endpoint');
assert.match(api, /markCodingSubjectUsed/, 'the API client exposes last-use tracking');

console.log('coding subject pagination UI checks passed');
