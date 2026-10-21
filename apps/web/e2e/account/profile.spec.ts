import { test, expect, signIn } from '../fixtures/test';

test('alteração de nome do estudante persiste pela API e pela tela', async ({ page, account, api }) => {
  expect((await api.post('/api/parent/settings', { data: { child_name: 'Estudante Renomeado E2E', auto_audio: false } })).ok()).toBeTruthy();
  await signIn(page, account);
  await page.goto('/account');
  await expect(page.getByRole('textbox', { name: 'Nome do estudante', exact: true })).toHaveValue('Estudante Renomeado E2E');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Nome do estudante', exact: true })).toHaveValue('Estudante Renomeado E2E');
});
