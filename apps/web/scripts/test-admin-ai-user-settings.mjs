import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const apiMain = readFileSync(new URL('../../../apps/api/main.py', import.meta.url), 'utf8');
const apiTypes = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const adminPage = readFileSync(new URL('../src/app/admin/learn/page.tsx', import.meta.url), 'utf8');

assert.match(apiMain, /@app\.get\("\/api\/admin\/users"\)/);
assert.match(apiMain, /@app\.put\("\/api\/admin\/users\/\{user_id\}\/ai-settings"/);
assert.match(apiMain, /def admin_list_users\(/);
assert.match(apiMain, /def admin_save_user_ai_settings\(/);

const listUsersStart = apiMain.indexOf('def admin_list_users(');
const saveSettingsStart = apiMain.indexOf('def admin_save_user_ai_settings(');
assert.notEqual(listUsersStart, -1);
assert.notEqual(saveSettingsStart, -1);

const listUsersBlock = apiMain.slice(listUsersStart, saveSettingsStart);
const saveSettingsBlock = apiMain.slice(saveSettingsStart, apiMain.indexOf('@app.get("/api/admin/learn/modules")', saveSettingsStart));

assert.match(listUsersBlock, /_require_admin\(request, session\)/);
assert.match(saveSettingsBlock, /_require_admin\(request, session\)/);
assert.match(saveSettingsBlock, /save_ai_settings_for_user\(\s*user_id=user_id,/);
assert.doesNotMatch(listUsersBlock, /api_key_encrypted["']?\s*:/);
assert.doesNotMatch(listUsersBlock, /decrypt_api_key/);

assert.match(apiTypes, /export interface AdminUser/);
assert.match(apiTypes, /adminListUsers: \(\) => fetchAPI<AdminUser\[\]>\('\/api\/admin\/users'\)/);
assert.match(apiTypes, /adminSaveUserAISettings: \(userId: number, payload: UserAISettingsPayload\) =>/);
assert.match(adminPage, /type Tab = 'modules' \| 'flashcards' \| 'users' \| 'editor'/);
assert.match(adminPage, /function UsersTab\(\)/);
assert.match(adminPage, /api\.adminListUsers\(\)/);
assert.match(adminPage, /api\.adminSaveUserAISettings/);
assert.match(adminPage, /placeholder="Cole a nova chave"/);
assert.doesNotMatch(adminPage, /value=\{user\.ai_settings\.api_key/);

console.log('admin AI user settings checks passed.');
