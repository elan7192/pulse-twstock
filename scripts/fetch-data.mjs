// 每個交易日由 GitHub Actions 執行：抓證交所、櫃買、期交所公開資料，存成網站讀取的靜態 JSON。
// 執行：node --experimental-strip-types scripts/fetch-data.mjs
// 原則：同主機請求至少相隔 1.5–4 秒；403／429 立即停止該主機；失敗時保留上次檔案；不跟隨轉址。
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SOURCES, HOSTS, taipeiDate } from '../src/lib/open-sources.ts';
import { parseMiIndex, num } from './mi-index.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA = join(ROOT, 'data');
const UA = 'PULSE-research/1.0 (+https://github.com; daily low-frequency reader)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lastAt = new Map(), blocked = new Set(), count = new Map();
const log = [];
const note = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };

function save(path, obj) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(obj)); }
function load(path) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } }

async function request(host, url, init = {}) {
  if (blocked.has(host)) return { status: -1 };
  // 首次補歷史需要約 170 次證交所網站請求（每 4 秒 1 次，約 12 分鐘）；之後每天只需 1 次。
  const policy = { ...(HOSTS[host] ?? { interval: 3000, budget: 200 }), ...(host === 'www.twse.com.tw' ? { budget: 190 } : {}) };
  if ((count.get(host) ?? 0) >= policy.budget) return { status: -2 };
  const wait = (lastAt.get(host) ?? 0) + Math.max(1500, policy.interval) - Date.now();
  if (wait > 0) await sleep(wait);
  lastAt.set(host, Date.now()); count.set(host, (count.get(host) ?? 0) + 1);
  try {
    const res = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(25000), headers: { 'User-Agent': UA, ...(init.headers ?? {}) } });
    if (res.status === 403 || res.status === 429) { blocked.add(host); note(`⛔ ${host} 回應 ${res.status}，本次停止此主機`); await res.body?.cancel(); return { status: res.status }; }
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buf };
  } catch (e) { return { status: 0, error: String(e) }; }
}

function headersFor(src, p) {
  return {
    Accept: src.binary ? 'text/csv,*/*' : 'application/json,text/plain,*/*',
    ...(src.host === 'www.tpex.org.tw' && !src.url(p).includes('/openapi/') ? { Referer: 'https://www.tpex.org.tw/zh-tw/bond/info/statistics-cb/day.html' } : {}),
    ...(src.body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' } : {}),
  };
}

/** 抓一個登記表資料集，成功才覆寫檔案。 */
async function fetchSource(key, p = {}, file) {
  const src = SOURCES[key];
  const r = await request(src.host, src.url(p), { method: src.method, body: src.body?.(p), headers: headersFor(src, p) });
  if (r.status === 404 && src.immutable) { save(file, { key, label: src.label, status: 404, fetchedAt: Date.now(), payload: '', encoding: 'text', stale: false, retryAfter: 0, message: '來源無此檔（休市或尚未產出）' }); return 404; }
  if (r.status !== 200 || !r.buf?.length) { note(`✗ ${key}${p.date ? ' ' + p.date : ''}：${r.status === -1 ? '主機已封鎖本次略過' : r.status === -2 ? '超過本次上限' : r.status || r.error}`); return r.status; }
  if (r.buf.length > src.maxBytes * 1.5) { note(`✗ ${key}：回應過大 ${r.buf.length}`); return 0; }
  let payload, encoding;
  if (src.binary) { payload = r.buf.toString('base64'); encoding = 'base64'; }
  else {
    payload = r.buf.toString('utf8').replace(/^﻿/, '');
    if (/^\s*</.test(payload)) { note(`✗ ${key}：收到 HTML（可能被導向或錯誤頁）`); return 0; }
    try { JSON.parse(payload); } catch { note(`✗ ${key}：不是 JSON`); return 0; }
    encoding = 'text';
  }
  save(file, { key, label: src.label, status: 200, fetchedAt: Date.now(), payload, encoding, stale: false, retryAfter: 0, message: '已更新' });
  note(`✓ ${key}${p.date ? ' ' + p.date : ''}（${Math.round(r.buf.length / 1024)} KB）`);
  return 200;
}

function weekdaysBack(n, from = taipeiDate(Date.now())) {
  const out = []; const d = new Date(from + 'T00:00:00Z');
  while (out.length < n) { const w = d.getUTCDay(); if (w > 0 && w < 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
  return out;
}

async function main() {
  const today = taipeiDate(Date.now());
  note(`PULSE 資料更新 ${new Date().toISOString()}（台北 ${today}）`);
  // 1. 當日資料集
  const plain = ['twse_punish', 'twse_notice', 'twse_notetrans', 'twse_margin', 'twse_day', 'twse_meeting', 'taifex_ssf_margin', 'taifex_fut_daily', 'tpex_disposal', 'tpex_warning', 'tpex_margin', 'tpex_day', 'tpex_cb_put', 'tpex_cb_mode'];
  for (const k of plain) await fetchSource(k, {}, join(DATA, 'open', `${k}.json`));

  // 2. 可轉債日行情：近 25 個工作日，過去日期已有檔就略過
  const cbDir = join(DATA, 'open', 'tpex_cb_quotes');
  for (const d of weekdaysBack(25)) {
    const f = join(cbDir, `${d}.json`), old = load(f);
    if (old && d < today && (old.status === 200 || old.status === 404)) continue;
    await fetchSource('tpex_cb_quotes', { date: d }, f);
  }
  const keepCb = new Set(weekdaysBack(60));
  if (existsSync(cbDir)) for (const f of readdirSync(cbDir)) if (!keepCb.has(f.replace('.json', ''))) rmSync(join(cbDir, f));

  // 3. 上市股票歷史：每日收盤行情，缺的日期補齊（首次約 170 個工作日，之後每天 1 次）
  const hDir = join(DATA, 'twse-daily');
  const want = weekdaysBack(170);
  let fetched = 0;
  for (const d of want) {
    const f = join(hDir, `${d}.json`);
    if (existsSync(f) && d < today) continue;
    if (fetched >= 175) break;
    const r = await request('www.twse.com.tw', `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${d.replace(/-/g, '')}&type=ALLBUT0999&response=json`, { headers: { Accept: 'application/json' } });
    fetched++;
    if (r.status !== 200) { if (r.status === -1 || r.status === 403 || r.status === 429) break; continue; }
    let json; try { json = JSON.parse(r.buf.toString('utf8')); } catch { note(`✗ MI_INDEX ${d}：不是 JSON`); continue; }
    const rows = parseMiIndex(json);
    if (rows && rows.length) save(f, rows);
    else if (d < today) save(f, []); // 休市
  }
  note(`上市歷史：本次請求 ${fetched} 次，已有 ${existsSync(hDir) ? readdirSync(hDir).length : 0} 天`);
  const keepH = new Set(weekdaysBack(200));
  if (existsSync(hDir)) for (const f of readdirSync(hDir)) if (!keepH.has(f.replace('.json', ''))) rmSync(join(hDir, f));

  // 4. 上櫃股票：由當日收盤行情逐日累積
  const tp = load(join(DATA, 'open', 'tpex_day.json'));
  if (tp?.payload) {
    try {
      const arr = JSON.parse(tp.payload);
      const rows = arr.map(r => [String(r.SecuritiesCompanyCode ?? '').trim(), num(r.Open), num(r.High), num(r.Low), num(r.Close), num(r.TradingShares)]).filter(r => /^[0-9A-Z]{4,6}$/.test(r[0]) && r[4] != null);
      const dRaw = String(arr[0]?.Date ?? ''); const m = dRaw.match(/^(1\d{2})(\d{2})(\d{2})$/);
      const d = m ? `${+m[1] + 1911}-${m[2]}-${m[3]}` : today;
      if (rows.length) save(join(DATA, 'tpex-daily', `${d}.json`), rows);
    } catch { note('✗ 上櫃日行情無法累積'); }
  }
  save(join(DATA, 'status.json'), { updatedAt: Date.now(), taipei: today, log, blocked: [...blocked], requests: Object.fromEntries(count) });
}
main().catch(e => { console.error(e); process.exitCode = 1; });
