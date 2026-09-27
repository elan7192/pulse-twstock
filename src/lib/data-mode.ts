// 資料讀取模式：'api'＝經本站 /api/open（Sites／Worker 版）；'static'＝讀 GitHub Actions 產生的靜態 JSON（GitHub Pages 版）。
export const DATA_MODE: { kind: 'api' | 'static'; base: string; defaultReal: boolean } = { kind: 'api', base: '', defaultReal: false };
export function setStaticMode(base = '') { DATA_MODE.kind = 'static'; DATA_MODE.base = base; DATA_MODE.defaultReal = true; }
