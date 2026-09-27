'use client';
// 真實資料模式：證交所／櫃買公開資料，經本站 /api/open 共用快取與限流後讀取。
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Database,Globe,Layers3,Radio,RefreshCw,TriangleAlert,TrendingUp} from 'lucide-react';
import {num} from '@/lib/market';
import {buildDataset,rangeStat,type Broker,type Dataset,type DayStat,type RawDay} from '@/lib/branch';
import {bands,bondValue,bs,cbasSplit,STAGE_GUIDE,STAGE_RULE,stageOf,type Stage,type StageRule} from '@/lib/strategy';
import * as O from '@/lib/opendata';
import {DATA_MODE} from '@/lib/data-mode';
import {buildStockFutures,parseFuturesReport,parseStockFuturesMargin,type StockFutRow} from '@/lib/futures';
import FuturesView,{marginMultiple} from './futures-view';
import {px,pct,pp,tone,md,Ok,Num,MiniChart,Calculator} from './strategy-ui';

// ---------- 讀取工具 ----------
type OpenRes={key:string;label:string;status:number;fetchedAt:number;payload:string;encoding:'text'|'base64';stale:boolean;retryAfter:number;message:string};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function getOpen(src:string,params:Record<string,string>={},signal?:AbortSignal,tries=4):Promise<OpenRes>{
 if(DATA_MODE.kind==='static'){
  const res=await fetch(`${DATA_MODE.base}data/open/${src}${params.date?`/${params.date}`:''}.json`,{cache:'no-cache',signal});
  if(res.status===404)return {key:src,label:src,status:404,fetchedAt:0,payload:'',encoding:'text',stale:false,retryAfter:0,message:'尚無此資料'};
  if(!res.ok)throw new Error(`讀取失敗（${res.status}）`);
  return await res.json() as OpenRes;
 }
 const q=new URLSearchParams({src,...params});
 for(let i=0;;i++){
  const res=await fetch(`/api/open?${q}`,{cache:'no-store',signal});
  const data=await res.json() as OpenRes&{message?:string};
  if(res.status===401)throw new Error('請先登入網站（/signin-with-chatgpt）後再讀取真實資料');
  if(!res.ok)throw new Error(data.message||`讀取失敗（${res.status}）`);
  if(data.fetchedAt||i>=tries-1||!data.retryAfter||data.retryAfter>15000)return data;
  await sleep(Math.min(8000,data.retryAfter+200));
 }
}
const parseJSON=(r:OpenRes|undefined)=>{if(!r?.payload)return null;try{return JSON.parse(r.payload) as unknown;}catch{return null;}};
function useOpenSet(keys:string[]){
 const [data,setData]=useState<Record<string,OpenRes|undefined>>({}),[errors,setErrors]=useState<Record<string,string>>({}),[loading,setLoading]=useState(false),[tick,setTick]=useState(0);
 const sig=keys.join('|');
 useEffect(()=>{const ctl=new AbortController();setLoading(true);
  (async()=>{for(const k of sig.split('|')){try{const r=await getOpen(k,{},ctl.signal);setData(d=>({...d,[k]:r}));setErrors(e=>{const n={...e};delete n[k];return n;});}catch(e){if(!ctl.signal.aborted)setErrors(x=>({...x,[k]:e instanceof Error?e.message:'讀取失敗'}));}}
   if(!ctl.signal.aborted)setLoading(false);})();
  return()=>ctl.abort();},[sig,tick]);
 return {data,errors,loading,reload:()=>setTick(t=>t+1)};
}
const taipeiToday=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const ago=(t:number)=>{if(!t)return '尚未取得';const m=Math.round((Date.now()-t)/60000);return m<1?'剛剛':m<60?`${m} 分鐘前`:m<1440?`${Math.round(m/60)} 小時前`:`${Math.round(m/1440)} 天前`;};

function SourceBar({data,errors,loading,reload}:{data:Record<string,OpenRes|undefined>;errors:Record<string,string>;loading:boolean;reload:()=>void}){
 const keys=[...new Set([...Object.keys(data),...Object.keys(errors)])];
 return <div className="rd-sources">{keys.map(k=>{const r=data[k],e=errors[k];const bad=!!e||(r&&r.status!==200&&!r.payload);return <span key={k} className={`rd-src ${bad?'bad':r?.stale?'stale':'ok'}`} title={e||r?.message||''}>
   <i/>{r?.label??k}<small>{e?e:r?.fetchedAt?ago(r.fetchedAt):r?.message||'等待中'}</small></span>;})}
  <button className="button" onClick={reload} disabled={loading}><RefreshCw size={14}/>{loading?'讀取中…':'重新整理'}</button></div>;
}

// ---------- 入口 ----------
export type RealView='dispo'|'radar'|'warrant'|'cb'|'band'|'short'|'fut';
export default function RealDesk({view}:{view:RealView}){
 return view==='fut'?<RealFut/>:view==='dispo'?<RealDispo/>:view==='short'?<RealShort/>:view==='cb'?<RealCB/>:view==='band'?<RealBand/>:<Unsupported view={view}/>;
}
function Unsupported({view}:{view:RealView}){
 return <div className="st-body"><div className="st-grid wide-side"><div className="panel"><div className="panel-title"><h2><TriangleAlert size={16}/>{view==='radar'?'權證主力雷達':'挑權證'}：尚未接真實資料</h2></div>
  <ol className="st-steps">
   <li><b>權證分點：</b>權證的券商分點只在證交所買賣日報表，需人工輸入驗證碼下載；本站不自動抓取、不繞過驗證碼。可在「分點籌碼 → 匯入資料」匯入個別權證的日報表 CSV。</li>
   <li><b>權證報價：</b>委買委賣價需即時行情；公開 OpenAPI 只有權證每日成交金額與張數，沒有報價，無法反推委買隱波。</li>
   <li><b>權證基本資料：</b>證交所 t187ap37_L 有履約價、行使比例、最後交易日，但檔案涵蓋上萬檔權證，超過本站 Worker 快取的安全大小，這一版未接。</li>
   <li>右側單檔試算器可直接輸入券商報價使用，計算方式與示範模式相同。</li></ol></div>
  <Calculator/></div></div>;
}

// ---------- 分點匯入資料（三條件用） ----------
function importedBranch():Dataset|null{try{const s=localStorage.getItem('pulse-branch-import-v1');if(!s)return null;const v=JSON.parse(s) as {raw:RawDay[];brokers:Broker[];names:Record<string,string>};return v?.raw?.length?buildDataset(v.raw,v.brokers,v.names,'import'):null;}catch{return null;}}
async function monthHistory(code:string,months:number,onProgress?:(done:number,total:number)=>void,signal?:AbortSignal){
 if(DATA_MODE.kind==='static'){
  const res=await fetch(`${DATA_MODE.base}data/series/${code}.json`,{cache:'no-cache',signal});onProgress?.(1,1);
  if(!res.ok)return {bars:[] as O.Bar[],message:res.status===404?'沒有這檔上市股票的歷史資料':`讀取失敗（${res.status}）`};
  const rows=await res.json() as [string,number|null,number|null,number|null,number|null,number|null][];
  const cutoff=new Date(Date.now()-months*31*86400000).toISOString().slice(0,10);
  return {bars:rows.filter(r=>r[0]>=cutoff).map(r=>({date:r[0],open:r[1],high:r[2],low:r[3],close:r[4],volume:r[5]})),message:''};
 }
 const now=new Date(Date.now()+8*3600000);const list:string[]=[];for(let i=months-1;i>=0;i--){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1));list.push(d.toISOString().slice(0,7).replace('-',''));}
 const bars:O.Bar[]=[];let msg='';
 for(const [i,m] of list.entries()){const r=await getOpen('twse_stock_month',{code,month:m},signal,6);if(r.payload)bars.push(...O.parseStockMonth(parseJSON(r)));else msg=r.message;onProgress?.(i+1,list.length);}
 const uniq=new Map(bars.map(b=>[b.date,b]));return {bars:[...uniq.values()].sort((a,b)=>a.date.localeCompare(b.date)),message:msg};
}
const toDay=(code:string,b:O.Bar):DayStat=>{const c=b.close??0;return {date:b.date,code,open:b.open,close:b.close,high:b.high??c,low:b.low??c,vwap:c,volume:b.volume??0,mark:c,flows:[],byBroker:new Map(),fills:[],topBuy:[],topSell:[],mainNet:0,buyers:0,sellers:0,diff:0};};
const avg=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;

// ================= 個股期貨（真實） =================
const textOf=(r:OpenRes|undefined)=>!r?.payload?'':r.encoding==='base64'?O.decodeBase64(r.payload):r.payload;
function futuresRows(data:Record<string,OpenRes|undefined>):StockFutRow[]{
 try{
  const quotes=parseFuturesReport(textOf(data.taifex_fut_daily)),margins=parseStockFuturesMargin(textOf(data.taifex_ssf_margin));
  const close=new Map([...O.parseTwseDay(parseJSON(data.twse_day)),...O.parseTpexDay(parseJSON(data.tpex_day))].filter(q=>q.close!=null).map(q=>[q.code,q.close as number]));
  return buildStockFutures(quotes,margins,close);
 }catch{return [];}
}
function RealFut(){
 const set=useOpenSet(['taifex_ssf_margin','taifex_fut_daily','twse_day','tpex_day']);
 const rows=useMemo(()=>futuresRows(set.data),[set.data]);
 return <><div className="st-body st-pad-b"><SourceBar {...set}/></div><FuturesView rows={rows} source="real" loading={set.loading} note="期交所 OpenAPI 偶爾改回 CSV，本站兩種格式都能解析。"/></>;
}

// ================= 處置股（真實） =================
function RealDispo(){
 const set=useOpenSet(['twse_punish','tpex_disposal','twse_notice','tpex_warning','twse_notetrans','taifex_ssf_margin','taifex_fut_daily']);
 const fut=useMemo(()=>{const m=new Map<string,StockFutRow>();for(const r of futuresRows(set.data))if(r.size!==100&&!m.has(r.code))m.set(r.code,r);return m;},[set.data]);
 const today=taipeiToday();
 const dispo=useMemo(()=>[...O.parseTwsePunish(parseJSON(set.data.twse_punish)),...O.parseTpexDisposal(parseJSON(set.data.tpex_disposal))].map(d=>{
  const release=d.end?O.addBusinessDays(d.end,1):null;const state=!d.start||!d.end?'unknown':today<d.start?'soon':today<=d.end?'in':'out';
  return {...d,release,state,left:d.end&&state==='in'?O.businessDaysBetween(today,d.end)+1:null};}).sort((a,b)=>(a.release??'').localeCompare(b.release??'')),[set.data,today]);
 const notices=useMemo(()=>[...O.parseTwseNotice(parseJSON(set.data.twse_notice)),...O.parseTpexWarning(parseJSON(set.data.tpex_warning))],[set.data]);
 const trans=useMemo(()=>O.parseNoteTrans(parseJSON(set.data.twse_notetrans)),[set.data]);
 const [sel,setSel]=useState<string|null>(null);const cur=dispo.find(d=>d.code===sel)??dispo.find(d=>d.state==='in')??dispo[0];
 const tomorrow=O.addBusinessDays(today,1);
 const kpi=[['處置中',dispo.filter(d=>d.state==='in').length,'依公告期間'],['今日出關',dispo.filter(d=>d.release===today).length,'出關日常開高走低'],['下個交易日出關',dispo.filter(d=>d.release===tomorrow).length,tomorrow],['今日注意股',notices.length,`上市＋上櫃・注意累計異常 ${trans.length}`]] as const;
 return <div className="st-body"><SourceBar {...set}/>
  <div className="st-kpis">{kpi.map(([l,v,s])=><div key={l} className="panel"><span>{l}</span><b>{v}</b><small>{s}</small></div>)}</div>
  <div className="st-grid">
   <div className="panel"><div className="panel-title"><h2><Radio size={16}/>處置股公告</h2><span className="tag">證交所・櫃買中心</span></div>
    <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>市場</th><th>個股</th><th>次別</th><th>處置期間</th><th>狀態</th><th>出關日</th><th>撮合</th><th>預收款券</th><th>股期</th><th>原因</th></tr></thead>
     <tbody>{dispo.map(d=><tr key={d.market+d.code+d.start} className={cur?.code===d.code?'selected':''} onClick={()=>setSel(d.code)}>
      <td className="muted">{d.market}</td><td className="bd-name">{d.code} {d.name}</td><td className={d.level.includes('二')?'amber-text':''}>{d.level}</td><td className="mono">{d.start?md(d.start):'—'}–{d.end?md(d.end):'—'}</td>
      <td>{d.state==='in'?<span className="amber-text">處置中・剩 {d.left} 日</span>:d.state==='soon'?<span className="cyan">即將開始</span>:d.state==='out'?<span className="muted">已結束</span>:'—'}</td>
      <td className={d.release===today?'cyan':''}>{d.release?md(d.release):'—'}</td><td>{d.matchMinutes?`約 ${d.matchMinutes} 分鐘`:'—'}</td><td>{d.fullPrepay?'全部委託':'單筆 10／累計 30 張以上'}</td><td>{(()=>{const f=fut.get(d.code);if(!f)return <span className="muted">無</span>;const mm=marginMultiple(f);return <span title={`原始保證金 ${f.initialRate!=null?(f.initialRate*100).toFixed(2):'—'}%`}>{f.contract} {px(f.price)}{mm&&<i className="bd-badge daytrade">保證金×{mm}</i>}</span>;})()}</td><td className="muted">{d.reason}</td></tr>)}
      {!dispo.length&&<tr><td colSpan={10} className="muted">{set.loading?'讀取中…':'目前沒有處置股，或來源尚未取得。'}</td></tr>}</tbody></table></div>
    <p className="live-helper">出關日＝處置迄日的下一個營業日（未扣國定假日）；剩餘天數含今日。撮合間隔與預收款券方式由公告內容解析。股期欄為同標的一般股票期貨近月價；標的處置時期交所將股期保證金調為 1.5 至 3 倍。</p></div>
   <div className="st-side">{cur?<RealThree code={cur.code} name={cur.name} market={cur.market}/>:<div className="panel"><p className="live-helper">選擇一檔處置股查看三條件。</p></div>}</div>
  </div>
  <div className="st-grid">
   <div className="panel"><div className="panel-title"><h2>今日注意股</h2><span className="tag">{notices.length}</span></div>
    <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>市場</th><th>個股</th><th>累計次數</th><th>收盤</th><th>注意交易資訊</th></tr></thead>
     <tbody>{notices.map(n=><tr key={n.market+n.code} onClick={()=>setSel(n.code)}><td className="muted">{n.market}</td><td className="bd-name">{n.code} {n.name}</td><td className={(n.count??0)>=2?'amber-text':''}>{n.count??'—'}</td><td>{px(n.close)}</td><td className="muted rd-wrap">{n.info}</td></tr>)}
      {!notices.length&&<tr><td colSpan={5} className="muted">今日沒有注意股（假日或盤後尚未公布時為空）。</td></tr>}</tbody></table></div></div>
   <div className="panel"><div className="panel-title"><h2>注意累計次數異常</h2><span className="tag">上市</span></div>
    <div className="bd-mini-list bd-pad">{trans.map(t=><div key={t.code} className="st-broker"><b>{t.code} {t.name}</b><span>{t.criteria}</span></div>)}{!trans.length&&<p className="live-helper">目前沒有資料。</p>}</div>
    <p className="live-helper">證交所公布近期達注意標準的累計情形，可作為「可能被處置」的預警名單。</p></div>
  </div></div>;
}
function RealThree({code,name,market}:{code:string;name:string;market:O.Market}){
 const [hist,setHist]=useState<O.Bar[]|null>(null),[prog,setProg]=useState(''),[err,setErr]=useState('');
 useEffect(()=>{setHist(null);setErr('');if(market!=='上市'){return;}const ctl=new AbortController();
  monthHistory(code,2,(d,t)=>setProg(`${d}/${t}`),ctl.signal).then(r=>{setHist(r.bars);if(!r.bars.length)setErr(r.message||'沒有取得歷史資料');}).catch(e=>{if(!ctl.signal.aborted)setErr(e instanceof Error?e.message:'讀取失敗');});return()=>ctl.abort();},[code,market]);
 const days=hist?.map(b=>toDay(code,b))??[];const L=days.length-1;
 const ma20=(i:number)=>i>=19?avg(days.slice(i-19,i+1).map(d=>d.close??0)):null;
 const m=ma20(L),m5=ma20(L-5);const ma20Up=m!=null&&m5!=null&&m>m5;
 const br=useMemo(()=>importedBranch(),[]);const bd=br?.days[code];
 const branchOk=!!bd&&bd.length>=10;
 const main5=branchOk?bd!.slice(-5).reduce((s,d)=>s+d.mainNet,0):null;
 const c5=branchOk?rangeStat(bd!.slice(-5)).concentration:null,c10=branchOk?rangeStat(bd!.slice(-10)).concentration:null;
 return <div className="panel"><div className="panel-title"><h2>{code} {name}</h2><span className="tag">{market}</span></div>
  {days.length>1&&<MiniChart days={days}/>}
  <div className="st-checks"><h3 className="bd-sub">權證小哥處置股三條件</h3>
   {market!=='上市'?<p className="tiny">上櫃個股歷史行情這一版未接，月線條件無法計算。</p>:!hist?<p className="tiny">{err||DATA_MODE.kind==='static'?'讀取歷史股價…':`讀取個股月資料 ${prog}（每次請求間隔 4 秒）…`}</p>:<Ok ok={ma20Up}>月線向上（MA20 {px(m)}，5 日前 {px(m5)}）</Ok>}
   {branchOk?<><Ok ok={(main5??0)>=0}>主力未出貨（匯入分點：5 日主力買賣超 {num(Math.round((main5??0)/1000))} 張）</Ok><Ok ok={(c5??-1)>0&&(c10??-1)>0}>籌碼集中度為正（5 日 {pct(c5)}／10 日 {pct(c10)}）</Ok></>
    :<p className="tiny">主力與集中度需要這檔股票至少 10 個交易日的分點資料：到「分點籌碼 → 匯入資料」匯入證交所買賣日報表 CSV 後，這裡會自動計算。</p>}
  </div></div>;
}

// ================= 融券回補（真實） =================
function RealShort(){
 const set=useOpenSet(['twse_margin','tpex_margin','twse_day','tpex_day','twse_meeting']);
 const today=taipeiToday();const [onlyEvent,setOnlyEvent]=useState(true);
 const rows=useMemo(()=>{
  const margin=[...O.parseTwseMargin(parseJSON(set.data.twse_margin)),...O.parseTpexMargin(parseJSON(set.data.tpex_margin))];
  const vol=new Map([...O.parseTwseDay(parseJSON(set.data.twse_day)),...O.parseTpexDay(parseJSON(set.data.tpex_day))].map(q=>[q.code,q]));
  const meet=new Map(O.parseMeetings(parseJSON(set.data.twse_meeting)).filter(m=>m.lastCover&&m.lastCover>=today).map(m=>[m.code,m]));
  return margin.filter(m=>(m.short??0)>0).map(m=>{const q=vol.get(m.code);const v=q?.volume!=null?q.volume/1000:null;const mt=meet.get(m.code);
   return {...m,close:q?.close??null,vol:v,power:v?(m.short??0)/v:null,ratio:m.margin?(m.short??0)/m.margin:null,lastCover:mt?.lastCover??null,meeting:mt?.meetingDate??null,left:mt?.lastCover?O.businessDaysBetween(today,mt.lastCover):null};})
   .filter(r=>!onlyEvent||r.lastCover).sort((a,b)=>(b.power??0)-(a.power??0)).slice(0,150);
 },[set.data,today,onlyEvent]);
 const max=Math.max(0.01,...rows.map(r=>r.power??0));
 return <div className="st-body"><SourceBar {...set}/><div className="st-grid">
  <div className="panel"><div className="panel-title"><h2><TrendingUp size={16}/>融券回補力道</h2><label className="bd-check st-inline"><input type="checkbox" checked={onlyEvent} onChange={e=>setOnlyEvent(e.target.checked)}/>只看有股東會最後回補日</label></div>
   <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>市場</th><th>個股</th><th>收盤</th><th>融券餘額</th><th>融資餘額</th><th>券資比</th><th>當日量</th><th>回補力道</th><th></th><th>股東會</th><th>最後回補日</th><th>倒數</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.market+r.code}><td className="muted">{r.market}</td><td className="bd-name">{r.code} {r.name}</td><td>{px(r.close)}</td><td>{num(r.short??0)}</td><td>{num(r.margin??0)}</td><td className={(r.ratio??0)>=0.3?'amber-text':''}>{pp(r.ratio)}</td><td>{r.vol!=null?num(Math.round(r.vol)):'—'}</td>
     <td><b>{r.power!=null?r.power.toFixed(2):'—'}</b> 倍</td><td className="st-bar"><i style={{width:`${(r.power??0)/max*100}%`}}/></td><td className="mono muted">{r.meeting?md(r.meeting):'—'}</td><td className="mono">{r.lastCover??'—'}</td><td className={r.left!=null&&r.left<=5?'up':''}>{r.left!=null?`${r.left} 日`:'—'}</td></tr>)}
     {!rows.length&&<tr><td colSpan={12} className="muted">{set.loading?'讀取中…':'沒有符合的資料。'}</td></tr>}</tbody></table></div>
   <p className="live-helper">回補力道＝融券餘額 ÷ 當日成交量（張）。最後回補日＝停止過戶首日前第 6 個營業日（依證基會說明；未扣國定假日，以交易所停券公告為準）。股東會資料目前只有上市公司。</p></div>
  <div className="st-side"><div className="panel"><div className="panel-title"><h2>資料說明</h2></div><ol className="st-steps">
   <li>融資融券：證交所 MI_MARGN、櫃買 tpex_mainboard_margin_balance（單位：張）。</li><li>成交量：當日個股成交資訊；累積 5 日均量需要每日保存，這一版先用當日量。</li>
   <li>股東會：證交所 t187ap38_L 停止過戶起日推算最後回補日。除權息的回補規定不同，未納入。</li></ol></div></div>
 </div></div>;
}

// ================= 可轉債（真實） =================
const TERMS='pulse-cb-terms-v1';
type CBRow={code:string;name:string;under:string;S:number|null;price:number|null;change:number|null;vol:number;vol5:number|null;week:number;history:{date:string;price:number|null;volume:number}[];
 stage:Stage|null;timeline:Stage[];since:string|null;move:'up'|'down'|null;conv:number|null;convValue:number|null;premium:number|null;put:O.PutInfo|null;maturity:string|null;
 years:number|null;exitPrice:number|null;bond:number|null;quote:number|null;perLot:number|null;leverage:number|null;elasticity:number|null;mode:string};
function RealCB(){
 const set=useOpenSet(['tpex_cb_put','tpex_cb_mode','twse_day','tpex_day']);
 const [quotes,setQuotes]=useState<Record<string,O.CBQuote[]>>({}),[prog,setProg]=useState({done:0,total:0,msg:''});
 const [terms,setTerms]=useState<Record<string,O.ConvTerm>>({}),[paste,setPaste]=useState(''),[rate,setRate]=useState(2.5),[rule,setRule]=useState<StageRule>(STAGE_RULE);
 const [tab,setTab]=useState<'life'|'zheng'|'cbas'|'terms'>('life'),[sel,setSel]=useState<string|null>(null);
 const days=useRef<string[]>([]);
 useEffect(()=>{try{const s=localStorage.getItem(TERMS);if(s)setTerms(JSON.parse(s));}catch{/* 忽略 */}},[]);
 const saveTerms=(t:Record<string,O.ConvTerm>)=>{setTerms(t);try{localStorage.setItem(TERMS,JSON.stringify(t));}catch{/* 忽略 */}};
 useEffect(()=>{const ctl=new AbortController();const list:string[]=[];let d=taipeiToday();while(list.length<22){const w=new Date(d+'T00:00:00Z').getUTCDay();if(w>0&&w<6)list.push(d);d=O.addBusinessDays(d,-1);}days.current=list;
  (async()=>{let got=0;for(const [i,date] of list.entries()){if(ctl.signal.aborted)return;try{const r=await getOpen('tpex_cb_quotes',{date},ctl.signal,6);
   if(r.status===200&&r.payload){const p=O.parseCBQuotes(O.decodeBase64(r.payload));setQuotes(q=>({...q,[p.date??date]:p.rows}));got++;}
   setProg({done:i+1,total:list.length,msg:r.status===200||r.status===404?'':r.message});}catch(e){setProg(p=>({...p,msg:e instanceof Error?e.message:'讀取失敗'}));if(!ctl.signal.aborted)await sleep(3000);}
   if(got>=20)break;}})();return()=>ctl.abort();},[]);
 const rows=useMemo(()=>{
  const dates=Object.keys(quotes).sort();if(!dates.length)return [] as CBRow[];
  const under=new Map([...O.parseTwseDay(parseJSON(set.data.twse_day)),...O.parseTpexDay(parseJSON(set.data.tpex_day))].map(q=>[q.code,q]));
  const puts=new Map(O.parsePutProvision(parseJSON(set.data.tpex_cb_put)).map(p=>[p.code,p]));const modes=new Map(O.parseCBMode(parseJSON(set.data.tpex_cb_mode)).map(m=>[m.code,m.note]));
  const all=new Map<string,{name:string;h:{date:string;price:number|null;volume:number;change:number|null}[]}>();
  for(const d of dates)for(const q of quotes[d]){const e=all.get(q.code)??{name:q.name,h:[]};e.h.push({date:d,price:q.close,volume:q.volume,change:q.change});all.set(q.code,e);}
  const today=taipeiToday();
  return [...all.entries()].map(([code,{name,h}])=>{
   const traded=h.filter(x=>x.price!=null);const last=traded.at(-1),lastDay=h.at(-1)!;const price=last?.price??null;
   const vols=h.map(x=>x.volume);const vol=lastDay.volume,vol5=avg(vols.slice(-6,-1)),week=vols.slice(-5).reduce((s,x)=>s+x,0);
   const timeline=traded.map(x=>stageOf(x.price!,rule));const stage=price!=null?stageOf(price,rule):null;
   let k=timeline.length-1;while(k>0&&timeline[k-1]===timeline.at(-1))k--;const prev=k>0?timeline[k-1]:null;
   const rank={幼年期:0,中年期:1,老年期:2} as const;
   const u=under.get(code.slice(0,4));const S=u?.close??null;const t=terms[code];const conv=t?.convPrice??null;
   const convValue=S&&conv?100*S/conv:null;const put=puts.get(code)??null;const maturity=t?.maturity??null;
   const exitDate=put?.putDate&&put.putDate>today?put.putDate:maturity;const exitPrice=put?.putDate&&put.putDate>today?put.putPrice:maturity?100:null;
   const years=exitDate?(Date.parse(exitDate)-Date.parse(today))/(365.25*86400000):null;
   const bond=exitPrice!=null&&years!=null&&years>0?bondValue(exitPrice,years,rate/100):null;const split=bond!=null&&price!=null?cbasSplit(price,bond):null;
   const elasticity=S&&conv&&price&&years&&years>0?Math.min(1.2,(100/conv)*bs('call',S,conv,years,0.015,0.4).delta*S/price):null;
   return {code,name,under:code.slice(0,4),S,price,change:last?.change??null,vol,vol5,week,history:h,stage,timeline,since:traded[k]?.date??null,move:prev&&stage?(rank[stage]>rank[prev]?'up':'down'):null,
    conv,convValue,premium:convValue&&price?price/convValue-1:null,put,maturity,years,exitPrice,bond,quote:split?.quote??null,perLot:split?.perLot??null,leverage:split&&Number.isFinite(split.leverage)?split.leverage:null,elasticity,mode:modes.get(code)??''} as CBRow;
  }).filter(r=>r.price!=null).sort((a,b)=>(b.price??0)-(a.price??0));
 },[quotes,set.data,terms,rate,rule]);
 const cur=rows.find(r=>r.code===sel)??rows[0];
 const stages:Stage[]=['幼年期','中年期','老年期'];
 const zheng=(r:CBRow)=>({band:(r.price??0)>=105&&(r.price??0)<=120,week:r.week>300,day:r.vol5!=null&&r.vol>r.vol5});
 const shown=tab==='zheng'?[...rows].sort((a,b)=>{const za=zheng(a),zb=zheng(b);return Number(zb.band&&zb.week&&zb.day)-Number(za.band&&za.week&&za.day)||(b.vol5?b.vol/b.vol5:0)-(a.vol5?a.vol/a.vol5:0);}):tab==='cbas'?rows.filter(r=>r.perLot!=null).sort((a,b)=>(a.perLot??0)-(b.perLot??0)):rows;
 const nDays=Object.keys(quotes).length;
 return <div className="st-body"><SourceBar {...set}/>
  <div className="feed-status bd-source rd-inline"><Globe size={16}/><b>可轉債日行情</b><span>已取得 {nDays} 個交易日（{prog.done}/{prog.total} 日期已檢查）{prog.msg?`・${prog.msg}`:''}。{DATA_MODE.kind==='static'?'由 GitHub Actions 每日更新。':'過去日期永久快取，之後每天只抓 1 檔。'}</span></div>
  <div className="bd-tabs st-subtabs">{([['life','生命週期'],['zheng','鄭大選債'],['cbas','CBAS 估算'],['terms','轉換價設定']] as const).map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}
   <span className="st-rate"><Num label="資產交換利率" suffix="%" value={rate} step={0.25} onChange={n=>setRate(Math.min(10,Math.max(0,n)))}/></span></div>
  {tab==='terms'?<div className="st-grid"><div className="panel"><div className="panel-title"><h2>轉換價設定</h2><span className="tag">已設定 {Object.keys(terms).length} 檔・存在本機瀏覽器</span></div>
    <div className="st-form"><p className="tiny">公開 API 沒有可自動讀取的轉換價（公開資訊觀測站禁止自動抓取）。請從投資少數派、券商或公開資訊觀測站複製，每行「代號 轉換價 [到期日]」，逗號、空白或 Tab 分隔。未設定轉換價的 CB 仍可用生命週期與鄭大選債（只需要 CB 價與成交量）。</p>
     <textarea className="rd-textarea" value={paste} onChange={e=>setPaste(e.target.value)} placeholder={'11011 36.5 2027-12-10\n12561 190'}/>
     <div className="bd-row"><button className="button primary" onClick={()=>{const t=O.parseConvTerms(paste);saveTerms({...terms,...t});setPaste('');}}>加入 {Object.keys(O.parseConvTerms(paste)).length} 檔</button><button className="button" onClick={()=>saveTerms({})}>全部清除</button></div></div></div>
   <div className="panel"><div className="panel-title"><h2>已設定</h2></div><div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>代號</th><th>轉換價</th><th>到期日</th><th></th></tr></thead><tbody>{Object.entries(terms).map(([c,t])=><tr key={c}><td>{c}</td><td>{t.convPrice}</td><td>{t.maturity??'—'}</td><td><button className="text-button" onClick={()=>{const n={...terms};delete n[c];saveTerms(n);}}>移除</button></td></tr>)}</tbody></table></div></div></div>
  :<><div className="st-kpis">{stages.map(st=>{const l=rows.filter(r=>r.stage===st);return <div key={st} className={`panel st-stagecard s${st.charAt(0)}`}><span>{st}<small>{st==='幼年期'?`< ${rule.young}`:st==='中年期'?`${rule.young}–${rule.old}`:`≥ ${rule.old}`}</small></span><b>{l.length}</b><small>剛換入（5 日內）{l.filter(r=>r.move&&r.since&&r.since>=(Object.keys(quotes).sort().slice(-5)[0]??'')).length} 檔</small></div>;})}
    <div className="panel st-stagecard moved"><span>門檻</span><div className="bd-row st-rulebox"><Num label="幼年上限" value={rule.young} onChange={n=>setRule({...rule,young:Math.min(n,rule.old-1)})}/><Num label="老年下限" value={rule.old} onChange={n=>setRule({...rule,old:Math.max(n,rule.young+1)})}/></div></div></div>
   <div className="st-grid"><div className="panel"><div className="panel-title"><h2><Layers3 size={16}/>{tab==='zheng'?'鄭大三步驟・主力動向':tab==='cbas'?'CBAS 權利金估算':'可轉債生命週期'}</h2><span className="tag">{shown.length} 檔</span></div>
    <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>可轉債</th><th>CB 收盤</th><th>漲跌</th><th>階段</th>
     {tab==='zheng'?<><th>今日量</th><th>前 5 日均量</th><th>週量</th><th>步驟一</th><th>出場訊號</th></>:tab==='cbas'?<><th>至</th><th>年數</th><th>純債價值</th><th>百元報價</th><th>權利金/張</th><th>槓桿</th></>:<><th>變化</th><th>股價</th><th>轉換價</th><th>轉換價值</th><th>溢價率</th><th>股性</th><th>近期階段</th></>}</tr></thead>
     <tbody>{shown.map(r=>{const z=zheng(r);const exits=[r.vol5&&r.vol>=r.vol5*3&&'量暴增',r.premium!=null&&r.premium<0.03&&'溢價收斂',(r.price??0)>=rule.old&&'老年期'].filter(Boolean);
      return <tr key={r.code} className={`${cur?.code===r.code?'selected':''} ${tab==='zheng'&&z.band&&z.week&&z.day?'pass':''}`} onClick={()=>setSel(r.code)}>
       <td className="bd-name">{r.code} {r.name}{r.mode&&<i className="bd-badge daytrade" title={r.mode}>變更交易</i>}</td><td>{r.price?.toFixed(2)}</td><td className={tone(r.change)}>{r.change!=null?(r.change>0?'+':'')+r.change.toFixed(2):'—'}</td><td>{r.stage&&<i className={`st-stage s${r.stage.charAt(0)}`}>{r.stage}</i>}</td>
       {tab==='zheng'?<><td className={z.day?'up':''}>{num(r.vol)}</td><td>{r.vol5!=null?num(Math.round(r.vol5)):'—'}</td><td className={z.week?'up':''}>{num(r.week)}</td><td>{z.band&&z.week&&z.day?<i className="bd-badge flip">符合</i>:<span className="muted">{[z.band,z.week,z.day].filter(Boolean).length}/3</span>}</td><td className="amber-text">{exits.join('、')}</td></>
       :tab==='cbas'?<><td className="muted">{r.put?.putDate&&r.exitPrice!==100?`賣回 ${r.put.putDate}`:r.maturity?`到期 ${r.maturity}`:'—'}</td><td>{r.years?.toFixed(2)??'—'}</td><td>{r.bond?.toFixed(2)??'—'}</td><td>{r.quote?.toFixed(2)??'—'}</td><td>{r.perLot!=null?num(Math.round(r.perLot)):'—'}</td><td>{r.leverage?.toFixed(1)??'—'}</td></>
       :<><td>{r.move==='up'?<span className="up">▲</span>:r.move==='down'?<span className="down">▼</span>:<span className="muted">—</span>}</td><td>{px(r.S)}</td><td>{r.conv??<span className="muted">未設定</span>}</td><td>{r.convValue?.toFixed(2)??'—'}</td><td>{pct(r.premium)}</td><td>{r.elasticity?.toFixed(2)??'—'}</td><td><span className="st-strip">{r.timeline.map((x,i)=><i key={i} className={`s${x.charAt(0)}`}/>)}</span></td></>}</tr>;})}
      {!shown.length&&<tr><td colSpan={11} className="muted">{nDays?'沒有符合的可轉債。':'讀取櫃買可轉債日行情中…'}</td></tr>}</tbody></table></div>
    <p className="live-helper">{tab==='cbas'?'CBAS 需要賣回日（櫃買賣回權資料）或到期日（轉換價設定中輸入）；百元報價為依利率估算，實際以券商報價為準。':tab==='zheng'?'鄭大步驟一：CB 105–120 元、週量 > 300 張、今日量 > 前 5 日均量；轉換比例上升需公開資訊觀測站資料，未納入。':'階段依 CB 收盤價（鄭大：120 以下幼年、150 以上老年）；轉換價值、溢價率、股性需先在「轉換價設定」輸入轉換價。'}</p></div>
    <div className="st-side">{cur&&<div className="panel"><div className="panel-title"><h2>{cur.code} {cur.name}</h2>{cur.stage&&<i className={`st-stage s${cur.stage.charAt(0)}`}>{cur.stage}</i>}</div>
     <div className="st-form"><span className="st-strip big">{cur.timeline.map((x,i)=><i key={i} className={`s${x.charAt(0)}`}/>)}</span>
      <div className="st-out"><p><span>CB 收盤</span><b>{cur.price?.toFixed(2)}</b></p><p><span>標的 {cur.under} 收盤</span><b>{px(cur.S)}</b></p><p><span>轉換價／轉換價值</span><b>{cur.conv??'—'} ／ {cur.convValue?.toFixed(2)??'—'}</b></p><p><span>溢價率・股性</span><b>{pct(cur.premium)}・{cur.elasticity?.toFixed(2)??'—'}</b></p>
       <p><span>賣回</span><b>{cur.put?`${cur.put.putDate} @ ${cur.put.putPrice}（${cur.put.ytp}%）`:'—'}</b></p><p><span>純債價值・百元報價</span><b>{cur.bond?.toFixed(2)??'—'}・{cur.quote?.toFixed(2)??'—'}</b></p><p><span>CBAS 權利金／張</span><b>{cur.perLot!=null?`${num(Math.round(cur.perLot))} 元（${cur.leverage?.toFixed(1)} 倍）`:'—'}</b></p>
       <p><span>今日量／前 5 日均量</span><b>{num(cur.vol)} ／ {cur.vol5!=null?num(Math.round(cur.vol5)):'—'}</b></p>{cur.mode&&<p><span>交易變更</span><b>{cur.mode}</b></p>}</div>
      {cur.stage&&<div className={`st-verdict ${cur.stage==='幼年期'?'go':cur.stage==='中年期'?'wait':'stop'}`}>{STAGE_GUIDE[cur.stage].action}</div>}
      {!cur.conv&&<button className="button" onClick={()=>setTab('terms')}>設定 {cur.code} 轉換價</button>}</div></div>}</div></div></>}
 </div>;
}

// ================= 地板天花板（真實，上市個股） =================
function RealBand(){
 const [code,setCode]=useState('2330'),[input,setInput]=useState('2330'),[bars,setBars]=useState<O.Bar[]|null>(null),[prog,setProg]=useState(''),[err,setErr]=useState(''),[q,setQ]=useState(5),[mult,setMult]=useState(2);
 const load=useCallback((c:string)=>{setBars(null);setErr('');const ctl=new AbortController();monthHistory(c,8,(d,t)=>setProg(`${d}/${t}`),ctl.signal).then(r=>{setBars(r.bars);if(!r.bars.length)setErr(r.message||'沒有取得資料（代號錯誤或非上市股票）');}).catch(e=>setErr(e instanceof Error?e.message:'讀取失敗'));return ctl;},[]);
 useEffect(()=>{const c=load(code);return()=>c.abort();},[code,load]);
 const days=useMemo(()=>(bars??[]).filter(b=>b.close!=null).map(b=>toDay(code,b)),[bars,code]);
 const b=useMemo(()=>days.length?bands(days,q/100,120,mult):[],[days,q,mult]);const last=b.at(-1);
 const recent=b.map((x,i)=>({x,i})).filter(({x})=>x.signal).slice(-8).reverse();
 return <div className="st-body"><div className="st-grid">
  <div className="panel"><div className="panel-title"><h2>{code} 地板・天花板 <span className="muted small">證交所個股月成交・近 8 個月</span></h2>
   <form className="bd-row" onSubmit={e=>{e.preventDefault();if(/^[0-9A-Z]{4,6}$/.test(input))setCode(input);}}><input className="rd-code" value={input} onChange={e=>setInput(e.target.value.trim().toUpperCase())} aria-label="上市股票代號"/><button className="button primary">讀取</button></form></div>
   {!bars?<p className="live-helper">{err||DATA_MODE.kind==='static'?'讀取歷史股價…':`讀取中 ${prog}（每個月份一次請求，間隔 4 秒；已讀過的月份會快取）`}</p>:days.length<40?<p className="live-helper">{err||'資料不足 40 個交易日，無法計算分位數。'}</p>:<>
    <MiniChart W={1100} H={300} days={days} floor={b.map(x=>x.floor)} ceil={b.map(x=>x.ceil)} signals={b.map(x=>x.signal)}/>
    <div className="bd-stats"><div><span>收盤</span><b>{px(last?.close)}</b></div><div><span>MA20</span><b>{px(last?.ma20)}</b></div><div><span>地板</span><b className="down">{px(last?.floor)}</b></div><div><span>天花板</span><b className="up">{px(last?.ceil)}</b></div><div><span>距地板</span><b>{last?.floor?pct(last.close/last.floor-1):'—'}</b></div><div><span>量／20 日均量</span><b>{last?.volRatio?.toFixed(2)??'—'} 倍</b></div></div>
    <div className="bd-mini-list bd-pad">{recent.map(({x})=><div key={x.date} className="st-broker"><b className={x.signal==='floor'?'down':'up'}>{x.date} {x.signal==='floor'?'碰地板':'碰天花板'}・量 {x.volRatio?.toFixed(1)} 倍</b><span>收盤 {px(x.close)}・地板 {px(x.floor)}・天花板 {px(x.ceil)}</span></div>)}{!recent.length&&<p className="live-helper">期間內沒有訊號。</p>}</div></>}
   <p className="live-helper">門檻線為本站自訂：MA20 ×（1 ＋ 過去乖離率第 {q}／{100-q} 百分位）；原作算法未公開。上櫃股票歷史行情這一版未接。</p></div>
  <div className="st-side"><div className="panel"><div className="panel-title"><h2>參數</h2></div><div className="st-form"><div className="two-inputs"><Num label="分位數" suffix="%" value={q} onChange={n=>setQ(Math.min(25,Math.max(1,n)))}/><Num label="量倍數" value={mult} step={0.5} onChange={setMult}/></div></div></div>
   <div className="panel"><div className="panel-title"><h2><Database size={16}/>請求量</h2></div><p className="live-helper">{DATA_MODE.kind==='static'?'歷史股價由 GitHub Actions 每日以證交所「每日收盤行情」累積，涵蓋全部上市股票約 8 個月。':'每讀一檔新股票約 8 次請求；證交所網站主機每 4 秒一次、每日上限 150 次（全站共用）。已讀取的過去月份不再重抓。'}</p></div></div>
 </div></div>;
}
