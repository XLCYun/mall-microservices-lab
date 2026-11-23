import { phonePath, verifyPhone } from './phone-endpoint.js';

const endpoint = new URL(phonePath, self.registration.scope).href;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.url === endpoint && !event.request.headers.has('X-Lab-HTTP')) {
    event.respondWith(verifyPhone(event.request));
  }
});
