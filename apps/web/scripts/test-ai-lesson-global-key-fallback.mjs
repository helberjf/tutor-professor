import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const apiMain = readFileSync(new URL('../../../apps/api/main.py', import.meta.url), 'utf8');

const endpointStart = apiMain.indexOf('def generate_parent_lesson(');
assert.notEqual(endpointStart, -1, 'generate_parent_lesson endpoint should exist');

const endpointEnd = apiMain.indexOf('# ═', endpointStart);
assert.notEqual(endpointEnd, -1, 'generate_parent_lesson endpoint block should be bounded by next section');

const endpoint = apiMain.slice(endpointStart, endpointEnd);

assert.doesNotMatch(
  endpoint,
  /if session_record\.user_id is not None and ai_config is None:/,
  'new user accounts should be allowed to use the server-wide AI key when no personal key is saved',
);

assert.match(
  endpoint,
  /if not phrase_generation_service\.is_configured\(ai_config\):/,
  'the endpoint should still reject generation when neither user nor server AI key is configured',
);

console.log('AI lesson global key fallback checks passed.');
