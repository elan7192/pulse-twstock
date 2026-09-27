// 公開資料來源登記表（證交所、櫃買中心）。純函式，可在伺服器與測試共用。
// 原則：每個資料集有快取時間；每個主機有最短請求間隔與每日上限；403／429 冷卻至少 1 小時。

export type OpenParams = { date?: string; code?: string; month?: string };
export type OpenSource = {
  key: string; label: string; host: string; method: 'GET' | 'POST'; binary?: boolean;
  url: (p: OpenParams) => string; body?: (p: OpenParams) => string;
  params: (keyof OpenParams)[]; ttl: (now: number) => number; immutable?: (p: OpenParams, now: number) => boolean; maxBytes: number;
};
export type HostPolicy = { interval: number; budget: number };

export const HOSTS: Record<string, HostPolicy> = {
  'openapi.twse.com.tw': { interval: 1500, budget: 400 },
  'www.twse.com.tw': { interval: 4000, budget: 150 },       // 個股月資料：證交所網站對頻率較敏感
  'www.tpex.org.tw': { interval: 2500, budget: 300 },
  'openapi.taifex.com.tw': { interval: 2000, budget: 200 },
};

const MIN = 60000, HOUR = 3600000;
const taipei = (now: number) => new Date(now + 8 * HOUR);
export function taipeiDate(now: number) { return taipei(now).toISOString().slice(0, 10); }
/** 交易日盤中與盤後公告時段較短，其餘時段較長。 */
export function sessionTtl(now: number, busy = 30 * MIN, idle = 3 * HOUR) {
  const d = taipei(now), m = d.getUTCHours() * 60 + d.getUTCMinutes(), w = d.getUTCDay();
  return w > 0 && w < 6 && m >= 510 && m <= 1260 ? busy : idle;
}
const daily = () => 6 * HOUR;
const ymd = (p: OpenParams) => (p.date ?? '').replace(/-/g, '');

export const SOURCES: Record<string, OpenSource> = {
  twse_punish: { key: 'twse_punish', label: '上市處置股票', host: 'openapi.twse.com.tw', method: 'GET', url: () => 'https://openapi.twse.com.tw/v1/announcement/punish', params: [], ttl: n => sessionTtl(n), maxBytes: 1_500_000 },
  twse_notice: { key: 'twse_notice', label: '上市注意股票', host: 'openapi.twse.com.tw', method: 'GET', url: () => 'https://openapi.twse.com.tw/v1/announcement/notice', params: [], ttl: n => sessionTtl(n), maxBytes: 1_500_000 },
  twse_notetrans: { key: 'twse_notetrans', label: '上市注意累計次數異常', host: 'openapi.twse.com.tw', method: 'GET', url: () => 'https://openapi.twse.com.tw/v1/announcement/notetrans', params: [], ttl: n => sessionTtl(n), maxBytes: 1_500_000 },
  twse_margin: { key: 'twse_margin', label: '上市融資融券餘額', host: 'openapi.twse.com.tw', method: 'GET', url: () => 'https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN', params: [], ttl: n => sessionTtl(n, HOUR), maxBytes: 1_800_000 },
  twse_day: { key: 'twse_day', label: '上市個股日成交', host: 'openapi.twse.com.tw', method: 'GET', url: () => 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', params: [], ttl: n => sessionTtl(n, HOUR), maxBytes: 1_800_000 },
  twse_meeting: { key: 'twse_meeting', label: '上市股東會公告', host: 'openapi.twse.com.tw', method: 'GET', url: () => 'https://openapi.twse.com.tw/v1/opendata/t187ap38_L', params: [], ttl: daily, maxBytes: 1_800_000 },
  tpex_disposal: { key: 'tpex_disposal', label: '上櫃處置股票', host: 'www.tpex.org.tw', method: 'GET', url: () => 'https://www.tpex.org.tw/openapi/v1/tpex_disposal_information', params: [], ttl: n => sessionTtl(n), maxBytes: 1_500_000 },
  tpex_warning: { key: 'tpex_warning', label: '上櫃注意股票', host: 'www.tpex.org.tw', method: 'GET', url: () => 'https://www.tpex.org.tw/openapi/v1/tpex_trading_warning_information', params: [], ttl: n => sessionTtl(n), maxBytes: 1_500_000 },
  tpex_margin: { key: 'tpex_margin', label: '上櫃融資融券餘額', host: 'www.tpex.org.tw', method: 'GET', url: () => 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance', params: [], ttl: n => sessionTtl(n, HOUR), maxBytes: 1_800_000 },
  tpex_day: { key: 'tpex_day', label: '上櫃個股日成交', host: 'www.tpex.org.tw', method: 'GET', url: () => 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', params: [], ttl: n => sessionTtl(n, HOUR), maxBytes: 1_800_000 },
  tpex_cb_put: { key: 'tpex_cb_put', label: '可轉債賣回權', host: 'www.tpex.org.tw', method: 'POST', url: () => 'https://www.tpex.org.tw/www/zh-tw/bond/putProvision', body: () => 'response=json', params: [], ttl: daily, maxBytes: 800_000 },
  tpex_cb_mode: { key: 'tpex_cb_mode', label: '可轉債變更／停止交易', host: 'www.tpex.org.tw', method: 'POST', url: () => 'https://www.tpex.org.tw/www/zh-tw/bond/cbMode', body: () => 'response=json', params: [], ttl: daily, maxBytes: 800_000 },
  // 期交所：可能回 JSON 或 CSV（UTF-8／Big5），以原始位元組保存，由瀏覽器判斷格式。
  taifex_fut_daily: { key: 'taifex_fut_daily', label: '期貨每日行情', host: 'openapi.taifex.com.tw', method: 'GET', binary: true, url: () => 'https://openapi.taifex.com.tw/v1/DailyMarketReportFut', params: [], ttl: n => sessionTtl(n, HOUR), maxBytes: 1_800_000 },
  taifex_ssf_margin: { key: 'taifex_ssf_margin', label: '股票期貨保證金', host: 'openapi.taifex.com.tw', method: 'GET', binary: true, url: () => 'https://openapi.taifex.com.tw/v1/SingleStockFuturesMargining', params: [], ttl: n => sessionTtl(n, 2 * HOUR), maxBytes: 1_200_000 },
  // 每日可轉債行情表（Big5 CSV）。過去日期不再變動，永久快取；休市日 404 也快取。
  tpex_cb_quotes: {
    key: 'tpex_cb_quotes', label: '可轉債日行情', host: 'www.tpex.org.tw', method: 'GET', binary: true, params: ['date'],
    url: p => { const d = ymd(p); return `https://www.tpex.org.tw/storage/bond_zone/tradeinfo/cb/${d.slice(0, 4)}/${d.slice(0, 6)}/RSta0113.${d}-C.csv`; },
    ttl: () => HOUR, immutable: (p, now) => (p.date ?? '') < taipeiDate(now), maxBytes: 1_000_000,
  },
  // 上市個股月成交資訊（MA20、地板天花板用）。過去月份永久快取。
  twse_stock_month: {
    key: 'twse_stock_month', label: '上市個股月成交', host: 'www.twse.com.tw', method: 'GET', params: ['code', 'month'],
    url: p => `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${p.month}01&stockNo=${p.code}&response=json`,
    ttl: n => sessionTtl(n, HOUR), immutable: (p, now) => (p.month ?? '') < taipeiDate(now).slice(0, 7).replace('-', ''), maxBytes: 400_000,
  },
};

/** 驗證並正規化參數；不合法回傳 null。 */
export function normalizeParams(src: OpenSource, raw: Record<string, string | null | undefined>): OpenParams | null {
  const p: OpenParams = {};
  for (const k of src.params) {
    const v = (raw[k] ?? '').trim();
    if (k === 'date' && !/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)) return null;
    if (k === 'code' && !/^[0-9A-Z]{4,6}$/.test(v)) return null;
    if (k === 'month' && !/^20\d{2}(0[1-9]|1[0-2])$/.test(v)) return null;
    p[k] = v;
  }
  return p;
}
export const cacheId = (src: OpenSource, p: OpenParams) => [src.key, ...src.params.map(k => p[k] ?? '')].join(':');
