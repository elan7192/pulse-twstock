// 自選股群組（仿籌碼K線電腦版「編輯自選股」）與分點調查局的熱門券商組合。
import { mainStreak, rangeStat, type Dataset } from './branch';

export type WatchGroup = { id: string; name: string; codes: string[] };
export type Watch = { groups: WatchGroup[] };
export const DEFAULT_WATCH: Watch = { groups: [{ id: 'g1', name: '我的自選', codes: ['2330', '2317', '2454'] }, { id: 'g2', name: '觀察中', codes: [] }] };

/** 從任意文字取出股票代號（4–6 碼，含英數，需有數字），去重並保留順序。 */
export function parseCodes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toUpperCase().matchAll(/(?<![0-9A-Z])[0-9A-Z]{4,6}(?![0-9A-Z])/g)) if (/\d/.test(m[0]) && !out.includes(m[0])) out.push(m[0]);
  return out;
}
const upd = (w: Watch, id: string, f: (g: WatchGroup) => WatchGroup): Watch => ({ groups: w.groups.map(g => (g.id === id ? f(g) : g)) });
export function addCodes(w: Watch, id: string, codes: string[]): { watch: Watch; added: number } {
  let added = 0;
  const watch = upd(w, id, g => { const next = [...g.codes]; for (const c of codes) if (!next.includes(c)) { next.push(c); added++; } return { ...g, codes: next }; });
  return { watch, added };
}
export const removeCode = (w: Watch, id: string, code: string) => upd(w, id, g => ({ ...g, codes: g.codes.filter(c => c !== code) }));
export function moveCode(w: Watch, id: string, code: string, step: -1 | 1): Watch {
  return upd(w, id, g => { const a = [...g.codes]; const i = a.indexOf(code), j = i + step; if (i < 0 || j < 0 || j >= a.length) return g; [a[i], a[j]] = [a[j], a[i]]; return { ...g, codes: a }; });
}
export function addGroup(w: Watch, name: string): { watch: Watch; id: string } {
  const n = Math.max(0, ...w.groups.map(g => Number(g.id.slice(1)) || 0)) + 1; const id = `g${n}`;
  return { watch: { groups: [...w.groups, { id, name: name.trim() || `群組 ${n}`, codes: [] }] }, id };
}
export const renameGroup = (w: Watch, id: string, name: string) => upd(w, id, g => ({ ...g, name: name.trim() || g.name }));
export const deleteGroup = (w: Watch, id: string): Watch => (w.groups.length <= 1 ? w : { groups: w.groups.filter(g => g.id !== id) });
/** 讀回的 JSON 可能被改壞：只保留合法欄位。 */
export function sanitizeWatch(v: unknown): Watch | null {
  const g = (v as Watch | null)?.groups; if (!Array.isArray(g)) return null;
  const groups = g.filter(x => x && typeof x.id === 'string' && typeof x.name === 'string' && Array.isArray(x.codes)).map(x => ({ id: x.id, name: x.name.slice(0, 30), codes: x.codes.filter((c: unknown) => typeof c === 'string' && /^[0-9A-Z]{4,6}$/.test(c)) }));
  return groups.length ? { groups } : null;
}

export type Category = { key: string; label: string; codes: string[] };
/** 編輯視窗左側分類：全部個股與幾個籌碼條件。 */
export function categories(ds: Dataset): Category[] {
  const last = (c: string) => ds.days[c].at(-1)!;
  const byMain = [...ds.stocks].sort((a, b) => last(b).mainNet - last(a).mainNet);
  const conc = ds.stocks.map(c => { const d = ds.days[c]; return { c, v: d.length >= 20 ? rangeStat(d.slice(-20)).concentration : -Infinity }; }).sort((a, b) => b.v - a.v);
  return [
    { key: 'all', label: '全部個股', codes: [...ds.stocks] },
    { key: 'main', label: '今日主力買超前 10', codes: byMain.filter(c => last(c).mainNet > 0).slice(0, 10) },
    { key: 'streak', label: '主力連買 ≥ 3 日', codes: ds.stocks.filter(c => mainStreak(ds.days[c], ds.days[c].length - 1) >= 3) },
    { key: 'conc', label: '20 日集中度前 10', codes: conc.filter(x => x.v > 0).slice(0, 10).map(x => x.c) },
    { key: 'diff', label: '買賣家數差為負', codes: ds.stocks.filter(c => last(c).diff < 0) },
  ];
}

export type HotCombo = { code: string; broker: string; net: number; amount: number; share: number };
/** 熱門券商組合：指定日所有個股的買超／賣超前 15 分點，依淨買賣金額排行（每檔最多 perStock 組）。 */
export function hotCombos(ds: Dataset, date: string, n = 12, perStock = 3): { buy: HotCombo[]; sell: HotCombo[] } {
  const all: HotCombo[] = [];
  for (const code of ds.stocks) {
    const d = ds.days[code].find(x => x.date === date); if (!d || !d.volume) continue;
    for (const f of [...d.topBuy, ...d.topSell]) all.push({ code, broker: f.broker, net: f.net, amount: f.net * d.vwap, share: Math.abs(f.net) / d.volume });
  }
  // 同一檔最多 perStock 組，避免大型權值股佔滿排行
  const cap = (list: HotCombo[]) => { const k = new Map<string, number>(); return list.filter(x => { const c = (k.get(x.code) ?? 0) + 1; k.set(x.code, c); return c <= perStock; }).slice(0, n); };
  return { buy: cap(all.filter(x => x.net > 0).sort((a, b) => b.amount - a.amount)), sell: cap(all.filter(x => x.net < 0).sort((a, b) => a.amount - b.amount)) };
}
