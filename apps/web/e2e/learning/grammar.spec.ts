import { test, expect, signIn } from '../fixtures/test';

test('atalho abre gramática diretamente; resposta e explicação persistem na API real', async ({ page, createAccount, request }) => {
  const account = await createAccount({ seed_grammar: true });
  await signIn(page, account);
  await page.goto('/dashboard');
  await page.getByRole('link', { name: /^Gramática/ }).click();
  await expect(page).toHaveURL(/\/grammar$/);
  await expect(page.getByRole('heading', { name: 'Gramática', exact: true })).toBeInViewport();
  await expect(page.getByRole('combobox', { name: 'Lição', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Praticar o que falta (2)' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Complete: I ___ a student.', { exact: true })).toBeVisible();
  const saved = page.waitForResponse(response => response.url().includes('/attempt') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'am', exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(dialog.getByText(/O sujeito I usa am/)).toBeVisible();
  await expect(dialog.getByText('Complete: I ___ a student.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Próxima questão' }).click();
  await expect(dialog.getByText('Complete: She ___ apples.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar questões' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Praticar o que falta (2)' })).toBeEnabled();
  const query = new URLSearchParams({ area: 'english', subject_name: 'Inglês - Gramática', topic_key: 'grammar:1' });
  const response = await request.get(`http://127.0.0.1:8100/api/study/questions?${query}`, {
    headers: { Authorization: `Bearer ${account.token}`, 'X-Child-ID': String(account.child_id) },
  });
  expect(response.ok()).toBeTruthy();
  const questions = await response.json();
  expect(questions[0].attempt_count).toBe(1);
  expect(questions[0].correct_count).toBe(1);
});

test('link antigo preserva aba e gramática depois do login', async ({ page, account }) => {
  await page.goto('/study?tab=english#english-grammar');
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/study?tab=english#english-grammar');
  await page.getByLabel('E-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/study\?tab=english#english-grammar$/);
  await expect(page.getByRole('heading', { name: 'Modo gramática' })).toBeVisible();
});

test('gramática sem lições orienta a abrir a página de lições', async ({ page, account }) => {
  await signIn(page, account);
  await page.route('**/api/lessons', route => route.fulfill({ json: [] }));
  await page.goto('/grammar');
  await expect(page.getByText(/Nenhuma lição de inglês ainda/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir página de lições' })).toHaveAttribute('href', '/lesson');
});

test('gramática recupera o carregamento de lições sem sair da página', async ({ page, account }) => {
  await signIn(page, account);
  let fail = true;
  await page.route('**/api/lessons', route => fail
    ? route.fulfill({ status: 400, json: { detail: 'Falha sintética de leitura' } })
    : route.continue());
  await page.goto('/grammar');
  await expect(page.locator('#english-grammar').getByRole('alert')).toContainText('Não foi possível carregar');
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('combobox', { name: 'Lição', exact: true })).toHaveValue('1');
});
