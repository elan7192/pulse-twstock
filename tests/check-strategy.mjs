// 執行：node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/check-strategy.mjs
import assert from 'node:assert/strict';
import { summarizeDay, demoShared } from '../src/lib/branch.ts';
import { bs, impliedVol, dispositionTimeline, forecast, noticeAt, evalCB, cbArbitrage, cbasTrade, cbasSplit, bondValue, stageOf, lifeInfo, demoCBs, bands, bandBacktest, threeCheck, dispositionStats, evalWarrant, warrantRadar, profilesMap, shortCover } from '../src/lib/strategy.ts';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
// 1. Black-Scholes：買賣權平價、隱波反推
const S = 100, K = 105, T = 0.5, r = 0.015, v = 0.4;
const c = bs('call', S, K, T, r, v), p = bs('put', S, K, T, r, v);
near(c.price - p.price, S - K * Math.exp(-r * T), 1e-4);
near(impliedVol('call', c.price, S, K, T, r), v, 1e-4);
near(c.delta - p.delta, 1, 1e-9);
assert.ok(c.theta < 0);
console.log('Black-Scholes：平價關係、隱波反推、Delta 正確');

// 2. 處置規則：連續 3 日 6 日累積漲幅 > 32% → 次日起處置 5 日
const mk = (i, close) => summarizeDay({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, code: 'T', open: close, close, fills: [{ broker: 'A', price: close, buy: 1000, sell: 0 }, { broker: 'B', price: close, buy: 0, sell: 1000 }] });
const series = c => c.map((x, i) => mk(i, x));
const days = series([10, 10, 10, 10, 10, 10, 11, 12, 13, 14, 15, 16, 16, 16, 16, 16, 16, 16, 16, 16]);
assert.equal(noticeAt(days, 8).hit, false);  // 13/10 = +30%，未超過 32%
assert.equal(noticeAt(days, 9).hit, true);   // 14/10 = +40%
const tl = dispositionTimeline('T', days);
assert.deepEqual(tl.streak.slice(9, 12), [1, 2, 3]);
assert.equal(tl.events.length, 1);
assert.equal(tl.events[0].start, 12); assert.equal(tl.events[0].end, 16);
assert.ok(tl.disposed[12] && tl.disposed[16] && !tl.disposed[17]);
console.log('處置：連續 3 日注意 → 次日起處置 5 個營業日');
// 必關：已連續 2 日注意，且明日跌停價仍高於觸發價
const hot = series([10, 10, 10, 10, 10, 10, 12, 13, 14.9, 16]);
const f = forecast('H', hot, dispositionTimeline('H', hot));
assert.equal(f.streak, 2); assert.equal(f.light, 'red');
const warm = series([10, 10, 10, 10, 10, 10, 10, 11, 13.5, 13.6]);
const f2 = forecast('W', warm, dispositionTimeline('W', warm));
assert.equal(f2.light, 'amber'); assert.ok(f2.upAt > f2.limitDown && f2.upAt < f2.limitUp);
console.log('處置預測：必關（跌停仍觸發）與看收盤（觸發價在漲跌停之間）正確');

// 3. 可轉債：CBAS 拆解公式以公開案例核對
const t1 = cbasTrade(106, 5.58, 126, 94.98, 50); // 台光電五
assert.equal(Math.round(t1.invest), 579000); assert.equal(Math.round(t1.back), 1551000); near(t1.ret, 1551000 / 579000 - 1);
assert.equal(Math.round(t1.ret * 100), 168);
const t2 = cbasTrade(108.5, 3.92, 130, 97.5, 1);   // 凡甲三
assert.equal(Math.round(t2.invest), 12420); assert.equal(Math.round(t2.back), 32500); assert.equal((t2.ret * 100).toFixed(2), '161.67');
const sp = cbasSplit(106, 100 - 5.58); near(sp.perLot, 11580, 1e-6);
near(bondValue(101, 2, 0.025), 101 / 1.025 ** 2);
const cb = { id: 'X1', code: 'X', name: 'X', convPrice: 50, rating: 3, secured: false, issueDate: '2025-09-25', putDate: '2027-09-25', putPrice: 101, maturity: '2028-09-25', redeem: 100, issuedAmt: 10,
  history: Array.from({ length: 6 }, (_, i) => ({ date: `2026-09-${20 + i}`, price: i === 5 ? 118 : 110, volume: i === 5 ? 200 : 40, converted: i === 5 ? 0.22 : 0.2, S: 60 })) };
const e = evalCB(cb, 0.025, 0);
near(e.convValue, 120); near(e.premium, 118 / 120 - 1); near(e.arbitrage, 120 / 118 - 1);
assert.equal(e.stage, '幼年期'); assert.ok(e.zheng.band && e.zheng.dayVol && e.zheng.volSpike && e.zheng.convRise && e.zheng.oneYear);
near(e.quote, 100 - e.bondValue); assert.ok(e.ytp < 0);
const a = cbArbitrage(e, 10);
assert.equal(a.shares, 20000); assert.equal(a.shortLots, 20); assert.equal(a.oddShares, 0);
console.log('可轉債：CBAS 拆解符合台光電五（168%）與凡甲三（161.67%）公開案例；轉換價值、鄭大檢核、套利正確');

// 生命週期：鄭大門檻、升級偵測、股性隨階段上升
assert.equal(stageOf(119.9), '幼年期'); assert.equal(stageOf(130), '中年期'); assert.equal(stageOf(150), '老年期');
assert.equal(stageOf(125, { young: 130, old: 160 }), '幼年期');
const up = { ...cb, history: cb.history.map((d, i) => ({ ...d, price: i < 4 ? 115 : 152, S: i < 4 ? 58 : 76 })) };
const li = lifeInfo(evalCB(up));
assert.equal(li.stage, '老年期'); assert.equal(li.prevStage, '幼年期'); assert.equal(li.move, 'up'); assert.equal(li.daysInStage, 2);
{ const all = demoCBs(demoShared()).map(x => evalCB(x)); const avgE = st => { const l = all.map(e => lifeInfo(e)).filter(i => i.stage === st); return l.reduce((s, i) => s + i.elasticity, 0) / l.length; };
  assert.ok(avgE('幼年期') < avgE('中年期') && avgE('中年期') < avgE('老年期'), '股性應隨階段上升'); }
console.log('生命週期：120／150 門檻、升級偵測、股性隨幼年→中年→老年上升');

// 4. 權證評估、地板天花板、合成資料流程可執行
const ds = demoShared();
const w = evalWarrant({ id: 'W', name: 'W', code: 'X', type: 'call', K: 105, ratio: 0.1, daysLeft: 120, bid: 0.75, ask: 0.76, issuer: 'I', bivHist: [0.4, 0.4, 0.4], outstanding: 0 }, 100);
assert.ok(w.biv > 0.3 && w.biv < 0.6); near(w.spread, 0.01 / 0.75); assert.ok(w.leverage > 3);
const b = bands(ds.days['2330']);
assert.ok(b.at(-1).floor < b.at(-1).ma20 && b.at(-1).ma20 < b.at(-1).ceil);
assert.equal(bandBacktest(ds).length, 5);
const st = dispositionStats(ds);
assert.ok(st.length >= 4, '示範資料應有處置事件');
const released = st.filter(s => s.releaseGap != null);
assert.ok(released.filter(s => s.releaseGap > 0 && s.releaseOC < 0).length >= 3, '示範出關日應呈開高走低');
assert.equal(typeof threeCheck(ds.days['P101'], 100).pass, 'boolean');
const radar = warrantRadar(ds, ds.dates.length - 2, profilesMap(ds));
assert.ok(radar.some(r => r.signal), '示範資料應有主力收購權證信號');
assert.ok(shortCover(ds).every(r => r.power >= 0));
console.log(`示範：${st.length} 次處置、${radar.filter(r => r.signal).length} 檔權證主力信號、地板天花板與融券回補可計算`);
