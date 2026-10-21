import type { BrowserContext } from '@playwright/test';
import { assertLocalUrl } from '../../scripts/e2e/safety.mjs';

export async function protectContext(context: BrowserContext, blocked: string[]) {
  await context.route('**/*', async route => {
    try { assertLocalUrl(route.request().url()); }
    catch {
      blocked.push(route.request().url());
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await context.route('**/api/runtime-backend', route => route.fulfill({
    json: { baseUrl: null, host: null, source: 'missing', updatedAt: null, activatedAt: null, machineName: null },
  }));
  await context.routeWebSocket('**/*', socket => {
    try {
      const url = new URL(socket.url());
      if (url.protocol !== 'ws:') throw new Error('protocol');
      url.protocol = 'http:';
      assertLocalUrl(url.href);
      socket.connectToServer();
    } catch { blocked.push(socket.url()); socket.close(); }
  });
}
