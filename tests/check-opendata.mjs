// 執行：node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/check-opendata.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as O from '../src/lib/opendata.ts';
import { SOURCES, normalizeParams, cacheId, sessionTtl } from '../src/lib/open-sources.ts';
const fx = f => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
const json = f => JSON.parse(fx(f).toString('utf8'));

// 處置：2026-09 證交所實際回應
const p = O.parseTwsePunish(json('twse_punish.json'));
assert.equal(p.length, 3);
assert.deepEqual([p[0].code, p[0].start, p[0].end, p[0].level], ['2305', '2026-09-18', '2026-09-30', '第一次處置']);
assert.equal(p[0].matchMinutes, 2); assert.equal(p[0].fullPrepay, false);
assert.equal(p[1].level, '第二次處置'); assert.equal(p[1].fullPrepay, true); assert.equal(p[1].matchMinutes, 2);
assert.equal(p[0].announced, '2026-09-17');
assert.equal(O.matchMinutes('約每二十分鐘撮合一次'), 20); assert.equal(O.matchMinutes('約每五分鐘'), 5);
assert.equal(O.parseTwseNotice(json('twse_notice_empty.json')).length, 0, '假日空白列應被略過');
console.log('處置／注意：期間、次別、撮合間隔、全額預收解析正確（第二次處置亦約 2 分鐘，改為全部預收）');

// 行情、融資融券
const d = O.parseTwseDay(json('twse_day.json'));
assert.equal(d[0].date, '2026-09-24'); assert.equal(d[0].close, 15.66); assert.equal(d[1].change, -0.04); assert.equal(d[0].volume, 22871974);
const m = O.parseTwseMargin(json('twse_margin.json'));
assert.deepEqual([m[0].code, m[0].margin, m[0].short, m[0].shortPrev], ['00400A', 7997, 64, 37]);
console.log('日成交、融資融券：民國日期與數字欄位正確');

// 股東會 → 融券最後回補日（停止過戶首日前第 6 個營業日）
const mt = O.parseMeetings([{ 公司代號: '2330', 公司名稱: '台積電', '股東常(臨時)會日期-日期': '1150604', '停止過戶起訖日期-起': '1150406', '停止過戶起訖日期-訖': '1150604' }]);
assert.equal(mt[0].stopFrom, '2026-04-06'); assert.equal(mt[0].lastCover, '2026-03-27');
assert.equal(O.addBusinessDays('2026-09-28', -6), '2026-09-18');
assert.equal(O.businessDaysBetween('2026-09-25', '2026-09-30'), 3);
console.log('融券最後回補日推算正確（未扣國定假日）');

// 可轉債日行情：Big5 標籤式 CSV
const text = new TextDecoder('big5').decode(fx('tpex_cb_quotes_20260924.csv'));
const q = O.parseCBQuotes(text);
assert.equal(q.date, '2026-09-24'); assert.equal(q.rows.length, 2, '合計列不應算成一檔');
const a = q.rows.find(r => r.code === '12561');
assert.equal(a.name, '鮮活果汁一KY'); assert.equal(a.close, 102); assert.equal(a.volume, 25, '等價 20 張 + 議價 5 張'); assert.equal(a.amount, 2040000);
assert.equal(q.rows[0].name, '台泥一永'); assert.equal(q.rows[0].change, 0.3);
const b64 = fx('tpex_cb_quotes_20260924.csv').toString('base64');
assert.equal(O.parseCBQuotes(O.decodeBase64(b64)).rows.length, 2);
const put = O.parsePutProvision(json('tpex_cb_put.json'));
assert.deepEqual([put[1].code, put[1].putDate, put[1].putPrice, put[1].ytp], ['99063', '2027-02-27', 103.0225, 1.5]);
const terms = O.parseConvTerms('代號,轉換價,到期\n11011, 36.5, 2027-12-10\n12561\t190.0\n無效列\n');
assert.deepEqual(terms['11011'], { convPrice: 36.5, maturity: '2027-12-10' }); assert.equal(terms['12561'].convPrice, 190);
const mon = O.parseStockMonth(json('twse_stock_month.json'));
assert.deepEqual([mon[0].date, mon[0].close, mon[1].volume], ['2026-09-01', 1270, 30001222]);
console.log('可轉債：Big5 行情表（一檔兩列、合計列）、賣回權、轉換價貼上格式、個股月資料解析正確');

// 來源登記表：參數驗證與快取鍵
assert.equal(normalizeParams(SOURCES.tpex_cb_quotes, { date: '2026-09-24' }).date, '2026-09-24');
assert.equal(normalizeParams(SOURCES.tpex_cb_quotes, { date: '../../etc' }), null);
assert.equal(normalizeParams(SOURCES.twse_stock_month, { code: '2330', month: '202609' }).code, '2330');
assert.equal(normalizeParams(SOURCES.twse_stock_month, { code: '2330;', month: '202609' }), null);
assert.equal(SOURCES.tpex_cb_quotes.url({ date: '2026-09-24' }), 'https://www.tpex.org.tw/storage/bond_zone/tradeinfo/cb/2026/202609/RSta0113.20260924-C.csv');
assert.equal(cacheId(SOURCES.twse_stock_month, { code: '2330', month: '202609' }), 'twse_stock_month:2330:202609');
assert.ok(SOURCES.tpex_cb_quotes.immutable({ date: '2026-09-24' }, Date.parse('2026-09-27T12:00:00+08:00')));
assert.ok(sessionTtl(Date.parse('2026-09-28T10:00:00+08:00')) < sessionTtl(Date.parse('2026-09-27T10:00:00+08:00')));
console.log('來源登記表：參數白名單、網址、快取鍵與快取時間正確');
