// 建置靜態網站到 dist/：打包前端、複製資料、由逐日收盤行情產生每檔股票的歷史序列。
// 執行：node scripts/build.mjs
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname, DIST = join(ROOT, 'dist');
rmSync(DIST, { recursive: true, force: true }); mkdirSync(DIST, { recursive: true });

await build({
  entryPoints: [join(ROOT, 'src/main.tsx')], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: join(DIST, 'app.js'),
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, alias: { '@': join(ROOT, 'src'), 'lucide-react': join(ROOT, 'src/icons.tsx') },
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(':') : [], logLevel: 'warning',
});
const version = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
writeFileSync(join(DIST, 'index.html'), readFileSync(join(ROOT, 'public/index.html'), 'utf8').replaceAll('__V__', version));
cpSync(join(ROOT, 'public/style.css'), join(DIST, 'style.css'));
writeFileSync(join(DIST, '.nojekyll'), '');

// 資料
const data = join(ROOT, 'data');
if (existsSync(join(data, 'open'))) cpSync(join(data, 'open'), join(DIST, 'data/open'), { recursive: true });
if (existsSync(join(data, 'plan'))) cpSync(join(data, 'plan'), join(DIST, 'data/plan'), { recursive: true });
if (existsSync(join(data, 'status.json'))) cpSync(join(data, 'status.json'), join(DIST, 'data/status.json'));
const series = new Map();
for (const dir of ['twse-daily', 'tpex-daily']) {
  const p = join(data, dir); if (!existsSync(p)) continue;
  for (const f of readdirSync(p).sort()) {
    const date = f.replace('.json', ''); let rows; try { rows = JSON.parse(readFileSync(join(p, f), 'utf8')); } catch { continue; }
    for (const [code, o, h, l, c, v] of rows) { const a = series.get(code) ?? []; a.push([date, o, h, l, c, v]); series.set(code, a); }
  }
}
mkdirSync(join(DIST, 'data/series'), { recursive: true });
for (const [code, rows] of series) { rows.sort((a, b) => a[0].localeCompare(b[0])); writeFileSync(join(DIST, 'data/series', `${code}.json`), JSON.stringify(rows.slice(-190))); }
console.log(`dist 完成：${series.size} 檔股票歷史序列`);
