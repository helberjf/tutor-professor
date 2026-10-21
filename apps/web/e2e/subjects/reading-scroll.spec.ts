import { test, expect, signIn } from '../fixtures/test';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`cada parte da leitura começa no topo em ${viewport.width}px`, async ({ page, account, api }) => {
    await page.setViewportSize(viewport);
    expect((await api.put('/api/account/modules', { data: { modules: { coding: true } } })).ok()).toBeTruthy();
    const subjectResponse = await api.post('/api/coding/subjects', { data: { name: 'Leitura longa E2E' } });
    expect(subjectResponse.ok()).toBeTruthy();
    const subject = await subjectResponse.json();
    const topicResponse = await api.post(`/api/coding/subjects/${subject.id}/topics`, {
      data: { title: 'Duas partes de leitura', generate_ai: false },
    });
    expect(topicResponse.ok()).toBeTruthy();
    const topic = await topicResponse.json();
    const saved = await api.put(`/api/coding/topics/${topic.id}`, { data: { ai_content: {
      sections: ['Primeira parte', 'Segunda parte'].map(title => ({
        title, body: Array(70).fill(`${title}: texto longo para percorrer até o final.`).join('\n\n'),
      })), quiz: [], flashcards: [],
    } } });
    expect(saved.ok()).toBeTruthy();
    await signIn(page, account);
    await page.goto(`/study?tab=coding&subject_id=${subject.id}&topic_id=${topic.id}`);
    await page.getByRole('button', { name: 'Iniciar estudo', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const body = dialog.locator('main');
    const fontSize = await body.evaluate(element => getComputedStyle(element).fontSize);

    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Próxima etapa do estudo', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Segunda parte', exact: true })).toBeAttached();
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(0);
    await expect(dialog.getByRole('heading', { name: 'Segunda parte', exact: true })).toBeVisible();
    expect(await body.evaluate(element => getComputedStyle(element).fontSize)).toBe(fontSize);

    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Etapa anterior do estudo', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Primeira parte', exact: true })).toBeAttached();
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(0);
  });
}
