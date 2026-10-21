import { test, expect, signIn } from '../fixtures/test';

test('responde simulado com acerto e erro e confirma o resultado persistido', async ({ page, createAccount }) => {
  const account = await createAccount({ seed_exam: true });
  await signIn(page, account);
  await page.goto('/exams');
  await page.getByRole('button', { name: 'Fazer simulado', exact: true }).click();
  const first = page.getByRole('heading', { name: /^Traduza:/ });
  await expect(first).toBeVisible();
  const question = await first.textContent();
  const correct = question?.includes('Good morning') ? 'Bom dia' : 'Obrigado';
  await page.getByRole('button', { name: correct, exact: true }).click();
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await page.getByRole('button', { name: 'Por favor', exact: true }).click();
  const finished = page.waitForResponse(response => response.url().includes('/finish') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Finalizar e ver resultado' }).click();
  const response = await finished;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.attempt.correct_count).toBe(1);
  expect(result.attempt.score_percent).toBe(50);
  await expect(page.getByText('50%', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(/melhor: 50%/)).toBeVisible();
});

test('simulado sem banco de questões não inicia e campos fora do limite são recusados', async ({ api }) => {
  expect((await api.post('/api/exams', { data: { name: 'Inválido', question_count: 0 } })).status()).toBe(422);
  const exam = await api.post('/api/exams', { data: { name: 'Sem questões E2E', question_count: 2 } });
  expect(exam.status()).toBe(201);
  const { id } = await exam.json();
  expect((await api.post(`/api/exams/${id}/attempts`)).status()).toBe(422);
});
