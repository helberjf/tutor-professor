import { test, expect } from '../fixtures/test';

test('cria matéria e tópico manual sem depender de IA e valida nomes obrigatórios', async ({ api }) => {
  expect((await api.put('/api/account/modules', { data: { modules: { coding: true } } })).ok()).toBeTruthy();
  expect((await api.post('/api/coding/subjects', { data: { name: '' } })).status()).toBe(422);
  const created = await api.post('/api/coding/subjects', { data: { name: 'TypeScript E2E', description: 'Curso sintético' } });
  expect(created.status()).toBe(201);
  const subject = await created.json();
  const topic = await api.post(`/api/coding/subjects/${subject.id}/topics`, { data: { title: 'Tipos básicos', generate_ai: false } });
  expect(topic.status()).toBe(201);
  const topics = await (await api.get(`/api/coding/subjects/${subject.id}/topics`)).json();
  expect(topics).toHaveLength(1);
  expect(topics[0].title).toBe('Tipos básicos');
});
