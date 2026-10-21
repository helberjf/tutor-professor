import { test, expect, signIn } from '../fixtures/test';

test('registra tempo de estudo sem IA e o mantém após recarregar', async ({ page, account, api }) => {
  await signIn(page, account);
  await page.goto('/study-log');
  await page.getByLabel(/^Disciplina/).fill('Português E2E');
  await page.getByLabel(/Título/).fill('Leitura E2E');
  await page.getByLabel('Tempo (minutos)').fill('25');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/study-log') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar registro' }).click();
  expect((await saved).status()).toBe(201);
  await page.reload();
  await expect(page.getByText('Leitura E2E', { exact: true })).toBeVisible();
  const entries = await (await api.get('/api/study-log')).json();
  expect(entries.some((entry: { title: string; duration_minutes: number }) => entry.title === 'Leitura E2E' && entry.duration_minutes === 25)).toBe(true);
});

test('não salva registro sem conteúdo nem tempo e API rejeita tempo acima do limite', async ({ page, account, api }) => {
  await signIn(page, account);
  await page.goto('/study-log');
  await page.getByLabel(/^Disciplina/).fill('Português E2E');
  await page.getByRole('button', { name: 'Salvar registro' }).click();
  await expect(page.getByText('Cole o que estudou ou informe quanto tempo estudou.', { exact: true })).toBeVisible();
  expect((await api.post('/api/study-log', { data: { discipline: 'Português E2E', duration_minutes: 1441 } })).status()).toBe(422);
  expect(await (await api.get('/api/study-log')).json()).toEqual([]);
});
