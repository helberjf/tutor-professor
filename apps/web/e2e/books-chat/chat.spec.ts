import { test, expect, signIn } from '../fixtures/test';

test('chat bloqueia envio vazio e mostra resposta controlada de IA [UI com mock]', async ({ page, account, context }) => {
  await signIn(page, account);
  await context.route('**/api/chat', route => route.fulfill({ json: { response: 'Good morning! Resposta sintética E2E.', audio_url: null } }));
  await page.goto('/chat');
  const send = page.getByRole('button', { name: 'Enviar', exact: true });
  await expect(send).toBeDisabled();
  await page.getByRole('textbox', { name: 'Peça uma frase ou diga oi' }).fill('Oi E2E');
  await send.click();
  await expect(page.getByText('Good morning! Resposta sintética E2E.', { exact: true })).toBeVisible();
  await expect(send).toBeDisabled();
});

test('geração de livro sem chave é recusada e não consome créditos [API real]', async ({ api }) => {
  const before = await (await api.get('/api/ai/credits')).json();
  const response = await api.post('/api/books/generate', { data: { theme: 'Saudações', num_pages: 3, level: 1 } });
  expect(response.status()).toBe(403);
  const after = await (await api.get('/api/ai/credits')).json();
  expect(after.used).toBe(before.used);
  expect(after.credits).toBe(before.credits);
});
