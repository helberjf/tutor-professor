import { test, expect, signIn } from '../fixtures/test';

test('chat mantém o assunto e não confunde this com hi [API real]', async ({ page, account }) => {
  await signIn(page, account);
  await page.goto('/chat');
  const input = page.getByRole('textbox', { name: 'Peça uma frase ou diga oi' });
  const send = page.getByRole('button', { name: 'Enviar', exact: true });
  await input.fill('What does this word mean?');
  await send.click();
  await expect(page.getByText(/Você pode dizer qual palavra ou frase/)).toBeVisible();
  await expect(page.getByText(/Tente dizer: Hello/)).toHaveCount(0);
  await input.fill('O que significa Good morning?');
  await send.click();
  await expect(page.getByText('Good morning significa Bom dia. Exemplo: We say Good morning every day.', { exact: true })).toBeVisible();
  await input.fill('Pode dar um exemplo?');
  await send.click();
  await expect(page.getByText('Good morning significa Bom dia. Exemplo: We say Good morning every day.', { exact: true })).toHaveCount(2);
});

test('livro gera uma página por clique e respeita o limite [UI com provedor simulado]', async ({ page, account, context }) => {
  const outline = { title: 'Synthetic book', theme: 'colors', synopsis: 'A short story.', characters: [],
    level: 1, num_pages: 2, target_language: 'English',
    page_outlines: [1, 2].map(page_number => ({ page_number, scene: `Scene ${page_number}`, key_vocabulary: [] })) };
  let calls = 0;
  await context.route('**/api/books/outline', route => route.fulfill({ json: outline }));
  await context.route('**/api/books/start', route => route.fulfill({ status: 201, json: {
    id: 900, title: outline.title, theme: outline.theme, level: 1, num_pages: 2,
    target_language: 'English', created_at: '2026-10-21T12:00:00', pages: [],
  } }));
  await context.route('**/api/books/900/pages', route => {
    calls += 1;
    const data = route.request().postDataJSON();
    expect(data.page_number).toBe(calls);
    return route.fulfill({ status: 201, json: { id: calls, page_number: calls,
      text_en: `Page ${calls}: The cat is blue.`, text_pt: `Página ${calls}: O gato é azul.`, vocabulary: ['cat', 'blue'] } });
  });
  await signIn(page, account);
  await page.goto('/books');
  await page.getByRole('button', { name: 'Novo livro' }).click();
  const count = page.getByRole('slider', { name: 'Número de páginas' });
  await expect(count).toHaveAttribute('max', '5');
  await count.fill('2');
  await page.getByPlaceholder('ex: Um menino que encontra um mapa no quintal e aprende palavras sobre natureza...').fill('A blue cat');
  await page.getByRole('button', { name: 'Criar roteiro com IA' }).click();
  await page.getByRole('button', { name: 'Criar livro', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gerar página 1 de 2' })).toBeVisible();
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Gerar página 1 de 2' }).click();
  await expect(page.getByText('Page 1: The cat is blue.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gerar página 2 de 2' })).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Gerar página 2 de 2' }).click();
  await expect(page.getByRole('button', { name: 'Ler livro', exact: true })).toBeVisible();
  expect(calls).toBe(2);
  await expect(page.getByRole('button', { name: /Gerar página/ })).toHaveCount(0);
});

test('chat bloqueia envio vazio e mostra resposta controlada [UI com mock]', async ({ page, account, context }) => {
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

test('API rejeita livros acima de 5 páginas e contexto excessivo antes de usar IA', async ({ api }) => {
  const before = await (await api.get('/api/ai/credits')).json();
  for (const endpoint of ['generate', 'outline', 'start']) {
    const response = await api.post(`/api/books/${endpoint}`, { data: {
      title: 'Synthetic', theme: 'Colors', level: 1, num_pages: 6,
    } });
    expect(response.status()).toBe(422);
  }
  const response = await api.post('/api/books/999/pages', { data: {
    page_number: 1, outline: { title: 'Synthetic', theme: 'Colors', synopsis: '',
      level: 1, num_pages: 1, page_outlines: [{ page_number: 1, scene: 'A blue cat' }] },
    context_pages: [{ page_number: 1, text_en: 'x'.repeat(10_000), text_pt: 'fake', vocabulary: [] }],
  } });
  expect(response.status()).toBe(422);
  const after = await (await api.get('/api/ai/credits')).json();
  expect(after.used).toBe(before.used);
  expect(after.credits).toBe(before.credits);
});

test('geração de livro sem chave é recusada e não consome créditos [API real]', async ({ api }) => {
  const before = await (await api.get('/api/ai/credits')).json();
  const response = await api.post('/api/books/generate', { data: { theme: 'Saudações', num_pages: 3, level: 1 } });
  expect(response.status()).toBe(403);
  const after = await (await api.get('/api/ai/credits')).json();
  expect(after.used).toBe(before.used);
  expect(after.credits).toBe(before.credits);
});
