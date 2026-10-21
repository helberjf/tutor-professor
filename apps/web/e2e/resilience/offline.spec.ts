import { test, expect, signIn } from '../fixtures/test';

test.describe('API desconectada', () => {
test.use({ allowedRequestFailures: ['/api/auth/me'] });
test('falha de conexão na API mostra estado offline em área privada', async ({ page, account, context }) => {
  await signIn(page, account);
  await context.route('**/api/auth/me', route => route.abort('connectionrefused'));
  await page.goto('/objectives');
  await expect(page.getByRole('heading', { name: 'Servidor offline' })).toBeVisible();
});
});

test.describe('falha controlada da API', () => {
  test.use({ allowedServerErrors: [503] });
  test('objetivos exibe erro e recupera ao recarregar a API restabelecida', async ({ page, account, context }) => {
    await signIn(page, account);
    await context.route('**/api/objectives', route => route.fulfill({ status: 503, json: { detail: 'Falha sintética E2E' } }));
    await page.goto('/objectives');
    await expect(page.getByText(/Falha sintética E2E/)).toBeVisible();
    await context.unroute('**/api/objectives');
    await page.reload();
    await expect(page.getByText('Falha sintética E2E')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Novo objetivo', exact: true })).toBeVisible();
  });
});
