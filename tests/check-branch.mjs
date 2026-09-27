import assert from 'node:assert/strict';
import {
  demoDataset, demoBrokers, summarizeDay, rangeStat, ledger, flipStat, profileBrokers, parseBrokerCsv, buildDataset,
  mainStreak, anomalies, backtest, screenAt, inferKind, dateFromText, LOT,
} from '../src/lib/branch.ts';

// 1. 公式：主力買賣超、家數差、集中度
const day = summarizeDay({ date: '2026-09-25', code: '9999', open: 10, close: 11, fills: [
  { broker: 'A', price: 10, buy: 5000, sell: 0 },
  { broker: 'A', price: 11, buy: 5000, sell: 0 },
  { broker: 'B', price: 10, buy: 0, sell: 6000 },
  { broker: 'C', price: 11, buy: 1000, sell: 5000 },
  { broker: 'D', price: 10, buy: 1000, sell: 1000 },
] });
assert.equal(day.volume, 12000);
assert.equal(day.mainNet, 10000 - (6000 + 4000));
assert.equal(day.buyers, 3); assert.equal(day.sellers, 3); assert.equal(day.diff, 0);
assert.equal(day.byBroker.get('A').buyAmt / day.byBroker.get('A').buy, 10.5);
const rs = rangeStat([day]);
assert.equal(rs.concentration, 0);
assert.equal(rs.mainCost, 10.5);
console.log('主力買賣超、家數差、集中度、主力均價公式正確');

// 2. 平均成本帳：買 10 張@10、隔日賣 6 張@12、再賣 6 張@9（翻空 2 張）
const mk = (date, fills, close) => summarizeDay({ date, code: 'T', open: null, close, fills });
const L = ledger([
  mk('d1', [{ broker: 'A', price: 10, buy: 10 * LOT, sell: 0 }, { broker: 'Z', price: 10, buy: 0, sell: 10 * LOT }], 10),
  mk('d2', [{ broker: 'A', price: 12, buy: 0, sell: 6 * LOT }, { broker: 'Z', price: 12, buy: 6 * LOT, sell: 0 }], 12),
  mk('d3', [{ broker: 'A', price: 9, buy: 0, sell: 6 * LOT }, { broker: 'Z', price: 9, buy: 6 * LOT, sell: 0 }], 8),
], 'A');
assert.equal(L[1].realized, 6 * LOT * 2);
assert.equal(L[2].position, -2 * LOT);
assert.equal(L[2].realized, 6 * LOT * 2 + 4 * LOT * -1);
assert.equal(L[2].cost, 9);
assert.equal(L[2].unrealized, -2 * LOT * (8 - 9));
console.log('平均成本法：已實現、翻空、未實現正確');

// 3. 合成資料守恆與手法辨識
const ds = demoDataset();
assert.equal(ds.stocks.length, 22);
for (const code of ds.stocks) for (const d of ds.days[code]) {
  const b = d.fills.reduce((s, f) => s + f.buy, 0), s = d.fills.reduce((s, f) => s + f.sell, 0);
  assert.equal(b, s, `${code} ${d.date} 買賣不平衡`);
  assert.ok(d.low <= d.close && d.close <= d.high);
  assert.ok(d.fills.every(f => f.price >= d.low - 1e-9 && f.price <= d.high + 1e-9));
}
console.log('合成資料：22 檔 × 130 日，每日買進股數 = 賣出股數');
const persona = new Map(demoBrokers().map(b => [b.id, b.persona]));
const profiles = profileBrokers(ds, 130);
const byStyle = s => profiles.filter(p => p.style === s).map(p => persona.get(p.broker.id));
console.log('隔日沖判定：', byStyle('flip').join(','), '| 當沖：', byStyle('daytrade').join(','), '| 波段：', byStyle('swing').join(','));
assert.ok(byStyle('flip').filter(p => p === 'flip').length >= 3, '隔日沖分點應被辨識');
assert.ok(byStyle('flip').every(p => p === 'flip'), '不應誤判其他分點為隔日沖');
assert.ok(byStyle('daytrade').filter(p => p === 'daytrade').length >= 2, '當沖分點應被辨識');
assert.ok(byStyle('swing').includes('swing'), '波段分點應被辨識');
const fs = flipStat(ds.days['2330'], 'X300');
assert.ok(fs.hits <= fs.events);
console.log('手法判讀符合合成角色設定');

// 4. 選股與回溯可執行
const pmap = new Map(profiles.map(p => [p.broker.id, p]));
const rule = { mainStreak: 3, conc20: 0.02, diffNeg: 0, foreign5: false, broker: '', flipMax: null };
const row = screenAt(ds, '2330', ds.days['2330'].length - 1, rule, pmap);
assert.equal(row.mainStreak, mainStreak(ds.days['2330'], ds.days['2330'].length - 1));
const bt = backtest(ds, rule, pmap);
assert.ok(bt.count >= 0);
console.log(`回溯：${bt.count} 次觸發，5 日平均 ${(bt.avg * 100).toFixed(2)}%`);
console.log(`異常進駐（最新日）：${anomalies(ds).length} 筆`);

// 5. CSV 解析：證交所買賣日報表（兩筆並排、="..." 格式）與 FinMind
const bsr = [
  '券商買賣股票成交價量資訊',
  '股票代碼,="2330",台積電',
  '序號,券商,價格,買進股數,賣出股數,,序號,券商,價格,買進股數,賣出股數',
  '1,1020合　庫,1025.00,2000,0,,2,1440美林,1030.00,150000,3000',
  '3,9A00永豐金,1025.00,"1,000",5000,,4,592A元大土城永寧,1030.00,0,145000',
].join('\r\n');
const p1 = parseBrokerCsv(bsr, { date: '2026-09-25' });
assert.equal(p1.format, 'bsr'); assert.equal(p1.rows, 4); assert.equal(p1.days[0].code, '2330');
assert.equal(p1.names['2330'], '台積電');
assert.equal(p1.brokers.find(b => b.id === '1440').kind, 'foreign');
assert.equal(p1.brokers.find(b => b.id === '1020').kind, 'gov');
assert.equal(p1.brokers.find(b => b.id === '9A00').kind, 'domestic');
assert.equal(p1.days[0].fills.find(f => f.broker === '9A00').buy, 1000);
const d1 = buildDataset(p1.days, p1.brokers, p1.names, 'import');
assert.equal(d1.days['2330'][0].volume, 153000);
const fm = parseBrokerCsv('securities_trader,price,buy,sell,securities_trader_id,stock_id,date\n美林,1030,150000,0,1440,2330,2026-09-25\n元大,1030,0,150000,9800,2330,2026-09-25\n美林,1040,0,1000,1440,2330,2026-09-26\n元大,1040,1000,0,9800,2330,2026-09-26\n');
assert.equal(fm.format, 'finmind'); assert.equal(fm.days.length, 2); assert.equal(fm.rows, 4);
assert.equal(dateFromText('115/09/25'), '2026-09-25');
assert.equal(dateFromText('bsr_2330_20260925.csv'), '2026-09-25');
assert.equal(inferKind('港商野村'), 'foreign');
console.log('CSV 解析：買賣日報表、FinMind、民國日期、券商類別推定正確');
