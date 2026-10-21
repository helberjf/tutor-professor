import { test, expect, signIn } from '../fixtures/test';

// Source: StudySessionPage + test_study_session_flow.py; generated from code,
// not claimed to originate from a user recording that does not exist yet.
test('estudante revela significado, avança e retoma o próximo cartão após recarregar', async ({ page, account, api }) => {
  await signIn(page, account);
  await page.goto('/session');
  const progress = page.getByRole('progressbar', { name: 'Progresso da sessão' });
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: 'Ver o significado', exact: true }).click();
  await expect(page.getByText('Bom dia', { exact: true })).toBeVisible();
  const saved = page.waitForResponse(response => response.url().includes('/progress') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Entendi', exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await page.reload();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  const state = await (await api.get('/api/study/session')).json();
  expect(state.has_session).toBe(true);
});

test('ler o estado não cria sessão; iniciar novamente retoma a mesma fila', async ({ api }) => {
  expect((await (await api.get('/api/study/session')).json()).has_session).toBe(false);
  const first = await (await api.post('/api/study/session/start')).json();
  const again = await (await api.post('/api/study/session/start')).json();
  expect(again.id).toBe(first.id);
  expect(again.items).toEqual(first.items);
});
