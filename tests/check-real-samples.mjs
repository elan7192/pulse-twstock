// 以 2026-09-27 GitHub Actions 實際抓回的櫃買處置公告驗證解析
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTpexDisposal } from '../src/lib/opendata.ts';
const d = parseTpexDisposal(JSON.parse(readFileSync(new URL('./fixtures/tpex_disposal_real.json', import.meta.url), 'utf8')));
assert.deepEqual([d[0].code, d[0].start, d[0].end, d[0].level, d[0].matchMinutes, d[0].fullPrepay], ['2221', '2026-09-24', '2026-10-06', '第一次處置', 2, false]);
assert.deepEqual([d[2].code, d[2].level, d[2].fullPrepay], ['36053', '第二次處置', true]);
console.log('櫃買處置（真實樣本）：期間、第一／第二次、撮合間隔、預收方式正確');
