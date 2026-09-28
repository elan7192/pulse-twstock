// 主力地圖：券商分點與公司總部所在縣市，用來找地緣券商。
// 分點縣市以證交所券商分公司名錄（代號→地址）為準，查不到時由名稱中的據點名判斷；公司縣市由證交所／櫃買公司基本資料的地址判斷。
import type { Dataset, Flow } from './branch';

export const COUNTIES = ['臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'] as const;
export type County = typeof COUNTIES[number];
/** 方格地圖座標 [欄, 列]：依相對地理位置排列。 */
export const TILE: Record<County, [number, number]> = {
  臺北市: [2, 0], 基隆市: [3, 0], 桃園市: [1, 1], 新北市: [2, 1], 宜蘭縣: [3, 1], 新竹市: [0, 2], 新竹縣: [1, 2], 苗栗縣: [1, 3], 臺中市: [1, 4], 花蓮縣: [2, 4],
  彰化縣: [0, 5], 南投縣: [1, 5], 雲林縣: [0, 6], 嘉義市: [0, 7], 嘉義縣: [1, 7], 臺東縣: [2, 7], 臺南市: [0, 8], 高雄市: [1, 8], 屏東縣: [1, 9], 澎湖縣: [0, 10], 金門縣: [2, 10], 連江縣: [3, 10],
};

// 分點名稱常見地名 → 縣市（台北市街道型分點名也列入）。
const PLACES: Record<County, string[]> = {
  臺北市: ['台北', '臺北', '信義', '大安', '松山', '南京', '民權', '民生', '建國', '忠孝', '仁愛', '敦南', '敦北', '復興', '長春', '松江', '城中', '西門', '萬華', '東門', '延平', '中山', '中正', '士林', '天母', '北投', '石牌', '內湖', '南港', '文山', '木柵', '景美', '松德', '大同', '承德', '古亭', '公館', '永吉', '東湖', '雙園', '光復', '世貿', '館前', '總公司'],
  新北市: ['新北', '板橋', '中和', '永和', '新店', '新莊', '三重', '蘆洲', '土城', '樹林', '鶯歌', '三峽', '汐止', '淡水', '林口', '五股', '泰山', '雙和', '北新', '江子翠', '頂溪', '府中', '瑞芳'],
  基隆市: ['基隆'],
  桃園市: ['桃園', '中壢', '平鎮', '八德', '楊梅', '龍潭', '大園', '龜山', '南崁', '蘆竹', '大溪', '內壢', '青埔'],
  新竹市: ['新竹', '竹科', '園區'],
  新竹縣: ['竹北', '竹東', '湖口', '新豐', '關西'],
  苗栗縣: ['苗栗', '竹南', '頭份', '通霄', '苑裡'],
  臺中市: ['台中', '臺中', '豐原', '大里', '太平', '沙鹿', '大甲', '清水', '烏日', '霧峰', '文心', '中港', '崇德', '五權', '西屯', '北屯', '南屯', '東勢', '潭子', '大雅', '台中港'],
  彰化縣: ['彰化', '員林', '鹿港', '和美', '北斗', '溪湖', '田中', '二林'],
  南投縣: ['南投', '草屯', '埔里', '竹山'],
  雲林縣: ['雲林', '斗六', '虎尾', '北港', '西螺', '斗南'],
  嘉義市: ['嘉義'],
  嘉義縣: ['民雄', '朴子', '大林'],
  臺南市: ['台南', '臺南', '新營', '永康', '佳里', '麻豆', '善化', '新化', '府城', '安平', '東寧', '歸仁', '仁德', '學甲'],
  高雄市: ['高雄', '鳳山', '岡山', '左營', '楠梓', '苓雅', '三民', '前鎮', '小港', '路竹', '旗山', '博愛', '五福', '大昌', '九如', '北高雄', '十全'],
  屏東縣: ['屏東', '潮州', '東港', '恆春'],
  宜蘭縣: ['宜蘭', '羅東', '蘇澳'],
  花蓮縣: ['花蓮'],
  臺東縣: ['台東', '臺東'],
  澎湖縣: ['澎湖', '馬公'],
  金門縣: ['金門'],
  連江縣: ['馬祖'],
};
const PLACE_LIST = (Object.entries(PLACES) as [County, string[]][]).flatMap(([c, ps]) => ps.map(p => [p, c] as [string, County])).sort((a, b) => b[0].length - a[0].length);

/** 分點名稱 → 縣市。有「-」時看後面的據點名（示範資料、證交所券商名錄格式）；
 *  證交所買賣日報表的名稱沒有分隔（例：「元大土城永寧」），取最後出現的地名。外資、只有總公司名稱時回傳 null。 */
export function branchCounty(name: string): County | null {
  const i = name.search(/[-－]/);
  const loc = (i >= 0 ? name.slice(i + 1) : name).replace(/\s/g, '');
  if (i >= 0) for (const [p, c] of PLACE_LIST) if (loc.startsWith(p)) return c;
  let best: { end: number; len: number; c: County } | null = null;
  for (const [p, c] of PLACE_LIST) {
    const k = loc.lastIndexOf(p); if (k < 0 || (i < 0 && k === 0 && loc.length > p.length && !/^(台|臺)/.test(p))) continue; // 沒分隔時，開頭通常是券商品牌名
    const end = k + p.length; if (!best || end > best.end || (end === best.end && p.length > best.len)) best = { end, len: p.length, c };
  }
  return best?.c ?? null;
}
/** 券商代號 → 縣市（證交所券商分公司名錄地址）優先，查不到再用名稱判斷。 */
export function brokerCounty(b: { id: string; name: string; kind: string } | undefined, geo: Record<string, County> = {}): County | null {
  if (!b || b.kind === 'foreign') return null;
  return geo[b.id] ?? branchCounty(b.name);
}

const ZH: [RegExp, County][] = [
  [/(臺|台)北(市)/, '臺北市'], [/新北市|(臺|台)北縣/, '新北市'], [/基隆/, '基隆市'], [/桃園/, '桃園市'], [/新竹市/, '新竹市'], [/新竹縣/, '新竹縣'], [/苗栗/, '苗栗縣'],
  [/(臺|台)中/, '臺中市'], [/彰化/, '彰化縣'], [/南投/, '南投縣'], [/雲林/, '雲林縣'], [/嘉義市/, '嘉義市'], [/嘉義縣/, '嘉義縣'], [/(臺|台)南/, '臺南市'], [/高雄/, '高雄市'],
  [/屏東/, '屏東縣'], [/宜蘭/, '宜蘭縣'], [/花蓮/, '花蓮縣'], [/(臺|台)東/, '臺東縣'], [/澎湖/, '澎湖縣'], [/金門/, '金門縣'], [/連江|馬祖/, '連江縣'],
];
const EN: [string, County][] = [
  ['newtaipei', '新北市'], ['newtaipi', '新北市'], ['newtaipe', '新北市'], ['taipeicounty', '新北市'], ['banqiao', '新北市'], ['panchiao', '新北市'], ['zhonghe', '新北市'], ['chungho', '新北市'], ['jhonghe', '新北市'], ['junghe', '新北市'],
  ['xindian', '新北市'], ['hsintien', '新北市'], ['xizhi', '新北市'], ['sijhih', '新北市'], ['shulin', '新北市'], ['wugu', '新北市'], ['wuku', '新北市'], ['xinzhuang', '新北市'], ['hsinchuang', '新北市'], ['tucheng', '新北市'], ['sanchong', '新北市'],
  ['taipei', '臺北市'], ['keelung', '基隆市'], ['taoyuan', '桃園市'], ['zhongli', '桃園市'], ['chungli', '桃園市'], ['guishan', '桃園市'], ['kueishan', '桃園市'], ['dayuan', '桃園市'],
  ['hsinchucity', '新竹市'], ['sciencepark', '新竹市'], ['xiangshan', '新竹市'], ['hsinchucounty', '新竹縣'], ['chucounty', '新竹縣'], ['zhubei', '新竹縣'], ['chupei', '新竹縣'], ['jubei', '新竹縣'], ['hukou', '新竹縣'], ['hsinfong', '新竹縣'], ['hsinchu', '新竹市'], ['chucity', '新竹市'],
  ['miaoli', '苗栗縣'], ['zhunan', '苗栗縣'], ['chunan', '苗栗縣'], ['taichung', '臺中市'], ['taiping', '臺中市'], ['changhua', '彰化縣'], ['nantou', '南投縣'], ['yunlin', '雲林縣'], ['douliu', '雲林縣'], ['douleu', '雲林縣'],
  ['chiayicity', '嘉義市'], ['chiayi', '嘉義縣'], ['tainan', '臺南市'], ['kaohsiung', '高雄市'], ['koahsiung', '高雄市'], ['pingtung', '屏東縣'], ['yilan', '宜蘭縣'], ['ilan', '宜蘭縣'], ['hualien', '花蓮縣'], ['taitung', '臺東縣'], ['penghu', '澎湖縣'], ['kinmen', '金門縣'],
];
/** 地址 → 縣市。中文取第一個縣市名；英文取最後出現的地名（縣市通常在最後）。 */
export function addressCounty(addr: string): County | null {
  if (!addr) return null;
  if (/[\u4e00-\u9fff]/.test(addr)) {
    const a = addr.replace(/巿/g, '市').replace(/^\(\d+\)/, '');
    for (const [re, c] of ZH) if (re.test(a)) return c;
    if (/竹科|新竹科學/.test(a)) return '新竹市';
    if (/^北市/.test(a)) return '臺北市';
    for (const [p, c] of PLACE_LIST) if (p.length >= 2 && new RegExp(`${p}(區|市|鎮|鄉)`).test(a)) return c; // 只寫行政區
    return null;
  }
  const s = addr.toLowerCase().replace(/[^a-z]/g, '');
  let best: { end: number; len: number; c: County } | null = null;
  for (const [k, c] of EN) { const i = s.lastIndexOf(k); if (i < 0) continue; const end = i + k.length; if (!best || end > best.end || (end === best.end && k.length > best.len)) best = { end, len: k.length, c }; }
  return best?.c ?? null;
}

/** 示範個股總部（真實股票依公開資料；虛構飆股任意指定以示範地緣券商）。 */
export const DEMO_HQ: Record<string, County> = {
  2330: '新竹市', 2317: '新北市', 2454: '新竹市', 2382: '桃園市', 3231: '臺北市', 2603: '桃園市', 2308: '臺北市', 2412: '臺北市', 2881: '臺北市', 2891: '臺北市',
  3008: '臺中市', 2303: '新竹市', 3711: '高雄市', 2345: '新竹市', 6669: '新北市', 1519: '臺北市', P101: '臺南市', P102: '臺中市', P103: '高雄市', P104: '桃園市', P105: '新北市', P106: '彰化縣',
};

export type CountyFlow = { county: County; buy: number; sell: number; net: number; brokers: number };
export type LocalBroker = Flow & { county: County };
/** 區間各縣市分點買賣（股），以及與公司同縣市的地緣券商。外資與判斷不出縣市的分點另計。 */
export function brokerMap(ds: Dataset, flows: Flow[], hq: County | null, geo: Record<string, County> = {}) {
  const m = new Map<County, CountyFlow>(); let unknown = 0; const local: LocalBroker[] = [];
  for (const f of flows) {
    const c = brokerCounty(ds.brokers.get(f.broker), geo);
    if (!c) { unknown += Math.abs(f.net); continue; }
    const o = m.get(c) ?? { county: c, buy: 0, sell: 0, net: 0, brokers: 0 }; o.buy += f.buy; o.sell += f.sell; o.net += f.net; o.brokers++; m.set(c, o);
    if (hq && c === hq) local.push({ ...f, county: c });
  }
  const counties = [...m.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const localNet = local.reduce((s, f) => s + f.net, 0);
  return { counties, unknown, local: local.sort((a, b) => b.net - a.net), localNet };
}
