'use client';
// 交易計劃：市場溫度計、期貨五條線（含五線譜）、樂透 OP、A+ 交易醫生。示範與真實（GitHub Actions 靜態資料）共用。
import {useEffect,useMemo,useState} from 'react';
import {Activity,Crosshair,Database,Radio,ShieldCheck,SlidersHorizontal,TriangleAlert,TrendingUp} from 'lucide-react';
import {num} from '@/lib/market';
import {DATA_MODE} from '@/lib/data-mode';
import {px,pct,pp,tone,md,Ok,Num} from './strategy-ui';
import {
  APLUS_CHECKS,LOTTO_RULE,METHOD_LABEL,THERMO_WEIGHTS,THERMO_ZONES,TXO_MULT,calcTrade,chainSeries,demoBreadth,demoChain,demoIndex,demoTrades,diagnose,fiveLines,gradeSetup,journalStats,lineStats,lottoList,parseTrades,positionSize,
  spectrum,thermoZone,thermometer,tradesToCsv,unpackChain,zoneOf,type BreadthRow,type LineMethod,type Lotto,type LottoRule,type OHLC,type OptChain,type OptCompact,type ThermoWeights,type Trade,
} from '@/lib/plan';

type View='thermo'|'lines'|'lotto'|'doctor';
type TxBar=OHLC&{month:string;settle:number|null;volume:number|null;oi:number|null;night:number|null};
type PlanData={index:OHLC[];tx:TxBar[];chain:OptChain|null;breadth:BreadthRow[]};

function demoData():PlanData{
  const index=demoIndex();const tx=index.slice(-250).map((b,i)=>({...b,open:b.open+40,high:b.high+40,low:b.low+40,close:b.close+40,month:'202610',settle:b.close+40,volume:90000,oi:80000,night:i===249?b.close+95:null}));
  return {index,tx,chain:demoChain(tx.at(-1)!.close,'2026-09-24'),breadth:demoBreadth(index)};
}
async function loadReal(signal:AbortSignal):Promise<{data:PlanData;missing:string[]}>{
  const get=async(f:string)=>{try{const r=await fetch(`${DATA_MODE.base}data/plan/${f}.json`,{cache:'no-cache',signal});return r.ok?await r.json():null;}catch{return null;}};
  const [taiex,tx,txo,breadth]=await Promise.all(['taiex','tx','txo','breadth'].map(get)) as [[string,number,number,number,number][]|null,(string|number|null)[][]|null,{date:string|null;rows:OptCompact[]}|null,BreadthRow[]|null];
  const missing=[!taiex?.length&&'加權指數歷史',!tx?.length&&'台指期日 K',!txo?.rows?.length&&'台指選擇權',!breadth?.length&&'市場寬度'].filter((x):x is string=>!!x);
  return {missing,data:{index:(taiex??[]).map(([date,open,high,low,close])=>({date,open,high,low,close})),
    tx:(tx??[]).map(r=>({date:r[0] as string,month:r[1] as string,open:(r[2]??r[5]) as number,high:r[3] as number,low:r[4] as number,close:r[5] as number,settle:r[6] as number|null,volume:r[7] as number|null,oi:r[8] as number|null,night:r[9] as number|null})),
    chain:txo?.rows?.length?unpackChain(txo):null,breadth:breadth??[]}};
}

export default function PlanDesk(){
  const canReal=DATA_MODE.kind==='static';
  const [view,setView]=useState<View>(()=>{try{const h=location.hash.split('/')[1];return (['thermo','lines','lotto','doctor'] as View[]).includes(h as View)?h as View:'lines';}catch{return 'lines';}});
  const [source,setSource]=useState<'demo'|'real'>(canReal?'real':'demo');
  const [real,setReal]=useState<{data:PlanData;missing:string[]}|null>(null),[loading,setLoading]=useState(false);
  useEffect(()=>{if(source!=='real'||real)return;const ctl=new AbortController();setLoading(true);loadReal(ctl.signal).then(r=>{setReal(r);setLoading(false);});return()=>ctl.abort();},[source,real]);
  const demo=useMemo(demoData,[]);
  const data=source==='real'?real?.data:demo;
  const go=(v:View)=>{setView(v);try{history.replaceState(null,'',`#plan/${v}`);}catch{/* 忽略 */}};
  const nav:[View,string][]=[['lines','期貨五條線'],['thermo','溫度計'],['lotto','樂透 OP'],['doctor','A+ 交易醫生']];
  const thermo=useMemo(()=>data?thermometer(data.breadth,data.index):[],[data]);
  return <section className="branch-desk strategy-desk">
    <div className="page-heading"><div><div className="eyebrow">TRADING PLAN</div><h1>交易計劃・五條線／溫度計／樂透 OP／交易醫生</h1></div>
      <div className="bd-nav" role="tablist" aria-label="交易計劃">{nav.map(([v,l])=><button key={v} role="tab" aria-selected={view===v} className={view===v?'active':''} onClick={()=>go(v)}>{l}</button>)}</div></div>
    <div className={`feed-status bd-source ${source==='real'?'imported':''}`} role="status"><Database size={17}/><b>{source==='demo'?'合成示範資料':'真實公開資料'}</b>
      <span>{source==='demo'?'合成加權指數、台指期與選擇權，用來看工具怎麼運作；數字不代表真實市場。':loading?'讀取中…':real?.missing.length?`尚未產生：${real.missing.join('、')}（下次 GitHub Actions 更新後補上）。`:'加權指數（證交所）、台指期與台指選擇權（期交所）、上市市場寬度，每個交易日 15:40、21:30 更新。'}</span>
      <div className="bd-seg rd-switch" aria-label="資料來源"><button className={source==='demo'?'active':''} onClick={()=>setSource('demo')}>示範資料</button><button className={source==='real'?'active':''} disabled={!canReal} onClick={()=>setSource('real')}>真實資料</button></div></div>
    {!data?<div className="st-body"><p className="live-helper">讀取中…</p></div>:
      view==='lines'?<LinesView d={data} thermo={thermo.at(-1)?.temp??null}/>:view==='thermo'?<ThermoView d={data}/>:view==='lotto'?<LottoView d={data} temp={thermo.at(-1)?.temp??null}/>:<DoctorView d={data} temp={thermo.at(-1)?.temp??null}/>}
    <p className="caution st-pad"><TriangleAlert size={14}/>概念參考「A+ 交易醫生」公開介紹（盤前五條撐壓線、溫度計、樂透單、交易紀律）；該服務的實際公式未公開，本頁採用公開技術指標自行實作，參數皆可調。研究用途，非投資建議。</p>
  </section>;
}

// ================= 期貨五條線 =================
function LinesView({d,thermo}:{d:PlanData;thermo:number|null}){
  const [base,setBase]=useState<'tx'|'index'>(d.tx.length>=2?'tx':'index'),[method,setMethod]=useState<LineMethod>('cdp');
  const bars:OHLC[]=base==='tx'&&d.tx.length?d.tx:d.index;
  const last=bars.at(-1);
  const [hlc,setHlc]=useState<{h:number;l:number;c:number}|null>(null);
  const src=hlc??(last?{h:Math.round(last.high),l:Math.round(last.low),c:Math.round(last.close)}:null);
  const night=base==='tx'?d.tx.at(-1)?.night??null:null;
  const [ref,setRef]=useState<number|null>(null);
  const refPx=ref??src?.c??0;
  const fl=src?fiveLines(src.h,src.l,src.c,method):null;
  const zone=fl?zoneOf(refPx,fl):null;
  const stats=useMemo(()=>lineStats(bars,method),[bars,method]);
  const [specN,setSpecN]=useState(875);
  const sp=useMemo(()=>spectrum(d.index.map(b=>b.close),specN),[d.index,specN]);
  if(!last||!fl||!src)return <div className="st-body"><p className="live-helper">尚無日 K 資料。</p></div>;
  const tz=thermo!=null?thermoZone(thermo):null;
  return <div className="st-body"><div className="st-grid">
    <div className="panel"><div className="panel-title"><h2><Crosshair size={16}/>{base==='tx'?'台指期近月':'加權指數'}・次日五條線</h2>
      <div className="bd-row"><div className="bd-seg">{d.tx.length>=2&&<button className={base==='tx'?'active':''} onClick={()=>{setBase('tx');setHlc(null);setRef(null);}}>台指期</button>}<button className={base==='index'?'active':''} onClick={()=>{setBase('index');setHlc(null);setRef(null);}}>加權指數</button></div>
        <div className="bd-seg">{(Object.keys(METHOD_LABEL) as LineMethod[]).map(m=><button key={m} className={method===m?'active':''} onClick={()=>setMethod(m)}>{METHOD_LABEL[m]}</button>)}</div></div></div>
      <LineChart bars={bars.slice(-20)} lines={fl.lines} refPx={refPx}/>
      <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>線</th><th>點位</th><th>距參考價</th><th>回測：隔日觸及</th><th>觸及後守住</th></tr></thead>
        <tbody>{fl.lines.map(([n,v],k)=><tr key={n} className={zone&&(zone.idx===k||zone.idx===k+1)?'selected':''}><td className={`bd-name ${k<2?'up':k>2?'down':''}`}>{n}</td><td><b>{num(Math.round(v))}</b></td><td className={tone(v-refPx)}>{v-refPx>0?'+':''}{num(Math.round(v-refPx))}</td><td>{pp(stats[k]?.touch,0)}</td><td>{k===2?'—':pp(stats[k]?.hold,0)}</td></tr>)}</tbody></table></div>
      <p className="live-helper">{method==='cdp'?'CDP＝(高＋低＋2×收)÷4；AH＝CDP＋(高−低)、NH＝2×CDP−低、NL＝2×CDP−高、AL＝CDP−(高−低)。':method==='pivot'?'P＝(高＋低＋收)÷3；R1＝2P−低、S1＝2P−高、R2＝P＋(高−低)、S2＝P−(高−低)。':'P＝(高＋低＋收)÷3；壓力／支撐＝P ± 0.382、0.618 ×(高−低)。'}回測：近 {stats[0]?.n??0} 日，以前一日五條線看隔日高低點是否觸及；「守住」＝壓力線收盤未站上、支撐線收盤未跌破。</p></div>
    <div className="st-side">
      <div className="panel"><div className="panel-title"><h2><SlidersHorizontal size={16}/>盤前規劃</h2><span className="tag">基準日 {md(last.date)}</span></div>
        <div className="st-form">
          <div className="two-inputs"><Num label="最高" value={src.h} onChange={n=>setHlc({...src,h:n})}/><Num label="最低" value={src.l} onChange={n=>setHlc({...src,l:n})}/></div>
          <div className="two-inputs"><Num label="收盤" value={src.c} onChange={n=>setHlc({...src,c:n})}/><Num label="參考價（開盤／現價）" value={refPx} onChange={setRef}/></div>
          <div className="bd-row">{night!=null&&<button className="text-button" onClick={()=>setRef(night)} title="期交所同日報表的盤後時段收盤">帶入夜盤 {num(night)}</button>}{ref!=null&&<button className="text-button" onClick={()=>setRef(null)}>參考價改回收盤</button>}{hlc&&<button className="text-button" onClick={()=>setHlc(null)}>高低收還原為資料</button>}</div>
          <div className={`st-verdict ${zone?.bias==='long'?'go':zone?.bias==='short'?'stop':'wait'}`}><b>{zone?.label}</b>：{zone?.plan}</div>
          <div className="st-out"><p><span>區間寬度（前日高低）</span><b>{num(Math.round(fl.range))} 點</b></p><p><span>中軸</span><b>{num(Math.round(fl.mid))}</b></p>
            <p><span>溫度計</span><b>{tz?`${thermo!.toFixed(0)}・${tz[1]}`:'—'}</b></p><p><span>五線譜位階</span><b>{sp?`${sp.z>0?'+':''}${sp.z.toFixed(2)}σ・${sp.zone}`:'—'}</b></p></div>
          {tz&&zone&&<p className="tiny">{(tz[0]>=60&&zone.bias==='short')||(tz[0]<40&&tz[0]>=0&&zone.bias==='long'&&tz[0]<20)?'⚠ 五條線方向與溫度計相反：只做短、口數減半。':tz[0]>=60?'溫度偏熱：以多方劇本為主，空單只在強壓附近短打。':tz[0]<40?'溫度偏冷：以空方劇本為主，多單只在強撐附近短打。':'溫度中性：區間操作，高空低多。'}</p>}
        </div></div>
      <div className="panel"><div className="panel-title"><h2><TrendingUp size={16}/>五線譜・加權指數</h2><div className="bd-seg">{[[250,'1 年'],[500,'2 年'],[875,'3.5 年']].map(([n,l])=><button key={n} className={specN===n?'active':''} onClick={()=>setSpecN(n as number)}>{l}</button>)}</div></div>
        {sp?<><SpecChart closes={d.index.slice(-sp.n)} sp={sp}/>
          <div className="st-out st-m">{sp.lines.map(([n,v])=><p key={n}><span>{n}</span><b>{num(Math.round(v))}</b></p>)}<p><span>目前 {num(Math.round(sp.last))}</span><b className={tone(sp.z)}>{sp.z>0?'+':''}{sp.z.toFixed(2)}σ</b></p></div>
          <p className="live-helper">收盤價線性回歸為趨勢線，±1、±2 個標準差為樂觀／悲觀線；樣本 {sp.n} 日{sp.n<specN?`（資料不足 ${specN} 日）`:''}。長線位階用來決定偏多或偏空，五條線決定當天進出點。</p></>:<p className="live-helper">指數歷史不足。</p>}</div>
    </div></div></div>;
}
function LineChart({bars,lines,refPx}:{bars:OHLC[];lines:[string,number][];refPx:number}){
  const W=760,H=300,L=6,R=110;const vals=[...bars.flatMap(b=>[b.high,b.low]),...lines.map(x=>x[1]),refPx];const hi=Math.max(...vals),lo=Math.min(...vals),pad=(hi-lo)*.05||1;
  const n=bars.length+6,w=(W-L-R)/n,x=(i:number)=>L+i*w+w/2,y=(v:number)=>8+(hi+pad-v)/(hi-lo+2*pad)*(H-28);
  const col=['var(--up)','var(--up)','#9d8cf0','var(--down)','var(--down)'];
  const ly=lines.map(l=>y(l[1]));for(let k=1;k<ly.length;k++)ly[k]=Math.max(ly[k],ly[k-1]+14); // 標籤不重疊
  const shift=Math.max(0,ly.at(-1)!-(H-24));if(shift)for(let k=0;k<ly.length;k++)ly[k]-=shift;
  return <svg className="st-mini" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="近 20 日 K 線與次日五條線">
    {bars.map((b,i)=>{const up=b.close>=b.open;const c=up?'var(--up)':'var(--down)';return <g key={b.date}><line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={c}/><rect x={x(i)-w*.3} width={Math.max(1,w*.6)} y={Math.min(y(b.open),y(b.close))} height={Math.max(1,Math.abs(y(b.open)-y(b.close)))} fill={c}/></g>;})}
    {lines.map(([nm,v],k)=><g key={nm}><line x1={x(Math.max(0,bars.length-6))} x2={W-R+4} y1={y(v)} y2={y(v)} stroke={col[k]} strokeWidth={k===2?1.4:1.1} strokeDasharray={k%2?'5 4':'none'} opacity={k===0||k===4?.9:.75}/><text x={W-R+8} y={ly[k]+4} fontSize="11" fill={col[k]}>{nm.split(' ')[0]} {num(Math.round(v))}</text></g>)}
    <line x1={x(bars.length)} x2={x(bars.length+5)} y1={y(refPx)} y2={y(refPx)} stroke="#e7b86c" strokeWidth="2"/><circle cx={x(bars.length+2.5)} cy={y(refPx)} r="3.5" fill="#e7b86c"/>
    <text x={L} y={H-4} fontSize="10" fill="#758698">{md(bars[0].date)}</text><text x={x(bars.length-1)} y={H-4} fontSize="10" fill="#758698" textAnchor="middle">{md(bars.at(-1)!.date)}</text><text x={x(bars.length+2.5)} y={H-4} fontSize="10" fill="#e7b86c" textAnchor="middle">次日</text>
  </svg>;
}
function SpecChart({closes,sp}:{closes:OHLC[];sp:NonNullable<ReturnType<typeof spectrum>>}){
  const W=360,H=170,n=closes.length;const vals=[...closes.map(b=>b.close),...sp.mid.map(m=>m+2*sp.sd),...sp.mid.map(m=>m-2*sp.sd)];const hi=Math.max(...vals),lo=Math.min(...vals);
  const x=(i:number)=>4+i*(W-8)/(n-1),y=(v:number)=>6+(hi-v)/(hi-lo||1)*(H-18);
  const band=(k:number)=>sp.mid.map((m,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(m+k*sp.sd).toFixed(1)}`).join(' ');
  return <svg className="st-mini" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="加權指數五線譜">
    {[2,1,0,-1,-2].map(k=><path key={k} d={band(k)} fill="none" stroke={k>0?'var(--up)':k<0?'var(--down)':'#9d8cf0'} strokeWidth={k===0?1.3:1} strokeDasharray={Math.abs(k)===1?'4 3':'none'} opacity=".8"/>)}
    <path d={closes.map((b,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(b.close).toFixed(1)}`).join(' ')} fill="none" stroke="#e7b86c" strokeWidth="1.3"/>
    <text x="6" y={H-3} fontSize="9" fill="#758698">{closes[0].date}</text><text x={W-6} y={H-3} fontSize="9" fill="#758698" textAnchor="end">{closes.at(-1)!.date}</text></svg>;
}

// ================= 溫度計 =================
const PART_LABEL:Record<keyof ThermoWeights,string>={ma20:'站上月線比例',ma60:'站上季線比例',adv:'5 日上漲家數比',nhnl:'20 日新高減新低',pos:'指數五線譜位階'};
function ThermoView({d}:{d:PlanData}){
  const [w,setW]=useState<ThermoWeights>(THERMO_WEIGHTS);
  const series=useMemo(()=>thermometer(d.breadth,d.index,w),[d,w]);
  const pts=series.filter(p=>p.temp!=null);const cur=pts.at(-1);
  const near=useMemo(()=>d.chain?chainSeries(d.chain,d.chain.date??'2000-01-01').find(s=>/^\d{6}$/.test(s.month)):null,[d.chain]);
  if(!cur)return <div className="st-body"><p className="live-helper">市場寬度資料不足（需要約 20 個交易日的上市收盤行情）。</p></div>;
  const z=thermoZone(cur.temp!);const prev5=pts.at(-6)?.temp;
  return <div className="st-body">
    <div className="st-kpis">
      <div className="panel pl-gauge-card"><span>市場溫度 {md(cur.date)}</span><Gauge t={cur.temp!}/><small>{z[1]}・{z[2]}</small></div>
      {(Object.keys(PART_LABEL) as (keyof ThermoWeights)[]).slice(0,3).map(k=><div key={k} className="panel"><span>{PART_LABEL[k]}</span><b>{pp(cur.parts[k],0)}</b><small>權重 {w[k]}</small></div>)}
    </div>
    <div className="st-grid">
      <div className="panel"><div className="panel-title"><h2><Activity size={16}/>溫度走勢</h2><span className="muted small">5 日變化 {prev5!=null?`${cur.temp!-prev5>0?'+':''}${(cur.temp!-prev5).toFixed(1)}`:'—'}</span></div>
        <ThermoChart pts={pts}/>
        <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>日期</th><th>溫度</th><th>區間</th>{(Object.keys(PART_LABEL) as (keyof ThermoWeights)[]).map(k=><th key={k}>{PART_LABEL[k]}</th>)}<th>加權指數</th></tr></thead>
          <tbody>{pts.slice(-12).reverse().map(p=><tr key={p.date}><td className="mono">{p.date}</td><td><b className={p.temp!>=60?'up':p.temp!<40?'down':''}>{p.temp!.toFixed(0)}</b></td><td>{thermoZone(p.temp!)[1]}</td>{(Object.keys(PART_LABEL) as (keyof ThermoWeights)[]).map(k=><td key={k}>{pp(p.parts[k],0)}</td>)}<td>{p.index!=null?num(p.index,0):'—'}</td></tr>)}</tbody></table></div>
        <p className="live-helper">溫度＝各分項 0–100% 的加權平均。新高減新低以 (新高−新低)÷樣本數 × 2.5 ＋ 50% 換算；指數位階以 250 日五線譜 z 值（−2σ＝0%、+2σ＝100%）換算。樣本為上市普通股（4 碼、非 0 開頭）。</p></div>
      <div className="st-side">
        <div className="panel"><div className="panel-title"><h2>判讀</h2></div><div className="st-form">
          {THERMO_ZONES.map(([t,l,a])=><div key={l} className={`pl-zone ${z[1]===l?'on':''}`}><b>{l}<small> ≥ {t}</small></b><span>{a}</span></div>)}
          {near&&<div className="st-out"><p><span>選擇權 P/C 未平倉比（{near.month}）</span><b>{near.pcOi?.toFixed(2)??'—'}</b></p><p><span>價平隱波</span><b>{pp(near.iv)}</b></p></div>}
          <p className="tiny">P/C 比高代表賣權未平倉多（賣方看撐），低代表買權未平倉多（賣方看壓）；只作輔助，不列入溫度。</p></div></div>
        <div className="panel"><div className="panel-title"><h2><SlidersHorizontal size={16}/>權重</h2><button className="text-button" onClick={()=>setW(THERMO_WEIGHTS)}>重設</button></div>
          <div className="st-form">{(Object.keys(PART_LABEL) as (keyof ThermoWeights)[]).map(k=><Num key={k} label={PART_LABEL[k]} value={w[k]} step={0.05} onChange={n=>setW(o=>({...o,[k]:Math.max(0,n)}))}/>)}</div></div>
      </div></div></div>;
}
function Gauge({t}:{t:number}){
  const a=Math.PI*(1-t/100),cx=90,cy=86,r=70;const seg=(from:number,to:number,c:string)=>{const a1=Math.PI*(1-from/100),a2=Math.PI*(1-to/100);return <path d={`M${cx+r*Math.cos(a1)} ${cy-r*Math.sin(a1)} A${r} ${r} 0 0 1 ${cx+r*Math.cos(a2)} ${cy-r*Math.sin(a2)}`} stroke={c} strokeWidth="12" fill="none"/>;};
  return <svg viewBox="0 0 180 100" className="pl-gauge" role="img" aria-label={`溫度 ${t.toFixed(0)}`}>{seg(0,20,'#2f8f7a')}{seg(20,40,'#32cba5')}{seg(40,60,'#6b7c8c')}{seg(60,80,'#f1a07e')}{seg(80,100,'#f36d7a')}
    <line x1={cx} y1={cy} x2={cx+(r-16)*Math.cos(a)} y2={cy-(r-16)*Math.sin(a)} stroke="#e3ebf3" strokeWidth="3" strokeLinecap="round"/><circle cx={cx} cy={cy} r="5" fill="#e3ebf3"/>
    <text x={cx} y={cy-24} textAnchor="middle" fontSize="22" fontWeight="600" fill="#e3ebf3">{t.toFixed(0)}</text></svg>;
}
function ThermoChart({pts}:{pts:{date:string;temp:number|null;index:number|null}[]}){
  const W=760,H=220,n=pts.length;const x=(i:number)=>30+i*(W-40)/Math.max(1,n-1),y=(t:number)=>8+(100-t)/100*(H-28);
  const idx=pts.map(p=>p.index).filter((v):v is number=>v!=null);const ih=Math.max(...idx),il=Math.min(...idx);const yi=(v:number)=>8+(ih-v)/(ih-il||1)*(H-28);
  return <svg className="st-mini" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="溫度與加權指數走勢">
    <rect x="30" y={y(100)} width={W-40} height={y(80)-y(100)} fill="#f36d7a" opacity=".08"/><rect x="30" y={y(20)} width={W-40} height={y(0)-y(20)} fill="#32cba5" opacity=".08"/>
    {[20,40,60,80].map(t=><g key={t}><line x1="30" x2={W-10} y1={y(t)} y2={y(t)} stroke="#1f2b37" strokeDasharray="3 5"/><text x="24" y={y(t)+4} textAnchor="end" fontSize="10" fill="#758698">{t}</text></g>)}
    {idx.length>1&&<path d={pts.map((p,i)=>p.index==null?'':`${i&&pts[i-1].index!=null?'L':'M'}${x(i).toFixed(1)} ${yi(p.index).toFixed(1)}`).join(' ')} fill="none" stroke="#e7b86c" strokeWidth="1" opacity=".6"/>}
    <path d={pts.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(p.temp!).toFixed(1)}`).join(' ')} fill="none" stroke="#79d3e4" strokeWidth="1.8"/>
    <text x="34" y="18" fontSize="10" fill="#79d3e4">溫度</text><text x="66" y="18" fontSize="10" fill="#e7b86c">加權指數（右軸比例）</text>
    <text x="30" y={H-4} fontSize="10" fill="#758698">{md(pts[0].date)}</text><text x={W-10} y={H-4} fontSize="10" fill="#758698" textAnchor="end">{md(pts.at(-1)!.date)}</text></svg>;
}

// ================= 樂透 OP =================
function LottoView({d,temp}:{d:PlanData;temp:number|null}){
  const today=d.chain?.date??'';
  const series=useMemo(()=>d.chain?chainSeries(d.chain,today):[],[d.chain,today]);
  const [month,setMonth]=useState<string|null>(null),[rule,setRule]=useState<LottoRule>(LOTTO_RULE),[pick,setPick]=useState<string|null>(null);
  const s=series.find(x=>x.month===month)??series[0];
  const list=useMemo(()=>s?lottoList(s,rule):[],[s,rule]);
  if(!d.chain||!s)return <div className="st-body"><p className="live-helper">尚無台指選擇權資料。</p></div>;
  const cur=list.find(l=>`${l.cp}${l.strike}`===pick)??null;
  const set=(k:keyof LottoRule,f=1)=>(n:number)=>setRule(r=>({...r,[k]:Math.max(0,n/f)}));
  const tz=temp!=null?thermoZone(temp):null;
  const table=(cp:'C'|'P')=><div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>{cp==='C'?'買權 Call':'賣權 Put'}</th><th>權利金</th><th>距離</th><th>損益兩平</th><th>到期價內機率</th><th>每口成本</th><th>可買口數</th>{[1,2,3,5].map(m=><th key={m}>{cp==='C'?'漲':'跌'} {m}%</th>)}<th>未平倉</th><th>量</th></tr></thead>
    <tbody>{list.filter(l=>l.cp===cp).map(l=><tr key={l.strike} className={pick===`${cp}${l.strike}`?'selected':''} onClick={()=>setPick(`${cp}${l.strike}`)}><td className="bd-name">{num(l.strike)}</td><td><b>{l.price}</b></td><td>{num(Math.round(l.dist))} 點（{pp(l.distPct,1)}）</td><td>{num(Math.round(l.breakeven))}<small className="muted">（需 {pp(l.needPct,1)}）</small></td><td>{pp(l.prob,1)}</td><td>{num(l.cost)}</td><td>{l.lots}</td>
      {l.scen.map(x=><td key={x.move} className={x.mult>=1?'up':'muted'}>{x.mult>=0.05?`${x.mult.toFixed(1)} 倍`:'歸零'}</td>)}<td>{num(l.oi)}</td><td>{num(l.volume)}</td></tr>)}
      {!list.some(l=>l.cp===cp)&&<tr><td colSpan={13} className="muted">沒有符合條件的{cp==='C'?'買權':'賣權'}，可放寬權利金上限或距離。</td></tr>}</tbody></table></div>;
  return <div className="st-body">
    <div className="st-kpis">{[['到期',`${md(s.expiry)}・剩 ${s.days} 日`,`${s.month}（${s.expiry}）`],['隱含期貨價',num(Math.round(s.F)),`價平 ${num(s.atm)}`],['價平隱波',pp(s.iv),`1 日預期波動 ±${s.iv?num(Math.round(s.F*s.iv/Math.sqrt(252))):'—'} 點`],['P/C 未平倉比',s.pcOi?.toFixed(2)??'—',tz?`溫度 ${temp!.toFixed(0)}・${tz[1]}`:'']].map(([l,v,x])=><div key={l} className="panel"><span>{l}</span><b>{v}</b><small>{x}</small></div>)}</div>
    <div className="st-grid">
      <div className="panel"><div className="panel-title"><h2><Radio size={16}/>樂透單候選・資料日 {today}</h2>
        <div className="bd-seg">{series.slice(0,6).map(x=><button key={x.month} className={s.month===x.month?'active':''} onClick={()=>{setMonth(x.month);setPick(null);}}>{x.month.slice(4)}<small className="muted"> {md(x.expiry)}</small></button>)}</div></div>
        <div className="st-rules"><Num label="權利金 ≤" suffix="點" value={rule.maxPrice} step={0.5} onChange={set('maxPrice')}/><Num label="價外距離 ≥" suffix="%" value={+(rule.minDist*100).toFixed(1)} step={0.5} onChange={set('minDist',100)}/><Num label="價外距離 ≤" suffix="%" value={+(rule.maxDist*100).toFixed(1)} step={0.5} onChange={set('maxDist',100)}/><Num label="每次預算" suffix="元" value={rule.budget} step={500} onChange={set('budget')}/></div>
        {table('C')}{table('P')}
        <p className="live-helper">價格用收盤價（無成交用買賣中價或結算價）。距離以隱含期貨價計；到期價內機率為 Black-Scholes N(d2)，採價平隱波，價外實際隱波通常更高（微笑），機率偏低估。情境倍數＝到期時指數漲跌該幅度的結算價值 ÷ 權利金。台指選擇權每點 {TXO_MULT} 元。</p></div>
      <div className="st-side">
        <div className="panel"><div className="panel-title"><h2><ShieldCheck size={16}/>樂透單規劃</h2><span className="tag">{cur?`${cur.cp==='C'?'Call':'Put'} ${num(cur.strike)}`:'點左表選一檔'}</span></div>
          {cur?<LottoPlan l={cur} rule={rule} setTarget={n=>setRule(r=>({...r,target:Math.max(1,n)}))} F={s.F}/>:<p className="live-helper">選一檔後顯示口數、最大損失、分批出場價與到期損益。</p>}</div>
        <div className="panel"><div className="panel-title"><h2>樂透單紀律</h2></div><ol className="st-steps">
          <li><b>固定預算：</b>每次只用帳戶 0.5–1%，當作「一定會歸零」的成本，不攤平、不加碼。</li>
          <li><b>時點：</b>多在結算前 1–2 日或結算日，時間價值最低、Gamma 最大；遇大事件（聯準會、財報、假期）前才買。</li>
          <li><b>方向：</b>溫度計冰點偏買 Call、過熱偏買 Put（賭反轉）；或順著突破強壓／跌破強撐的五條線方向。</li>
          <li><b>出場：</b>漲到 3 倍先賣一半收回成本，其餘抱到結算或 {rule.target} 倍。</li>
          <li><b>避開：</b>權利金 0.1–0.5 點、成交量極少的履約價，買賣價差大、幾乎無法出場。</li></ol></div>
      </div></div></div>;
}
function LottoPlan({l,rule,setTarget,F}:{l:Lotto;rule:LottoRule;setTarget:(n:number)=>void;F:number}){
  const [lots,setLots]=useState(Math.max(1,l.lots));const cost=l.cost*lots;
  const W=320,H=130,lo=F*0.93,hi=F*1.07;const pay=(p:number)=>(Math.max(0,l.cp==='C'?p-l.strike:l.strike-p)-l.price)*TXO_MULT*lots;
  const xs=Array.from({length:61},(_,i)=>lo+(hi-lo)*i/60);const ps=xs.map(pay);const pmax=Math.max(...ps,cost),pmin=-cost;
  const x=(v:number)=>8+(v-lo)/(hi-lo)*(W-16),y=(v:number)=>6+(pmax-v)/(pmax-pmin||1)*(H-22);
  return <div className="st-form">
    <div className="two-inputs"><Num label="口數" value={lots} onChange={n=>setLots(Math.max(1,Math.round(n)))}/><Num label="目標倍數" value={rule.target} onChange={setTarget}/></div>
    <svg className="st-mini" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="到期損益"><line x1="8" x2={W-8} y1={y(0)} y2={y(0)} stroke="#3a4a58"/><line x1={x(F)} x2={x(F)} y1="4" y2={H-16} stroke="#e7b86c" strokeDasharray="3 3"/>
      <path d={xs.map((v,i)=>`${i?'L':'M'}${x(v).toFixed(1)} ${y(ps[i]).toFixed(1)}`).join(' ')} fill="none" stroke="#79d3e4" strokeWidth="1.8"/>
      <text x={x(F)+3} y="14" fontSize="9" fill="#e7b86c">目前 {num(Math.round(F))}</text><text x="8" y={H-4} fontSize="9" fill="#758698">−7%</text><text x={W-8} y={H-4} fontSize="9" fill="#758698" textAnchor="end">+7%</text></svg>
    <div className="st-out"><p><span>總成本＝最大損失</span><b className="down">{num(cost)} 元</b></p><p><span>佔預算</span><b>{pp(cost/rule.budget,0)}</b></p>
      <p><span>損益兩平（到期指數）</span><b>{num(Math.round(l.breakeven))}</b></p><p><span>3 倍先賣一半（權利金）</span><b>{(l.price*3).toFixed(1)} 點</b></p>
      <p><span>{rule.target} 倍對應到期指數</span><b>{num(Math.round(l.targetAt))}（{pct(l.targetAt/F-1,1)}）</b></p><p><span>到期價內機率</span><b>{pp(l.prob,1)}</b></p></div>
    {cost>rule.budget&&<p className="caution"><TriangleAlert size={14}/>超過每次預算。</p>}</div>;
}

// ================= A+ 交易醫生 =================
const KEY='pulse.journal.v1';
const loadJournal=():Trade[]|null=>{try{const s=localStorage.getItem(KEY);return s?JSON.parse(s) as Trade[]:null;}catch{return null;}};
const saveJournal=(t:Trade[]|null)=>{try{if(t)localStorage.setItem(KEY,JSON.stringify(t));else localStorage.removeItem(KEY);}catch{/* 無法保存時只保留在本頁 */}};
function DoctorView({d,temp}:{d:PlanData;temp:number|null}){
  const [tab,setTab]=useState<'check'|'journal'>('check');
  return <div className="st-body"><div className="bd-tabs st-subtabs">{([['check','A+ 下單前檢核'],['journal','交易日誌診斷']] as const).map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
    {tab==='check'?<CheckView d={d} temp={temp}/>:<JournalView/>}</div>;
}
function CheckView({d,temp}:{d:PlanData;temp:number|null}){
  const bars:OHLC[]=d.tx.length>=2?d.tx:d.index;const last=bars.at(-1)!;const fl=fiveLines(last.high,last.low,last.close);
  const gap=Math.max(20,Math.round(fl.range*0.15));
  const [side,setSide]=useState<'long'|'short'>('long'),[entry,setEntry]=useState(Math.round(fl.lines[3][1])),[stop,setStop]=useState(Math.round(fl.lines[3][1])-gap),[target,setTarget]=useState(Math.round(fl.lines[1][1]));
  const [capital,setCapital]=useState(500000),[riskPct,setRiskPct]=useState(2),[product,setProduct]=useState('MTX');
  const [chk,setChk]=useState<Record<string,boolean>>({mood:true});
  const stopPts=Math.abs(entry-stop),gain=(target-entry)*(side==='long'?1:-1),rr=stopPts?gain/stopPts:0;
  const dirOk=temp==null?null:side==='long'?temp>=40:temp<60;
  const near=fl.lines.map(x=>x[1]).reduce((b,v)=>Math.abs(v-entry)<Math.abs(b-entry)?v:b);const lineOk=Math.abs(near-entry)<=Math.max(20,fl.range*0.1);
  const auto:Record<string,boolean|null>={trend:dirOk,line:lineOk,rr:rr>=2,stop:stopPts>0&&(side==='long'?stop<entry:stop>entry)&&positionSize(capital,riskPct/100,stopPts,product)>=1};
  const eff={...chk,...Object.fromEntries(Object.entries(auto).filter(([k,v])=>v!=null&&chk[k]===undefined))} as Record<string,boolean>;
  const g=gradeSetup(eff);const maxLots=positionSize(capital,riskPct/100,stopPts,product);const lots=Math.floor(maxLots*g.size);
  return <div className="st-grid">
    <div className="panel"><div className="panel-title"><h2><ShieldCheck size={16}/>下單前 A+ 檢核</h2><div className="bd-seg">{(['long','short'] as const).map(s=><button key={s} className={side===s?'active':''} onClick={()=>{setSide(s);if(s==='short'){setEntry(Math.round(fl.lines[1][1]));setStop(Math.round(fl.lines[1][1])+gap);setTarget(Math.round(fl.lines[3][1]));}else{setEntry(Math.round(fl.lines[3][1]));setStop(Math.round(fl.lines[3][1])-gap);setTarget(Math.round(fl.lines[1][1]));}}}>{s==='long'?'做多':'做空'}</button>)}</div></div>
      <div className="st-form">
        <div className="two-inputs"><Num label="進場價" value={entry} onChange={setEntry}/><Num label="停損價" value={stop} onChange={setStop}/></div>
        <div className="two-inputs"><Num label="目標價" value={target} onChange={setTarget}/><label className="st-field"><span>商品</span><select className="st-select" value={product} onChange={e=>setProduct(e.target.value)}><option value="TX">大台 200 元／點</option><option value="MTX">小台 50 元／點</option><option value="TMF">微台 10 元／點</option></select></label></div>
        <p className="tiny">預設帶入 {md(last.date)} 的 CDP 五條線：{fl.lines.map(([n,v])=>`${n.split(' ')[0]} ${num(Math.round(v))}`).join('・')}</p>
        <div className="st-checks">{APLUS_CHECKS.map(c=>{const a=auto[c.key];const on=eff[c.key]??false;return <label key={c.key} className={`st-check pl-check ${on?'ok':'no'}`}><input type="checkbox" checked={on} onChange={e=>setChk(o=>({...o,[c.key]:e.target.checked}))}/><span>{on?'✓':'✕'}</span><div><b>{c.label}</b><small className="muted"> ×{c.weight}　{c.hint}{a!=null&&chk[c.key]===undefined?'（自動判斷）':''}</small></div></label>;})}</div>
        <div className="st-out"><p><span>停損點數／目標點數</span><b>{num(stopPts)}／{num(gain)} 點</b></p><p><span>風報比</span><b className={rr>=2?'up':''}>{rr.toFixed(2)}</b></p><p><span>溫度計</span><b>{temp!=null?`${temp.toFixed(0)}・${thermoZone(temp)[1]}`:'—'}</b></p><p><span>最近的線</span><b>{num(Math.round(near))}（差 {num(Math.round(entry-near))}）</b></p></div>
      </div></div>
    <div className="st-side">
      <div className="panel"><div className="panel-title"><h2>評級</h2></div><div className="st-form">
        <div className={`pl-grade g${g.grade.replace('+','p')}`}>{g.grade}</div>
        <div className={`st-verdict ${g.grade.startsWith('A')?'go':g.grade==='B'?'wait':'stop'}`}>{g.text}（條件分數 {pp(g.score,0)}）</div>
        <div className="two-inputs"><Num label="帳戶資金" suffix="元" value={capital} step={10000} onChange={n=>setCapital(Math.max(0,n))}/><Num label="單筆風險" suffix="%" value={riskPct} step={0.5} onChange={n=>setRiskPct(Math.max(0,n))}/></div>
        <div className="st-out"><p><span>風險上限口數</span><b>{maxLots} 口</b></p><p><span>依評級建議口數</span><b className="amber-text">{lots} 口</b></p><p><span>最大虧損</span><b className="down">{num(Math.round(lots*stopPts*(product==='TX'?200:product==='MTX'?50:10)))} 元</b></p></div>
        <p className="tiny">口數＝資金 × 單筆風險 ÷（停損點數 × 每點價值），再依評級：A+ 全額、A 一半、B 四分之一、C 不做。沒有停損一律 C。</p></div></div>
    </div></div>;
}
function JournalView(){
  const [mine,setMine]=useState<Trade[]|null>(loadJournal);const [text,setText]=useState(''),[msg,setMsg]=useState<string[]>([]),[cost,setCost]=useState(150);
  const trades=mine??demoTrades();const calc=useMemo(()=>trades.map(t=>calcTrade(t,cost)),[trades,cost]);
  const s=useMemo(()=>journalStats(calc),[calc]);const f=useMemo(()=>diagnose(calc,s),[calc,s]);
  const byGrade=['A+','A','B','C',''].map(g=>{const l=calc.filter(t=>t.grade===g);return {g:g||'未評',n:l.length,win:l.length?l.filter(t=>t.pnl>0).length/l.length:null,avg:l.length?l.reduce((a,t)=>a+t.pnl,0)/l.length:null};}).filter(x=>x.n);
  const update=(t:Trade[]|null)=>{setMine(t);saveJournal(t);};
  const imp=(append:boolean)=>{const r=parseTrades(text);setMsg([`匯入 ${r.trades.length} 筆`,...r.errors.slice(0,5)]);if(r.trades.length)update([...(append&&mine?mine:[]),...r.trades].sort((a,b)=>a.date.localeCompare(b.date)));};
  return <><div className="st-kpis">{[['筆數',`${s.n}`,`${s.days} 個交易日`],['勝率',pp(s.winRate,0),`賺賠比 ${s.payoff?.toFixed(2)??'—'}`],['期望值／筆',`${num(Math.round(s.expectancy))} 元`,`獲利因子 ${s.pf?.toFixed(2)??'—'}`],['總損益',`${num(Math.round(s.total))} 元`,`最大回撤 ${num(Math.round(s.maxDD))}・連虧 ${s.maxLossStreak}`]].map(([l,v,x])=><div key={l} className="panel"><span>{l}</span><b>{v}</b><small>{x}</small></div>)}</div>
    <div className="st-grid">
      <div className="panel"><div className="panel-title"><h2><Activity size={16}/>{mine?'我的交易日誌':'範例日誌（合成）'}</h2><span className="muted small">{mine?'只存在這個瀏覽器':'匯入自己的紀錄後取代'}</span></div>
        <Equity eq={s.equity}/>
        <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>日期</th><th>商品</th><th>多空</th><th>進場</th><th>出場</th><th>口數</th><th>停損</th><th>點數</th><th>R</th><th>損益</th><th>評級</th><th>分鐘</th></tr></thead>
          <tbody>{[...calc].reverse().slice(0,80).map((t,i)=><tr key={i}><td className="mono">{t.date}</td><td>{t.product}</td><td className={t.side==='long'?'up':'down'}>{t.side==='long'?'多':'空'}</td><td>{num(t.entry)}</td><td>{num(t.exit)}</td><td>{t.qty}</td><td className="muted">{t.stop!=null?num(t.stop):'未設'}</td><td className={tone(t.points)}>{t.points>0?'+':''}{num(t.points)}</td><td className={t.r!=null&&t.r<-1.3?'amber-text':''}>{t.r!=null?t.r.toFixed(1):'—'}</td><td className={tone(t.pnl)}>{num(Math.round(t.pnl))}</td><td>{t.grade||'—'}</td><td className="muted">{t.minutes??'—'}</td></tr>)}</tbody></table></div>
        <p className="live-helper">損益＝點數 × 每點價值（大台 200、小台 50、微台 10）× 口數 − 每口來回成本。R＝點數 ÷ 停損點數。</p></div>
      <div className="st-side">
        <div className="panel"><div className="panel-title"><h2><TriangleAlert size={16}/>診斷與處方</h2><span className="tag">{f.filter(x=>x.level==='bad').length} 項嚴重</span></div>
          <div className="st-form">{f.map(x=><div key={x.title} className={`pl-finding ${x.level}`}><b>{x.level==='bad'?'✕':x.level==='warn'?'!':'✓'} {x.title}</b><span>{x.detail}</span><small>處方：{x.rx}</small></div>)}
            {!f.length&&<p className="live-helper">沒有明顯問題。</p>}
            <div className="st-out"><p><span>平均 R</span><b>{s.avgR?.toFixed(2)??'—'}</b></p><p><span>停損設定率</span><b>{pp(s.stopRate,0)}</b></p><p><span>凱利值</span><b>{s.kelly!=null?pp(s.kelly,0):'—'}</b></p><p><span>每日平均筆數</span><b>{s.perDay.toFixed(1)}</b></p></div>
            <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>評級</th><th>筆數</th><th>勝率</th><th>平均損益</th></tr></thead><tbody>{byGrade.map(x=><tr key={x.g}><td className="bd-name">{x.g}</td><td>{x.n}</td><td>{pp(x.win,0)}</td><td className={tone(x.avg)}>{x.avg!=null?num(Math.round(x.avg)):'—'}</td></tr>)}</tbody></table></div></div></div>
        <div className="panel"><div className="panel-title"><h2>匯入／匯出</h2></div><div className="st-form">
          <textarea className="rd-textarea" value={text} onChange={e=>setText(e.target.value)} placeholder={'日期,商品,多空,進場,出場,口數,停損,評級,持有分鐘,備註\n2026-09-24,MTX,多,47920,48010,2,47880,A+,25,NL 支撐反彈'} aria-label="貼上交易紀錄"/>
          <div className="bd-row"><button className="button primary" onClick={()=>imp(false)}>取代匯入</button><button className="button" onClick={()=>imp(true)} disabled={!mine}>附加</button>
            <button className="button" onClick={()=>setText(tradesToCsv(trades))}>匯出到文字框</button>{mine&&<button className="text-button" onClick={()=>{if(confirm('清除這個瀏覽器保存的交易日誌？'))update(null);}}>清除</button>}</div>
          {msg.length>0&&<p className="tiny">{msg.join('；')}</p>}
          <Num label="每口來回成本（手續費＋期交稅）" suffix="元" value={cost} step={10} onChange={n=>setCost(Math.max(0,n))}/>
          <p className="tiny">多空可寫「多／空」或 long／short；停損、評級（A+／A／B／C）、持有分鐘可空白。資料只存在你的瀏覽器（localStorage），不會上傳。</p></div></div>
      </div></div></>;
}
function Equity({eq}:{eq:number[]}){
  if(eq.length<2)return null;const W=760,H=140;const all=[0,...eq];const hi=Math.max(...all),lo=Math.min(...all);const x=(i:number)=>6+i*(W-12)/(all.length-1),y=(v:number)=>6+(hi-v)/(hi-lo||1)*(H-14);
  return <svg className="st-mini" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="累積損益曲線"><line x1="6" x2={W-6} y1={y(0)} y2={y(0)} stroke="#3a4a58"/>
    <path d={all.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} fill="none" stroke={all.at(-1)!>=0?'var(--up)':'var(--down)'} strokeWidth="1.6"/><text x="8" y="16" fontSize="10" fill="#758698">累積損益</text></svg>;
}
