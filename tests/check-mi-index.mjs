import assert from 'node:assert/strict';
import { parseMiIndex } from '../scripts/mi-index.mjs';
const fields = ['證券代號', '證券名稱', '成交股數', '成交筆數', '成交金額', '開盤價', '最高價', '最低價', '收盤價', '漲跌(+/-)', '漲跌價差'];
const row = ['2330', '台積電', '32,000,000', '40,000', '41,280,000,000', '1,285.00', '1,300.00', '1,280.00', '1,290.00', '+', '5.00'];
const a = parseMiIndex({ stat: 'OK', tables: [{ title: '價格指數', fields: ['指數', '收盤指數'], data: [] }, { title: '每日收盤行情', fields, data: [row, ['0050', '元大台灣50', '0', '0', '0', '--', '--', '--', '--', '', '']] }] });
assert.deepEqual(a, [['2330', 1285, 1300, 1280, 1290, 32000000]]);
assert.deepEqual(parseMiIndex({ stat: 'OK', fields9: fields, data9: [row] })[0][4], 1290);
assert.equal(parseMiIndex({ stat: '很抱歉，沒有符合條件的資料!' }), null);
console.log('MI_INDEX：新版 tables、舊版 fields9、休市回應解析正確');
