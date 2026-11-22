import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const readSource = (name) => readFile(path.join(root, 'src', name), 'utf8');
const styles = ['style.css', 'phone.css', 'contract.css'];
const scripts = [
  'core.js',
  'story.js',
  'report.js',
  'traffic.js',
  'resilience.js',
  'phone.js',
  'contract.js',
  'stage.js',
  'app.js',
];
const css = await Promise.all(
  styles.map(async (name) => {
    try {
      return await readSource(name);
    } catch (error) {
      if (name !== 'style.css' && error.code === 'ENOENT') return '';
      throw error;
    }
  })
);
const code = await Promise.all(scripts.map(readSource));
const html = (await readSource('page.html'))
  .replace('<!-- STYLES -->', () => '<style>\n' + css.join('\n') + '\n</style>')
  .replace('<!-- SCRIPTS -->', () =>
    code
      .map((source) => '<script>\n' + source.replace(/<\/script/gi, '<\\/script') + '\n</script>')
      .join('\n')
  );
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist', 'index.html'), html);
await writeFile(path.join(root, 'dist', '.nojekyll'), '');
console.log('已生成 dist/index.html，可直接双击打开。');
