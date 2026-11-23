import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { context } from 'esbuild';
import { phonePath, verifyPhone } from './src/phone-endpoint.js';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 59011);
const root = fileURLToPath(new URL('.', import.meta.url));
const compiler = await context({
  absWorkingDir: root, entryPoints: ['src/gateway-ui.jsx'], outfile: 'src/assets/gateway-ui.js',
  bundle: true, jsx: 'automatic', format: 'iife', target: 'es2020', write: false
});
const assets = await compiler.serve({ host, port: 0, servedir: 'src' });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + host + ':' + port);
    if (url.pathname === '/' + phonePath) {
      const init = { method: req.method, headers: req.headers };
      if (req.method === 'POST') Object.assign(init, { body: Readable.toWeb(req), duplex: 'half' });
      const result = await verifyPhone(new Request(url, init));
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(await result.text());
    } else if (['/', '/index.html'].includes(url.pathname) && ['GET', 'HEAD'].includes(req.method)) {
      const page = await readFile(new URL('./src/index.html', import.meta.url), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(page.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-phone-api="http">'));
    } else {
      const upstream = http.request({ hostname: host, port: assets.port, path: req.url, method: req.method,
        headers: req.headers }, asset => {
        res.writeHead(asset.statusCode, asset.headers);
        asset.pipe(res);
      });
      upstream.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(upstream);
    }
  } catch (error) {
    console.error(error.message);
    res.writeHead(500);
    res.end();
  }
});
server.on('error', async error => {
  console.error(error.message);
  await compiler.dispose();
  process.exitCode = 1;
});
server.listen(port, host, () => console.log('本地演练场 http://' + host + ':' + port + '/'));
