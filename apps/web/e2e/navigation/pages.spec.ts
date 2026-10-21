import { readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { test, expect, signIn } from '../fixtures/test';
import { routes } from '../support/routes';

test('o inventário contém todas as páginas do App Router', async () => {
  const root = resolve(__dirname, '../../src/app');
  const files = readdirSync(root, { recursive: true, withFileTypes: true });
  const paths = files.filter(file => file.isFile() && file.name === 'page.tsx').map(file => {
    const directory = file.parentPath;
    return '/' + relative(root, directory).split(sep).join('/');
  });
  expect(routes.map(route => route.path).sort()).toEqual(paths.sort());
});

for (const route of routes) {
  test(`página ${route.path} — ${route.access}`, async ({ page, createAccount, adminAccount }, testInfo) => {
    if (route.access !== 'public') {
      const account = route.access === 'admin' ? adminAccount : await createAccount({ onboarding_completed: route.path !== '/onboarding' });
      await signIn(page, account);
    }
    const response = await page.goto(route.path);
    expect(response?.ok(), `documento ${route.path}`).toBeTruthy();
    if (route.destination) await expect(page).toHaveURL(new RegExp(route.destination.replace(/[?]/g, '\\?') + '$'));
    if (route.heading) await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
    if (route.kind === 'session') {
      await expect(page.getByRole('progressbar', { name: 'Progresso da sessão' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ver o significado', exact: true })).toBeVisible();
    }
    if (route.kind === 'quiz') {
      await expect(page.getByText('Preparando o quiz', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Bom dia|Obrigado|Até mais|Good morning|Thank you|See you later/ }).first()).toBeVisible();
    }
    if (route.kind === 'activity') await expect(page.getByLabel('Escolher o dia')).toBeVisible();
    await testInfo.attach('page-visit', { body: JSON.stringify({ path: route.path, access: route.access, finalUrl: page.url(), result: 'expected-state-visible' }), contentType: 'application/json' });
  });
}
