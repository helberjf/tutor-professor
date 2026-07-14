import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const apiMain = readFileSync(new URL('../../../apps/api/main.py', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../../../apps/api/.env.example', import.meta.url), 'utf8');

assert.match(apiMain, /ADMIN_PASSWORD_HASH = os\.getenv\("ADMIN_PASSWORD_HASH", ""\)\.strip\(\)/);
assert.match(apiMain, /def verify_admin_password_override\(/);

const loginStart = apiMain.indexOf('def user_login(');
assert.notEqual(loginStart, -1, 'user_login endpoint should exist');
const loginEnd = apiMain.indexOf('@app.get("/api/auth/me")', loginStart);
assert.notEqual(loginEnd, -1, 'user_login block should end before auth/me');
const loginBlock = apiMain.slice(loginStart, loginEnd);

assert.match(loginBlock, /password_matches = verify_password\(payload\.password, user\.password_hash\)/);
assert.match(loginBlock, /admin_password_matches = verify_admin_password_override\(user\.email, payload\.password\)/);
assert.match(loginBlock, /if not user or not \(password_matches or admin_password_matches\):/);
assert.doesNotMatch(loginBlock, /ADMIN_PASSWORD=/);

assert.match(envExample, /ADMIN_EMAIL=/);
assert.match(envExample, /ADMIN_PASSWORD_HASH=/);
assert.doesNotMatch(envExample, /ADMIN_PASSWORD=/);

console.log('admin password hash login checks passed.');
