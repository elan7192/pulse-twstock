// 執行：node --experimental-strip-types --import ./tests/ts-resolve.mjs tests/check-branch-geo.mjs
import assert from 'node:assert/strict';
import * as G from '../src/lib/geo.ts';
import * as W from '../src/lib/watch.ts';
import { demoShared, fillPrices, mainVerdict, rangeStat } from '../src/lib/branch.ts';

// 1. 分點名稱 → 縣市
for (const [n, c] of [['元大-竹北', '新竹縣'], ['凱基-台北', '臺北市'], ['富邦-建國', '臺北市'], ['永豐金-新營', '臺南市'], ['統一-員林', '彰化縣'], ['兆豐-北高雄', '高雄市'], ['元富-中壢', '桃園市'], ['華南永昌-板橋', '新北市']]) assert.equal(G.branchCounty(n), c, n);
assert.equal(G.branchCounty('美林'), null); assert.equal(G.branchCounty('某券商-火星'), null);

// 2. 地址 → 縣市（證交所中文、櫃買英文，含舊縣名與拼法差異）
assert.equal(G.addressCounty('新竹市東區力行六路8號'), '新竹市');
assert.equal(G.addressCounty('臺北縣土城市自由街2號'), '新北市');
assert.equal(G.addressCounty('2F.,No.30,Sec. 1,Heping W.Rd.,Zhongzheng Dist.,Taipei City 100028TAIPEI,TAIWAN(R.O.C)'), '臺北市');
assert.equal(G.addressCounty('No. 2, Ziyou St., Tucheng Dist., New Taipei City'), '新北市');
assert.equal(G.addressCounty('No.1, Hsin Tai Wu Rd., Zhubei City, Hsinchu County'), '新竹縣');
assert.equal(G.addressCounty('Hsinchu Science Park, Hsinchu City'), '新竹市');
assert.equal(G.addressCounty('Zhongli Dist., Taoyuan City'), '桃園市');
assert.equal(G.addressCounty('George Town, Grand Cayman, Cayman Islands'), null);

// 3. 主力地圖：示範資料中鴻海（新北）有新北分點進出，地緣券商皆為新北
const ds = demoShared(); const rs = rangeStat(ds.days['2317'].slice(-20));
const m = G.brokerMap(ds, rs.flows, '新北市');
assert.ok(m.local.length > 0 && m.local.every(f => f.county === '新北市'));
assert.equal(m.localNet, m.local.reduce((s, f) => s + f.net, 0));
const tot = m.counties.reduce((s, c) => s + c.net, 0); assert.ok(Number.isFinite(tot));
assert.equal(new Set(Object.values(G.TILE).map(([x, y]) => `${x},${y}`)).size, G.COUNTIES.length, '方格不重疊');

// 4. 自選股群組
assert.deepEqual(W.parseCodes('2330, 2317\n00878 p101 2330 12 abcd 台積電'), ['2330', '2317', '00878', 'P101']);
let w = W.DEFAULT_WATCH; const r = W.addCodes(w, 'g2', ['2330', '2603', '2330']); assert.equal(r.added, 2); w = r.watch;
assert.deepEqual(w.groups[1].codes, ['2330', '2603']);
w = W.moveCode(w, 'g2', '2603', -1); assert.deepEqual(w.groups[1].codes, ['2603', '2330']);
w = W.moveCode(w, 'g2', '2603', -1); assert.deepEqual(w.groups[1].codes, ['2603', '2330'], '頂端不再上移');
w = W.removeCode(w, 'g2', '2603'); assert.deepEqual(w.groups[1].codes, ['2330']);
const ng = W.addGroup(w, ' 半導體 '); assert.equal(ng.id, 'g3'); assert.equal(ng.watch.groups[2].name, '半導體');
w = W.renameGroup(ng.watch, 'g3', 'AI'); assert.equal(w.groups[2].name, 'AI');
w = W.deleteGroup(w, 'g3'); assert.equal(w.groups.length, 2);
assert.equal(W.deleteGroup({ groups: [w.groups[0]] }, 'g1').groups.length, 1, '最後一個群組不能刪');
assert.equal(W.sanitizeWatch({ groups: [{ id: 'g1', name: 'x', codes: ['2330', '<b>', 5] }] }).groups[0].codes.length, 1);
assert.equal(W.sanitizeWatch('壞掉'), null);

// 5. 分類與熱門券商組合
const cats = W.categories(ds); assert.equal(cats[0].codes.length, ds.stocks.length);
for (const c of cats) assert.ok(c.codes.every(x => ds.stocks.includes(x)));
const hot = W.hotCombos(ds, ds.dates.at(-1));
assert.ok(hot.buy.length > 0 && hot.buy.every(h => h.net > 0) && hot.sell.every(h => h.net < 0));
for (let i = 1; i < hot.buy.length; i++) assert.ok(hot.buy[i - 1].amount >= hot.buy[i].amount);
const per = {}; hot.buy.forEach(h => { per[h.code] = (per[h.code] ?? 0) + 1; }); assert.ok(Object.values(per).every(n => n <= 3));
console.log('分點地圖、自選股群組、熱門券商組合 ok');

// 6. 真實買賣日報表的分點名稱沒有「-」；券商名錄代號優先
for (const [n, c] of [['元大土城永寧', '新北市'], ['凱基台北', '臺北市'], ['統一員林', '彰化縣'], ['群益金鼎大安', '臺北市'], ['合庫', null], ['永豐金', null], ['新光', null]]) assert.equal(G.branchCounty(n), c, n);
assert.equal(G.brokerCounty({ id: '1021', name: '合庫台中', kind: 'gov' }, { 1021: '臺中市' }), '臺中市');
assert.equal(G.brokerCounty({ id: '1020', name: '合庫', kind: 'gov' }, { 1020: '臺北市' }), '臺北市', '總公司靠名錄');
assert.equal(G.brokerCounty({ id: '1440', name: '美林', kind: 'foreign' }, { 1440: '臺北市' }), null, '外資不上圖');
assert.equal(G.addressCounty('新竹科學園區力行六路8號'), '新竹市');
assert.equal(G.addressCounty('新竹科學園區新竹巿力行五路七號'), '新竹市');
assert.equal(G.addressCounty('台北巿大安區忠孝東路四段219號12樓'), '臺北市');
assert.equal(G.addressCounty('板橋區民生路一段一號'), '新北市');
assert.equal(G.addressCounty('(235)新北巿中和區建一路166號3樓'), '新北市');
assert.equal(G.addressCounty('廣東省東莞市厚街鎮橋頭第三工業區'), null);

// 7. 匯入分點資料補上公開收盤行情（不覆蓋已有值）
const raw = [{ date: '2026-09-24', code: '2330', open: null, close: null, fills: [] }, { date: '2026-09-24', code: '2317', open: 1, close: 2, fills: [] }];
const filled = fillPrices(raw, { 2330: [['2026-09-24', 2480, 2490, 2470, 2475, 1]], 2317: [['2026-09-24', 9, 9, 9, 9, 1]] });
assert.deepEqual([filled[0].open, filled[0].high, filled[0].low, filled[0].close], [2480, 2490, 2470, 2475]);
assert.equal(filled[1].open, 1); assert.equal(filled[1].close, 2);
console.log('真實分點名稱、券商名錄、公司地址、收盤行情補值 ok');

// 8. 今日主力動向分級
for (const [s, l] of [[0.19, '大買'], [0.1, '大買'], [0.05, '買'], [0.03, '買'], [0.029, '中性'], [0, '中性'], [-0.029, '中性'], [-0.03, '賣'], [-0.1, '大賣']]) assert.equal(mainVerdict(s).label, l, String(s));
assert.equal(mainVerdict(0.2).level, 'buy2'); assert.equal(mainVerdict(-0.2).level, 'sell2');
console.log('主力動向分級 ok');
