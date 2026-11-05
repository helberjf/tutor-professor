import { test, expect, signIn } from '../fixtures/test';

for (const path of ['/dashboard', '/study?tab=dashboard']) {
  test(`dashboard ${path} mostra o que falta e atualiza após concluir etapa`, async ({ page, api, account }) => {
    const created = await api.post('/api/objectives', { data: { title: 'Preparar entrevista', items: [
      { title: 'Revisar apresentação', weight: 1 }, { title: 'Treinar uma entrevista', weight: 3 },
    ] } });
    expect(created.ok()).toBeTruthy();
    const objective = await created.json();
    expect((await api.put(`/api/objectives/items/${objective.items[0].id}`, { data: { done: true } })).ok()).toBeTruthy();
    await signIn(page, account);
    await page.goto(path);
    const card = page.getByRole('region', { name: 'O que falta para seus objetivos' });
    await expect(card.getByText('25%', { exact: true })).toBeVisible();
    await expect(card.getByText('Treinar uma entrevista', { exact: true })).toBeVisible();
    await expect(card.getByText('Revisar apresentação', { exact: true })).toHaveCount(0);
    await expect(card.getByText('Faltam 1 de 2 etapas planejadas.')).toBeVisible();
    await expect(card.getByRole('link', { name: /Preparar entrevista/ })).toHaveAttribute('href', `/objectives#objective-${objective.id}`);
    expect((await api.put(`/api/objectives/items/${objective.items[1].id}`, { data: { done: true } })).ok()).toBeTruthy();
    await page.reload();
    await expect(card.getByText('Todas as etapas planejadas foram concluídas.')).toBeVisible();
    await expect(card.getByText('Treinar uma entrevista', { exact: true })).toHaveCount(0);
  });
}

test('dashboard distingue análise sem evidências de progresso zero e mostra lacunas salvas', async ({ page, account }) => {
  await signIn(page, account);
  await page.route('**/api/objectives/summary', route => route.fulfill({ json: {
    active_count: 1, achieved_count: 0, archived_count: 0, total_items: 0, done_items: 0, average_progress_percent: 0,
    objectives: [{ id: 500, title: 'Fluência E2E', status: 'active', item_count: 0, items: [], progress_percent: 0,
      days_remaining: null, target_date: null, study_analysis: { progress_percent: null, stale: true,
        gaps: ['Organizar as respostas no passado'], next_steps: ['Descrever uma experiência profissional'],
      } }],
  } }));
  await page.goto('/study?tab=dashboard');
  const card = page.getByRole('region', { name: 'O que falta para seus objetivos' });
  await expect(card.getByText('Organizar as respostas no passado')).toBeVisible();
  await expect(card.getByText('Descrever uma experiência profissional')).toBeVisible();
  await expect(card.getByText('Dados insuficientes para estimar')).toBeVisible();
  await expect(card.getByText('Análise desatualizada. Atualize em Objetivos.')).toBeVisible();
  await expect(card.getByRole('progressbar')).toHaveCount(0);
});
