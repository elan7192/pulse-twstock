// 策略工具引擎：處置股、權證、可轉債、地板天花板、融券回補、連動股。
// 規則依公開資料與權證小哥公開教學整理後自行實作；門檻皆可調，並非廠商程式。
import { type Dataset, type DayStat, rangeStat, profileBrokers, demoBrokers, roundTick, LOT } from './branch';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const std = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 11);
const closeOf = (d: DayStat) => d.close ?? d.mark;

export function ma(days: DayStat[], i: number, n: number): number | null {
  if (i + 1 < n) return null;
  return mean(days.slice(i - n + 1, i + 1).map(closeOf));
}
export function addBusinessDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z'); let k = 0;
  while (k < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w > 0 && w < 6) k++; }
  return d.toISOString().slice(0, 10);
}

// ======================= 處置股 =======================

export type DispoRule = { cumDays: number; cumPct: number; altPct: number; altDiff: number; streak: number; in10: number; in30: number; days: number; limit: number };
/** 預設值：注意股第一款（6 日累積漲跌幅）簡化版；處置天數採 2026/8/10 新制 5 個營業日。 */
export const DISPO_RULE: DispoRule = { cumDays: 6, cumPct: 0.32, altPct: 0.25, altDiff: 50, streak: 3, in10: 6, in30: 12, days: 5, limit: 0.1 };

export type NoticeInfo = { hit: boolean; cum: number; diff: number; base: number };
export function noticeAt(days: DayStat[], i: number, rule = DISPO_RULE): NoticeInfo {
  if (i < rule.cumDays) return { hit: false, cum: 0, diff: 0, base: 0 };
  const base = closeOf(days[i - rule.cumDays]), c = closeOf(days[i]);
  const cum = c / base - 1, diff = c - base;
  return { hit: Math.abs(cum) > rule.cumPct || (Math.abs(cum) > rule.altPct && Math.abs(diff) >= rule.altDiff), cum, diff, base };
}

export type DispoEvent = { code: string; trigger: number; start: number; end: number; level: 1 | 2; reason: string; startDate: string; endDate: string; releaseDate: string };
export type Timeline = { notice: boolean[]; streak: number[]; disposed: (DispoEvent | null)[]; events: DispoEvent[] };

export function dispositionTimeline(code: string, days: DayStat[], rule = DISPO_RULE): Timeline {
  const notice: boolean[] = [], streak: number[] = [], disposed: (DispoEvent | null)[] = days.map(() => null);
  const events: DispoEvent[] = [];
  let run = 0, from = 0;
  for (let i = 0; i < days.length; i++) {
    const hit = noticeAt(days, i, rule).hit;
    notice.push(hit); run = hit ? run + 1 : 0; streak.push(run);
    if (disposed[i]) continue;
    const c10 = notice.slice(Math.max(from, i - 9)).filter(Boolean).length, c30 = notice.slice(Math.max(from, i - 29)).filter(Boolean).length;
    const reason = run >= rule.streak ? `連續 ${rule.streak} 日注意` : c10 >= rule.in10 ? `10 日內 ${rule.in10} 次注意` : c30 >= rule.in30 ? `30 日內 ${rule.in30} 次注意` : '';
    if (!hit || !reason) continue;
    const prev = events.at(-1);
    const level: 1 | 2 = prev && i - prev.end <= 30 ? 2 : 1;
    const start = i + 1, end = i + rule.days;
    const startDate = days[start]?.date ?? addBusinessDays(days[i].date, 1);
    const endDate = days[end]?.date ?? addBusinessDays(days[i].date, rule.days);
    const ev: DispoEvent = { code, trigger: i, start, end, level, reason, startDate, endDate, releaseDate: days[end + 1]?.date ?? addBusinessDays(endDate, 1) };
    events.push(ev);
    for (let k = start; k <= end && k < days.length; k++) disposed[k] = ev;
    run = 0; from = i + 1; // 處置後重新計算注意次數
  }
  return { notice, streak, disposed, events };
}

export type Light = 'red' | 'amber' | 'yellow' | 'green';
export type Forecast = { code: string; light: Light; streak: number; cum: number; upAt: number | null; downAt: number | null; limitUp: number; limitDown: number; label: string };
/** 明日處置預測：以明日收盤是否仍符合第一款計算「觸發價」；跌停仍觸發者標為必關。 */
export function forecast(code: string, days: DayStat[], tl: Timeline, rule = DISPO_RULE): Forecast {
  const L = days.length - 1, c = closeOf(days[L]);
  const limitUp = roundTick(c * (1 + rule.limit)), limitDown = roundTick(c * (1 - rule.limit));
  const base: DispoEvent | null = tl.disposed[L];
  const s = tl.streak[L], cum = noticeAt(days, L, rule).cum;
  if (base || L < rule.cumDays - 1) return { code, light: 'green', streak: s, cum, upAt: null, downAt: null, limitUp, limitDown, label: base ? '處置中' : '資料不足' };
  const B = closeOf(days[L + 1 - rule.cumDays]);
  const upAt = Math.min(B * (1 + rule.cumPct), Math.max(B * (1 + rule.altPct), B + rule.altDiff));
  const downAt = Math.max(B * (1 - rule.cumPct), Math.min(B * (1 - rule.altPct), B - rule.altDiff));
  const c10 = tl.notice.slice(Math.max(0, L - 8)).filter(Boolean).length, c30 = tl.notice.slice(Math.max(0, L - 28)).filter(Boolean).length;
  const nextTriggers = s + 1 >= rule.streak || c10 + 1 >= rule.in10 || c30 + 1 >= rule.in30;
  const always = limitDown > upAt || limitUp < downAt;
  const possible = limitUp > upAt || limitDown < downAt;
  let light: Light = 'green', label = '明日不會注意';
  if (nextTriggers && always) { light = 'red'; label = '必關：跌停仍觸發'; }
  else if (nextTriggers && possible) { light = 'amber'; label = '明日收盤過觸發價即處置'; }
  else if (s > 0 || possible) { light = 'yellow'; label = s > 0 ? `已連續 ${s} 日注意` : '明日可能列注意'; }
  return { code, light, streak: s, cum, upAt: possible || always ? upAt : null, downAt: limitDown < downAt ? downAt : null, limitUp, limitDown, label };
}

export type ThreeCheck = { ma20Up: boolean; mainOk: boolean; concOk: boolean; ma20: number | null; main5: number; conc5: number | null; conc10: number | null; pass: boolean };
/** 權證小哥處置股三條件：月線向上、主力未出貨、5/10 日籌碼集中度為正。 */
export function threeCheck(days: DayStat[], i: number): ThreeCheck {
  const m = ma(days, i, 20), m5 = ma(days, i - 5, 20);
  const main5 = sum(days.slice(Math.max(0, i - 4), i + 1).map(d => d.mainNet));
  const conc = (n: number) => (i + 1 >= n ? rangeStat(days.slice(i - n + 1, i + 1)).concentration : null);
  const conc5 = conc(5), conc10 = conc(10);
  const ma20Up = m != null && m5 != null && m > m5, mainOk = main5 >= 0, concOk = (conc5 ?? -1) > 0 && (conc10 ?? -1) > 0;
  return { ma20Up, mainOk, concOk, ma20: m, main5, conc5, conc10, pass: ma20Up && mainOk && concOk };
}

export type DispoStat = { event: DispoEvent; during: number; releaseGap: number | null; releaseOC: number | null; releaseRet: number | null; after5: number | null; check: ThreeCheck };
export function dispositionStats(ds: Dataset, rule = DISPO_RULE): DispoStat[] {
  const out: DispoStat[] = [];
  for (const code of ds.stocks) {
    const days = ds.days[code]; const tl = dispositionTimeline(code, days, rule);
    for (const ev of tl.events) {
      if (ev.start >= days.length) continue;
      const pre = closeOf(days[ev.start - 1]), endI = Math.min(ev.end, days.length - 1), rel = days[ev.end + 1];
      out.push({
        event: ev, during: closeOf(days[endI]) / pre - 1,
        releaseGap: rel?.open != null ? rel.open / closeOf(days[ev.end]) - 1 : null,
        releaseOC: rel?.open != null ? closeOf(rel) / rel.open - 1 : null,
        releaseRet: rel ? closeOf(rel) / closeOf(days[ev.end]) - 1 : null,
        after5: days[ev.end + 5] ? closeOf(days[ev.end + 5]) / closeOf(days[ev.end]) - 1 : null,
        check: threeCheck(days, ev.trigger),
      });
    }
  }
  return out.sort((a, b) => b.event.startDate.localeCompare(a.event.startDate));
}

/** 雙刀連動：近 N 日日報酬相關係數。 */
export function correlations(ds: Dataset, code: string, n = 60) {
  const ret = (c: string) => { const d = ds.days[c].slice(-n - 1); return d.slice(1).map((x, i) => closeOf(x) / closeOf(d[i]) - 1); };
  const a = ret(code), ma0 = mean(a), sa = std(a);
  return ds.stocks.filter(c => c !== code).map(c => {
    const b = ret(c), mb = mean(b), sb = std(b);
    const k = Math.min(a.length, b.length);
    const cov = mean(Array.from({ length: k }, (_, i) => (a[i] - ma0) * (b[i] - mb)));
    return { code: c, corr: sa && sb ? cov / (sa * sb) : 0 };
  }).sort((x, y) => y.corr - x.corr);
}

// ======================= 權證 =======================

function erf(x: number) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
export const ncdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
const npdf = (x: number) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
export type WType = 'call' | 'put';
/** Black-Scholes 每股理論價、Delta、每日 Theta（每股、元）。T 以年計。 */
export function bs(type: WType, S: number, K: number, T: number, r: number, v: number) {
  const sq = Math.sqrt(T), d1 = (Math.log(S / K) + (r + v * v / 2) * T) / (v * sq), d2 = d1 - v * sq;
  const price = type === 'call' ? S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2) : K * Math.exp(-r * T) * ncdf(-d2) - S * ncdf(-d1);
  const delta = type === 'call' ? ncdf(d1) : ncdf(d1) - 1;
  const thetaY = -S * npdf(d1) * v / (2 * sq) + (type === 'call' ? -r * K * Math.exp(-r * T) * ncdf(d2) : r * K * Math.exp(-r * T) * ncdf(-d2));
  return { price, delta, theta: thetaY / 365 };
}
/** 隱含波動率（二分法）；價格低於內含價值時回傳 null。 */
export function impliedVol(type: WType, price: number, S: number, K: number, T: number, r: number): number | null {
  let lo = 0.01, hi = 3;
  if (bs(type, S, K, T, r, lo).price > price || bs(type, S, K, T, r, hi).price < price) return null;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (bs(type, S, K, T, r, mid).price > price) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
export function warrantTick(p: number) { return p < 5 ? 0.01 : p < 10 ? 0.05 : p < 50 ? 0.1 : p < 100 ? 0.5 : 1; }

export type Warrant = { id: string; name: string; code: string; type: WType; K: number; ratio: number; daysLeft: number; bid: number; ask: number; issuer: string; bivHist: number[]; outstanding: number };
export type WarrantEval = Warrant & {
  S: number; spread: number; biv: number | null; bivStd: number | null; bivTrend: number | null; delta: number; leverage: number; thetaPct: number; premium: number; moneyness: number; score: number; flags: string[];
};
export type WarrantRule = { minDays: number; maxSpread: number; maxOtm: number; minLeverage: number; maxBivStd: number };
export const WARRANT_RULE: WarrantRule = { minDays: 60, maxSpread: 0.02, maxOtm: 0.15, minLeverage: 3, maxBivStd: 0.02 };

export function evalWarrant(w: Warrant, S: number, r = 0.015, rule = WARRANT_RULE): WarrantEval {
  const T = w.daysLeft / 365;
  const biv = impliedVol(w.type, w.bid / w.ratio, S, w.K, T, r);
  const g = bs(w.type, S, w.K, T, r, biv ?? 0.4);
  const spread = (w.ask - w.bid) / w.bid;
  const leverage = Math.abs(g.delta) * S * w.ratio / w.ask;
  const thetaPct = g.theta * w.ratio / w.bid;
  const premium = w.type === 'call' ? (w.K + w.ask / w.ratio) / S - 1 : 1 - (w.K - w.ask / w.ratio) / S;
  const moneyness = w.type === 'call' ? S / w.K - 1 : w.K / S - 1;
  const bivStd = w.bivHist.length > 2 ? std(w.bivHist) : null;
  const bivTrend = w.bivHist.length > 2 ? w.bivHist.at(-1)! - w.bivHist[0] : null;
  const flags: string[] = [];
  if (w.daysLeft < rule.minDays) flags.push('天數短');
  if (spread > rule.maxSpread) flags.push('價差大');
  if (-moneyness > rule.maxOtm) flags.push('深度價外');
  if (leverage < rule.minLeverage) flags.push('槓桿低');
  if (bivStd != null && bivStd > rule.maxBivStd) flags.push('隱波不穩');
  if (bivTrend != null && bivTrend < -0.03) flags.push('隱波調降');
  // 分數：6 原則加權（價差比、隱波穩定、槓桿、Theta、溢價比、天數），越高越好
  const score = Math.max(0, 100 - spread * 1500 - (bivStd ?? 0) * 800 - Math.max(0, -(bivTrend ?? 0)) * 400 + Math.min(leverage, 12) * 2 + thetaPct * 800 - Math.max(0, premium) * 60 - (w.daysLeft < rule.minDays ? 20 : 0));
  return { ...w, S, spread, biv, bivStd, bivTrend, delta: g.delta, leverage, thetaPct, premium, moneyness, score, flags };
}

const ISSUERS = ['甲山權證', '北辰權證', '海峰權證', '雲台權證', '松濤權證'];
export function demoWarrants(ds: Dataset): Warrant[] {
  const out: Warrant[] = [];
  for (const code of ds.stocks) {
    const r = rng(hash('w' + code)), S = closeOf(ds.days[code].at(-1)!);
    for (let k = 0; k < 8; k++) {
      const type: WType = k < 6 ? 'call' : 'put';
      const issuerIdx = Math.floor(r() * ISSUERS.length);
      const K = roundTick(S * (type === 'call' ? 0.92 + r() * 0.35 : 0.75 + r() * 0.3));
      const daysLeft = 25 + Math.floor(r() * 200);
      const baseIv = 0.32 + issuerIdx * 0.03 + r() * 0.08;
      const per = bs(type, S, K, daysLeft / 365, 0.015, baseIv).price;
      const ratio = Math.max(0.01, Math.round((0.6 + r() * 2.2) / per * 1000) / 1000);
      let bid = per * ratio; const tk = warrantTick(bid); bid = Math.max(tk, Math.floor(bid / tk) * tk);
      const spreadTicks = issuerIdx === 4 ? 3 + Math.floor(r() * 4) : 1 + Math.floor(r() * 2);
      const cutter = issuerIdx === 3; // 示範：會逐步調降隱波的發行商
      const bivHist = Array.from({ length: 10 }, (_, i) => baseIv + (cutter ? (9 - i) * 0.006 : (r() - 0.5) * 0.01));
      out.push({ id: `${code.slice(0, 2)}${String(700 + k + (hash(code) & 0xff)).padStart(4, '0')}`, name: `${ds.names[code]}${ISSUERS[issuerIdx].slice(0, 2)}${String(k + 1).padStart(2, '0')}${type === 'call' ? '購' : '售'}`, code, type, K, ratio, daysLeft, bid: Math.round(bid * 100) / 100, ask: Math.round((bid + spreadTicks * warrantTick(bid)) * 100) / 100, issuer: ISSUERS[issuerIdx], bivHist, outstanding: Math.round(r() * 60) / 100 });
    }
  }
  return out;
}

export type WarrantFlow = { code: string; date: string; broker: string; buyAmt: number; sellAmt: number; issuer: boolean };
/** 合成權證分點流量：隔日沖與波段型分點在買超現股時同步收購認購權證，發行商自營賣出。 */
export function demoWarrantFlows(ds: Dataset, code: string, i: number): WarrantFlow[] {
  const d = ds.days[code][i]; const r = rng(hash(code + d.date));
  const persona = new Map(demoBrokers().map(b => [b.id, b.persona]));
  const out: WarrantFlow[] = [];
  for (const f of d.topBuy.slice(0, 8)) {
    const p = persona.get(f.broker);
    if ((p === 'flip' || p === 'swing') && r() < 0.8) out.push({ code, date: d.date, broker: f.broker, buyAmt: Math.round(f.net * d.vwap * (0.03 + r() * 0.04)), sellAmt: 0, issuer: false });
  }
  const retail = demoBrokers().filter(b => b.persona === 'retail');
  for (let k = 0; k < 4; k++) { const b = retail[Math.floor(r() * retail.length)]; const a = Math.round(d.volume * d.vwap * 0.0004 * r()); out.push({ code, date: d.date, broker: b.id, buyAmt: a, sellAmt: Math.round(a * r() * 0.8), issuer: false }); }
  const net = sum(out.map(o => o.buyAmt - o.sellAmt));
  out.push({ code, date: d.date, broker: 'ISSUER', buyAmt: 0, sellAmt: Math.max(0, net), issuer: true });
  return out;
}

export type RadarRow = { code: string; name: string; total: number; issuerShare: number; top: string | null; topShare: number; style: string; signal: boolean; nextSell: number | null };
/** 主力收購權證評估：單一分點佔權證買超金額 ≥ 80%、自營賣出比 ≥ 15% 視為主力信號；並檢查次日現股賣超。 */
export function warrantRadar(ds: Dataset, i: number, profiles: Map<string, { style: string }>): RadarRow[] {
  const rows: RadarRow[] = [];
  for (const code of ds.stocks) {
    const days = ds.days[code]; const idx = Math.min(i, days.length - 1);
    const flows = demoWarrantFlows(ds, code, idx).filter(f => !f.issuer);
    const nets = flows.map(f => ({ b: f.broker, n: f.buyAmt - f.sellAmt })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    const total = sum(nets.map(x => x.n)); const turnover = sum(flows.map(f => f.buyAmt + f.sellAmt));
    const issuerSell = sum(demoWarrantFlows(ds, code, idx).filter(f => f.issuer).map(f => f.sellAmt));
    const top = nets[0]?.b ?? null, topShare = total && nets[0] ? nets[0].n / total : 0;
    const issuerShare = turnover ? issuerSell / (turnover + issuerSell) : 0;
    const next = days[idx + 1];
    rows.push({ code, name: ds.names[code], total, issuerShare, top, topShare, style: top ? profiles.get(top)?.style ?? 'mixed' : '—', signal: topShare >= 0.8 && issuerShare >= 0.15 && total > 0, nextSell: next && top ? next.byBroker.get(top)?.net ?? 0 : null });
  }
  return rows.sort((a, b) => Number(b.signal) - Number(a.signal) || b.total - a.total);
}

// ======================= 可轉債 =======================
// CBAS 拆解依公開交易實例驗證：權利金／張 ＝ (CB 價 − 100 ＋ 百元報價) × 1000；
// 履約收回／張 ＝ (CB 賣價 − 履約參考價) × 1000；履約參考價 ≈ 純債價值 ＝ 賣回（或到期）價 ÷ (1 ＋ 資產交換利率)^剩餘年數。

export type CBDay = { date: string; price: number; volume: number; converted: number; S: number };
export type CB = {
  id: string; code: string; name: string; convPrice: number; rating: number; secured: boolean; issueDate: string;
  putDate: string | null; putPrice: number; maturity: string; redeem: number; issuedAmt: number; history: CBDay[];
};
export type Stage = '幼年期' | '中年期' | '老年期';
export type CBEval = CB & {
  S: number; price: number; change: number | null; convValue: number; premium: number; arbitrage: number; sharesPerLot: number; main5: number;
  years: number; exitPrice: number; bondValue: number; quote: number; cbasPerLot: number; leverage: number; ytp: number | null;
  ageMonths: number; stage: Stage; vol: number; vol5: number; week: number; convertedDelta: number;
  zheng: { band: boolean; weekVol: boolean; dayVol: boolean; pass: boolean; volSpike: boolean; convRise: boolean; converge: boolean; old: boolean; oneYear: boolean };
};
const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 86400000);
/** 純債價值（履約參考價）：以賣回日（無則到期日）的償還價折現。 */
export function bondValue(exitPrice: number, years: number, rate: number) { return exitPrice / Math.pow(1 + rate, Math.max(0, years)); }
/** 由 CB 價與純債價值得到 CBAS 百元報價、每張權利金與槓桿。 */
export function cbasSplit(price: number, bond: number) {
  const quote = 100 - bond, perLot = (price - 100 + quote) * 1000;
  return { quote, perLot, leverage: perLot > 0 ? price * 1000 / perLot : Infinity };
}
/** CBAS 買進後履約（或賣出）損益。 */
export function cbasTrade(buyPrice: number, buyQuote: number, sellPrice: number, sellRef: number, lots = 1) {
  const invest = (buyPrice - 100 + buyQuote) * 1000 * lots, back = Math.max(0, sellPrice - sellRef) * 1000 * lots;
  return { invest, back, profit: back - invest, ret: invest > 0 ? back / invest - 1 : null };
}
export type StageRule = { young: number; old: number };
/** 鄭大說法：120 元以下幼年期、約 130 元中年期、150 元以上老年期（應停利）。門檻可調。 */
export const STAGE_RULE: StageRule = { young: 120, old: 150 };
export function stageOf(price: number, rule: StageRule = STAGE_RULE): Stage { return price >= rule.old ? '老年期' : price >= rule.young ? '中年期' : '幼年期'; }
const STAGE_RANK: Record<Stage, number> = { 幼年期: 0, 中年期: 1, 老年期: 2 };
export const STAGE_GUIDE: Record<Stage, { trait: string; action: string }> = {
  幼年期: { trait: '價格接近債券底價，債性強：股價下跌時 CB 跌幅有限，股價上漲時 CB 跟漲也較慢。CBAS 權利金小、槓桿大。', action: '觀察主力是否進場（105–120 元、量增）；發行約一年、有題材者優先。風險報酬比最好的階段。' },
  中年期: { trait: '股性增加：CB 開始跟著股價走，溢價率逐步收斂，下檔保護變薄。', action: '續抱、移動停利；留意溢價收斂、轉換比例上升與量能變化。' },
  老年期: { trait: '溢價接近 0，CB 幾乎等於轉換價值，與股價同漲同跌，失去債券保護；持有人開始轉換賣股。', action: '分批停利；量暴增、轉換比例增加、溢價收斂時減碼。不宜新進場。' },
};
export type LifeInfo = {
  stage: Stage; prevStage: Stage | null; since: string; daysInStage: number; move: 'up' | 'down' | null; elasticity: number; downside: number;
  timeline: Stage[]; action: string;
};
/** 生命週期資訊：股性（CB 對股價的彈性）、跌到純債價值的下檔空間、進入目前階段的日期與升降級。 */
export function lifeInfo(e: CBEval, rule: StageRule = STAGE_RULE, sigma = 0.4): LifeInfo {
  const timeline = e.history.map(d => stageOf(d.price, rule));
  const stage = timeline.at(-1)!;
  let k = timeline.length - 1; while (k > 0 && timeline[k - 1] === stage) k--;
  const prevStage = k > 0 ? timeline[k - 1] : null;
  const T = Math.max(0.05, e.years);
  const g = bs('call', e.S, e.convPrice, T, 0.015, sigma);
  const elasticity = Math.min(1.2, (100 / e.convPrice) * g.delta * e.S / e.price);
  const downside = Math.min(0, e.bondValue / e.price - 1);
  const move = prevStage ? (STAGE_RANK[stage] > STAGE_RANK[prevStage] ? 'up' : 'down') : null;
  return { stage, prevStage, since: e.history[k].date, daysInStage: timeline.length - k, move, elasticity, downside, timeline, action: STAGE_GUIDE[stage].action };
}

export function evalCB(cb: CB, rate = 0.025, cost = 0.004, main5 = 0, stageRule: StageRule = STAGE_RULE): CBEval {
  const h = cb.history, d = h.at(-1)!, prev = h.at(-2), asOf = d.date;
  const convValue = 100 * d.S / cb.convPrice;
  const years = Math.max(0, yearsBetween(asOf, cb.putDate && cb.putDate > asOf ? cb.putDate : cb.maturity));
  const exitPrice = cb.putDate && cb.putDate > asOf ? cb.putPrice : cb.redeem;
  const bond = bondValue(exitPrice, years, rate);
  const split = cbasSplit(d.price, bond);
  const vol5 = mean(h.slice(-6, -1).map(x => x.volume)), week = sum(h.slice(-5).map(x => x.volume));
  const convertedDelta = d.converted - (h.at(-6)?.converted ?? d.converted);
  const ageMonths = yearsBetween(cb.issueDate, asOf) * 12;
  const premium = d.price / convValue - 1;
  const band = d.price >= 105 && d.price <= 120, weekVol = week > 300, dayVol = d.volume > vol5;
  return {
    ...cb, S: d.S, price: d.price, change: prev ? d.price / prev.price - 1 : null, convValue, premium, arbitrage: convValue / d.price - 1 - cost,
    sharesPerLot: 100000 / cb.convPrice, main5, years, exitPrice, bondValue: bond, quote: split.quote, cbasPerLot: split.perLot, leverage: split.leverage,
    ytp: years > 0.05 ? Math.pow(exitPrice / d.price, 1 / years) - 1 : null, ageMonths, stage: stageOf(d.price, stageRule), vol: d.volume, vol5, week, convertedDelta,
    zheng: { band, weekVol, dayVol, pass: band && weekVol && dayVol, volSpike: vol5 > 0 && d.volume >= vol5 * 3, convRise: convertedDelta >= 0.01, converge: premium < 0.03, old: d.price >= stageRule.old, oneYear: ageMonths >= 9 && ageMonths <= 15 },
  };
}
/** 情境：持有 m 個月後以 exit 價格履約的報酬（到時履約參考價依剩餘年數上升）。 */
export function cbasScenario(e: CBEval, rate: number, months: number[], exits: number[]) {
  return months.map(m => ({ months: m, ref: bondValue(e.exitPrice, e.years - m / 12, rate), rows: exits.map(x => cbasTrade(e.price, e.quote, x, bondValue(e.exitPrice, e.years - m / 12, rate))) }));
}
/** 靜態套利：買 N 張 CB（面額 10 萬）轉換，同時融券放空對應股數。 */
export function cbArbitrage(e: { sharesPerLot: number; price: number; S: number }, lots: number, feeRate = 0.001425, taxRate = 0.003) {
  const shares = Math.floor(e.sharesPerLot * lots);
  const shortLots = Math.floor(shares / LOT), oddShares = shares - shortLots * LOT;
  const buyCost = e.price * 1000 * lots * (1 + feeRate);
  const shortProceeds = shortLots * LOT * e.S * (1 - feeRate - taxRate - 0.0008);
  const oddValue = oddShares * e.S * (1 - feeRate - taxRate);
  return { shares, shortLots, oddShares, buyCost, shortProceeds, profit: shortProceeds + oddValue - buyCost };
}
/** 合成可轉債：以「純債價值 + 轉換權（Black-Scholes）」定價，歷史跟隨示範股價。 */
export function demoCBs(ds: Dataset): CB[] {
  const out: CB[] = [];
  const asOf = ds.dates.at(-1)!;
  ds.stocks.forEach((code, i) => {
    const r = rng(hash('cb2' + code)); const days = ds.days[code];
    const count = code.startsWith('P') ? 1 : i % 3 === 0 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const S0 = closeOf(days[days.length - 61]);
      const ageM = [1, 5, 11, 20, 30, 40][Math.floor(r() * 6)] + Math.floor(r() * 3);
      const issue = new Date(Date.parse(asOf) - ageM * 30.4 * 86400000).toISOString().slice(0, 10);
      const convPrice = roundTick(S0 * (0.72 + r() * 0.6));
      const tenor = Math.max(3 + Math.floor(r() * 3), Math.ceil(ageM / 12 + 0.4));
      const maturity = new Date(Date.parse(issue) + tenor * 365.25 * 86400000).toISOString().slice(0, 10);
      const putYear = tenor - 1 - Math.floor(r() * 2);
      const putDate = r() < 0.7 && putYear * 12 > ageM + 2 ? new Date(Date.parse(issue) + putYear * 365.25 * 86400000).toISOString().slice(0, 10) : null;
      const putPrice = 100 + Math.round(r() * 3 * 4) / 4, redeem = 100;
      const rating = 2 + Math.floor(r() * 7), secured = r() < 0.3, sigma = 0.3 + r() * 0.2;
      const spread = 0.012 + rating * 0.002 - (secured ? 0.005 : 0);
      const main = r() < 0.25; // 示範：近期有人買賣的活躍 CB
      let converted = Math.round(r() * 40) / 100, baseVol = 20 + Math.floor(r() * 120);
      const history: CBDay[] = days.slice(-60).map((d, j) => {
        const S = closeOf(d), T = Math.max(0.05, yearsBetween(d.date, putDate && putDate > d.date ? putDate : maturity));
        const bond = bondValue(putDate && putDate > d.date ? putPrice : redeem, T, spread);
        const conv = (100 / convPrice) * bs('call', S, convPrice, T, 0.015, sigma).price;
        let price = Math.max(bond + conv, 100 * S / convPrice) * (1 + (r() - 0.5) * 0.006);
        if (i === 6 && k === 0) price = 100 * S / convPrice * 0.983; // 示範：靜態套利空間
        price = Math.round(price * 20) / 20;
        if (100 * S / convPrice > 115 && r() < 0.5) converted = Math.min(0.95, converted + r() * 0.012);
        const volume = Math.round(baseVol * (0.5 + r()) * (main && j >= 55 ? 2.5 + r() * 2 : 1));
        return { date: d.date, price, volume, converted: Math.round(converted * 1000) / 1000, S };
      });
      if (main) baseVol *= 3;
      out.push({ id: `${code}${k + 1 + (i % 4)}`, code, name: `${ds.names[code]}${['一', '二', '三', '四', '五', '六'][(k + i) % 6]}`, convPrice, rating, secured, issueDate: issue, putDate, putPrice, maturity, redeem, issuedAmt: Math.round((3 + r() * 27) * 10) / 10, history });
    }
  });
  return out;
}

// ======================= 地板天花板 =======================

const quantile = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); const p = (s.length - 1) * q, lo = Math.floor(p); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (p - lo); };
export type Band = { date: string; close: number; ma20: number | null; floor: number | null; ceil: number | null; volRatio: number | null; signal: 'floor' | 'ceil' | null };
/** 以 20 日均線乖離率的歷史分位數（預設 5% / 95%，回看 120 日）畫出地板、天花板。 */
export function bands(days: DayStat[], q = 0.05, lookback = 120, volMult = 2): Band[] {
  const bias: (number | null)[] = days.map((d, i) => { const m = ma(days, i, 20); return m ? closeOf(d) / m - 1 : null; });
  return days.map((d, i) => {
    const m = ma(days, i, 20);
    const hist = bias.slice(Math.max(0, i - lookback), i).filter((x): x is number => x != null);
    const avgVol = i >= 20 ? mean(days.slice(i - 20, i).map(x => x.volume)) : null;
    if (!m || hist.length < 40) return { date: d.date, close: closeOf(d), ma20: m, floor: null, ceil: null, volRatio: avgVol ? d.volume / avgVol : null, signal: null };
    const floor = m * (1 + quantile(hist, q)), ceil = m * (1 + quantile(hist, 1 - q));
    const volRatio = avgVol ? d.volume / avgVol : null, c = closeOf(d);
    const loud = volRatio != null && volRatio >= volMult;
    return { date: d.date, close: c, ma20: m, floor, ceil, volRatio, signal: loud && c <= floor ? 'floor' : loud && c >= ceil ? 'ceil' : null };
  });
}
/** 回測：訊號次日開盤進場，持有 h 日後收盤（1/3/5/10/20）。天花板訊號以放空方向計算。 */
export function bandBacktest(ds: Dataset, q = 0.05, volMult = 2, holds = [1, 3, 5, 10, 20]) {
  const res: Record<'floor' | 'ceil', Record<number, number[]>> = { floor: {}, ceil: {} };
  for (const k of ['floor', 'ceil'] as const) for (const h of holds) res[k][h] = [];
  for (const code of ds.stocks) {
    const days = ds.days[code], b = bands(days, q, 120, volMult);
    b.forEach((x, i) => {
      if (!x.signal || !days[i + 1]?.open) return;
      const entry = days[i + 1].open!;
      for (const h of holds) { const exit = days[i + h]; if (exit) res[x.signal][h].push((closeOf(exit) / entry - 1) * (x.signal === 'ceil' ? -1 : 1)); }
    });
  }
  return holds.map(h => ({ hold: h, floor: summary(res.floor[h]), ceil: summary(res.ceil[h]) }));
}
const summary = (a: number[]) => ({ n: a.length, avg: a.length ? mean(a) : null, win: a.length ? a.filter(x => x > 0).length / a.length : null });

// ======================= 融券回補 =======================

export type ShortRow = { code: string; name: string; short: number; margin: number; ratio: number; avg5: number; power: number; lastCover: string | null; daysLeft: number | null; event: string | null };
/** 融券回補力道 ＝ 融券餘額 ÷ 近 5 日均量；券資比 ＝ 融券 ÷ 融資。合成資料含股東會／除權息最後回補日。 */
export function shortCover(ds: Dataset): ShortRow[] {
  return ds.stocks.map((code, i) => {
    const r = rng(hash('s' + code)), days = ds.days[code], last = days.at(-1)!;
    const avg5 = mean(days.slice(-5).map(d => d.volume / LOT));
    const margin = Math.round(avg5 * (0.3 + r() * 1.5)), short = Math.round(margin * (0.02 + r() * (i % 4 === 0 ? 0.6 : 0.15)));
    const hasEvent = i % 3 !== 2;
    const daysLeft = hasEvent ? 2 + Math.floor(r() * 25) : null;
    return { code, name: ds.names[code], short, margin, ratio: margin ? short / margin : 0, avg5, power: avg5 ? short / avg5 : 0, lastCover: daysLeft != null ? addBusinessDays(last.date, daysLeft) : null, daysLeft, event: hasEvent ? (r() < 0.5 ? '股東會' : '除權息') : null };
  }).sort((a, b) => b.power - a.power);
}

export function profilesMap(ds: Dataset, window = 60) { return new Map(profileBrokers(ds, window).map(p => [p.broker.id, p])); }
