import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const readSource = (name, encoding = 'utf8') => readFile(path.join(root, 'src', name), encoding);

// Development loads the files directly. Their order in the entry page also defines the offline bundle.
const entry = await readSource('index.html');
const reactEntry = 'assets/gateway-ui.js';
async function readAsset(name) {
  if (name !== reactEntry) return readSource(name);
  const bundle = await build({
    entryPoints: [path.join(root, 'src', 'gateway-ui.jsx')],
    bundle: true,
    jsx: 'automatic',
    format: 'iife',
    target: 'es2020',
    minify: true,
    legalComments: 'inline',
    write: false,
  });
  return bundle.outputFiles[0].text;
}
const tags = /<link\s+rel="stylesheet"\s+href="\.\/([\w.-]+\.css)"\s*\/?>|<script\s+src="\.\/((?:assets\/)?[\w.-]+\.js)"\s*>\s*<\/script>/g;
const assets = [...entry.matchAll(tags)];
const contents = await Promise.all(assets.map(([, css, js]) => readAsset(css || js)));
let html = entry;
for (const [index, [tag, css]] of assets.entries()) {
  const source = contents[index];
  const inline = css
    ? '<style>\n' + source + '\n</style>'
    : '<script>\n' + source.replace(/<\/script/gi, '<\\/script') + '\n</script>';
  html = html.replace(tag, () => inline);
}
// React slides and static markup use the same relative artwork URLs during development.
const artPaths = new Set(Array.from(html.matchAll(/["']\.\/(art\/[\w.-]+\.webp)["']/g), match => match[1]));
for (const name of artPaths) {
  const encoded = await readSource(name, 'base64');
  html = html.replaceAll('./' + name, () => 'data:image/webp;base64,' + encoded);
}
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist', 'index.html'), html);
await writeFile(path.join(root, 'dist', '.nojekyll'), '');
console.log('已生成 dist/index.html，可直接双击打开。');
