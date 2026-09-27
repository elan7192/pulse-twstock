// 交易計劃引擎：期貨五條線、五線譜、市場溫度計、樂透選擇權、交易醫生（交易日誌診斷與 A+ 檢核）。
// 參考「A+ 交易醫生」公開介紹的概念（盤前五條撐壓線、溫度計、結算日樂透單、交易紀律）自行設計；
// 該廠商的實際公式並未公開，本檔公式皆為公開技術指標（CDP、樞紐點、線性回歸五線譜、市場寬度）並可調整。
import { bs, impliedVol, ncdf, type WType } from './strategy';
import { num, toDate } from './opendata';
import { records } from './futures';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());

/** 日 K：[日期, 開, 高, 低, 收]。 */
export type OHLC = { date: string; open: number; high: number; low: number; close: number };

// ======================= 期貨五條線 =======================

export type LineMethod = 'cdp' | 'pivot' | 'fib';
export type FiveLines = { method: LineMethod; lines: [string, number][]; mid: number; range: number };
export const METHOD_LABEL: Record<LineMethod, string> = { cdp: 'CDP 逆勢操作', pivot: '樞紐點 Pivot', fib: '費波那契樞紐' };
/** 由前一日高低收算五條撐壓線，由上到下：強壓、壓力、中軸、支撐、強撐。 */
export function fiveLines(h: number, l: number, c: number, method: LineMethod = 'cdp'): FiveLines {
  const r = h - l;
  if (method === 'cdp') {
    const m = (h + l + 2 * c) / 4;
    return { method, mid: m, range: r, lines: [['AH 強壓', m + r], ['NH 壓力', 2 * m - l], ['CDP 中軸', m], ['NL 支撐', 2 * m - h], ['AL 強撐', m - r]] };
  }
  const p = (h + l + c) / 3;
  if (method === 'pivot') return { method, mid: p, range: r, lines: [['R2 強壓', p + r], ['R1 壓力', 2 * p - l], ['P 中軸', p], ['S1 支撐', 2 * p - h], ['S2 強撐', p - r]] };
  return { method, mid: p, range: r, lines: [['R2 強壓', p + 0.618 * r], ['R1 壓力', p + 0.382 * r], ['P 中軸', p], ['S1 支撐', p - 0.382 * r], ['S2 強撐', p - 0.618 * r]] };
}

export type Zone = { idx: number; label: string; bias: 'long' | 'short' | 'range' | 'wait'; plan: string };
/** 依價格位於五條線哪一區給出當日劇本。idx：0＝強壓之上 … 5＝強撐之下。 */
export function zoneOf(price: number, fl: FiveLines): Zone {
  const v = fl.lines.map(x => x[1]); const idx = v.filter(x => price < x).length; // 價格高於幾條線
  const n = fl.lines.map(x => x[0].split(' ')[0]);
  const Z: Zone[] = [
    { idx: 0, label: `站上 ${n[0]}`, bias: 'long', plan: `強勢突破：順勢偏多，回測 ${n[0]} 不破可追，跌回 ${n[0]} 之下出場。` },
    { idx: 1, label: `${n[1]}–${n[0]}`, bias: 'wait', plan: `壓力區：${n[0]} 附近不追多、可試空，停損設在 ${n[0]} 之上；站穩 ${n[0]} 翻多。` },
    { idx: 2, label: `${n[2]}–${n[1]}`, bias: 'range', plan: `中軸之上：偏多整理，靠近 ${n[2]} 找多點，${n[1]} 先停利。` },
    { idx: 3, label: `${n[3]}–${n[2]}`, bias: 'range', plan: `中軸之下：偏空整理，靠近 ${n[2]} 找空點，${n[3]} 先停利。` },
    { idx: 4, label: `${n[4]}–${n[3]}`, bias: 'wait', plan: `支撐區：${n[4]} 附近不追空、可試多，停損設在 ${n[4]} 之下；跌破 ${n[4]} 翻空。` },
    { idx: 5, label: `跌破 ${n[4]}`, bias: 'short', plan: `弱勢破底：順勢偏空，反彈 ${n[4]} 不過可空，站回 ${n[4]} 之上出場。` },
  ];
  return Z[idx];
}

export type LineStat = { name: string; touch: number; hold: number; n: number };
/** 回測：用前一日算出的五條線，隔日盤中觸及各線的比例，以及觸及後收盤仍守住（壓力未站上／支撐未跌破）的比例。 */
export function lineStats(bars: OHLC[], method: LineMethod = 'cdp', lookback = 250): LineStat[] {
  const out = [0, 1, 2, 3, 4].map(() => ({ touch: 0, hold: 0 })); let n = 0; let names: string[] = [];
  for (let i = Math.max(1, bars.length - lookback); i < bars.length; i++) {
    const p = bars[i - 1], d = bars[i]; const fl = fiveLines(p.high, p.low, p.close, method); names = fl.lines.map(x => x[0]); n++;
    fl.lines.forEach(([, v], k) => {
      if (d.low <= v && d.high >= v) { out[k].touch++; if (k < 2 ? d.close < v : k > 2 ? d.close > v : true) out[k].hold++; }
    });
  }
  return out.map((o, k) => ({ name: names[k] ?? '', touch: n ? o.touch / n : 0, hold: o.touch ? o.hold / o.touch : 0, n }));
}

// ======================= 五線譜（長線位階） =======================

export type Spectrum = { n: number; slope: number; sd: number; mid: number[]; z: number; last: number; lines: [string, number][]; zone: string };
/** 對收盤價做線性回歸，中線 ±1、±2 個殘差標準差：樂活五線譜的做法。 */
export function spectrum(closes: number[], n = 500): Spectrum | null {
  const y = closes.slice(-n); const m = y.length; if (m < 20) return null;
  const xm = (m - 1) / 2, ym = mean(y);
  let sxy = 0, sxx = 0; y.forEach((v, i) => { sxy += (i - xm) * (v - ym); sxx += (i - xm) ** 2; });
  const slope = sxy / sxx, b = ym - slope * xm;
  const mid = y.map((_, i) => b + slope * i);
  const sd = Math.sqrt(mean(y.map((v, i) => (v - mid[i]) ** 2))) || 1;
  const t = mid[m - 1], last = y[m - 1], z = (last - t) / sd;
  const zone = z >= 2 ? '極樂觀（高於 +2σ）' : z >= 1 ? '樂觀（+1σ～+2σ）' : z > -1 ? '中性（±1σ）' : z > -2 ? '悲觀（−1σ～−2σ）' : '極悲觀（低於 −2σ）';
  return { n: m, slope, sd, mid, z, last, zone, lines: [['+2σ 極樂觀', t + 2 * sd], ['+1σ 樂觀', t + sd], ['趨勢線', t], ['−1σ 悲觀', t - sd], ['−2σ 極悲觀', t - 2 * sd]] };
}

// ======================= 市場溫度計 =======================

/** 市場寬度一日：[日期, 站上 MA20 比例, 站上 MA60 比例, 上漲家數, 下跌家數, 20 日新高家數, 20 日新低家數, 樣本數]。 */
export type BreadthRow = [string, number | null, number | null, number, number, number, number, number];
/** stock rows：[代號, 開, 高, 低, 收, 量]；只取一般上市股票（4 碼、非 0 開頭）。 */
export function breadthSeries(days: { date: string; rows: [string, number | null, number | null, number | null, number | null, number | null][] }[]): BreadthRow[] {
  const hist = new Map<string, number[]>(); const out: BreadthRow[] = [];
  for (const d of days) {
    if (!d.rows.length) continue;
    let a20 = 0, n20 = 0, a60 = 0, n60 = 0, up = 0, dn = 0, nh = 0, nl = 0, n = 0;
    for (const [code, , , , c] of d.rows) {
      if (c == null || !/^[1-9]\d{3}$/.test(code)) continue;
      const h = hist.get(code) ?? []; const prev = h.at(-1);
      if (prev != null) { if (c > prev) up++; else if (c < prev) dn++; }
      if (h.length >= 19) { const w = h.slice(-19); n20++; if (c > (sum(w) + c) / 20) a20++; if (c > Math.max(...w)) nh++; if (c < Math.min(...w)) nl++; }
      if (h.length >= 59) { n60++; if (c > (sum(h.slice(-59)) + c) / 60) a60++; }
      h.push(c); if (h.length > 60) h.shift(); hist.set(code, h); n++;
    }
    out.push([d.date, n20 > 100 ? a20 / n20 : null, n60 > 100 ? a60 / n60 : null, up, dn, nh, nl, n]);
  }
  return out;
}

export type ThermoWeights = { ma20: number; ma60: number; adv: number; nhnl: number; pos: number };
export const THERMO_WEIGHTS: ThermoWeights = { ma20: 0.25, ma60: 0.2, adv: 0.2, nhnl: 0.15, pos: 0.2 };
export type ThermoPoint = { date: string; temp: number | null; parts: Record<keyof ThermoWeights, number | null>; index: number | null };
export const THERMO_ZONES: [number, string, string][] = [[80, '過熱', '追高風險大，多單分批停利、不追價；樂透偏買 Put'], [60, '偏熱', '多方主導，拉回找多，不急著猜頭'], [40, '中性', '區間思維，五條線高空低多'], [20, '偏冷', '空方主導，反彈找空，不急著猜底'], [0, '冰點', '恐慌區，空單分批停利、不追空；樂透偏買 Call']];
export const thermoZone = (t: number) => THERMO_ZONES.find(z => t >= z[0])!;
/** 溫度（0–100）＝各分項 0–1 分數加權平均。位階分數以指數在 250 日五線譜的 z 值換算。 */
export function thermometer(breadth: BreadthRow[], index: OHLC[], w: ThermoWeights = THERMO_WEIGHTS, specN = 250): ThermoPoint[] {
  const idx = new Map(index.map((b, i) => [b.date, i])); const closes = index.map(b => b.close);
  return breadth.map((r, k) => {
    const win = breadth.slice(Math.max(0, k - 4), k + 1); const u = sum(win.map(x => x[3])), d = sum(win.map(x => x[4]));
    const i = idx.get(r[0]); const sp = i != null && i >= 60 ? spectrum(closes.slice(0, i + 1), specN) : null;
    const parts = { ma20: r[1], ma60: r[2], adv: u + d ? u / (u + d) : null, nhnl: r[7] ? clamp(0.5 + (r[5] - r[6]) / r[7] * 2.5) : null, pos: sp ? clamp((sp.z + 2) / 4) : null };
    let s = 0, ws = 0; (Object.keys(w) as (keyof ThermoWeights)[]).forEach(key => { const v = parts[key]; if (v != null && w[key] > 0) { s += v * w[key]; ws += w[key]; } });
    return { date: r[0], temp: ws ? s / ws * 100 : null, parts, index: i != null ? index[i].close : null };
  });
}

// ======================= 台指選擇權（樂透 OP） =======================

export type OptRow = { month: string; strike: number; cp: 'C' | 'P'; close: number | null; settle: number | null; volume: number; oi: number; bid: number | null; ask: number | null };
export type OptChain = { date: string | null; rows: OptRow[] };
/** 期交所 DailyMarketReportOpt（JSON 或 CSV）→ 台指選擇權一般時段。 */
export function parseTxo(text: string, contract = 'TXO'): OptChain {
  let date: string | null = null;
  const rows = records(text).filter(r => (r.Contract ?? r['契約'] ?? '').toUpperCase() === contract && /一般|Regular/i.test(r.TradingSession ?? r['交易時段'] ?? '一般')).map(r => {
    date ??= toDate(r.Date ?? r['交易日期']);
    const cp = String(r.CallPut ?? r['買賣權'] ?? ''); return {
      month: String(r['ContractMonth(Week)'] ?? r['到期月份(週別)'] ?? '').replace(/\s/g, ''), strike: num(r.StrikePrice ?? r['履約價']) ?? 0, cp: (/買|call/i.test(cp) ? 'C' : 'P') as 'C' | 'P',
      close: num(r.Close ?? r['收盤價']), settle: num(r.SettlementPrice ?? r['結算價']), volume: num(r.Volume ?? r['成交量']) ?? 0, oi: num(r.OpenInterest ?? r['未沖銷契約數']) ?? 0, bid: num(r.BestBid ?? r['最後最佳買價']), ask: num(r.BestAsk ?? r['最後最佳賣價']),
    };
  }).filter(r => r.month && r.strike > 0);
  return { date, rows };
}
/** 壓縮格式（網站資料檔用）：[月份, 履約價, C/P, 收盤, 結算, 量, 未平倉, 買, 賣]。 */
export type OptCompact = [string, number, 'C' | 'P', number | null, number | null, number, number, number | null, number | null];
export const packChain = (c: OptChain) => ({ date: c.date, rows: c.rows.map(r => [r.month, r.strike, r.cp, r.close, r.settle, r.volume, r.oi, r.bid, r.ask] as OptCompact) });
export const unpackChain = (p: { date: string | null; rows: OptCompact[] }): OptChain => ({ date: p.date, rows: p.rows.map(([month, strike, cp, close, settle, volume, oi, bid, ask]) => ({ month, strike, cp, close, settle, volume, oi, bid, ask })) });

/** 契約到期日：月選為第三個週三，W n＝當月第 n 個週三，F n＝當月第 n 個週五（未處理休市順延）。 */
export function txoExpiry(month: string): string | null {
  const m = month.match(/^(\d{4})(\d{2})(?:([WF])(\d))?$/); if (!m) return null;
  const [, y, mo, kind, nth] = m; const wd = kind === 'F' ? 5 : 3; const k = nth ? +nth : 3;
  const d = new Date(Date.UTC(+y, +mo - 1, 1)); while (d.getUTCDay() !== wd) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + 7 * (k - 1)); return d.getUTCMonth() === +mo - 1 ? d.toISOString().slice(0, 10) : null;
}
const optPx = (r: OptRow) => r.close ?? (r.bid != null && r.ask != null ? (r.bid + r.ask) / 2 : r.settle);
/** 交易日數（含到期日當天，不含今天；只排除週末）。 */
export function tradingDaysTo(from: string, to: string) { let n = 0; const d = new Date(from + 'T00:00:00Z'), e = new Date(to + 'T00:00:00Z'); while (d < e) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w > 0 && w < 6) n++; } return n; }

export type Series = { month: string; expiry: string; days: number; F: number; atm: number; iv: number | null; rows: OptRow[]; pcOi: number | null };
/** 各到期序列：以買賣權價差最小的履約價反推價平與隱含期貨價（F ≈ K ＋ C − P），並估價平隱波。 */
export function chainSeries(chain: OptChain, today: string): Series[] {
  const by = new Map<string, OptRow[]>(); for (const r of chain.rows) { const a = by.get(r.month) ?? []; a.push(r); by.set(r.month, a); }
  const out: Series[] = [];
  for (const [month, rows] of by) {
    const expiry = txoExpiry(month); if (!expiry || expiry < today) continue;
    const pair = new Map<number, { C?: number; P?: number }>();
    for (const r of rows) { const p = r.settle ?? optPx(r); if (p == null) continue; const o = pair.get(r.strike) ?? {}; o[r.cp] = p; pair.set(r.strike, o); }
    let best: [number, number] | null = null;
    for (const [K, o] of pair) if (o.C != null && o.P != null) { const g = Math.abs(o.C - o.P); if (!best || g < Math.abs((pair.get(best[0])!.C!) - (pair.get(best[0])!.P!))) best = [K, K + o.C - o.P]; }
    if (!best) continue;
    const days = Math.max(1, tradingDaysTo(today, expiry)); const T = days / 252; const atm = best[0], F = best[1];
    const ivs = (['C', 'P'] as const).map(cp => { const p = pair.get(atm)?.[cp]; return p != null ? impliedVol(cp === 'C' ? 'call' : 'put', p, F, atm, T, 0) : null; }).filter((x): x is number => x != null);
    const cOi = sum(rows.filter(r => r.cp === 'C').map(r => r.oi)), pOi = sum(rows.filter(r => r.cp === 'P').map(r => r.oi));
    out.push({ month, expiry, days, F, atm, iv: ivs.length ? mean(ivs) : null, rows, pcOi: cOi ? pOi / cOi : null });
  }
  return out.sort((a, b) => a.expiry.localeCompare(b.expiry) || a.month.localeCompare(b.month));
}

export const TXO_MULT = 50;
export type LottoRule = { maxPrice: number; minDist: number; maxDist: number; budget: number; target: number };
export const LOTTO_RULE: LottoRule = { maxPrice: 10, minDist: 0.01, maxDist: 0.06, budget: 5000, target: 5 };
export type Lotto = OptRow & { price: number; dist: number; distPct: number; breakeven: number; needPct: number; prob: number | null; cost: number; lots: number; scen: { move: number; value: number; mult: number }[]; targetAt: number };
/** 樂透單候選：價外、權利金低於門檻；情境＝到期時指數漲跌 1–5% 的結算價值與倍數。 */
export function lottoList(s: Series, rule: LottoRule = LOTTO_RULE, moves = [0.01, 0.02, 0.03, 0.05]): Lotto[] {
  const iv = s.iv ?? 0.2, T = s.days / 252;
  return s.rows.flatMap(r => {
    const price = optPx(r); if (price == null || price <= 0 || price > rule.maxPrice) return [];
    const dist = r.cp === 'C' ? r.strike - s.F : s.F - r.strike, distPct = dist / s.F;
    if (distPct < rule.minDist || distPct > rule.maxDist) return [];
    const breakeven = r.cp === 'C' ? r.strike + price : r.strike - price;
    const d2 = (Math.log(s.F / r.strike) - iv * iv * T / 2) / (iv * Math.sqrt(T));
    const cost = price * TXO_MULT; const lots = Math.floor(rule.budget / cost);
    const scen = moves.map(m => { const px = s.F * (1 + (r.cp === 'C' ? m : -m)); const value = Math.max(0, r.cp === 'C' ? px - r.strike : r.strike - px); return { move: m, value, mult: value / price }; });
    const targetAt = r.cp === 'C' ? r.strike + price * rule.target : r.strike - price * rule.target;
    return [{ ...r, price, dist, distPct, breakeven, needPct: Math.abs(breakeven / s.F - 1), prob: r.cp === 'C' ? ncdf(d2) : ncdf(-d2), cost, lots, scen, targetAt }];
  }).sort((a, b) => a.cp.localeCompare(b.cp) || a.strike - b.strike);
}

// ======================= 交易醫生 =======================

export type Trade = { date: string; product: string; side: 'long' | 'short'; entry: number; exit: number; qty: number; stop: number | null; grade: string; minutes: number | null; note: string };
export const POINT_VALUE: Record<string, number> = { TX: 200, 大台: 200, MTX: 50, 小台: 50, TMF: 10, 微台: 10, TXO: 50 };
export const pointValue = (p: string) => POINT_VALUE[p.toUpperCase()] ?? POINT_VALUE[p] ?? 200;
export type TradeCalc = Trade & { points: number; pnl: number; risk: number | null; r: number | null };
export function calcTrade(t: Trade, costPerLot = 150): TradeCalc {
  const dir = t.side === 'long' ? 1 : -1; const points = (t.exit - t.entry) * dir; const pv = pointValue(t.product);
  const risk = t.stop != null ? Math.abs(t.entry - t.stop) : null;
  return { ...t, points, pnl: points * pv * t.qty - costPerLot * t.qty, risk, r: risk ? points / risk : null };
}
export type JournalStats = { n: number; wins: number; winRate: number; avgWin: number; avgLoss: number; payoff: number | null; expectancy: number; pf: number | null; total: number; maxDD: number; maxLossStreak: number; stopRate: number; avgR: number | null; kelly: number | null; equity: number[]; days: number; perDay: number };
export function journalStats(list: TradeCalc[]): JournalStats {
  const w = list.filter(t => t.pnl > 0), l = list.filter(t => t.pnl <= 0);
  const gw = sum(w.map(t => t.pnl)), gl = -sum(l.map(t => t.pnl)); const avgWin = w.length ? gw / w.length : 0, avgLoss = l.length ? gl / l.length : 0;
  let eq = 0, peak = 0, dd = 0, streak = 0, maxStreak = 0; const equity: number[] = [];
  for (const t of list) { eq += t.pnl; equity.push(eq); peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); streak = t.pnl <= 0 ? streak + 1 : 0; maxStreak = Math.max(maxStreak, streak); }
  const winRate = list.length ? w.length / list.length : 0, payoff = avgLoss ? avgWin / avgLoss : null;
  const rs = list.map(t => t.r).filter((x): x is number => x != null); const days = new Set(list.map(t => t.date)).size;
  return { n: list.length, wins: w.length, winRate, avgWin, avgLoss, payoff, expectancy: list.length ? (gw - gl) / list.length : 0, pf: gl ? gw / gl : null, total: gw - gl, maxDD: dd, maxLossStreak: maxStreak,
    stopRate: list.length ? list.filter(t => t.stop != null).length / list.length : 0, avgR: rs.length ? mean(rs) : null, kelly: payoff ? winRate - (1 - winRate) / payoff : null, equity, days, perDay: days ? list.length / days : 0 };
}

export type Finding = { level: 'bad' | 'warn' | 'good'; title: string; detail: string; rx: string };
/** 依統計與逐筆行為找出常見交易病症，並給出處方。 */
export function diagnose(list: TradeCalc[], s = journalStats(list)): Finding[] {
  const f: Finding[] = []; if (s.n < 5) return [{ level: 'warn', title: '樣本不足', detail: `目前 ${s.n} 筆，至少 20 筆才有統計意義。`, rx: '先持續記錄，每筆都寫停損與評級。' }];
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  if (s.payoff != null && s.payoff < 1 && s.winRate < 0.6) f.push({ level: 'bad', title: '砍大抱小（賺小賠大）', detail: `賺賠比 ${s.payoff.toFixed(2)}、勝率 ${pct(s.winRate)}：平均虧損大於平均獲利，勝率又不夠高。`, rx: '停損單進場同時掛好；獲利單至少抱到下一條線（五條線）再出。' });
  if (s.expectancy <= 0) f.push({ level: 'bad', title: '期望值為負', detail: `每筆平均 ${Math.round(s.expectancy)} 元（已扣成本）。`, rx: '暫停加碼，只做 A+ 條件的單，縮小口數直到期望值轉正。' });
  if (s.stopRate < 0.8) f.push({ level: 'warn', title: '停損設定不足', detail: `只有 ${pct(s.stopRate)} 的單有記錄停損。`, rx: '下單前先寫停損點與可承受金額，沒有停損就不下單。' });
  const bigR = list.filter(t => t.r != null && t.r < -1.3);
  if (bigR.length) f.push({ level: bigR.length / s.n > 0.1 ? 'bad' : 'warn', title: '停損沒有執行（凹單）', detail: `${bigR.length} 筆虧損超過原訂停損 1.3 倍（最差 ${Math.min(...bigR.map(t => t.r!)).toFixed(1)}R）。`, rx: '用觸價停損單取代心理停損；跳空除外，其餘超過 1R 就是紀律問題。' });
  let revenge = 0; for (let i = 1; i < list.length; i++) if (list[i - 1].pnl < 0 && list[i].date === list[i - 1].date && list[i].qty > list[i - 1].qty) revenge++;
  if (revenge) f.push({ level: 'bad', title: '報復性加碼', detail: `${revenge} 次在同日虧損後立刻放大口數。`, rx: '單日連虧 2 筆或虧損達日上限就收手；下一筆口數不得大於上一筆。' });
  if (s.perDay > 6) f.push({ level: 'warn', title: '過度交易', detail: `平均每日 ${s.perDay.toFixed(1)} 筆。`, rx: '每天只做計劃內的位置（五條線附近），其餘時間觀察。' });
  if (s.maxLossStreak >= 5) f.push({ level: 'warn', title: '連續虧損過長', detail: `最長連虧 ${s.maxLossStreak} 筆。`, rx: '連虧 3 筆強制休息一天，回頭檢查是否逆溫度計方向交易。' });
  const lossMin = mean(list.filter(t => t.pnl <= 0 && t.minutes != null).map(t => t.minutes!)), winMin = mean(list.filter(t => t.pnl > 0 && t.minutes != null).map(t => t.minutes!));
  if (lossMin && winMin && lossMin > winMin * 1.5) f.push({ level: 'warn', title: '虧損單抱太久', detail: `虧損單平均持有 ${lossMin.toFixed(0)} 分鐘，獲利單 ${winMin.toFixed(0)} 分鐘。`, rx: '到停損就走；獲利單用移動停利（跌破前一條線才出）。' });
  const aplus = list.filter(t => t.grade === 'A+'), rest = list.filter(t => t.grade && t.grade !== 'A+');
  if (aplus.length >= 3 && rest.length >= 3) { const a = mean(aplus.map(t => t.pnl)), b = mean(rest.map(t => t.pnl)); if (a > b) f.push({ level: 'good', title: 'A+ 單表現較好', detail: `A+ 平均 ${Math.round(a)} 元／筆，其他 ${Math.round(b)} 元／筆。`, rx: '把資金集中在 A+；B、C 級單減半或放棄。' }); else f.push({ level: 'warn', title: 'A+ 評級沒有優勢', detail: `A+ 平均 ${Math.round(a)} 元／筆，其他 ${Math.round(b)} 元／筆。`, rx: '檢查 A+ 條件是否太寬鬆，或是否評級時已知結果。' }); }
  if (s.expectancy > 0 && s.payoff != null && s.payoff >= 1.5) f.push({ level: 'good', title: '賺賠比健康', detail: `賺賠比 ${s.payoff.toFixed(2)}，期望值 ${Math.round(s.expectancy)} 元／筆。`, rx: '維持紀律；在最大回撤可承受下，可依凱利值的 1/4 調整口數。' });
  return f;
}

export type CheckItem = { key: string; label: string; weight: number; hint: string };
export const APLUS_CHECKS: CheckItem[] = [
  { key: 'trend', label: '順溫度計／五線譜方向', weight: 2, hint: '偏熱只做多、偏冷只做空；中性做區間' },
  { key: 'line', label: '進場點在五條線關鍵位', weight: 2, hint: '支撐附近做多、壓力附近做空，或突破強壓／跌破強撐順勢' },
  { key: 'rr', label: '風報比 ≥ 2', weight: 2, hint: '到下一條線的距離 ≥ 停損距離 2 倍' },
  { key: 'stop', label: '停損已設且在風險上限內', weight: 2, hint: '單筆虧損 ≤ 帳戶 2%' },
  { key: 'mood', label: '非連虧後報復單', weight: 1, hint: '今天沒有連虧 2 筆，也沒有想「賺回來」' },
  { key: 'plan', label: '盤前計劃內的單', weight: 1, hint: '盤前已寫下這個價位與劇本' },
];
export function gradeSetup(checked: Record<string, boolean>, items = APLUS_CHECKS) {
  const total = sum(items.map(i => i.weight)), got = sum(items.filter(i => checked[i.key]).map(i => i.weight));
  const must = ['stop'].every(k => checked[k]); const score = got / total;
  const grade = !must ? 'C' : score >= 0.99 ? 'A+' : score >= 0.8 ? 'A' : score >= 0.6 ? 'B' : 'C';
  const size = grade === 'A+' ? 1 : grade === 'A' ? 0.5 : grade === 'B' ? 0.25 : 0;
  return { grade, score, size, text: grade === 'A+' ? '全部條件成立：可用完整部位' : grade === 'A' ? '主要條件成立：半倉' : grade === 'B' ? '條件不足：1/4 倉或放棄' : !must ? '停損未設或超過風險上限：不下單' : '條件太少：不下單' };
}
/** 部位計算：可承受虧損 ÷（停損點數 × 每點價值）。 */
export function positionSize(capital: number, riskPct: number, stopPts: number, product = 'TX') { const pv = pointValue(product); return stopPts > 0 ? Math.floor(capital * riskPct / (stopPts * pv)) : 0; }

/** CSV／貼上文字：日期,商品,多空,進場,出場,口數,停損,評級,持有分鐘,備註（首列可為欄名）。 */
export function parseTrades(text: string): { trades: Trade[]; errors: string[] } {
  const trades: Trade[] = [], errors: string[] = [];
  text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach((line, i) => {
    const c = line.split(/[,\t]/).map(s => s.trim());
    if (i === 0 && /日期|date/i.test(c[0])) return;
    const date = toDate(c[0]), entry = num(c[3]), exit = num(c[4]), qty = num(c[5]) ?? 1;
    const side = /^(空|空單|short|s|賣|sell)$/i.test(c[2] ?? '') ? 'short' : /^(多|多單|long|b|買|buy)$/i.test(c[2] ?? '') ? 'long' : null;
    if (!date || entry == null || exit == null || !side) { errors.push(`第 ${i + 1} 行無法解析：${line.slice(0, 40)}`); return; }
    trades.push({ date, product: (c[1] || 'TX').toUpperCase(), side, entry, exit, qty, stop: num(c[6]), grade: (c[7] ?? '').toUpperCase(), minutes: num(c[8]), note: c.slice(9).join(' ') });
  });
  return { trades, errors };
}
export const tradesToCsv = (list: Trade[]) => ['日期,商品,多空,進場,出場,口數,停損,評級,持有分鐘,備註', ...list.map(t => [t.date, t.product, t.side === 'long' ? '多' : '空', t.entry, t.exit, t.qty, t.stop ?? '', t.grade, t.minutes ?? '', t.note.replace(/[,\n]/g, ' ')].join(','))].join('\n');

// ======================= 示範資料 =======================

/** 合成加權指數日 K（約 3.5 年），以及對應的市場寬度。 */
export function demoIndex(n = 880, end = '2026-09-25', seed = 7): OHLC[] {
  const r = rng(seed); const dates: string[] = []; const d = new Date(end + 'T00:00:00Z');
  while (dates.length < n) { const w = d.getUTCDay(); if (w > 0 && w < 6) dates.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
  dates.reverse(); let c = 17000; const out: OHLC[] = [];
  for (let i = 0; i < n; i++) {
    const drift = 0.0006 + 0.004 * Math.sin(i / 90); const ret = drift + 0.011 * gauss(r); const o = c * (1 + 0.003 * gauss(r)); c = c * (1 + ret);
    const hi = Math.max(o, c) * (1 + Math.abs(0.004 * gauss(r))), lo = Math.min(o, c) * (1 - Math.abs(0.004 * gauss(r)));
    out.push({ date: dates[i], open: Math.round(o), high: Math.round(hi), low: Math.round(lo), close: Math.round(c) });
  }
  return out;
}
export function demoBreadth(index: OHLC[], n = 170, seed = 11): BreadthRow[] {
  const r = rng(seed); const bars = index.slice(-n - 60); const out: BreadthRow[] = [];
  for (let i = 60; i < bars.length; i++) {
    const ret = bars[i].close / bars[i - 1].close - 1, m20 = bars[i].close / mean(bars.slice(i - 19, i + 1).map(b => b.close)) - 1, m60 = bars[i].close / mean(bars.slice(i - 59, i + 1).map(b => b.close)) - 1;
    const N = 940; const up = Math.round(N * clamp(0.5 + ret * 25 + 0.05 * gauss(r), 0.03, 0.97));
    out.push([bars[i].date, clamp(0.5 + m20 * 9 + 0.04 * gauss(r), 0.02, 0.98), clamp(0.5 + m60 * 6 + 0.04 * gauss(r), 0.02, 0.98), up, N - up - 40, Math.round(N * clamp(0.05 + m20 * 2, 0, 0.3)), Math.round(N * clamp(0.05 - m20 * 2, 0, 0.3)), N]);
  }
  return out;
}
/** 合成台指選擇權：週選（W、F）與月選，以 BS 定價並加上價外權利金溢價（微笑）。 */
export function demoChain(F: number, today = '2026-09-25', seed = 5): OptChain {
  const r = rng(seed); const rows: OptRow[] = [];
  const months = ['202609W5', '202610F1', '202610W1', '202610'].filter(m => (txoExpiry(m) ?? '') >= today);
  for (const m of months) {
    const T = Math.max(1, tradingDaysTo(today, txoExpiry(m)!)) / 252; const step = 100; const atm = Math.round(F / step) * step;
    for (let K = atm - 3000; K <= atm + 3000; K += step) for (const cp of ['C', 'P'] as const) {
      const mny = Math.abs(K / F - 1); const v = 0.17 + mny * 1.6; const p = bs(cp === 'C' ? 'call' : 'put' as WType, F, K, T, 0, v).price;
      const px = p < 0.1 ? null : p < 10 ? Math.round(p * 10) / 10 : p < 50 ? Math.round(p * 2) / 2 : Math.round(p);
      const oi = Math.round(2000 * Math.exp(-mny * 40) * (1 + r()) + (K % 500 === 0 ? 1500 * r() : 0));
      rows.push({ month: m, strike: K, cp, close: px, settle: px, volume: Math.round(oi * (0.5 + r())), oi, bid: px != null ? Math.max(0.1, px - (px < 10 ? 0.1 : 1)) : null, ask: px != null ? px + (px < 10 ? 0.1 : 1) : null });
    }
  }
  return { date: today, rows };
}
export function demoTrades(seed = 3): Trade[] {
  const lostPrev = (t: Trade) => (t.exit - t.entry) * (t.side === 'long' ? 1 : -1) < 0;
  const r = rng(seed); const out: Trade[] = []; const d = new Date('2026-08-03T00:00:00Z'); let px = 46000;
  for (let k = 0; k < 40; k++) {
    const nPer = 1 + Math.floor(r() * 3);
    for (let j = 0; j < nPer; j++) {
      const side = r() < 0.55 ? 'long' : 'short'; const stopPts = 30 + Math.round(r() * 40); const grade = r() < 0.3 ? 'A+' : r() < 0.6 ? 'A' : r() < 0.85 ? 'B' : 'C';
      const edge = grade === 'A+' ? 0.62 : grade === 'A' ? 0.5 : 0.4; const win = r() < edge; const hold = r() < 0.12 && !win; // 凹單
      const pts = win ? stopPts * (0.6 + r() * 2.2) : -stopPts * (hold ? 1.6 + r() * 1.5 : 0.7 + r() * 0.35);
      const dir = side === 'long' ? 1 : -1; const entry = Math.round(px + (r() - 0.5) * 200);
      out.push({ date: d.toISOString().slice(0, 10), product: r() < 0.7 ? 'MTX' : 'TX', side, entry, exit: Math.round(entry + dir * pts), qty: 1 + Math.floor(r() * 2) + (j > 0 && lostPrev(out.at(-1)!) && r() < 0.4 ? 2 : 0), stop: r() < 0.85 ? entry - dir * stopPts : null, grade, minutes: Math.round(win ? 10 + r() * 60 : 15 + r() * (hold ? 180 : 40)), note: '' });
      px += (r() - 0.48) * 250;
    }
    do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  }
  return out;
}
