// 每個交易日由 GitHub Actions 執行：抓證交所、櫃買、期交所公開資料，存成網站讀取的靜態 JSON。
// 執行：node --experimental-strip-types scripts/fetch-data.mjs
// 原則：同主機請求至少相隔 1.5–4 秒；403／429 立即停止該主機；失敗時保留上次檔案；不跟隨轉址。
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SOURCES, HOSTS, taipeiDate } from '../src/lib/open-sources.ts';
import { parseMiIndex, num } from './mi-index.mjs';
import { parseTxo, packChain, breadthSeries } from '../src/lib/plan.ts';
import { parseFuturesReport } from '../src/lib/futures.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA = join(ROOT, 'data');
const UA = 'PULSE-research/1.0 (+https://github.com; daily low-frequency reader)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lastAt = new Map(), blocked = new Set(), count = new Map();
const log = [];
const note = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };

const COMPACT = {
  tpex_day: ['Date', 'SecuritiesCompanyCode', 'CompanyName', 'Close', 'Change', 'Open', 'High', 'Low', 'TradingShares'],
};
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
  // 櫃買尚未產出的靜態檔會回 302 轉址：近 5 日視為暫缺（下次再試），更早視為休市
  if (r.status >= 300 && r.status < 400 && src.immutable) {
    if ((p.date ?? '') >= weekdaysBack(5)[4]) { note(`… ${key} ${p.date ?? ''}：來源尚未產出（${r.status}），下次再試`); return r.status; }
    r.status = 404;
  }
  if (r.status === 404 && src.immutable) { save(file, { key, label: src.label, status: 404, fetchedAt: Date.now(), payload: '', encoding: 'text', stale: false, retryAfter: 0, message: '來源無此檔（休市或尚未產出）' }); return 404; }
  if (r.status !== 200 || !r.buf?.length) { note(`✗ ${key}${p.date ? ' ' + p.date : ''}：${r.status === -1 ? '主機已封鎖本次略過' : r.status === -2 ? '超過本次上限' : r.status || r.error}`); return r.status; }
  if (r.buf.length > Math.max(src.maxBytes * 1.5, COMPACT[key] ? 12_000_000 : 0)) { note(`✗ ${key}：回應過大 ${r.buf.length}`); return 0; }
  let payload, encoding;
  if (src.binary) { payload = r.buf.toString('base64'); encoding = 'base64'; }
  else {
    payload = r.buf.toString('utf8').replace(/^﻿/, '');
    if (/^\s*</.test(payload)) { note(`✗ ${key}：收到 HTML（可能被導向或錯誤頁）`); return 0; }
    let parsed; try { parsed = JSON.parse(payload); } catch { note(`✗ ${key}：不是 JSON`); return 0; }
    // 大檔只保留網站用到的欄位（上櫃日成交原檔約 4.5 MB）
    if (COMPACT[key] && Array.isArray(parsed)) payload = JSON.stringify(parsed.map(o => Object.fromEntries(COMPACT[key].filter(f => f in o).map(f => [f, o[f]]))));
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

const decode = buf => { const t = buf.toString('utf8').replace(/^\uFEFF/, ''); return /^\s*[[{]/.test(t) || !t.includes('\uFFFD') ? t : new TextDecoder('big5').decode(buf); };

/** 交易計劃（溫度計、五條線、樂透 OP）用的資料：台指選擇權、台指期日 K、加權指數歷史、上市市場寬度。 */
async function planData(today) {
  const dir = join(DATA, 'plan');
  // a. 台指選擇權每日行情：原檔約 4 MB，只保留 TXO 一般時段必要欄位
  const r = await request('openapi.taifex.com.tw', 'https://openapi.taifex.com.tw/v1/DailyMarketReportOpt', { headers: { Accept: 'application/json,text/csv,*/*' } });
  if (r.status === 200 && r.buf?.length) {
    try { const c = parseTxo(decode(r.buf)); if (c.rows.length) { save(join(dir, 'txo.json'), packChain(c)); note(`✓ 台指選擇權 ${c.date}（${c.rows.length} 筆）`); } else note('✗ 台指選擇權：沒有 TXO 資料'); }
    catch (e) { note(`✗ 台指選擇權：${e}`); }
  } else note(`✗ 台指選擇權：${r.status || r.error}`);

  // b. 台指期近月日 K：由期貨每日行情逐日累積（一般時段；夜盤另存收盤）
  const fut = load(join(DATA, 'open', 'taifex_fut_daily.json'));
  if (fut?.payload) {
    try {
      const q = parseFuturesReport(fut.encoding === 'base64' ? decode(Buffer.from(fut.payload, 'base64')) : fut.payload).filter(x => x.contract === 'TX' && /^\d{6}$/.test(x.month));
      const day = q.filter(x => /一般|Regular/i.test(x.session)).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
      if (day?.date && day.high != null && day.low != null && (day.last ?? day.settle) != null) {
        const night = q.find(x => x.month === day.month && !/一般|Regular/i.test(x.session));
        const file = join(dir, 'tx.json'); const hist = (load(file) ?? []).filter(x => x[0] !== day.date);
        hist.push([day.date, day.month, day.open, day.high, day.low, day.last ?? day.settle, day.settle, day.volume, day.oi, night?.last ?? null]);
        hist.sort((a, b) => a[0].localeCompare(b[0])); save(file, hist.slice(-400)); note(`✓ 台指期日 K ${day.date}（累積 ${hist.length} 日）`);
      }
    } catch (e) { note(`✗ 台指期日 K：${e}`); }
  }

  // c. 加權指數日 K（證交所 MI_5MINS_HIST，每月一次請求）：保留約 42 個月，已完整的月份不再抓
  const file = join(dir, 'taiex.json'); const have = new Map((load(file) ?? []).map(x => [x[0], x]));
  const cur = today.slice(0, 7); const months = [];
  for (let d = new Date(cur + '-01T00:00:00Z'), k = 0; k < 42; k++, d.setUTCMonth(d.getUTCMonth() - 1)) months.push(d.toISOString().slice(0, 7));
  const prev = months[1];
  let got = 0;
  for (const m of months) {
    const needs = m === cur || (m === prev && +today.slice(8) <= 7) || ![...have.keys()].some(d => d.startsWith(m));
    if (!needs) continue;
    const res = await request('www.twse.com.tw', `https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=${m.replace('-', '')}01&response=json`, { headers: { Accept: 'application/json' } });
    if (res.status !== 200) { if (res.status === -1 || res.status === -2 || res.status === 403 || res.status === 429) break; continue; }
    let j; try { j = JSON.parse(res.buf.toString('utf8')); } catch { continue; }
    for (const row of j?.data ?? []) { const mm = String(row[0]).match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/); if (!mm) continue; const d = `${+mm[1] + 1911}-${mm[2]}-${mm[3]}`; const v = row.slice(1, 5).map(num); if (v.every(x => x != null)) have.set(d, [d, ...v]); }
    got++;
  }
  const keepFrom = months.at(-1);
  const taiex = [...have.values()].filter(x => x[0] >= keepFrom).sort((a, b) => a[0].localeCompare(b[0]));
  if (taiex.length) save(file, taiex);
  note(`加權指數歷史：本次請求 ${got} 次，共 ${taiex.length} 日`);

  // d. 上市市場寬度（站上 MA20／MA60、漲跌家數、20 日新高新低）：由逐日收盤行情計算
  const hDir = join(DATA, 'twse-daily');
  if (existsSync(hDir)) {
    const days = readdirSync(hDir).sort().map(f => ({ date: f.replace('.json', ''), rows: load(join(hDir, f)) ?? [] }));
    const b = breadthSeries(days); save(join(dir, 'breadth.json'), b); note(`市場寬度：${b.length} 日`);
  }
}

async function main() {
  const today = taipeiDate(Date.now());
  note(`PULSE 資料更新 ${new Date().toISOString()}（台北 ${today}）`);
  if (process.argv.includes('--only=plan')) { await planData(today); return; }
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
  // 5. 交易計劃資料
  try { await planData(today); } catch (e) { note(`✗ 交易計劃資料：${e}`); }
  save(join(DATA, 'status.json'), { updatedAt: Date.now(), taipei: today, log, blocked: [...blocked], requests: Object.fromEntries(count) });
}
main().catch(e => { console.error(e); process.exitCode = 1; });
