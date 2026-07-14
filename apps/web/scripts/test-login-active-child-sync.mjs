import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const userLoginStart = source.indexOf('userLogin: async');
assert.notEqual(userLoginStart, -1, 'userLogin implementation should exist');

const userLoginEnd = source.indexOf('getUserMe:', userLoginStart);
assert.notEqual(userLoginEnd, -1, 'userLogin block should end before getUserMe');

const userLoginBlock = source.slice(userLoginStart, userLoginEnd);
const tokenIndex = userLoginBlock.indexOf('setSessionToken(result.token)');
const clearIndex = userLoginBlock.indexOf('clearActiveChildId()');
const syncIndex = userLoginBlock.indexOf('await syncPreferredChild(apiBaseUrl)');

assert.notEqual(tokenIndex, -1, 'login should persist the session token first');
assert.notEqual(clearIndex, -1, 'login should clear any stale active child from another session');
assert.notEqual(syncIndex, -1, 'login should sync the preferred active child before navigation');
assert.ok(tokenIndex < clearIndex, 'token must be available before clearing and syncing the child');
assert.ok(clearIndex < syncIndex, 'stale active child must be cleared before preferred child sync');

console.log('login active child sync checks passed.');
