// 執行：node --experimental-strip-types --import ./tests/ts-resolve.mjs tests/check-branch-geo.mjs
import assert from 'node:assert/strict';
import * as G from '../src/lib/geo.ts';
import * as W from '../src/lib/watch.ts';
import { demoShared, rangeStat } from '../src/lib/branch.ts';

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
