import { test, expect, signIn } from '../fixtures/test';

test('cria objetivo pela tela e confirma persistência após recarregar', async ({ page, account, api }) => {
  await signIn(page, account);
  await page.goto('/objectives');
  await page.getByRole('button', { name: 'Novo objetivo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo objetivo' });
  await expect(dialog.getByRole('button', { name: 'Criar objetivo' })).toBeDisabled();
  await dialog.getByLabel('Título do objetivo').fill('Aprender saudações E2E');
  await dialog.getByRole('button', { name: 'Criar objetivo' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Aprender saudações E2E', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Aprender saudações E2E', { exact: true })).toBeVisible();
  const objectives = await (await api.get('/api/objectives')).json();
  expect(objectives).toHaveLength(1);
  expect(objectives[0].title).toBe('Aprender saudações E2E');
});

test('API valida título e permite excluir somente dados criados pelo próprio teste', async ({ api }) => {
  expect((await api.post('/api/objectives', { data: { title: '' } })).status()).toBe(422);
  const created = await api.post('/api/objectives', { data: { title: 'Descartável E2E' } });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  expect((await api.delete(`/api/objectives/${id}`)).status()).toBe(204);
  expect(await (await api.get('/api/objectives')).json()).toEqual([]);
});

test('progresso respeita pesos das tarefas e mantém a conclusão manual', async ({ api }) => {
  const created = await api.post('/api/objectives', { data: { title: 'Progresso E2E', items: [
    { title: 'Leitura', weight: 1 }, { title: 'Prática', weight: 3 },
  ] } });
  expect(created.status()).toBe(201);
  const objective = await created.json();
  const updated = await api.put(`/api/objectives/items/${objective.items[1].id}`, { data: { done: true } });
  expect(updated.ok()).toBeTruthy();
  const body = await updated.json();
  expect(body.progress_percent).toBe(75);
  expect(body.items[1].done).toBe(true);
  expect(body.items[1].auto_completed).toBe(false);
});
