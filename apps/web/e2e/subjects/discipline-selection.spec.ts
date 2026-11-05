import { test, expect, signIn } from '../fixtures/test';

test('seletor mantém Programação e a disciplina escolhida ao alternar abas', async ({ page, api, account }) => {
  expect((await api.put('/api/account/modules', { data: { modules: { coding: true } } })).ok()).toBeTruthy();
  const response = await api.post('/api/general/disciplines', { data: { name: 'Francês E2E', icon_emoji: '🇫🇷' } });
  expect(response.ok()).toBeTruthy();
  const discipline = await response.json();
  await signIn(page, account);
  await page.goto('/study?tab=coding#english-grammar');
  const picker = page.getByRole('combobox', { name: 'Abrir lista de disciplinas' });
  await expect(picker).toHaveValue('coding');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Outras Disciplinas', exact: true }).click();
  await expect(picker).toHaveValue('coding');
  expect(new URL(page.url()).hash).toBe('');
  await picker.selectOption(`discipline:${discipline.id}`);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Outras Disciplinas', exact: true }).click();
  await expect(picker).toHaveValue(`discipline:${discipline.id}`);
});

test('primeiro clique em Outras disciplinas restaura a última matéria do servidor', async ({ page, api, account }) => {
  expect((await api.put('/api/account/modules', { data: { modules: { coding: true } } })).ok()).toBeTruthy();
  const response = await api.post('/api/coding/subjects', { data: { name: 'Última matéria E2E' } });
  expect(response.ok()).toBeTruthy();
  const subject = await response.json();
  expect((await api.post(`/api/coding/subjects/${subject.id}/use`)).ok()).toBeTruthy();
  expect((await api.put('/api/study/resume', { data: { kind: 'coding_subject', subject_id: subject.id, mode: 'reading' } })).ok()).toBeTruthy();
  await signIn(page, account);
  await page.goto('/study');
  await page.getByRole('button', { name: 'Outras Disciplinas', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Abrir lista de disciplinas' })).toHaveValue('coding');
  await expect(page.getByRole('heading', { name: 'Última matéria E2E' })).toBeVisible();
});
