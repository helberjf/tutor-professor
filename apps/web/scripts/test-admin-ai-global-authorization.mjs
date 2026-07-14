import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const apiMain = readFileSync(new URL('../../../apps/api/main.py', import.meta.url), 'utf8');
const models = readFileSync(new URL('../../../apps/api/models/database.py', import.meta.url), 'utf8');
const schemas = readFileSync(new URL('../../../apps/api/schemas/schemas.py', import.meta.url), 'utf8');
const apiClient = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const adminPage = readFileSync(new URL('../src/app/admin/learn/page.tsx', import.meta.url), 'utf8');

assert.match(models, /use_global_key: bool = Field\(default=False\)/);
assert.match(schemas, /use_global_key: bool = False/);
assert.match(schemas, /use_global_key: Optional\[bool\] = None/);

assert.match(apiMain, /ALTER TABLE useraisettings ADD COLUMN IF NOT EXISTS use_global_key BOOLEAN NOT NULL DEFAULT FALSE/);
assert.match(apiMain, /def _get_global_ai_config\(record: UserAISettings \| None = None\) -> AIProviderConfig \| None:/);
assert.match(apiMain, /api_key = \(os\.getenv\("GEMINI_API_KEY"\) or phrase_generation_service\.api_key or ""\)\.strip\(\)/);
assert.match(apiMain, /if record\.use_global_key:\s+return _get_global_ai_config\(record\)/s);
assert.match(apiMain, /use_global_key = bool\(payload\.use_global_key\)/);
assert.match(apiMain, /if not api_key and not use_global_key:/);
assert.doesNotMatch(apiMain, /__GLOBAL_SERVER_AI_KEY__/);
assert.match(apiMain, /api_key_encrypted=encrypt_api_key\(api_key\) if api_key else ""/);
assert.match(apiMain, /if use_global_key:\s+record\.api_key_encrypted = ""/s);
assert.match(apiMain, /record\.use_global_key = use_global_key/);

assert.match(apiClient, /use_global_key: boolean;/);
assert.match(apiClient, /use_global_key\?: boolean;/);
assert.match(adminPage, /Autorizar IA/);
assert.match(adminPage, /usar a chave global do servidor/);
assert.match(adminPage, /use_global_key: true/);

console.log('admin global AI authorization checks passed.');
