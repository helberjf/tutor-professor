// Loaded only by the disposable Next.js process. Fail closed before DNS/socket I/O.
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // HTTP Agent passes an already-normalized argument array to Socket.connect.
  const [options] = net._normalizeArgs(Array.isArray(args[0]) ? args[0] : args);
  if (options.port && (!['127.0.0.1', 'localhost', '::1'].includes(options.host || 'localhost') ||
    ![3100, 8100].includes(Number(options.port)))) {
    throw new Error('E2E: conexão externa recusada pelo servidor de teste.');
  }
  return originalConnect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['http://127.0.0.1:3100', 'http://127.0.0.1:8100'].includes(url.origin) || url.username || url.password) {
    return Promise.reject(new Error('E2E: fetch externo recusado pelo servidor de teste.'));
  }
  return originalFetch(input, options);
};
