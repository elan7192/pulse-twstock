// 證交所 MI_INDEX（每日收盤行情）解析；新版 tables[] 與舊版 fieldsN/dataN 都支援。
export const num = v => { const s = String(v ?? '').replace(/,/g, '').trim(); if (!s || /^-+$/.test(s)) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
export /** 證交所「每日收盤行情（全部，不含權證）」：一次取得全部上市股票當日開高低收量。 */
function parseMiIndex(json) {
  if (!json || (json.stat && json.stat !== 'OK')) return null;
  const tables = Array.isArray(json.tables) ? json.tables : Object.keys(json).filter(k => /^fields\d+$/.test(k)).map(k => ({ fields: json[k], data: json[k.replace('fields', 'data')] }));
  const t = tables.find(t => Array.isArray(t.fields) && t.fields.includes('證券代號') && t.fields.some(f => f.includes('收盤價')));
  if (!t) return null;
  const i = n => t.fields.findIndex(f => f.includes(n));
  const [ic, io, ih, il, iC, iv] = [i('證券代號'), i('開盤價'), i('最高價'), i('最低價'), i('收盤價'), i('成交股數')];
  return (t.data ?? []).map(r => [String(r[ic]).trim(), num(r[io]), num(r[ih]), num(r[il]), num(r[iC]), num(r[iv])]).filter(r => /^[0-9A-Z]{4,6}$/.test(r[0]) && r[4] != null);
}

