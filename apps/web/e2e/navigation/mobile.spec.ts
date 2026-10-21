import { test, expect, signIn } from '../fixtures/test';

for (const path of ['/login', '/study', '/objectives', '/study-log']) {
  test(`mobile: ${path} mantém conteúdo e ações dentro da viewport`, async ({ page, account }) => {
    if (path !== '/login') await signIn(page, account);
    await page.goto(path);
    const expected = path === '/login' ? 'Entrar na sua conta' : path === '/study' ? '3 frases por dia' : path === '/objectives' ? 'Objetivos' : 'Controle de estudos';
    await expect(page.getByRole('heading', { name: expected, exact: true })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  });
}
