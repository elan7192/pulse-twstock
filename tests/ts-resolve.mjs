// 測試用：讓 node --experimental-strip-types 解析未寫副檔名的 .ts 相對匯入（Next 打包不需要）。
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) { if (spec.startsWith('.') && !/\\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx); throw e; }
}`));
