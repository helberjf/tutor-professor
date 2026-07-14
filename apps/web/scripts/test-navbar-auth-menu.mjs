import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/navbar.tsx', import.meta.url), 'utf8');

assert.match(navbar, /import \{ usePathname, useRouter \} from 'next\/navigation';/);
assert.match(navbar, /LogOut/);
assert.match(navbar, /type AuthStatus = 'checking' \| 'authenticated' \| 'unauthenticated';/);
assert.match(navbar, /api\.getUserMe\(\)/);
assert.match(navbar, /setAuthStatus\('authenticated'\)/);
assert.match(navbar, /setAuthStatus\('unauthenticated'\)/);
assert.match(navbar, /async function handleLogout\(\)/);
assert.match(navbar, /await api\.userLogout\(\)/);
assert.match(navbar, /router\.replace\('\/login'\)/);
assert.match(navbar, /authStatus === 'authenticated'/);
assert.match(navbar, /Sair/);
assert.match(navbar, /authStatus === 'unauthenticated'/);
assert.match(navbar, /authLinks\.map/);

console.log('navbar auth menu checks passed.');
