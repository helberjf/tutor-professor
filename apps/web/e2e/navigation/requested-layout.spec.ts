import { test as base, expect, signIn } from '../fixtures/test';

const test = base.extend({
  account: async ({ createAccount }, use) => { await use(await createAccount({ seed_grammar: true })); },
});

for (const [width, theme] of [[390, 'dark'], [782, 'dark'], [1440, 'dark'], [782, 'light']] as const) {
  test(`início, seletor e simulados se adaptam em ${width}px ${theme}`, async ({ page, account, api }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    expect((await api.put('/api/account/modules', { data: { modules: { coding: true } } })).ok()).toBeTruthy();
    await signIn(page, account);
    await page.addInitScript(theme => localStorage.setItem('english-kids-tutor.theme-preference', theme), theme);
    await page.route('**/api/study/resume', route => route.fulfill({ json: {
      has_resume: true, href: '/lesson', kind: 'language_lesson',
      label: 'Curso de preparação — tópico com título longo para verificar o uso de toda a largura disponível', updated_at: null,
    } }));
    await page.goto('/');
    const resume = page.getByRole('link', { name: /Continuar de onde parou/ });
    await expect(resume).toBeVisible();
    const hero = page.locator('main > div > section').first();
    const heading = page.getByRole('heading', { name: 'Vamos aprender tudo do seu jeito' });
    if (width < 1024) {
      const heroBox = await hero.boundingBox();
      const headingBox = await heading.boundingBox();
      expect(headingBox!.width).toBeGreaterThan(heroBox!.width * 0.7);
    }
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: false });
    await page.goto('/study?tab=coding');
    await expect(page.getByRole('combobox', { name: 'Abrir lista de disciplinas' })).toHaveValue('coding');
    await expect(page.getByRole('heading', { name: 'Minhas Matérias', exact: true })).toBeVisible();
    await page.locator('.discipline-picker').screenshot({ path: testInfo.outputPath(`picker-${width}.png`), animations: 'disabled' });
    await page.getByRole('button', { name: /^Modo simulado/ }).click();
    await expect(page.getByRole('heading', { name: 'Simulado de uma matéria' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Matéria', exact: true })).toBeEnabled();
    const exam = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Simulado de uma matéria' }) });
    await exam.screenshot({ path: testInfo.outputPath(`exam-${width}.png`), animations: 'disabled' });
    const examBox = await exam.boundingBox();
    expect(examBox!.x).toBeGreaterThanOrEqual(0);
    expect(examBox!.x + examBox!.width).toBeLessThanOrEqual(width);
    for (const path of ['/', '/grammar', '/study?tab=coding']) {
      await page.goto(path);
      await expect(page.locator('main').first()).toBeVisible();
      const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.width + 1);
    }
  });
}
