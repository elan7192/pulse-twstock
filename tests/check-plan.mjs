// 執行：node --experimental-strip-types --import ./tests/ts-resolve.mjs tests/check-plan.mjs
import assert from 'node:assert/strict';
import * as P from '../src/lib/plan.ts';
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);

// 1. 五條線：CDP 與樞紐點公式
const cdp = P.fiveLines(110, 100, 105, 'cdp');
near(cdp.mid, 105); assert.deepEqual(cdp.lines.map(x => x[1]), [115, 110, 105, 100, 95]);
const pv = P.fiveLines(110, 100, 108, 'pivot');
near(pv.mid, 106); assert.deepEqual(pv.lines.map(x => Math.round(x[1] * 100) / 100), [116, 112, 106, 102, 96]);
assert.equal(P.zoneOf(120, cdp).idx, 0); assert.equal(P.zoneOf(107, cdp).idx, 2); assert.equal(P.zoneOf(90, cdp).idx, 5);
assert.equal(P.zoneOf(90, cdp).bias, 'short');

// 2. 五線譜：完美直線的 z 為 0；最後一點高出 → z > 0
const line = Array.from({ length: 100 }, (_, i) => 100 + i + (i % 2 ? 1 : -1));
assert.ok(Math.abs(P.spectrum(line, 100).z) < 1.2);
const up = [...line.slice(0, 99), 250]; assert.ok(P.spectrum(up, 100).z > 2);

// 3. 選擇權到期日：月選第三個週三、W/F 週選
assert.equal(P.txoExpiry('202610'), '2026-10-21');
assert.equal(P.txoExpiry('202610W1'), '2026-10-07');
assert.equal(P.txoExpiry('202609F4'), '2026-09-25');
assert.equal(P.txoExpiry('202609W5'), '2026-09-30');
assert.equal(P.txoExpiry('202602W5'), null);

// 4. 解析期交所選擇權行情（依 DailyMarketReportOpt 欄位），推算隱含期貨價
const raw = [];
for (const K of [47800, 47900, 48000, 48100]) for (const [cp, p] of [['買權', Math.max(1, 48000 - K + 60)], ['賣權', Math.max(1, K - 48000 + 60)]])
  raw.push({ Date: '20260924', Contract: 'TXO', 'ContractMonth(Week)': '202610', StrikePrice: String(K), CallPut: cp, Close: String(p), Volume: '10', SettlementPrice: String(p), OpenInterest: '100', BestBid: '-', BestAsk: '-', TradingSession: '一般' });
raw.push({ Date: '20260924', Contract: 'TXO', 'ContractMonth(Week)': '202610', StrikePrice: '48000', CallPut: '買權', Close: '99', TradingSession: '盤後' });
raw.push({ Date: '20260924', Contract: 'TEO', 'ContractMonth(Week)': '202610', StrikePrice: '1000', CallPut: '買權', Close: '1', TradingSession: '一般' });
const chain = P.parseTxo(JSON.stringify(raw));
assert.equal(chain.date, '2026-09-24'); assert.equal(chain.rows.length, 8, '只取 TXO 一般時段');
assert.deepEqual(P.unpackChain(P.packChain(chain)), chain);
const s = P.chainSeries(chain, '2026-09-24')[0];
assert.equal(s.atm, 48000); near(s.F, 48000); assert.equal(s.days, 19); assert.equal(s.pcOi, 1);

// 5. 樂透單：情境倍數與損益兩平
const demo = P.chainSeries(P.demoChain(48000, '2026-09-24'), '2026-09-24');
const lotto = P.lottoList(demo.find(x => x.month === '202609W5'), { ...P.LOTTO_RULE, maxPrice: 50 });
assert.ok(lotto.length > 0);
for (const l of lotto) {
  near(l.breakeven, l.cp === 'C' ? l.strike + l.price : l.strike - l.price);
  assert.ok(l.prob > 0 && l.prob < 0.5); assert.equal(l.cost, l.price * 50);
  const m5 = l.scen.find(x => x.move === 0.05); near(m5.value, Math.max(0, l.cp === 'C' ? l.dist * -1 + demo.find(x => x.month === '202609W5').F * 0.05 : demo.find(x => x.month === '202609W5').F * 0.05 - l.dist), 1e-6);
}

// 6. 市場寬度：兩檔股票、25 日
const days = Array.from({ length: 25 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, rows: [['1101', 0, 0, 0, 10 + i, 1], ['2330', 0, 0, 0, 100 - i, 1], ['0050', 0, 0, 0, 5, 1]] }));
const b = P.breadthSeries(days);
assert.equal(b.length, 25); assert.deepEqual(b.at(-1).slice(3, 8), [1, 1, 1, 1, 2]);
assert.equal(b.at(-1)[1], null, '樣本太少不算比例');

// 7. 溫度計：分項 0–1、溫度 0–100
const idx = P.demoIndex(); const t = P.thermometer(P.demoBreadth(idx), idx);
for (const p of t) { assert.ok(p.temp == null || (p.temp >= 0 && p.temp <= 100)); for (const v of Object.values(p.parts)) assert.ok(v == null || (v >= 0 && v <= 1)); }
assert.equal(P.thermoZone(85)[1], '過熱'); assert.equal(P.thermoZone(10)[1], '冰點');

// 8. 交易醫生：損益、統計、診斷
const tr = P.calcTrade({ date: '2026-09-24', product: 'MTX', side: 'short', entry: 48000, exit: 47900, qty: 2, stop: 48050, grade: 'A+', minutes: 10, note: '' }, 100);
assert.equal(tr.points, 100); assert.equal(tr.pnl, 100 * 50 * 2 - 200); assert.equal(tr.r, 2);
const bad = [
  ...Array.from({ length: 6 }, (_, i) => ({ date: `2026-09-0${i + 1}`, product: 'TX', side: 'long', entry: 100, exit: 105, qty: 1, stop: 90, grade: 'B', minutes: 5, note: '' })),
  ...Array.from({ length: 4 }, (_, i) => ({ date: `2026-09-1${i}`, product: 'TX', side: 'long', entry: 100, exit: 70, qty: 1, stop: 90, grade: 'B', minutes: 60, note: '' })),
].map(x => P.calcTrade(x, 0));
const st = P.journalStats(bad);
assert.equal(st.n, 10); near(st.winRate, 0.6); near(st.payoff, 1000 / 6000); assert.equal(st.maxLossStreak, 4);
const titles = P.diagnose(bad).map(f => f.title);
assert.ok(titles.includes('期望值為負')); assert.ok(titles.some(x => x.startsWith('停損沒有執行'))); assert.ok(titles.includes('虧損單抱太久'));
const parsed = P.parseTrades('日期,商品,多空,進場,出場,口數,停損,評級\n2026/09/24,MTX,空,48000,47900,2,48050,a+\n亂寫一行');
assert.equal(parsed.trades.length, 1); assert.equal(parsed.errors.length, 1); assert.equal(parsed.trades[0].side, 'short'); assert.equal(parsed.trades[0].grade, 'A+');
assert.deepEqual(P.parseTrades(P.tradesToCsv(parsed.trades)).trades, parsed.trades);

// 9. A+ 檢核與部位
assert.equal(P.gradeSetup({ trend: true, line: true, rr: true, stop: true, mood: true, plan: true }).grade, 'A+');
assert.equal(P.gradeSetup({ trend: true, line: true, rr: true, mood: true, plan: true }).grade, 'C', '沒有停損一律 C');
assert.equal(P.gradeSetup({ trend: true, rr: true, stop: true, mood: true, plan: true }).grade, 'A');
assert.equal(P.positionSize(500000, 0.02, 40, 'MTX'), 5);
console.log('plan ok');
