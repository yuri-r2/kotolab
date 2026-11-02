// Cache-busting for GitHub Pages: rewrites the import map in index.html so
// every module URL carries a hash of its contents. Run after editing JS/CSS:
//   node scripts/stamp.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const hash = (file) => createHash('sha1').update(readFileSync(join(root, file))).digest('hex').slice(0, 8);
const walk = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
  const p = join(dir, f);
  return statSync(join(root, p)).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});
const modules = walk('js').sort();
const imports = Object.fromEntries(modules.map((m) => [`./${m}`, `./${m}?v=${hash(m)}`]));
const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n  </script>`;
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, map);
html = html.replace(/href="css\/style\.css(\?v=\w+)?"/, `href="css/style.css?v=${hash('css/style.css')}"`);
html = html.replace(/src="js\/app\.js(\?v=\w+)?"/, `src="js/app.js?v=${hash('js/app.js')}"`);
writeFileSync(join(root, 'index.html'), html);
console.log(`stamped ${modules.length} modules`);
void relative;
