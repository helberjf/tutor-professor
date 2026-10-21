import { test, expect, signIn, API_URL } from '../fixtures/test';

// Source: LoginForm, UserRegisterSchema and the real authentication routes.
test('login pela tela respeita o destino solicitado e mantém a sessão ao recarregar', async ({ page, account }) => {
  await page.goto('/login?next=%2Fobjectives');
  await page.getByLabel('E-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/objectives$/);
  await expect(page.getByRole('heading', { name: 'Objetivos', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Objetivos', exact: true })).toBeVisible();
});

test('senha incorreta mostra erro sem abrir uma área privada', async ({ page, account }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill('E2e!Incorrect123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('E-mail ou senha incorretos.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('sessão revogada impede acesso após recarregar', async ({ page, account, api }) => {
  await signIn(page, account);
  await page.goto('/objectives');
  await expect(page.getByRole('heading', { name: 'Objetivos', exact: true })).toBeVisible();
  expect((await api.post('/api/account/sessions/revoke')).ok()).toBeTruthy();
  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('API rejeita senha fraca, CPF inválido e cadastro duplicado', async ({ request, account }) => {
  const payload = { first_name: 'Pessoa', last_name: 'E2E', email: account.email, is_foreign: true, password: account.password };
  expect((await request.post(`${API_URL}/api/auth/register`, { data: { ...payload, password: 'abcdefgh' } })).status()).toBe(422);
  expect((await request.post(`${API_URL}/api/auth/register`, { data: { ...payload, is_foreign: false, cpf: '11111111111' } })).status()).toBe(422);
  expect((await request.post(`${API_URL}/api/auth/register`, { data: payload })).status()).toBe(409);
});

test('formulário de cadastro valida CPF e confirmação de senha ao preencher', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('textbox', { name: 'CPF', exact: true }).fill('11111111111');
  await expect(page.getByText(/CPF inválido/)).toBeVisible();
  await page.getByLabel(/^Senha/).fill('E2e!Synthetic123');
  await page.getByLabel(/^Confirmar senha/).fill('Different!123');
  await expect(page.getByText(/senhas não coincidem/i)).toBeVisible();
});

test('token de recuperação inválido é recusado pela API real', async ({ request }) => {
  const response = await request.post(`${API_URL}/api/auth/password/reset`, {
    data: { token: 'synthetic-invalid-token', password: 'E2e!Synthetic123' },
  });
  expect(response.status()).toBe(400);
});
