// 執行：node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/check-futures.mjs
import assert from 'node:assert/strict';
import * as F from '../src/lib/futures.ts';
import { demoShared } from '../src/lib/branch.ts';
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);

// 1. JSON（英文欄名，依期交所 OpenAPI 欄位）
const fut = F.parseFuturesReport(JSON.stringify([
  { Date: '20260925', Contract: 'CDF', 'ContractMonth(Week)': '202610', Open: '1290', High: '1300', Low: '1285', Last: '1295', Change: '5', '%': '0.39%', Volume: '8123', SettlementPrice: '1295', OpenInterest: '20111', BestBid: '1290', BestAsk: '1300', TradingSession: '一般' },
  { Date: '20260925', Contract: 'CDF', 'ContractMonth(Week)': '202611', Last: '1300', Volume: '120', SettlementPrice: '1300', OpenInterest: '900', TradingSession: '一般' },
  { Date: '20260925', Contract: 'CDF', 'ContractMonth(Week)': '202610/202611', Last: '5', Volume: '30', TradingSession: '一般' },
  { Date: '20260925', Contract: 'CDF', 'ContractMonth(Week)': '202610', Last: '1298', Volume: '500', SettlementPrice: '', TradingSession: '盤後' },
]));
assert.equal(fut.length, 3, '價差委託列應排除');
const mg = F.parseStockFuturesMargin(JSON.stringify([
  { Date: '20260925', Contract: 'CDF', UnderlyingSecurityCode: '2330', ContractName: '台積電期貨', GroupLevel: '級距1', ClearingMarginRate: '10.00%', MaintenanceMarginRate: '10.35%', InitialMarginRate: '13.50%' },
  { Date: '20260925', Contract: 'QFF', UnderlyingSecurityCode: '2330', ContractName: '小型台積電期貨', GroupLevel: '級距1', ClearingMarginRate: '0.1', MaintenanceMarginRate: '0.1035', InitialMarginRate: '0.135' },
]));
assert.equal(mg[0].initial, 0.135); assert.equal(mg[1].initial, 0.135);
const rows = F.buildStockFutures(fut, mg, new Map([['2330', 1290]]));
const std = rows.find(r => r.contract === 'CDF'), small = rows.find(r => r.contract === 'QFF');
assert.equal(std.month, '202610'); assert.equal(std.price, 1295); assert.equal(std.months.length, 2, '只取一般交易時段');
assert.equal(std.size, 2000); assert.equal(small.size, 100);
near(std.initial, 1295 * 2000 * 0.135); near(std.maintenance, 1295 * 2000 * 0.1035);
assert.equal(std.basis, 5); near(std.leverage, 1 / 0.135);
console.log('JSON：近月、一般時段、排除價差列、契約規模、保證金金額、基差正確');

// 2. CSV（期交所間歇改回 CSV，中文欄名）
const csv = '交易日期,契約,到期月份(週別),開盤價,最高價,最低價,收盤價,漲跌價,漲跌%,成交量,結算價,未沖銷契約數,最後最佳買價,最後最佳賣價,交易時段\n2026/09/25,CDF,202610,1290,1300,1285,1295,5,0.39%,"8,123",1295,"20,111",1290,1300,一般\n';
const c = F.parseFuturesReport(csv);
assert.equal(c[0].volume, 8123); assert.equal(c[0].oi, 20111); assert.equal(c[0].date, '2026-09-25');
const mcsv = F.parseStockFuturesMargin('股票期貨英文代碼,證券代號,股票期貨中文簡稱,級距,結算保證金適用比例,維持保證金適用比例,原始保證金適用比例\nCDF,2330,台積電期貨,級距1,10.00%,10.35%,13.50%\n');
assert.deepEqual([mcsv[0].contract, mcsv[0].code, mcsv[0].maintenance], ['CDF', '2330', 0.1035]);
console.log('CSV：中文欄名、千分位、日期格式解析正確');

// 3. 追繳價：多單 1 口台積電期 1295，原始 349,650、維持 268,065 → 可承受 81,585 元 ÷ 2000 股 = 40.79 元
const init = 1295 * 2000 * 0.135, maint = 1295 * 2000 * 0.1035;
near(F.callPrice(1295, 2000, init, maint, 'long'), 1295 - (init - maint) / 2000);
near(F.callPrice(1295, 2000, init, maint, 'short'), 1295 + (init - maint) / 2000);
assert.equal(F.contractSize('元大台灣50期貨', '0050'), 10000);
assert.deepEqual(F.LEVELS.map(l => l[3]), [0.135, 0.162, 0.2025]);
const demo = F.demoStockFutures(demoShared());
assert.ok(demo.length >= 22 && demo.every(r => r.initial > r.maintenance));
console.log('追繳價、ETF 規模、三級距、示範資料正確');
