import { chromium } from '@playwright/test';
import { startEnvironment } from './environment.mjs';
import { WEB_URL } from './safety.mjs';

// Node 22 can strip the types from this shared browser guard. The same guard is
// installed by every E2E fixture; plain CLI codegen would lose that protection.
const { protectContext } = await import('../../e2e/support/network.ts');
const check = process.argv.includes('--check');
if (!check) process.env.PWDEBUG = '1';
let browser;
const environment = await startEnvironment({ onStop: async () => { await browser?.close(); } });
try {
  browser = await chromium.launch({ headless: check });
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  const blocked = [];
  await protectContext(context, blocked);
  const page = await context.newPage();
  await page.goto(WEB_URL);
  await page.getByRole('heading', { name: 'Vamos aprender tudo do seu jeito' }).waitFor();
  if (check) {
    if (blocked.length) throw new Error('E2E Codegen tentou conectar fora do ambiente.');
    console.log('Codegen: ambiente, navegador e proteções verificados.');
  } else {
    console.log('Gravação: no Inspector, clique Record. Navegue, inclua assertions e copie o código TypeScript.');
    console.log('Contas sintéticas: student@e2e.invalid ou admin@e2e.invalid. Senha para ambas: E2e!Synthetic123.');
    console.log('Salve em e2e/recordings/. Finalize copiando o código e clicando Resume.');
    await page.pause();
  }
  await context.close();
} finally {
  await browser?.close();
  await environment.stop();
}
