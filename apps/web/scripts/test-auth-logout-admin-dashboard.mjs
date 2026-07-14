import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const webSrc = new URL('../src/', import.meta.url);

function read(relativePath) {
  return readFileSync(new URL(relativePath, webSrc), 'utf8');
}

const parentsPage = read('app/parents/page.tsx');
assert.match(parentsPage, /await api\.userLogout\(\)/, 'parents logout must clear the user session token');
assert.doesNotMatch(parentsPage, /await api\.parentLogout\(\)/, 'parents logout must not use the legacy parent-only logout');
assert.match(parentsPage, /router\.replace\('\/login\?next=\/parents'\)/, 'logout should leave private pages immediately');

const apiMain = readFileSync(new URL('apps/api/main.py', root), 'utf8');
const clearSessionStart = apiMain.indexOf('def clear_parent_session(');
const clearSessionEnd = apiMain.indexOf('\ndef require_parent_session(', clearSessionStart);
assert.notEqual(clearSessionStart, -1, 'clear_parent_session should exist');
assert.notEqual(clearSessionEnd, -1, 'clear_parent_session block should be bounded');
const clearSessionBlock = apiMain.slice(clearSessionStart, clearSessionEnd);
assert.match(
  clearSessionBlock,
  /get_request_user_session\(request=request, session=session\)/,
  'server logout must delete sessions authenticated by Authorization bearer token',
);

const loginPage = read('app/login/page.tsx');
assert.match(loginPage, /api\.adminCheck\(\)/, 'login should detect admin accounts after login');
assert.match(loginPage, /router\.push\(isAdminDefaultLogin \? '\/admin' : next\)/, 'admin default login should go to admin dashboard');

const dashboardPage = read('app/dashboard/page.tsx');
assert.match(dashboardPage, /api\.adminCheck\(\)/, 'regular dashboard should detect admin accounts');
assert.match(dashboardPage, /router\.replace\('\/admin'\)/, 'admin accounts should be sent to the admin dashboard');

const adminDashboardUrl = new URL('app/admin/page.tsx', webSrc);
const adminUsersUrl = new URL('app/admin/users/page.tsx', webSrc);
const adminUsersPanelUrl = new URL('components/admin-users-panel.tsx', webSrc);

assert.equal(existsSync(adminDashboardUrl), true, '/admin dashboard page should exist');
assert.equal(existsSync(adminUsersUrl), true, '/admin/users page should exist');
assert.equal(existsSync(adminUsersPanelUrl), true, 'admin users panel should be reusable');

const adminDashboard = read('app/admin/page.tsx');
assert.match(adminDashboard, /api\.adminCheck\(\)/);
assert.match(adminDashboard, /href:\s*'\/admin\/users'/);
assert.match(adminDashboard, /Dashboard administrativo/);

const adminUsersPage = read('app/admin/users/page.tsx');
assert.match(adminUsersPage, /AdminUsersPanel/);
assert.match(adminUsersPage, /api\.adminCheck\(\)/);

const adminUsersPanel = read('components/admin-users-panel.tsx');
assert.match(adminUsersPanel, /api\.adminListUsers\(\)/);
assert.match(adminUsersPanel, /api\.adminSaveUserAISettings/);
assert.match(adminUsersPanel, /Autorizar IA/);

console.log('auth logout and admin dashboard checks passed.');
