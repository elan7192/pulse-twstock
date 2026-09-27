// 個股期貨：期交所每日行情與股票期貨保證金解析、契約規模、基差與保證金試算。
// 期交所 OpenAPI 會間歇改回 CSV（同資料、不同格式），因此 JSON 與 CSV、英文與中文欄名都接受。

import { num, toDate } from './opendata';
import type { Dataset } from './branch';

type Rec = Record<string, string>;
function csvLine(line: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out.map(s => s.trim());
}
/** JSON 陣列或 CSV（首列為欄名）→ 物件陣列。 */
export function records(text: string): Rec[] {
  const t = text.replace(/^﻿/, '').trim();
  if (!t) return [];
  if (t[0] === '[' || t[0] === '{') {
    const j = JSON.parse(t) as unknown; const arr = Array.isArray(j) ? j : [];
    return arr.map(r => Object.fromEntries(Object.entries(r as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v).trim()])));
  }
  const lines = t.split(/\r?\n/).filter(l => l.trim());
  const head = csvLine(lines[0]);
  return lines.slice(1).map(l => { const c = csvLine(l); return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ''])); });
}
function get(r: Rec, names: string[]): string {
  for (const n of names) if (n in r) return r[n];
  for (const n of names) { const k = Object.keys(r).find(x => x.replace(/\s/g, '') === n.replace(/\s/g, '') || x.includes(n)); if (k) return r[k]; }
  return '';
}
/** 保證金比例：接受 "13.50%"、"13.5"、"0.135"。 */
export function rate(v: string): number | null {
  const s = v.replace(/,/g, '').trim(); if (!s) return null;
  const n = Number(s.replace('%', '')); if (!Number.isFinite(n)) return null;
  return s.includes('%') || n > 1 ? n / 100 : n;
}

export type FutQuote = { date: string | null; contract: string; month: string; session: string; open: number | null; high: number | null; low: number | null; last: number | null; change: number | null; volume: number | null; settle: number | null; oi: number | null; bid: number | null; ask: number | null };
export function parseFuturesReport(text: string): FutQuote[] {
  return records(text).map(r => ({
    date: toDate(get(r, ['Date', '交易日期'])), contract: get(r, ['Contract', '契約']).toUpperCase(), month: get(r, ['ContractMonth(Week)', '到期月份(週別)']).replace(/\s/g, ''),
    session: get(r, ['TradingSession', '交易時段']), open: num(get(r, ['Open', '開盤價'])), high: num(get(r, ['High', '最高價'])), low: num(get(r, ['Low', '最低價'])),
    last: num(get(r, ['Last', '收盤價'])), change: num(get(r, ['Change', '漲跌價'])), volume: num(get(r, ['Volume', '成交量'])), settle: num(get(r, ['SettlementPrice', '結算價'])),
    oi: num(get(r, ['OpenInterest', '未沖銷契約數', '未沖銷契約量'])), bid: num(get(r, ['BestBid', '最後最佳買價'])), ask: num(get(r, ['BestAsk', '最後最佳賣價'])),
  })).filter(q => q.contract && q.month && !q.month.includes('/'));
}

export type StockFutMargin = { contract: string; code: string; name: string; group: string; clearing: number | null; maintenance: number | null; initial: number | null; date: string | null };
export function parseStockFuturesMargin(text: string): StockFutMargin[] {
  return records(text).map(r => ({
    contract: get(r, ['Contract', '股票期貨英文代碼', '股票期貨代碼', '契約代碼']).toUpperCase(), code: get(r, ['UnderlyingSecurityCode', '證券代號', '標的證券代號']),
    name: get(r, ['ContractName', '股票期貨中文簡稱', '標的證券簡稱', '中文簡稱']), group: get(r, ['GroupLevel', '級距']),
    clearing: rate(get(r, ['ClearingMarginRate', '結算保證金適用比例', '結算保證金'])), maintenance: rate(get(r, ['MaintenanceMarginRate', '維持保證金適用比例', '維持保證金'])),
    initial: rate(get(r, ['InitialMarginRate', '原始保證金適用比例', '原始保證金'])), date: toDate(get(r, ['Date', '日期'])),
  })).filter(m => m.contract);
}

/** 契約規模（股）：一般股票期貨 2,000 股、小型 100 股、ETF 期貨 10,000 單位。調整型契約依期交所公告，需自行覆寫。 */
export function contractSize(name: string, code: string): number {
  if (/小型/.test(name)) return 100;
  if (/^00/.test(code)) return 10000;
  return 2000;
}
/** 保證金（元／口）＝ 結算價 × 契約規模 × 保證金比例。 */
export const marginAmount = (price: number, size: number, r: number) => price * size * r;
/** 追繳價位：權益降到維持保證金時的期貨價格。多單＝進場價 −（原始 − 維持）÷ 規模；空單相反。 */
export function callPrice(entry: number, size: number, initial: number, maintenance: number, side: 'long' | 'short') {
  const cushion = (initial - maintenance) / size; // 每口可承受的每股價格變動
  return side === 'long' ? entry - cushion : entry + cushion;
}
/** 處置期間期交所調高股票期貨保證金：依處置情形為原級距 1.5、2 或 3 倍。 */
export const DISPOSITION_MULTIPLIERS = [1.5, 2, 3];

export type StockFutRow = {
  contract: string; code: string; name: string; group: string; size: number; month: string | null; months: FutQuote[];
  last: number | null; settle: number | null; price: number | null; change: number | null; volume: number; oi: number; bid: number | null; ask: number | null;
  stock: number | null; basis: number | null; basisPct: number | null; initialRate: number | null; maintRate: number | null; clearingRate: number | null;
  initial: number | null; maintenance: number | null; notional: number | null; leverage: number | null; date: string | null;
};
/** 合併行情、保證金與現股收盤；近月＝一般時段有成交量或未平倉的最早月份。基差＝期貨 − 現股。 */
export function buildStockFutures(quotes: FutQuote[], margins: StockFutMargin[], stockClose: Map<string, number>): StockFutRow[] {
  const byContract = new Map<string, FutQuote[]>();
  for (const q of quotes) { if (q.session && !/一般|Regular|^$/.test(q.session)) continue; const a = byContract.get(q.contract) ?? []; a.push(q); byContract.set(q.contract, a); }
  return margins.map(m => {
    const months = (byContract.get(m.contract) ?? []).sort((a, b) => a.month.localeCompare(b.month));
    const near = months.find(q => (q.volume ?? 0) > 0 || (q.oi ?? 0) > 0) ?? months[0];
    const size = contractSize(m.name, m.code);
    const price = near ? near.settle ?? near.last : null;
    const stock = stockClose.get(m.code) ?? null;
    const initial = price != null && m.initial != null ? marginAmount(price, size, m.initial) : null;
    const maintenance = price != null && m.maintenance != null ? marginAmount(price, size, m.maintenance) : null;
    return {
      contract: m.contract, code: m.code, name: m.name, group: m.group, size, month: near?.month ?? null, months,
      last: near?.last ?? null, settle: near?.settle ?? null, price, change: near?.change ?? null, volume: months.reduce((s, q) => s + (q.volume ?? 0), 0), oi: months.reduce((s, q) => s + (q.oi ?? 0), 0),
      bid: near?.bid ?? null, ask: near?.ask ?? null, stock, basis: price != null && stock != null ? price - stock : null, basisPct: price != null && stock ? price / stock - 1 : null,
      initialRate: m.initial, maintRate: m.maintenance, clearingRate: m.clearing, initial, maintenance, notional: price != null ? price * size : null,
      leverage: m.initial ? 1 / m.initial : null, date: near?.date ?? m.date,
    };
  }).sort((a, b) => b.volume - a.volume || b.oi - a.oi);
}

/** 期交所股票期貨保證金三級距（結算／維持／原始），依期交所「保證金訂定-股票期貨」頁。真實資料以每日公告為準。 */
export const LEVELS: [string, number, number, number][] = [['級距1', 0.10, 0.1035, 0.135], ['級距2', 0.12, 0.1242, 0.162], ['級距3', 0.15, 0.1553, 0.2025]];

// ---------- 示範資料 ----------
/** 由示範股價產生股票期貨：虛構契約代碼（X 開頭）、近兩個月份、依波動度分級距。 */
export function demoStockFutures(ds: Dataset): StockFutRow[] {
  const quotes: FutQuote[] = [], margins: StockFutMargin[] = [], close = new Map<string, number>();
  ds.stocks.forEach((code, i) => {
    const days = ds.days[code], last = days.at(-1)!, c = last.close ?? last.mark; close.set(code, c);
    const rets = days.slice(-60).map((d, k, a) => (k ? (d.close ?? d.mark) / (a[k - 1].close ?? a[k - 1].mark) - 1 : 0)).slice(1);
    const vol = Math.sqrt(rets.reduce((s, x) => s + x * x, 0) / rets.length) * Math.sqrt(252);
    const lv = vol > 0.55 ? LEVELS[2] : vol > 0.35 ? LEVELS[1] : LEVELS[0];
    const add = (contract: string, name: string, scale: number) => {
      margins.push({ contract, code, name, group: lv[0], clearing: lv[1], maintenance: lv[2], initial: lv[3], date: last.date });
      ['202610', '202611'].forEach((m, k) => {
        const basis = ((i % 5) - 2) * 0.001 + k * 0.002, settle = Math.round(c * (1 + basis) * 100) / 100;
        const v = Math.round((last.volume / 1000) * 0.08 * scale / (k ? 6 : 1));
        quotes.push({ date: last.date, contract, month: m, session: '一般', open: settle, high: settle, low: settle, last: settle, change: null, volume: v, settle, oi: v * 3, bid: settle, ask: settle });
      });
    };
    add(`X${code}`, `${ds.names[code]}期貨`, 1);
    if (i % 4 === 0) add(`Y${code}`, `小型${ds.names[code]}期貨`, 0.5);
  });
  return buildStockFutures(quotes, margins, close);
}
