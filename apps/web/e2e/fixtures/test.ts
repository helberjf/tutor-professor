import { test as base, expect, request, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL, WEB_URL } from '../../scripts/e2e/safety.mjs';
import { protectContext } from '../support/network';

export interface Account {
  id: number; email: string; password: string; child_id: number; child_name: string; token: string;
}
type Options = { status?: 'approved' | 'pending' | 'rejected'; onboarding_completed?: boolean; seed_exam?: boolean };
type Fixtures = {
  account: Account;
  createAccount: (options?: Options) => Promise<Account>;
  api: APIRequestContext;
  allowedServerErrors: number[];
  allowedRequestFailures: string[];
  diagnostics: void;
};
type Workers = { environment: { run_id: string }; adminApi: APIRequestContext; adminAccount: Account };

export const test = base.extend<Fixtures, Workers>({
  allowedServerErrors: [[], { option: true }],
  allowedRequestFailures: [[], { option: true }],
  environment: [async ({}, use) => {
    const client = await request.newContext({ baseURL: API_URL });
    const response = await client.get('/__e2e__/ready');
    expect(response.ok(), 'API deve comprovar que é um ambiente E2E isolado').toBeTruthy();
    const marker = await response.json();
    expect(marker).toMatchObject({ service: 'tutor-e2e', database: 'disposable-sqlite', external_network: 'blocked' });
    await client.dispose();
    await use(marker);
  }, { scope: 'worker', auto: true }],
  adminAccount: [async ({ environment }, use) => {
    expect(environment.run_id).toBeTruthy();
    const client = await request.newContext({ baseURL: API_URL });
    const login = await client.post('/api/auth/login', { data: { email: 'admin@e2e.invalid', password: 'E2e!Synthetic123' } });
    expect(login.ok(), await login.text()).toBeTruthy();
    const { token } = await login.json();
    const children = await (await client.get('/api/parent/children', { headers: { Authorization: `Bearer ${token}` } })).json();
    await client.dispose();
    await use({ id: 1, email: 'admin@e2e.invalid', password: 'E2e!Synthetic123',
      child_id: children[0].id, child_name: children[0].name, token });
  }, { scope: 'worker' }],
  adminApi: [async ({ adminAccount }, use) => {
    const admin = await request.newContext({ baseURL: API_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${adminAccount.token}` } });
    await use(admin);
    await admin.dispose();
  }, { scope: 'worker' }],
  createAccount: async ({ environment }, use) => {
    const client = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-E2E-Run': environment.run_id } });
    await use(async (options = {}) => {
      const response = await client.post('/__e2e__/fixtures', { data: options });
      expect(response.ok(), await response.text()).toBeTruthy();
      return response.json();
    });
    await client.dispose();
  },
  account: async ({ createAccount }, use) => { await use(await createAccount()); },
  api: async ({ account }, use) => {
    const client = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: {
      Authorization: `Bearer ${account.token}`, 'X-Child-ID': String(account.child_id),
    } });
    await use(client);
    await client.dispose();
  },
  diagnostics: [async ({ context, allowedServerErrors, allowedRequestFailures }, use, testInfo) => {
    const blocked: string[] = [];
    const errors: string[] = [];
    await protectContext(context, blocked);
    context.on('page', page => {
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', failed => {
        const reason = failed.failure()?.errorText || 'unknown';
        // Navigations deliberately cancel pending fetches. Other transport errors
        // require an explicit exception in a resilience scenario.
        if (reason === 'net::ERR_ABORTED' || reason === 'NS_BINDING_ABORTED') return;
        if (allowedRequestFailures.some(path => new URL(failed.url()).pathname === path)) return;
        errors.push(`${reason} ${failed.url()}`);
      });
      page.on('response', response => {
        if (response.status() >= 500 && !allowedServerErrors.includes(response.status())) {
          errors.push(`HTTP ${response.status()} ${response.url()}`);
        }
      });
    });
    await use();
    await testInfo.attach('browser-diagnostics', { body: JSON.stringify({ blocked, errors }, null, 2), contentType: 'application/json' });
    expect(blocked, 'nenhum acesso externo deve ser tentado').toEqual([]);
    expect(errors, 'nenhuma exceção de JavaScript ou HTTP 5xx inesperado').toEqual([]);
  }, { auto: true }],
});

export async function signIn(page: Page, account: Account) {
  // A real, hashed server session supplied by the synthetic fixture, not a
  // fabricated profile or permission flag. The API remains the authorization gate.
  await page.context().addInitScript(({ token, childId, origin }) => {
    if (location.origin !== origin) return;
    localStorage.setItem('english-kids-tutor.session-token', token);
    localStorage.setItem('english-kids-tutor.active-child-id', String(childId));
    localStorage.setItem('english-kids-tutor.active-child-id.explicit', 'true');
  }, { token: account.token, childId: account.child_id, origin: WEB_URL });
}

export { expect, API_URL, WEB_URL };
