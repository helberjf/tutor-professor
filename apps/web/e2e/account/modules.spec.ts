import { test, expect } from '../fixtures/test';

test('programação começa desativada, ativação abre a API e idioma obrigatório permanece ativo', async ({ api }) => {
  expect((await api.get('/api/coding/subjects')).status()).toBe(403);
  const enabled = await api.put('/api/account/modules', { data: { modules: { coding: true } } });
  expect(enabled.ok()).toBeTruthy();
  expect((await api.get('/api/coding/subjects')).status()).toBe(200);
  expect((await api.put('/api/account/modules', { data: { modules: { language: false } } })).status()).toBe(422);
  const modules = await (await api.get('/api/account/modules')).json();
  expect(modules.modules.find((module: { id: string }) => module.id === 'language').enabled).toBe(true);
});
