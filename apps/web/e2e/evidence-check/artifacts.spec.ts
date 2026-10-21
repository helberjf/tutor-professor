import { test, expect } from '../fixtures/test';

test('diagnóstico intencional: comprovar captura de evidências', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Entrar na sua conta' })).toBeVisible();
  expect('estado real').toBe('falha deliberada para verificar artefatos');
});
