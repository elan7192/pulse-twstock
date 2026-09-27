// 證交所／櫃買公開資料解析（瀏覽器端執行；Big5 由瀏覽器 TextDecoder 解碼）。
// 欄位名稱以 2026-09 實際回應為準；櫃買 OpenAPI 部分欄位未能實測，採多名稱容錯。

export type Market = '上市' | '上櫃';
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
/** 取第一個存在的欄位；也接受欄名包含關鍵字。 */
function pick(r: Record<string, unknown>, keys: string[], contains: string[] = []): string {
  for (const k of keys) if (k in r && str(r[k])) return str(r[k]);
  for (const c of contains) { const k = Object.keys(r).find(x => x.includes(c)); if (k && str(r[k])) return str(r[k]); }
  return '';
}
export function num(v: unknown): number | null {
  const s = str(v).replace(/,/g, '').replace(/^[+＋]/, '').replace(/[−–]/g, '-');
  if (!s || s === '--' || s === '---' || s === 'X') return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
/** 民國 1150917、115/09/17、115年09月17日、西元 20260917、2026-09-17、2026/09/17 → 2026-09-17。 */
export function toDate(v: unknown): string | null {
  const s = str(v);
  let m = s.match(/^(1\d{2})(\d{2})(\d{2})$/); if (m) return `${+m[1] + 1911}-${m[2]}-${m[3]}`;
  m = s.match(/(?<!\d)(20\d{2})[/.-]?(\d{2})[/.-]?(\d{2})(?!\d)/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(?<!\d)(\d{2,3})\s*[/年.-]\s*(\d{1,2})\s*[/月.-]\s*(\d{1,2})/); if (m && +m[1] < 200) return `${+m[1] + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}
export function addBusinessDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z'); let k = 0; const step = n >= 0 ? 1 : -1;
  while (k < Math.abs(n)) { d.setUTCDate(d.getUTCDate() + step); const w = d.getUTCDay(); if (w > 0 && w < 6) k++; }
  return d.toISOString().slice(0, 10);
}
export function businessDaysBetween(from: string, to: string): number {
  if (to <= from) return 0; let n = 0; const d = new Date(from + 'T00:00:00Z');
  while (d.toISOString().slice(0, 10) < to) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w > 0 && w < 6) n++; }
  return n;
}
const list = (json: unknown): Record<string, unknown>[] => (Array.isArray(json) ? json.map(obj) : Array.isArray(obj(json).data) ? (obj(json).data as unknown[]).map(obj) : []);

// ---------- 處置／注意 ----------
export type Disposition = { market: Market; code: string; name: string; announced: string | null; start: string | null; end: string | null; level: string; reason: string; matchMinutes: number | null; fullPrepay: boolean; detail: string };
const ZH: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function zhNumber(s: string) { if (/^\d+$/.test(s)) return +s; if (s === '十') return 10; const [a, b] = s.split('十'); return s.includes('十') ? (a ? ZH[a] : 1) * 10 + (b ? ZH[b] : 0) : ZH[s] ?? NaN; }
export function matchMinutes(detail: string): number | null {
  const m = detail.match(/每\s*([一二三四五六七八九十\d]+)\s*分鐘/); if (!m) return null;
  const n = zhNumber(m[1]); return Number.isFinite(n) ? n : null;
}
function period(v: string): [string | null, string | null] {
  const parts = v.split(/[～~至\-－]+/).map(x => x.trim()).filter(Boolean);
  return [toDate(parts[0]), toDate(parts[1] ?? '')];
}
export function parseTwsePunish(json: unknown): Disposition[] {
  return list(json).map(r => {
    const [start, end] = period(pick(r, ['DispositionPeriod']));
    const detail = pick(r, ['Detail']);
    return { market: '上市' as Market, code: pick(r, ['Code']), name: pick(r, ['Name']), announced: toDate(pick(r, ['Date'])), start, end, level: pick(r, ['DispositionMeasures']) || '處置',
      reason: pick(r, ['ReasonsOfDisposition']), matchMinutes: matchMinutes(detail), fullPrepay: /所有投資人每日委託/.test(detail), detail };
  }).filter(d => d.code);
}
export function parseTpexDisposal(json: unknown): Disposition[] {
  return list(json).map(r => {
    const [start, end] = period(pick(r, ['DispositionPeriod', 'Period'], ['期間', 'Period']));
    const detail = pick(r, ['DisposalCondition', 'DispositionMeasures', 'Measures', 'Detail'], ['措施', '內容', 'Condition']);
    return { market: '上櫃' as Market, code: pick(r, ['SecuritiesCompanyCode', 'Code'], ['代號', 'Code']), name: pick(r, ['CompanyName', 'Name'], ['名稱', 'Name']),
      announced: toDate(pick(r, ['Date', 'AnnouncementDate'], ['日期'])), start, end, level: /第二次|再次/.test(detail) ? '第二次處置' : /第一次/.test(detail) ? '第一次處置' : '處置',
      reason: pick(r, ['DispositionReasons', 'Reason'], ['原因', 'Reason']), matchMinutes: matchMinutes(detail), fullPrepay: /所有投資人/.test(detail), detail };
  }).filter(d => d.code);
}
export type Notice = { market: Market; code: string; name: string; count: number | null; info: string; close: number | null; date: string | null };
export function parseTwseNotice(json: unknown): Notice[] {
  return list(json).map(r => ({ market: '上市' as Market, code: pick(r, ['Code']), name: pick(r, ['Name']), count: num(r.NumberOfAnnouncement), info: pick(r, ['TradingInfoForAttention']), close: num(r.ClosingPrice), date: toDate(pick(r, ['Date'])) })).filter(n => n.code);
}
export function parseTpexWarning(json: unknown): Notice[] {
  return list(json).map(r => ({ market: '上櫃' as Market, code: pick(r, ['SecuritiesCompanyCode', 'Code'], ['代號']), name: pick(r, ['CompanyName', 'Name'], ['名稱']), count: num(pick(r, ['NumberOfAnnouncement', 'AccumulatedTimes'], ['次數', 'Times'])),
    info: pick(r, ['TradingInformation', 'TradingInfoForAttention'], ['資訊', 'Information', 'Reason']), close: num(pick(r, ['ClosePrice', 'ClosingPrice', 'Close'], ['收盤'])), date: toDate(pick(r, ['Date'], ['日期'])) })).filter(n => n.code);
}
export type NoteTrans = { code: string; name: string; criteria: string };
export function parseNoteTrans(json: unknown): NoteTrans[] {
  return list(json).map(r => ({ code: pick(r, ['Code']), name: pick(r, ['Name']), criteria: pick(r, ['RecentlyMetAttentionSecuritiesCriteria']) })).filter(n => n.code);
}

// ---------- 行情、融資融券 ----------
export type DayQuote = { market: Market; code: string; name: string; date: string | null; open: number | null; high: number | null; low: number | null; close: number | null; change: number | null; volume: number | null };
export function parseTwseDay(json: unknown): DayQuote[] {
  return list(json).map(r => ({ market: '上市' as Market, code: pick(r, ['Code']), name: pick(r, ['Name']), date: toDate(pick(r, ['Date'])), open: num(r.OpeningPrice), high: num(r.HighestPrice), low: num(r.LowestPrice), close: num(r.ClosingPrice), change: num(r.Change), volume: num(r.TradeVolume) })).filter(q => q.code);
}
export function parseTpexDay(json: unknown): DayQuote[] {
  return list(json).map(r => ({ market: '上櫃' as Market, code: pick(r, ['SecuritiesCompanyCode', 'Code']), name: pick(r, ['CompanyName', 'Name']), date: toDate(pick(r, ['Date'])), open: num(r.Open), high: num(r.High), low: num(r.Low), close: num(r.Close), change: num(r.Change), volume: num(pick(r, ['TradingShares', 'TradeVolume'])) })).filter(q => q.code);
}
export type Margin = { market: Market; code: string; name: string; margin: number | null; short: number | null; shortPrev: number | null };
export function parseTwseMargin(json: unknown): Margin[] {
  return list(json).map(r => ({ market: '上市' as Market, code: pick(r, ['股票代號']), name: pick(r, ['股票名稱']), margin: num(r['融資今日餘額']), short: num(r['融券今日餘額']), shortPrev: num(r['融券前日餘額']) })).filter(m => m.code);
}
export function parseTpexMargin(json: unknown): Margin[] {
  return list(json).map(r => ({ market: '上櫃' as Market, code: pick(r, ['SecuritiesCompanyCode', 'Code']), name: pick(r, ['CompanyName', 'Name']), margin: num(pick(r, ['MarginPurchaseBalance'], ['MarginPurchaseBalance'])), short: num(pick(r, ['ShortSaleBalance'], ['ShortSaleBalance'])), shortPrev: num(pick(r, ['ShortSalePreviousDayBalance', 'ShortSaleBalancePreviousDay'], ['ShortSalePrevious'])) })).filter(m => m.code);
}
export type Meeting = { code: string; name: string; meetingDate: string | null; stopFrom: string | null; stopTo: string | null; lastCover: string | null };
/** 融券最後回補日：停止過戶首日前第 6 個營業日（未扣國定假日，需以公告為準）。 */
export function lastCoverDate(stopFrom: string | null) { return stopFrom ? addBusinessDays(stopFrom, -6) : null; }
export function parseMeetings(json: unknown): Meeting[] {
  return list(json).map(r => {
    const stopFrom = toDate(pick(r, ['停止過戶起訖日期-起'], ['停止過戶起訖日期-起', '停止過戶起']));
    return { code: pick(r, ['公司代號']), name: pick(r, ['公司名稱']), meetingDate: toDate(pick(r, ['股東常(臨時)會日期-日期'], ['會日期-日期'])), stopFrom, stopTo: toDate(pick(r, ['停止過戶起訖日期-訖'], ['停止過戶起訖日期-訖'])), lastCover: lastCoverDate(stopFrom) };
  }).filter(m => m.code);
}

// ---------- 個股月成交（證交所 STOCK_DAY） ----------
export type Bar = { date: string; open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null };
export function parseStockMonth(json: unknown): Bar[] {
  const d = obj(json); const rows = Array.isArray(d.data) ? d.data as unknown[][] : [];
  const f = Array.isArray(d.fields) ? (d.fields as unknown[]).map(str) : [];
  const at = (k: string, dflt: number) => { const i = f.findIndex(x => x.includes(k)); return i < 0 ? dflt : i; };
  const [iD, iV, iO, iH, iL, iC] = [at('日期', 0), at('成交股數', 1), at('開盤', 3), at('最高', 4), at('最低', 5), at('收盤', 6)];
  return rows.map(r => ({ date: toDate(r[iD]) ?? '', volume: num(r[iV]), open: num(r[iO]), high: num(r[iH]), low: num(r[iL]), close: num(r[iC]) })).filter(b => b.date);
}

// ---------- 可轉債 ----------
export function decodeBase64(b64: string, encoding = 'big5'): string {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder(encoding).decode(bytes); }
}
function csvLine(line: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out.map(s => s.replace(/　/g, ' ').trim());
}
export type CBQuote = { code: string; name: string; close: number | null; change: number | null; open: number | null; high: number | null; low: number | null; volume: number; amount: number | null; refNext: number | null };
/** 每日可轉債買賣斷行情表：標籤式 CSV（HEADER／BODY），一檔兩列（等價、議價），代號只在第一列。成交量合計兩列（單位：張）。 */
export function parseCBQuotes(text: string): { date: string | null; rows: CBQuote[] } {
  let header: string[] | null = null, date: string | null = null, last = { code: '', name: '' };
  const m = new Map<string, CBQuote>();
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cells = csvLine(raw); const tag = cells[0];
    if (tag === 'DATADATE') { date = toDate(cells.slice(1).join(',')); continue; }
    if (tag === 'HEADER') { header = cells.slice(1); continue; }
    if (tag !== 'BODY' || !header) continue;
    const rec: Record<string, string> = {}; header.forEach((h, i) => { rec[h] = cells[i + 1] ?? ''; });
    if (rec['代號']) last = { code: rec['代號'], name: rec['名稱'] }; else { rec['代號'] = last.code; rec['名稱'] = last.name; }
    if (!rec['代號'] || !/^\d{5,6}$/.test(rec['代號'])) continue;
    const q = m.get(rec['代號']) ?? { code: rec['代號'], name: rec['名稱'], close: null, change: null, open: null, high: null, low: null, volume: 0, amount: null, refNext: null };
    const isMain = rec['交易'] === '等價' || !rec['交易'];
    if (isMain) { q.close = num(rec['收市']); q.change = num(rec['漲跌']); q.open = num(rec['開市']); q.high = num(rec['最高']); q.low = num(rec['最低']); q.amount = num(rec['金額']); q.refNext = num(rec['明日參價']); }
    q.volume += num(rec['單位']) ?? 0;
    m.set(q.code, q);
  }
  if (!header) throw new Error('找不到 HEADER 列，行情表格式可能已變更');
  return { date, rows: [...m.values()] };
}
export type PutInfo = { code: string; name: string; putDate: string | null; putPrice: number | null; ytp: number | null };
/** 櫃買 /bond/putProvision：{ tables: [{ fields, data }] }。 */
export function parsePutProvision(json: unknown): PutInfo[] {
  const t = obj((obj(json).tables as unknown[] | undefined)?.[0]); const fields = (t.fields as string[] | undefined) ?? []; const rows = (t.data as unknown[][] | undefined) ?? [];
  const idx = (k: string) => fields.findIndex(f => f.includes(k));
  const [ic, iname, id, ip, iy] = [idx('代號'), idx('名稱'), idx('日期'), idx('金額'), idx('收益率')];
  return rows.map(r => ({ code: str(r[ic < 0 ? 0 : ic]), name: str(r[iname < 0 ? 1 : iname]), putDate: toDate(r[id < 0 ? 2 : id]), putPrice: num(r[ip < 0 ? 3 : ip]), ytp: num(r[iy < 0 ? 4 : iy]) })).filter(p => p.code);
}
export type CBMode = { code: string; name: string; note: string };
export function parseCBMode(json: unknown): CBMode[] {
  const t = obj((obj(json).tables as unknown[] | undefined)?.[0]); const fields = (t.fields as string[] | undefined) ?? []; const rows = (t.data as unknown[][] | undefined) ?? [];
  return rows.map(r => ({ code: str(r[0]), name: str(r[1]), note: fields.slice(2).map((f, i) => (str(r[i + 2]) ? `${f}：${str(r[i + 2])}` : '')).filter(Boolean).join('；') })).filter(x => x.code);
}
/** 使用者貼上的轉換價清單：每行「代號 轉換價 [到期日]」，分隔可為逗號、空白或 Tab。 */
export type ConvTerm = { convPrice: number; maturity?: string | null };
export function parseConvTerms(text: string): Record<string, ConvTerm> {
  const out: Record<string, ConvTerm> = {};
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[,\t ]+/).map(s => s.trim()).filter(Boolean);
    const code = cells.find(c => /^\d{5,6}$/.test(c)); if (!code) continue;
    const rest = cells.slice(cells.indexOf(code) + 1);
    const priceCell = rest.find(c => /^\d+(\.\d+)?$/.test(c.replace(/,/g, '')) && Number(c.replace(/,/g, '')) > 1);
    if (!priceCell) continue;
    const maturity = rest.map(toDate).find(Boolean) ?? null;
    out[code] = { convPrice: Number(priceCell.replace(/,/g, '')), maturity };
  }
  return out;
}
