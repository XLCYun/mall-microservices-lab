import { phonePath, verifyPhone } from './phone-endpoint.js';

export function phoneTransport() {
  if (location.protocol === 'file:') return '离线执行';
  return document.documentElement.dataset.phoneApi === 'http' ? 'HTTP 接口' : '浏览器接口 · Service Worker';
}

let preparing;
async function prepareWorker() {
  const workers = navigator.serviceWorker;
  if (!workers) throw new Error('请使用 HTTPS 或 localhost 打开此站点，以启用浏览器接口。');
  const script = new URL('./phone-worker.js', document.baseURI).href;
  await workers.register(script, { type: 'module' });
  if (workers.controller?.scriptURL === script) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      workers.removeEventListener('controllerchange', ready);
      reject(new Error('浏览器接口尚未就绪，请重试。'));
    }, 10000);
    function ready() {
      if (workers.controller?.scriptURL !== script) return;
      clearTimeout(timer);
      workers.removeEventListener('controllerchange', ready);
      resolve();
    }
    workers.addEventListener('controllerchange', ready);
    ready();
  });
}

export async function sendPhone(body) {
  const endpoint = new URL(phonePath, document.baseURI);
  const headers = { 'Content-Type': 'application/json' };
  const init = { method: 'POST', headers, body };
  if (location.protocol === 'file:') return verifyPhone(new Request(endpoint, init));
  if (document.documentElement.dataset.phoneApi === 'http') {
    // A worker left by a static preview at this origin must allow the native HTTP route through.
    if (navigator.serviceWorker?.controller) headers['X-Lab-HTTP'] = '1';
  } else {
    preparing ??= prepareWorker().catch(error => {
      preparing = undefined;
      throw error;
    });
    await preparing;
  }
  return fetch(endpoint, init);
}
