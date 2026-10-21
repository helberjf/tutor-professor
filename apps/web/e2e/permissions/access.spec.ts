import { test, expect, signIn, API_URL } from '../fixtures/test';

for (const path of ['/account', '/objectives', '/study', '/admin/accounts']) {
  test(`visitante deve entrar antes de acessar ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('heading', { name: 'Entrar na sua conta' })).toBeVisible();
  });
}

test('conta comum recebe bloqueio na tela e 403 na API administrativa', async ({ page, account, api }) => {
  await signIn(page, account);
  await page.goto('/admin/accounts');
  await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
  expect((await api.get('/api/admin/users')).status()).toBe(403);
});

for (const status of ['pending', 'rejected'] as const) {
  test(`conta ${status} não passa pelo gate de estudos`, async ({ page, createAccount }) => {
    await signIn(page, await createAccount({ status }));
    await page.goto('/study');
    await expect(page.getByRole('heading', { name: status === 'pending' ? 'Aguardando aprovação' : 'Seu acesso foi recusado' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '3 frases por dia' })).toHaveCount(0);
  });
}

test('aprovação libera a conta, rejeição revoga sua sessão', async ({ page, createAccount, adminApi, request }) => {
  const account = await createAccount({ status: 'pending' });
  await signIn(page, account);
  await page.goto('/objectives');
  await expect(page.getByRole('heading', { name: 'Aguardando aprovação' })).toBeVisible();
  expect((await adminApi.post(`/api/admin/users/${account.id}/approve`, { data: {} })).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Verificar de novo' }).click();
  await expect(page.getByRole('heading', { name: 'Objetivos', exact: true })).toBeVisible();
  expect((await adminApi.post(`/api/admin/users/${account.id}/reject`, { data: {} })).ok()).toBeTruthy();
  const stale = await request.get(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${account.token}` } });
  expect(stale.status()).toBe(401);
  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('outra conta não lê nem altera um objetivo por ID ou X-Child-ID', async ({ api, createAccount, request }) => {
  const created = await api.post('/api/objectives', { data: { title: 'Objetivo privado E2E' } });
  expect(created.status()).toBe(201);
  const objective = await created.json();
  const other = await createAccount();
  const headers = { Authorization: `Bearer ${other.token}` };
  const changed = await request.put(`${API_URL}/api/objectives/${objective.id}`, { headers, data: { title: 'Invasão' } });
  expect(changed.status()).toBe(404);
  const forged = await request.get(`${API_URL}/api/objectives`, { headers: { ...headers, 'X-Child-ID': String(objective.child_id) } });
  // get_requested_child intentionally hides another tenant's student with 404.
  expect(forged.status()).toBe(404);
  expect((await (await api.get('/api/objectives')).json())[0].title).toBe('Objetivo privado E2E');
});
