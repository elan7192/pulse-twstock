// 分點（券商分點）籌碼研究引擎。
// 所有數量以「股」儲存，畫面以「張」(1,000 股) 顯示。
// 公式依 CMoney 籌碼K線使用手冊公開定義實作，並在各函式註明；非廠商原始程式。

export type BrokerKind = 'foreign' | 'gov' | 'domestic';
export type Broker = { id: string; name: string; kind: BrokerKind };
export type Fill = { broker: string; price: number; buy: number; sell: number };
export type RawDay = { date: string; code: string; open: number | null; close: number | null; high?: number | null; low?: number | null; fills: Fill[] };
export type Flow = { broker: string; buy: number; sell: number; net: number; buyAmt: number; sellAmt: number };
export type DayStat = {
  date: string; code: string; open: number | null; close: number | null; high: number; low: number; vwap: number;
  volume: number; mark: number; flows: Flow[]; byBroker: Map<string, Flow>; fills: Fill[];
  topBuy: Flow[]; topSell: Flow[]; mainNet: number; buyers: number; sellers: number; diff: number;
};
export type Dataset = {
  source: 'synthetic' | 'import'; brokers: Map<string, Broker>; names: Record<string, string>;
  stocks: string[]; days: Record<string, DayStat[]>; dates: string[];
};

export const LOT = 1000;
export const lots = (shares: number) => shares / LOT;
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

// ---------- 基礎彙總 ----------

export function flowsOf(fills: Fill[]): Flow[] {
  const m = new Map<string, Flow>();
  for (const f of fills) {
    const x = m.get(f.broker) ?? { broker: f.broker, buy: 0, sell: 0, net: 0, buyAmt: 0, sellAmt: 0 };
    x.buy += f.buy; x.sell += f.sell; x.buyAmt += f.buy * f.price; x.sellAmt += f.sell * f.price;
    m.set(f.broker, x);
  }
  const out = [...m.values()];
  for (const x of out) x.net = x.buy - x.sell;
  return out.sort((a, b) => b.net - a.net);
}

export function mergeFlows(list: Flow[][]): Flow[] {
  const m = new Map<string, Flow>();
  for (const flows of list) for (const f of flows) {
    const x = m.get(f.broker) ?? { broker: f.broker, buy: 0, sell: 0, net: 0, buyAmt: 0, sellAmt: 0 };
    x.buy += f.buy; x.sell += f.sell; x.buyAmt += f.buyAmt; x.sellAmt += f.sellAmt; m.set(f.broker, x);
  }
  const out = [...m.values()];
  for (const x of out) x.net = x.buy - x.sell;
  return out.sort((a, b) => b.net - a.net);
}

/** 買超前 15 名與賣超前 15 名（依淨買賣超股數）。 */
export function tops(flows: Flow[], n = 15) {
  const topBuy = flows.filter(f => f.net > 0).sort((a, b) => b.net - a.net).slice(0, n);
  const topSell = flows.filter(f => f.net < 0).sort((a, b) => a.net - b.net).slice(0, n);
  return { topBuy, topSell };
}

function lowOf(low: number | null | undefined, prices: number[]) {
  const v = Math.min(low ?? Infinity, ...prices);
  return Number.isFinite(v) ? v : 0;
}

export function summarizeDay(raw: RawDay): DayStat {
  const fills = raw.fills.filter(f => f.price > 0 && (f.buy > 0 || f.sell > 0));
  const flows = flowsOf(fills);
  const prices = fills.map(f => f.price);
  const buyVol = sum(fills.map(f => f.buy)), sellVol = sum(fills.map(f => f.sell));
  const volume = Math.max(buyVol, sellVol);
  const amt = sum(fills.map(f => f.price * f.buy));
  const vwap = buyVol ? amt / buyVol : prices.length ? sum(prices) / prices.length : 0;
  const { topBuy, topSell } = tops(flows);
  // 主力買賣超 = 每日買超前 15 名買超合計 − 每日賣超前 15 名賣超合計
  const mainNet = sum(topBuy.map(f => f.net)) - sum(topSell.map(f => -f.net));
  // 買賣家數差 = 有買進的券商家數 − 有賣出的券商家數
  const buyers = flows.filter(f => f.buy > 0).length, sellers = flows.filter(f => f.sell > 0).length;
  return {
    date: raw.date, code: raw.code, open: raw.open, close: raw.close,
    high: Math.max(raw.high ?? 0, ...prices), low: lowOf(raw.low, prices),
    vwap, volume, mark: raw.close ?? vwap, flows, byBroker: new Map(flows.map(f => [f.broker, f])), fills,
    topBuy, topSell, mainNet, buyers, sellers, diff: buyers - sellers,
  };
}

export function buildDataset(raw: RawDay[], brokers: Broker[], names: Record<string, string>, source: Dataset['source']): Dataset {
  const days: Record<string, DayStat[]> = {};
  const byKey = new Map<string, RawDay>();
  // 同日同股多檔匯入時合併 fills
  for (const r of raw) {
    const k = r.code + '|' + r.date, old = byKey.get(k);
    if (old) { old.fills.push(...r.fills); old.open ??= r.open; old.close ??= r.close; }
    else byKey.set(k, { ...r, fills: [...r.fills] });
  }
  for (const r of byKey.values()) {
    const d = summarizeDay(r);
    if (!d.volume) continue;
    (days[r.code] ??= []).push(d);
  }
  for (const c of Object.keys(days)) {
    days[c].sort((a, b) => a.date.localeCompare(b.date));
    // 匯入資料缺高低時，保留分點成交價區間；若有收盤價則納入
    for (const d of days[c]) if (d.close != null) { d.high = Math.max(d.high, d.close); d.low = Math.min(d.low, d.close); }
  }
  const m = new Map<string, Broker>();
  for (const b of brokers) if (!m.has(b.id)) m.set(b.id, b);
  const dates = [...new Set(Object.values(days).flatMap(d => d.map(x => x.date)))].sort();
  return { source, brokers: m, names, stocks: Object.keys(days).sort(), days, dates };
}

// ---------- 區間與籌碼指標 ----------

export type RangeStat = { from: string; to: string; volume: number; flows: Flow[]; topBuy: Flow[]; topSell: Flow[]; mainNet: number; concentration: number; mainCost: number | null; mainSellCost: number | null };

/** 區間籌碼：籌碼集中 = (區間買超前15名買超合計 − 區間賣超前15名賣超合計) / 區間成交量。 */
export function rangeStat(days: DayStat[]): RangeStat {
  const flows = mergeFlows(days.map(d => d.flows));
  const volume = sum(days.map(d => d.volume));
  const { topBuy, topSell } = tops(flows);
  const mainNet = sum(topBuy.map(f => f.net)) - sum(topSell.map(f => -f.net));
  const bq = sum(topBuy.map(f => f.buy)), sq = sum(topSell.map(f => f.sell));
  return {
    from: days[0]?.date ?? '', to: days.at(-1)?.date ?? '', volume, flows, topBuy, topSell, mainNet,
    concentration: volume ? mainNet / volume : 0,
    mainCost: bq ? sum(topBuy.map(f => f.buyAmt)) / bq : null,
    mainSellCost: sq ? sum(topSell.map(f => f.sellAmt)) / sq : null,
  };
}

/** 滾動籌碼集中度序列；不足視窗天數時為 null。 */
export function concentrationSeries(days: DayStat[], window: number): (number | null)[] {
  return days.map((_, i) => (i + 1 < window ? null : rangeStat(days.slice(i + 1 - window, i + 1)).concentration));
}

/** 主力連續買超（正）或連續賣超（負）天數，截至 index。 */
export function mainStreak(days: DayStat[], index: number): number {
  const s = Math.sign(days[index]?.mainNet ?? 0);
  if (!s) return 0;
  let n = 0;
  for (let i = index; i >= 0 && Math.sign(days[i].mainNet) === s; i--) n++;
  return s * n;
}

export function diffNegativeStreak(days: DayStat[], index: number): number {
  let n = 0;
  for (let i = index; i >= 0 && days[i].diff < 0; i--) n++;
  return n;
}

// ---------- 單一分點在單一股票的損益帳 ----------

export type LedgerRow = {
  date: string; buy: number; sell: number; net: number; avgBuy: number | null; avgSell: number | null;
  position: number; cost: number | null; realized: number; unrealized: number; mark: number;
};

/**
 * 平均成本法：同日買賣先互抵（視為當沖，依當日均買／均賣結算），剩餘淨額再進出庫存。
 * 起點庫存為 0，因此庫存與損益僅代表「所選資料區間內」的估算。
 */
export function ledger(days: DayStat[], broker: string): LedgerRow[] {
  let pos = 0, cost = 0, realized = 0;
  const rows: LedgerRow[] = [];
  for (const d of days) {
    const f = d.byBroker.get(broker);
    const buy = f?.buy ?? 0, sell = f?.sell ?? 0;
    const avgBuy = buy ? f!.buyAmt / buy : null, avgSell = sell ? f!.sellAmt / sell : null;
    const matched = Math.min(buy, sell);
    if (matched) realized += matched * (avgSell! - avgBuy!);
    const net = buy - sell;
    if (net > 0) {
      const px = avgBuy!;
      if (pos >= 0) { cost = (pos * cost + net * px) / (pos + net); pos += net; }
      else { const c = Math.min(net, -pos); realized += c * (cost - px); pos += c; const rem = net - c; if (rem > 0) { pos = rem; cost = px; } if (pos === 0) cost = 0; }
    } else if (net < 0) {
      const q = -net, px = avgSell!;
      if (pos <= 0) { cost = (-pos * cost + q * px) / (-pos + q); pos -= q; }
      else { const c = Math.min(q, pos); realized += c * (px - cost); pos -= c; const rem = q - c; if (rem > 0) { pos = -rem; cost = px; } if (pos === 0) cost = 0; }
    }
    rows.push({ date: d.date, buy, sell, net, avgBuy, avgSell, position: pos, cost: pos ? cost : null, realized, unrealized: pos ? pos * (d.mark - cost) : 0, mark: d.mark });
  }
  return rows;
}

// ---------- 手法判讀 ----------

export type FlipStat = { events: number; hits: number; flipped: number };
/** 隔日沖：T 日買超 ≥ 當日量 1% 且 ≥ 50 張，T+1 賣超達 T 日買超 60% 以上，記為一次命中。 */
export function flipStat(days: DayStat[], broker: string): FlipStat {
  let events = 0, hits = 0, flipped = 0;
  for (let i = 0; i + 1 < days.length; i++) {
    const n = days[i].byBroker.get(broker)?.net ?? 0;
    if (n < 50 * LOT || n < days[i].volume * 0.01) continue;
    events++;
    const next = days[i + 1].byBroker.get(broker)?.net ?? 0;
    if (next <= -0.6 * n) { hits++; flipped += Math.min(n, -next); }
  }
  return { events, hits, flipped };
}

export type Style = 'flip' | 'daytrade' | 'swing' | 'mixed';
export const STYLE_LABEL: Record<Style, string> = { flip: '隔日沖', daytrade: '當沖', swing: '波段', mixed: '一般' };
export const KIND_LABEL: Record<BrokerKind, string> = { foreign: '外資', gov: '官股', domestic: '本土' };

export type BrokerProfile = {
  broker: Broker; pnl: number; realized: number; unrealized: number; stocks: number; wins: number; winRate: number | null;
  activeDays: number; gross: number; netAmt: number; flip: FlipStat; offset: number; persistence: number; style: Style;
  holdings: { code: string; position: number; cost: number | null; pnl: number }[];
  recent: { code: string; net: number; amount: number; avg: number | null }[];
};

export function windowDays(ds: Dataset, code: string, window: number, endDate?: string): DayStat[] {
  const all = ds.days[code] ?? [];
  const end = endDate ? all.findIndex(d => d.date > endDate) : -1;
  const upto = end === -1 ? all : all.slice(0, end);
  return upto.slice(-window);
}

export function profileBrokers(ds: Dataset, window: number, endDate?: string): BrokerProfile[] {
  const acc = new Map<string, BrokerProfile & { _offMin: number; _offMax: number; _persistBest: number }>();
  const get = (id: string) => {
    let p = acc.get(id);
    if (!p) {
      p = { broker: ds.brokers.get(id) ?? { id, name: id, kind: 'domestic' }, pnl: 0, realized: 0, unrealized: 0, stocks: 0, wins: 0, winRate: null,
        activeDays: 0, gross: 0, netAmt: 0, flip: { events: 0, hits: 0, flipped: 0 }, offset: 0, persistence: 0, style: 'mixed', holdings: [], recent: [],
        _offMin: 0, _offMax: 0, _persistBest: 0 };
      acc.set(id, p);
    }
    return p;
  };
  for (const code of ds.stocks) {
    const days = windowDays(ds, code, window, endDate);
    if (!days.length) continue;
    const ids = new Set(days.flatMap(d => d.flows.map(f => f.broker)));
    const recentDays = days.slice(-5);
    for (const id of ids) {
      const p = get(id);
      const rows = ledger(days, id);
      const last = rows.at(-1)!;
      const pnl = last.realized + last.unrealized;
      let gross = 0, netAmt = 0, active = 0, pos = 0, neg = 0;
      for (const d of days) {
        const f = d.byBroker.get(id); if (!f) continue;
        active++; gross += f.buy + f.sell; netAmt += f.buyAmt - f.sellAmt;
        const big = Math.max(f.buy, f.sell);
        if (big >= d.volume * 0.005) { p._offMin += Math.min(f.buy, f.sell); p._offMax += big; }
        if (f.net > 0) pos++; else if (f.net < 0) neg++;
      }
      p.activeDays += active; p.gross += gross; p.netAmt += netAmt; p.pnl += pnl; p.realized += last.realized; p.unrealized += last.unrealized;
      if (gross >= 20 * LOT) { p.stocks++; if (pnl > 0) p.wins++; }
      // 波段持續度：有淨買賣的交易日中，落在「同方向連續 ≥ 5 個交易日」區段的比例
      const vol = sum(days.map(d => d.volume));
      if (pos + neg >= 8 && gross >= vol * 0.01) {
        const signs = days.map(d => Math.sign(d.byBroker.get(id)?.net ?? 0)).filter(x => x !== 0);
        let inRuns = 0;
        for (let a = 0; a < signs.length;) { let b = a; while (b < signs.length && signs[b] === signs[a]) b++; if (b - a >= 5) inRuns += b - a; a = b; }
        p._persistBest = Math.max(p._persistBest, inRuns / signs.length);
      }
      const fs = flipStat(days, id); p.flip.events += fs.events; p.flip.hits += fs.hits; p.flip.flipped += fs.flipped;
      if (last.position) p.holdings.push({ code, position: last.position, cost: last.cost, pnl });
      const rNet = sum(recentDays.map(d => d.byBroker.get(id)?.net ?? 0));
      if (rNet) {
        const amt = sum(recentDays.map(d => { const f = d.byBroker.get(id); return f ? f.buyAmt - f.sellAmt : 0; }));
        const bq = sum(recentDays.map(d => d.byBroker.get(id)?.buy ?? 0)), ba = sum(recentDays.map(d => d.byBroker.get(id)?.buyAmt ?? 0));
        p.recent.push({ code, net: rNet, amount: amt, avg: bq ? ba / bq : null });
      }
    }
  }
  const out = [...acc.values()].map(p => {
    p.winRate = p.stocks ? p.wins / p.stocks : null;
    p.offset = p._offMax ? p._offMin / p._offMax : 0;
    p.persistence = p._persistBest;
    const flipRate = p.flip.events ? p.flip.hits / p.flip.events : 0;
    p.style = p.flip.events >= 3 && flipRate >= 0.5 ? 'flip' : p.offset >= 0.6 && p.activeDays >= 10 ? 'daytrade' : p.persistence >= 0.7 ? 'swing' : 'mixed';
    p.holdings.sort((a, b) => Math.abs(b.position) - Math.abs(a.position));
    p.recent.sort((a, b) => b.net - a.net);
    const { _offMin, _offMax, _persistBest, ...rest } = p; void _offMin; void _offMax; void _persistBest;
    return rest as BrokerProfile;
  });
  return out.sort((a, b) => b.pnl - a.pnl);
}

// ---------- 大量分點／異常進駐／隔日沖賣壓 ----------

/** 單日大量分點：當日買進或賣出 ≥ 成交量 2%。BSR 資料為分點彙總，不是逐筆大單。 */
export function heavyBrokers(day: DayStat, share = 0.02): Flow[] {
  return day.flows.filter(f => Math.max(f.buy, f.sell) >= day.volume * share).sort((a, b) => Math.max(b.buy, b.sell) - Math.max(a.buy, a.sell));
}

export type Anomaly = { code: string; date: string; broker: string; net: number; share: number; multiple: number | null; priorActive: number };
/** 異常進駐（對應「神秘券商」概念）：當日買超前 5 名，過去 20 日少於 6 天有交易，買超 ≥ 當日量 1%，且 ≥ 過去平均 3 倍。 */
export function anomalies(ds: Dataset, date?: string): Anomaly[] {
  const out: Anomaly[] = [];
  for (const code of ds.stocks) {
    const all = ds.days[code];
    const i = date ? all.findIndex(d => d.date === date) : all.length - 1;
    if (i < 1) continue;
    const day = all[i], prior = all.slice(Math.max(0, i - 20), i);
    for (const f of day.topBuy.slice(0, 5)) {
      const hist = prior.map(d => d.byBroker.get(f.broker)).filter(Boolean) as Flow[];
      const base = prior.length ? sum(hist.map(h => Math.abs(h.net))) / prior.length : 0;
      const share = f.net / day.volume;
      if (hist.length <= 5 && share >= 0.01 && (base === 0 || f.net >= base * 3))
        out.push({ code, date: day.date, broker: f.broker, net: f.net, share, multiple: base ? f.net / base : null, priorActive: hist.length });
    }
  }
  return out.sort((a, b) => b.share - a.share);
}

export function flipPressure(day: DayStat, profiles: Map<string, BrokerProfile>) {
  const list = day.topBuy.filter(f => profiles.get(f.broker)?.style === 'flip');
  return { list, total: sum(list.map(f => f.net)), share: day.volume ? sum(list.map(f => f.net)) / day.volume : 0 };
}

/** 價位分布：區間內各價位的主力（前 15 買超）買進與（前 15 賣超）賣出股數。 */
export function priceLevels(days: DayStat[], topBuy: Flow[], topSell: Flow[]) {
  const buyers = new Set(topBuy.map(f => f.broker)), sellers = new Set(topSell.map(f => f.broker));
  const m = new Map<number, { price: number; mainBuy: number; mainSell: number; all: number }>();
  for (const d of days) for (const f of d.fills) {
    const x = m.get(f.price) ?? { price: f.price, mainBuy: 0, mainSell: 0, all: 0 };
    x.all += f.buy; if (buyers.has(f.broker)) x.mainBuy += f.buy; if (sellers.has(f.broker)) x.mainSell += f.sell;
    m.set(f.price, x);
  }
  return [...m.values()].sort((a, b) => b.price - a.price);
}

// ---------- 籌碼選股 ----------

export type ScreenRule = {
  mainStreak: number; conc20: number | null; diffNeg: number; foreign5: boolean; broker: string; flipMax: number | null;
};
export type ScreenRow = {
  code: string; name: string; mark: number; change: number | null; mainStreak: number; conc20: number | null; diff: number;
  diffNeg: number; foreign5: number; brokerNet: number; flipShare: number; pass: boolean;
};

export function screenAt(ds: Dataset, code: string, i: number, rule: ScreenRule, profiles: Map<string, BrokerProfile>): ScreenRow {
  const days = ds.days[code], d = days[i];
  const prev = days[i - 1];
  const conc20 = i >= 19 ? rangeStat(days.slice(i - 19, i + 1)).concentration : null;
  const foreign5 = sum(days.slice(Math.max(0, i - 4), i + 1).flatMap(x => x.flows.filter(f => ds.brokers.get(f.broker)?.kind === 'foreign').map(f => f.net)));
  const streak = mainStreak(days, i), dn = diffNegativeStreak(days, i);
  const brokerNet = rule.broker ? d.byBroker.get(rule.broker)?.net ?? 0 : 0;
  const fp = flipPressure(d, profiles).share;
  const pass = streak >= rule.mainStreak
    && (rule.conc20 == null || (conc20 != null && conc20 >= rule.conc20))
    && dn >= rule.diffNeg && (!rule.foreign5 || foreign5 > 0) && (!rule.broker || brokerNet > 0)
    && (rule.flipMax == null || fp <= rule.flipMax);
  return { code, name: ds.names[code] ?? '', mark: d.mark, change: prev ? d.mark / prev.mark - 1 : null, mainStreak: streak, conc20, diff: d.diff, diffNeg: dn, foreign5, brokerNet, flipShare: fp, pass };
}

/** 回溯：每個歷史交易日套用條件，統計觸發後 N 日報酬（以收盤價或均價估算，不含成本）。 */
export function backtest(ds: Dataset, rule: ScreenRule, profiles: Map<string, BrokerProfile>, hold = 5) {
  const rets: number[] = [];
  for (const code of ds.stocks) {
    const days = ds.days[code];
    for (let i = 20; i + hold < days.length; i++) {
      if (screenAt(ds, code, i, rule, profiles).pass) rets.push(days[i + hold].mark / days[i].mark - 1);
    }
  }
  return { count: rets.length, avg: rets.length ? sum(rets) / rets.length : null, win: rets.length ? rets.filter(r => r > 0).length / rets.length : null };
}

// ---------- CSV 匯入（證交所／櫃買「買賣日報表」與 FinMind 分點 CSV） ----------

export function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.replace(/^=/, '').replace(/^"|"$/g, '').replace(/　/g, ' ').trim());
}

export function decodeBytes(buf: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('big5').decode(buf); }
}

const FOREIGN = ['美林', '摩根', '高盛', '瑞銀', '花旗', '野村', '麥格理', '匯立', '法銀', '巴黎', '大和', '德意志', '興業', '瑞信', '瑞士信貸', '港商', '美商', '新加坡商', '英商', '法商', '日商', '星展', '渣打', '香港上海', '滙豐', '匯豐'];
const GOV = ['台銀', '臺銀', '土銀', '合庫', '第一金', '兆豐', '華南永昌', '彰銀', '臺企銀', '台企銀'];
/** 依券商名稱關鍵字推定類別；不在名單者歸本土。 */
export function inferKind(name: string): BrokerKind {
  if (FOREIGN.some(k => name.includes(k))) return 'foreign';
  if (GOV.some(k => name.includes(k))) return 'gov';
  return 'domestic';
}

const isInt = (s: string) => /^\d+$/.test(s.replace(/,/g, ''));
const isNum = (s: string) => /^\d+(\.\d+)?$/.test(s.replace(/,/g, ''));
const toNum = (s: string) => Number(s.replace(/,/g, ''));

export function dateFromText(s: string): string | null {
  let m = s.match(/(20\d{2})[-/年.]?(\d{2})[-/月.]?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(?:^|\D)(1\d{2})[/年.](\d{1,2})[/月.](\d{1,2})/);
  if (m) return `${Number(m[1]) + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

export type ParseResult = { format: 'bsr' | 'finmind'; days: RawDay[]; brokers: Broker[]; names: Record<string, string>; rows: number; warnings: string[] };

export function parseBrokerCsv(text: string, fallback: { date?: string | null; code?: string | null } = {}): ParseResult {
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  const header = splitCsvLine(lines.find(l => l.trim()) ?? '').map(s => s.toLowerCase());
  // FinMind TaiwanStockTradingDailyReport：securities_trader, securities_trader_id, stock_id, date, price, buy, sell
  if (header.includes('securities_trader_id') && header.includes('stock_id')) {
    const col = (n: string) => header.indexOf(n);
    const [ci, di, bi, ni, pi, bu, se] = ['stock_id', 'date', 'securities_trader_id', 'securities_trader', 'price', 'buy', 'sell'].map(col);
    const days = new Map<string, RawDay>(); const brokers = new Map<string, Broker>(); let rows = 0;
    for (const line of lines.slice(lines.indexOf(lines.find(l => l.trim())!) + 1)) {
      if (!line.trim()) continue;
      const t = splitCsvLine(line);
      const price = toNum(t[pi] ?? ''), buy = toNum(t[bu] ?? '0'), sell = toNum(t[se] ?? '0');
      if (!(price > 0) || !Number.isFinite(buy) || !Number.isFinite(sell)) continue;
      const code = t[ci], date = dateFromText(t[di] ?? '') ?? t[di], id = t[bi];
      const k = code + '|' + date;
      if (!days.has(k)) days.set(k, { date, code, open: null, close: null, fills: [] });
      days.get(k)!.fills.push({ broker: id, price, buy, sell }); rows++;
      if (!brokers.has(id)) { const name = ni >= 0 ? t[ni] || id : id; brokers.set(id, { id, name, kind: inferKind(name) }); }
    }
    return { format: 'finmind', days: [...days.values()], brokers: [...brokers.values()], names: {}, rows, warnings };
  }
  // 買賣日報表：每列可能並排兩筆「序號,券商,價格,買進股數,賣出股數」
  let code = fallback.code ?? '', name = '';
  let date = fallback.date ?? null;
  for (const line of lines.slice(0, 8)) {
    const m = line.replace(/[="]/g, '').match(/(?:股票代[號碼]|證券代[號碼])[^0-9A-Z]*([0-9A-Z]{4,6})\s*,?\s*([^\s,]*)/);
    if (m) { code = m[1]; name = m[2] ?? ''; }
    const d = /日期|年|\//.test(line) ? dateFromText(line) : null;
    if (d && !date) date = d;
  }
  const fills: Fill[] = []; const brokers = new Map<string, Broker>(); let rows = 0;
  for (const line of lines) {
    const t = splitCsvLine(line);
    for (let i = 0; i + 4 < t.length;) {
      const bm = t[i + 1]?.match(/^([0-9A-Z]{4})\s*(.*)$/);
      if (isInt(t[i]) && bm && isNum(t[i + 2]) && isInt(t[i + 3]) && isInt(t[i + 4])) {
        const id = bm[1], bname = bm[2].replace(/\s+/g, '') || id;
        const price = toNum(t[i + 2]), buy = toNum(t[i + 3]), sell = toNum(t[i + 4]);
        if (price > 0 && (buy || sell)) { fills.push({ broker: id, price, buy, sell }); rows++; }
        if (!brokers.has(id)) brokers.set(id, { id, name: bname, kind: inferKind(bname) });
        i += 5;
      } else i++;
    }
  }
  if (!code) warnings.push('找不到股票代號，請在匯入欄位指定。');
  if (!date) warnings.push('找不到交易日期，請在匯入欄位指定。');
  if (!rows) warnings.push('沒有辨識到任何分點成交列。');
  return { format: 'bsr', days: code && date && rows ? [{ date, code, open: null, close: null, fills }] : [], brokers: [...brokers.values()], names: code && name ? { [code]: name } : {}, rows, warnings };
}

// ---------- 合成示範資料（虛構券商，固定亂數種子） ----------

export function tickSize(p: number) { return p < 10 ? 0.01 : p < 50 ? 0.05 : p < 100 ? 0.1 : p < 500 ? 0.5 : p < 1000 ? 1 : 5; }
export function roundTick(p: number) { const t = tickSize(p); return Math.round(Math.round(p / t) * t * 100) / 100; }
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export const DEMO_UNIVERSE: [string, string, number, number][] = [
  ['2330', '台積電', 1030, 30000], ['2317', '鴻海', 198, 45000], ['2454', '聯發科', 1250, 5000], ['2382', '廣達', 270, 15000],
  ['3231', '緯創', 112, 40000], ['2603', '長榮', 185, 30000], ['2308', '台達電', 380, 8000], ['2412', '中華電', 125, 9000],
  ['2881', '富邦金', 88, 20000], ['2891', '中信金', 40, 40000], ['3008', '大立光', 2400, 800], ['2303', '聯電', 48, 50000],
  ['3711', '日月光投控', 160, 15000], ['2345', '智邦', 600, 3000], ['6669', '緯穎', 2200, 1500], ['1519', '華城', 650, 5000],
  // 虛構飆股：用來示範注意股、處置股與出關行情（代號非真實股票）
  ['P101', '示範飆股甲', 48, 6000], ['P102', '示範飆股乙', 82, 4000], ['P103', '示範飆股丙', 135, 3000], ['P104', '示範飆股丁', 26, 9000],
  ['P105', '示範飆股戊', 58, 5000], ['P106', '示範飆股己', 95, 3500],
];
/** 飆股劇本：start＝連續強漲起點；hold＝主力續抱或處置中出貨；owner＝null 代表只有隔日沖追價。 */
const PUMPS: Record<string, { start: number; hold: boolean; owner: boolean }> = {
  P101: { start: 96, hold: true, owner: true }, P102: { start: 104, hold: true, owner: false },
  P103: { start: 112, hold: true, owner: true }, P104: { start: 88, hold: false, owner: true },
  P105: { start: 125, hold: true, owner: true }, P106: { start: 121, hold: true, owner: false },
};

type Persona = 'foreign' | 'gov' | 'flip' | 'swing' | 'daytrade' | 'local' | 'retail';
export type DemoBroker = Broker & { persona: Persona };

export function demoBrokers(): DemoBroker[] {
  const b: DemoBroker[] = [];
  const add = (id: string, name: string, kind: BrokerKind, persona: Persona) => b.push({ id, name, kind, persona });
  ['環宇國際', '北辰資本', '藍海環球'].forEach((n, i) => add(`X10${i}`, n, 'foreign', 'foreign'));
  ['公庫證券', '聯合銀證券'].forEach((n, i) => add(`X20${i}`, n, 'gov', 'gov'));
  ['順風-中和', '快手-板橋', '金雷-民權', '星河-竹北'].forEach((n, i) => add(`X30${i}`, n, 'domestic', 'flip'));
  ['長策-信義', '穩泰-台中', '遠望-高雄'].forEach((n, i) => add(`X40${i}`, n, 'domestic', 'swing'));
  ['閃電-南京', '速達-新竹', '疾風-桃園'].forEach((n, i) => add(`X50${i}`, n, 'domestic', 'daytrade'));
  ['在地-新營', '鄉親-員林'].forEach((n, i) => add(`X60${i}`, n, 'domestic', 'local'));
  const brands = ['青松', '白鷺', '紅楓', '金穗', '銀杏', '朝陽', '海灣', '雲峰'], cities = ['台北', '板橋', '新莊', '桃園', '新竹', '台中', '彰化', '嘉義', '台南', '高雄'];
  let k = 0;
  for (const br of brands) for (const c of cities) add(`X7${String(k++).padStart(2, '0')}`, `${br}-${c}`, 'domestic', 'retail');
  return b;
}

function weekdays(end: string, n: number): string[] {
  const out: string[] = []; const d = new Date(end + 'T00:00:00Z');
  while (out.length < n) { const w = d.getUTCDay(); if (w > 0 && w < 6) out.unshift(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
  return out;
}

export function demoDataset(endDate = '2026-09-25', n = 130): Dataset {
  const brokers = demoBrokers();
  const by = (p: Persona) => brokers.filter(b => b.persona === p);
  const dates = weekdays(endDate, n);
  const raw: RawDay[] = [];
  const names: Record<string, string> = {};
  const swing = by('swing'), local = by('local');
  DEMO_UNIVERSE.forEach(([code, name, base, baseVol], si) => {
    names[code] = name;
    const r = rng(hash(code) ^ 0x5eed);
    const nrm = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return (s - 3) / Math.sqrt(0.5); };
    // 部分股票安排「波段主力」：吸籌 25 日 → 拉抬 12 日 → 出貨
    const pump = PUMPS[code];
    const swingOwner = pump ? (pump.owner ? swing[si % swing.length] : null) : si % 2 === 0 ? swing[(si / 2) % swing.length] : null;
    const rally = pump ? pump.start : 55 + Math.floor(r() * 50), acc0 = rally - 25;
    const dist0 = pump ? (pump.hold ? rally + 16 : rally + 3) : rally + 9, dist1 = pump ? (pump.hold ? rally + 30 : rally + 15) : rally + 22;
    const localOwner = si % 5 === 1 ? local[si % local.length] : null;
    let prev = base; const closes: number[] = [];
    let swingInv = 0; const flipPending = new Map<string, number>();
    const flipBrokers = by('flip'), dayBrokers = by('daytrade'), foreign = by('foreign'), gov = by('gov'), retail = by('retail');
    for (let t = 0; t < n; t++) {
      const inRally = (swingOwner || pump) && t >= rally && t < rally + (pump ? 9 : 12);
      const inAcc = swingOwner && t >= acc0 && t < rally;
      const k = t - rally;
      const shock = r() < 0.04 ? (r() < 0.5 ? -1 : 1) * 0.045 : 0;
      let ret = (inRally ? 0.016 : inAcc ? 0.001 : 0) + nrm() * 0.016 + shock;
      let gap = nrm() * 0.005;
      if (pump && inRally) { ret = 0.062 + r() * 0.033; gap = 0.02 + r() * 0.03; }
      else if (pump && k >= 9 && k < 11) ret = (pump.hold ? 0.008 : -0.012) + nrm() * 0.012;
      else if (pump && k === 11) { gap = 0.03; ret = -0.035 - r() * 0.02; } // 出關日：開高走低
      else if (pump && k > 14 && k < 26) ret = -0.004 + nrm() * 0.018;
      ret = Math.max(-0.095, Math.min(0.095, ret));
      const open = roundTick(prev * (1 + Math.min(0.095, gap)));
      const close = roundTick(prev * (1 + ret));
      const high = roundTick(Math.max(open, close) * (1 + Math.abs(nrm()) * 0.006));
      const low = roundTick(Math.min(open, close) * (1 - Math.abs(nrm()) * 0.006));
      closes.push(close);
      const mom = closes.length > 10 ? close / closes[closes.length - 11] - 1 : 0;
      let V = Math.round(baseVol * (0.7 + r() * 0.6) * (1 + Math.abs(ret) * 15) * (inRally ? 1.6 : 1) * (shock ? 1.8 : 1));
      const flows: { id: string; buy: number; sell: number; bias: 'high' | 'low' | 'close' | 'any' }[] = [];
      const push = (id: string, net: number, grossBase: number, bias: 'high' | 'low' | 'close' | 'any') => {
        const g = Math.max(0, Math.round(grossBase));
        flows.push({ id, buy: Math.max(0, Math.round(net)) + g, sell: Math.max(0, Math.round(-net)) + g, bias });
      };
      foreign.forEach((b, i) => {
        const w = [1, 0.7, 0.45][i];
        const signal = Math.tanh(mom * 12) * 0.6 + Math.sign(ret) * Math.min(1, Math.abs(ret) * 40) * 0.4;
        push(b.id, V * 0.03 * w * signal + nrm() * V * 0.003, V * 0.008 * w * r(), 'any');
      });
      gov.forEach(b => push(b.id, ret < -0.02 ? V * 0.02 * (0.6 + r() * 0.8) : ret > 0.03 ? -V * 0.006 : 0, r() < 0.3 ? V * 0.002 : 0, 'low'));
      flipBrokers.forEach(b => {
        const pend = flipPending.get(b.id) ?? 0; flipPending.delete(b.id);
        let net = pend ? -Math.round(pend * (0.85 + r() * 0.15)) : 0;
        if (ret > 0.03 && r() < 0.65) { const q = Math.round(V * (0.02 + r() * 0.03)); net += q; flipPending.set(b.id, q); }
        if (net || r() < 0.15) push(b.id, net, r() < 0.2 ? V * 0.002 : 0, net > 0 ? 'high' : 'close');
      });
      if (swingOwner) {
        let net = 0;
        if (inAcc && r() < 0.75) net = V * (0.025 + r() * 0.02);
        else if (t >= dist0 && t < dist1 && swingInv > 0) net = -Math.min(swingInv, swingInv / Math.max(1, dist1 - t) * (0.8 + r() * 0.5));
        else if (t >= rally && t < dist0 && r() < 0.4) net = V * 0.01;
        net = Math.round(net); swingInv += net;
        if (net) push(swingOwner.id, net, 0, net > 0 ? 'low' : 'high');
      }
      if (localOwner && (ret < -0.01 || r() < 0.08)) push(localOwner.id, V * 0.012 * (0.5 + r()), 0, 'low');
      dayBrokers.forEach(b => { if (r() < 0.45) { const g = V * (0.02 + r() * 0.02); push(b.id, nrm() * g * 0.03, g, 'any'); } });
      // 散戶分點補平：確保 Σ買 = Σ賣 = 成交量
      const B = sum(flows.map(f => f.buy)), S = sum(flows.map(f => f.sell));
      V = Math.max(V, Math.ceil(Math.max(B, S) * 1.3));
      // 散戶分點多半單邊：買方與賣方家數依剩餘買賣量比例分配，約兩成分點雙邊皆有
      const pool = retail.filter(() => r() < 0.6).sort(() => r() - 0.5);
      const rbT = V - B, rsT = V - S;
      const nb = Math.max(3, Math.round(pool.length * rbT / Math.max(1, rbT + rsT) * 1.2)), ns = Math.max(3, Math.round(pool.length * rsT / Math.max(1, rbT + rsT) * 1.2));
      const buyers = pool.slice(0, Math.min(pool.length, nb)), sellers = pool.slice(Math.max(0, pool.length - ns));
      const alloc = (list: DemoBroker[], total: number) => { const w = list.map(() => r() + 0.25), W = sum(w); let left = total; return new Map(list.map((b, i) => { const q = i === w.length - 1 ? left : Math.floor(total * w[i] / W); left -= q; return [b.id, q]; })); };
      const rb = alloc(buyers, rbT), rs = alloc(sellers, rsT);
      for (const id of new Set([...rb.keys(), ...rs.keys()])) flows.push({ id, buy: rb.get(id) ?? 0, sell: rs.get(id) ?? 0, bias: 'any' });
      // 分配至價位
      const grid: number[] = []; for (let p = low; p <= high + 1e-9 && grid.length < 60; p = roundTick(p + tickSize(p))) grid.push(p);
      if (!grid.length) grid.push(close);
      const pick = (bias: string) => {
        const u = r(); const x = bias === 'high' ? 1 - u * u * 0.6 : bias === 'low' ? u * u * 0.6 : bias === 'close' ? (grid.indexOf(close) >= 0 ? grid.indexOf(close) / Math.max(1, grid.length - 1) : u) + (r() - 0.5) * 0.3 : u;
        return grid[Math.max(0, Math.min(grid.length - 1, Math.round(x * (grid.length - 1))))];
      };
      const fills: Fill[] = [];
      for (const f of flows) {
        for (const [side, q] of [['buy', f.buy], ['sell', f.sell]] as const) {
          if (q <= 0) continue;
          const parts = Math.min(q, f.bias === 'any' && f.id.startsWith('X7') ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3)); let left = q;
          for (let k = 0; k < parts; k++) {
            const part = k === parts - 1 ? left : Math.max(1, Math.floor(q / parts)); left -= part;
            fills.push({ broker: f.id, price: pick(f.bias), buy: side === 'buy' ? part * LOT : 0, sell: side === 'sell' ? part * LOT : 0 });
          }
        }
      }
      raw.push({ date: dates[t], code, open, close, high, low, fills });
      prev = close;
    }
  });
  // 合成資料有開高低收，K 線高低以生成值為準
  return buildDataset(raw, brokers.map(({ persona, ...b }) => { void persona; return b; }), names, 'synthetic');
}

let sharedDemo: Dataset | null = null;
/** 全站共用的示範資料（避免切換分頁時重算）。 */
export function demoShared(): Dataset { return sharedDemo ??= demoDataset(); }
