'use client';
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {Crosshair,Database,Globe,Layers3,Radio,Search,SlidersHorizontal,TriangleAlert,Upload,Users,X} from 'lucide-react';
import {DATA_MODE} from '@/lib/data-mode';
import {brokerCounty,brokerMap,DEMO_HQ,TILE,type County} from '@/lib/geo';
import {addCodes,addGroup,categories,DEFAULT_WATCH,deleteGroup,hotCombos,moveCode,parseCodes,removeCode,renameGroup,sanitizeWatch,type Watch} from '@/lib/watch';
import {num} from '@/lib/market';
import {
  anomalies,backtest,buildDataset,fillPrices,type SeriesBar,concentrationSeries,dateFromText,decodeBytes,demoShared,flipPressure,heavyBrokers,
  KIND_LABEL,ledger,mainStreak,parseBrokerCsv,priceLevels,profileBrokers,rangeStat,screenAt,STYLE_LABEL,
  type Broker,type BrokerProfile,type Dataset,type DayStat,type Flow,type RawDay,type ScreenRule,
} from '@/lib/branch';

// ---------- 格式 ----------
const lot=(s:number)=>Math.round(s/1000);
const fl=(s:number,sign=false)=>{const v=lot(s);return (sign&&v>0?'+':'')+num(v);};
const px=(p:number|null|undefined)=>p==null||!Number.isFinite(p)?'—':num(p,p>=1000?0:p>=100?1:2);
const pct=(x:number|null|undefined,d=1)=>x==null?'—':`${x>0?'+':''}${(x*100).toFixed(d)}%`;
const amt=(n:number)=>{const a=Math.abs(n),s=n<0?'−':'';return a>=1e8?`${s}${(a/1e8).toFixed(2)} 億`:a>=1e4?`${s}${num(Math.round(a/1e4))} 萬`:`${s}${num(Math.round(a))}`;};
const tone=(n:number|null|undefined)=>n==null||n===0?'':n>0?'up':'down';
const md=(d:string)=>d.slice(5).replace('-','/');

const getDemo=demoShared;
type ImportState={files:{name:string;format:string;code:string;date:string;rows:number;warnings:string[]}[];raw:RawDay[];brokers:Broker[];names:Record<string,string>};
const STORE='pulse-branch-import-v1',WATCH='pulse-watch-v1';
type View='stock'|'desk'|'screen'|'import';

function BrokerTags({b,p}:{b?:Broker;p?:BrokerProfile}){
  if(!b)return null;
  return <>{b.kind!=='domestic'&&<i className={`bd-badge ${b.kind}`}>{KIND_LABEL[b.kind]}</i>}{p&&p.style!=='mixed'&&<i className={`bd-badge ${p.style}`}>{STYLE_LABEL[p.style]}</i>}</>;
}

export default function BranchDesk(){
  const [imported,setImported]=useState<ImportState|null>(null),[useImport,setUseImport]=useState(false);
  const [view,setView]=useState<View>('stock');
  const [code,setCode]=useState('2330'),[date,setDate]=useState<string|null>(null),[range,setRange]=useState(5),[broker,setBroker]=useState<string|null>(null);
  const [watch,setWatchRaw]=useState<Watch>(DEFAULT_WATCH),[group,setGroup]=useState('all'),[editing,setEditing]=useState(false),[hq,setHq]=useState<Record<string,County>>({}),[bgeo,setBgeo]=useState<Record<string,County>>({});
  const setWatch=(w:Watch)=>{setWatchRaw(w);try{localStorage.setItem(WATCH,JSON.stringify(w));}catch{/* 無法保存時只保留在本頁 */}};
  useEffect(()=>{try{const w=sanitizeWatch(JSON.parse(localStorage.getItem(WATCH)??'null'));if(w)setWatchRaw(w);}catch{/* 使用預設自選 */}
    if(DATA_MODE.kind==='static'){const get=(f:string)=>fetch(`${DATA_MODE.base}data/geo/${f}.json`,{cache:'no-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({}));get('hq').then(setHq);get('brokers').then(setBgeo);}},[]);
  useEffect(()=>{try{const s=localStorage.getItem(STORE);if(s){const v=JSON.parse(s) as ImportState;if(v?.raw?.length)setImported(v);}}catch{/* 無法讀取瀏覽器儲存時以示範資料運作 */}},[]);
  // 匯入資料多半只有分點成交價：靜態版從 data/series 補上真實開高低收
  const [series,setSeries]=useState<Record<string,SeriesBar[]>>({});
  useEffect(()=>{if(!useImport||!imported?.raw.length||DATA_MODE.kind!=='static')return;const ctl=new AbortController();
    const codes=[...new Set(imported.raw.map(r=>r.code))].filter(c=>!series[c]).slice(0,60);
    Promise.all(codes.map(c=>fetch(`${DATA_MODE.base}data/series/${c}.json`,{signal:ctl.signal}).then(r=>r.ok?r.json():null).catch(()=>null).then(v=>[c,v] as const)))
      .then(list=>{const got=Object.fromEntries(list.filter(([,v])=>Array.isArray(v)));if(Object.keys(got).length)setSeries(o=>({...o,...got}));});
    return()=>ctl.abort();},[useImport,imported]);// eslint-disable-line react-hooks/exhaustive-deps
  const ds=useMemo(()=>useImport&&imported?.raw.length?buildDataset(fillPrices(imported.raw,series),imported.brokers,imported.names,'import'):getDemo(),[useImport,imported,series]);
  const cur=ds.days[code]?code:ds.stocks[0];
  const open=(c:string,b?:string|null)=>{setCode(c);setDate(null);if(b!==undefined)setBroker(b);setView('stock');};
  const nav:[View,string,ReactNode][]=[['stock','個股分點',<Crosshair key="a" size={15}/>],['desk','分點調查局',<Users key="b" size={15}/>],['screen','籌碼選股',<SlidersHorizontal key="c" size={15}/>],['import','匯入資料',<Upload key="d" size={15}/>]];
  return <section className="branch-desk">
    <div className="page-heading"><div><div className="eyebrow">BROKER BRANCH FLOW</div><h1>分點籌碼・主力進出</h1></div>
      <div className="bd-nav" role="tablist" aria-label="分點功能">{nav.map(([v,l,i])=><button key={v} role="tab" aria-selected={view===v} className={view===v?'active':''} onClick={()=>setView(v)}>{i}{l}</button>)}</div></div>
    <div className={`feed-status bd-source ${ds.source==='synthetic'?'':'imported'}`} role="status"><Database size={17}/><b>{ds.source==='synthetic'?'合成示範資料':'已匯入分點資料'}</b>
      <span>{ds.source==='synthetic'?`虛構券商、固定亂數：${ds.stocks.length} 檔 × ${ds.dates.length} 個交易日。證交所分點（買賣日報表）下載需人工輸入驗證碼，網站不自動抓；匯入你下載的 CSV 後即為真實分點。`:`${ds.stocks.length} 檔、${ds.dates.length} 個交易日（${ds.dates[0]} ~ ${ds.dates.at(-1)}）。${Object.keys(series).length?`開高低收取自證交所／櫃買收盤行情（${ds.stocks.filter(c=>series[c]).length} 檔）；`:''}無收盤行情時以分點成交均價代替。`}</span>
      <small>{ds.source==='synthetic'?<button className="text-button" onClick={()=>setView('import')}>匯入真實買賣日報表 →</button>:<button className="text-button" onClick={()=>setUseImport(false)}>切回示範資料</button>}</small></div>
    {!ds.stocks.length?<div className="panel empty-state bd-margin">目前沒有可用資料。</div>:
     view==='stock'?<StockView ds={ds} code={cur} setCode={c=>{setCode(c);}} date={date} setDate={setDate} range={range} setRange={setRange} broker={broker} setBroker={setBroker} watch={watch} setWatch={setWatch} group={group} setGroup={setGroup} onEdit={()=>setEditing(true)} hq={ds.source==='synthetic'?DEMO_HQ:{...DEMO_HQ,...hq}} geo={ds.source==='synthetic'?{}:bgeo}/>:
     view==='desk'?<DeskView ds={ds} onOpen={open}/>:
     view==='screen'?<ScreenView ds={ds} onOpen={open}/>:
     <ImportView imported={imported} useImport={useImport} onChange={v=>{setImported(v);if(!v)setUseImport(false);}} onUse={()=>{setUseImport(true);setDate(null);setBroker(null);setView('stock');}} onDemo={()=>setUseImport(false)}/>}
    {editing&&<WatchEditor ds={ds} watch={watch} setWatch={setWatch} initial={group==='all'?watch.groups[0].id:group} onClose={()=>setEditing(false)}/>}
  </section>;
}

// ================= 個股分點 =================
function StockView({ds,code,setCode,date,setDate,range,setRange,broker,setBroker,watch,setWatch,group,setGroup,onEdit,hq,geo}:{ds:Dataset;code:string;setCode:(c:string)=>void;date:string|null;setDate:(d:string|null)=>void;range:number;setRange:(n:number)=>void;broker:string|null;setBroker:(b:string|null)=>void;watch:Watch;setWatch:(w:Watch)=>void;group:string;setGroup:(g:string)=>void;onEdit:()=>void;hq:Record<string,County>;geo:Record<string,County>}){
  const [query,setQuery]=useState('');
  const days=ds.days[code];
  const found=date?days.findIndex(d=>d.date===date):-1;const idx=found<0?days.length-1:found;
  const day=days[idx],prev=days[idx-1];
  const rdays=days.slice(Math.max(0,idx-range+1),idx+1);
  const rs=useMemo(()=>rangeStat(rdays),[code,idx,range,ds]);// eslint-disable-line react-hooks/exhaustive-deps
  const profiles=useMemo(()=>new Map(profileBrokers(ds,60,day.date).map(p=>[p.broker.id,p])),[ds,day.date]);
  const conc=(n:number)=>idx+1>=n?rangeStat(days.slice(idx-n+1,idx+1)).concentration:null;
  const streak=mainStreak(days,idx);
  const levels=useMemo(()=>priceLevels(rdays,rs.topBuy,rs.topSell),[rs]);// eslint-disable-line react-hooks/exhaustive-deps
  const flip=flipPressure(day,profiles);const flipOut=day.topSell.filter(f=>profiles.get(f.broker)?.style==='flip').reduce((s,f)=>s-f.net,0);const heavy=heavyBrokers(day).slice(0,6);
  const change=prev?day.mark-prev.mark:null;const hasClose=day.close!=null;
  const g=watch.groups.find(x=>x.id===group);const base=g?g.codes:ds.stocks;
  const list=base.filter(c=>!query||c.includes(query.toUpperCase())||(ds.names[c]??'').includes(query));
  const target=g??watch.groups[0];const inTarget=(c:string)=>target.codes.includes(c);
  const toggle=(c:string)=>setWatch(inTarget(c)?removeCode(watch,target.id,c):addCodes(watch,target.id,[c]).watch);
  const pick=(b:string)=>setBroker(broker===b?null:b);
  return <div className="work-grid bd-grid">
    <aside className="panel watchlist"><div className="panel-title"><h2><Layers3 size={16}/>自選股</h2><span className="tag">{watch.groups.length} 個群組</span></div>
      <div className="bd-groups" role="tablist" aria-label="自選股群組"><button role="tab" aria-selected={group==='all'} className={group==='all'?'active':''} onClick={()=>setGroup('all')}>全部 <small>{ds.stocks.length}</small></button>
        {watch.groups.map(x=><button key={x.id} role="tab" aria-selected={group===x.id} className={group===x.id?'active':''} onClick={()=>setGroup(x.id)}>{x.name} <small>{x.codes.length}</small></button>)}<button className="bd-edit" onClick={onEdit}>✎ 編輯</button></div>
      <label className="bd-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value.trim())} placeholder="代號或名稱" aria-label="搜尋個股"/></label>
      <div className="stock-list bd-stock-list">{list.map(c=>{const ds0=ds.days[c];if(!ds0)return <div key={c} className="bd-watch-row"><span className="stock-item bd-nodata"><span><b>{c}</b><small>此資料集沒有這檔</small></span></span><button className="bd-plus on" onClick={()=>toggle(c)} aria-label={`從 ${target.name} 移除 ${c}`} title={`從「${target.name}」移除`}>−</button></div>;
        const d=ds0.at(-1)!,p=ds0.at(-2);const ch=p?d.mark/p.mark-1:null;const on=inTarget(c);return <div key={c} className="bd-watch-row"><button className={`stock-item ${c===code?'selected':''}`} onClick={()=>setCode(c)} aria-pressed={c===code}>
        <span><b>{ds.names[c]||c}</b><small>{c}<em className={`bd-main ${tone(d.mainNet)}`}>主力 {fl(d.mainNet,true)}</em></small></span>
        <span className={tone(ch)}><b>{px(d.mark)}</b><small>{pct(ch,2)}</small></span></button>
        <button className={`bd-plus ${on?'on':''}`} onClick={()=>toggle(c)} aria-label={`${on?'從':'加入'} ${target.name} ${on?'移除':''} ${c}`} title={on?`已在「${target.name}」，點擊移除`:`加入「${target.name}」`}>{on?'★':'+'}</button></div>;})}
        {!list.length&&<p className="live-helper">{g?'這個群組還沒有股票，點「編輯」或在「全部」按 + 加入。':'沒有符合的個股。'}</p>}</div>
      <div className="legend"><span className="up">■ 買超</span><span className="down">■ 賣超</span><span className="muted">單位：張</span></div></aside>

    <section className="center-column">
      <div className="quote-header panel"><div><div className="stock-title"><h2>{ds.names[code]||code}</h2><span>{code}</span><span className="tag">{md(day.date)} {hasClose?'收盤':'分點均價'}</span></div>
        <div className={`main-price ${tone(change)}`}>{px(day.mark)} <span>{change==null?'':`${change>=0?'▲':'▼'} ${px(Math.abs(change))} (${pct(change/prev!.mark,2)})`}</span></div></div>
        <div className="quote-metrics"><div><span>成交量</span><b>{fl(day.volume)} <small>張</small></b></div><div><span>主力買賣超</span><b className={tone(day.mainNet)}>{fl(day.mainNet,true)} <small>張</small></b></div><div><span>買賣家數差</span><b className={tone(-day.diff)}>{day.diff>0?'+':''}{day.diff} <small>家</small></b></div><div><span>20 日集中度</span><b className={tone(conc(20))}>{pct(conc(20))}</b></div></div></div>

      <div className="panel chart-panel"><div className="panel-title"><h2>分點K線 <span className="muted small">/ 日線・主力・家數差・集中度</span></h2>
        <div className="bd-row">{broker&&<span className="bd-chip">疊加：{ds.brokers.get(broker)?.name??broker}<button aria-label="取消疊加分點" onClick={()=>setBroker(null)}><X size={12}/></button></span>}
          <div className="bd-seg" aria-label="統計區間">{[1,5,10,20,60].map(n=><button key={n} className={range===n?'active':''} onClick={()=>setRange(n)}>{n===1?'當日':`${n}日`}</button>)}</div></div></div>
        <BranchChart days={days} idx={idx} range={range} broker={broker} onPick={i=>setDate(days[i].date)} name={broker?ds.brokers.get(broker)?.name??broker:''}/>
        <div className="chart-bottom"><span><i className="dot amber"/>點選 K 棒切換統計日</span><span>區間 {md(rs.from)} – {md(rs.to)}（{rdays.length} 日）</span><span className="bd-row"><button className="text-button" disabled={idx<=0} onClick={()=>setDate(days[idx-1].date)}>◀ 前一日</button><button className="text-button" disabled={idx>=days.length-1} onClick={()=>setDate(days[idx+1].date)}>後一日 ▶</button></span></div></div>

      <div className="bottom-grid">
        <TopTable title="買超 TOP15" side="buy" flows={rs.topBuy} volume={rs.volume} ds={ds} profiles={profiles} selected={broker} onPick={pick} hq={hq[code]??null} geo={geo}/>
        <TopTable title="賣超 TOP15" side="sell" flows={rs.topSell} volume={rs.volume} ds={ds} profiles={profiles} selected={broker} onPick={pick} hq={hq[code]??null} geo={geo}/>
      </div>
      <BrokerMapPanel ds={ds} geo={geo} code={code} flows={rs.flows} volume={rs.volume} hq={hq[code]??null} label={range===1?'當日':`近 ${range} 日`} selected={broker} onPick={pick}/>
      {broker&&<BrokerDetail ds={ds} code={code} days={days} idx={idx} broker={broker} profile={profiles.get(broker)} onClose={()=>setBroker(null)}/>}
    </section>

    <aside className="right-column">
      <div className="panel"><div className="panel-title"><h2>籌碼指標</h2><span className="tag">{range===1?'當日':`近 ${range} 日`}</span></div>
        <div className="live-details bd-metrics">
          <p><span>區間主力買賣超</span><b className={tone(rs.mainNet)}>{fl(rs.mainNet,true)} 張</b></p>
          <p><span>區間籌碼集中度</span><b className={tone(rs.concentration)}>{pct(rs.concentration,2)}</b></p>
          <p><span>集中度 5/20/60日</span><b>{pct(conc(5))} / {pct(conc(20))} / {pct(conc(60))}</b></p>
          <p><span>主力連續{streak>=0?'買':'賣'}超</span><b className={tone(streak)}>{Math.abs(streak)} 日</b></p>
          <p><span>買超前 15 買進均價</span><b>{px(rs.mainCost)} <small className={tone(rs.mainCost?day.mark-rs.mainCost:0)}>{rs.mainCost?pct(day.mark/rs.mainCost-1):''}</small></b></p>
          <p><span>賣超前 15 賣出均價</span><b>{px(rs.mainSellCost)}</b></p>
          <p><span>買 / 賣券商家數</span><b>{day.buyers} / {day.sellers}</b></p>
          <span className="muted">集中度 =（區間買超前 15 名買超合計 − 賣超前 15 名賣超合計）÷ 區間成交量。家數差為負，代表多數分點賣給少數分點。</span>
        </div></div>

      <div className="panel"><div className="panel-title"><h2>主力價位分布</h2><span className="tag">前 15 名</span></div><PriceLevels levels={levels} mark={day.mark}/></div>

      <div className="panel signal-panel"><div className="panel-title"><h2><Radio size={16}/>隔日沖賣壓</h2><span className="tag">{md(day.date)} → 次日</span></div>
        <div className={`signal-card ${flip.share>=0.03?'detected':''}`}><div className="signal-caption"><span>隔日沖型分點今日買超</span><span>{pct(flip.share)} 佔量</span></div>
          <h3>{fl(flip.total)} 張</h3><div className="signal-caption"><span>今日隔日沖型分點賣超（前日買進出貨）</span><span>{fl(flipOut)} 張</span></div><p>{flip.list.length?'這些分點過去常在隔日賣出。次日開盤後的賣壓，可與「連次量・力竭」的買盤力竭條件一起觀察。':'今日買超前 15 名中，沒有被判為隔日沖型的分點。'}</p>
          {flip.list.length>0&&<div className="bd-mini-list">{flip.list.slice(0,4).map(f=><button key={f.broker} onClick={()=>pick(f.broker)}><span>{ds.brokers.get(f.broker)?.name??f.broker}</span><b className="up">{fl(f.net,true)}</b></button>)}</div>}</div>
        <p className="caution"><TriangleAlert size={14}/>手法以近 60 日行為推定，不保證次日必賣</p></div>

      <div className="panel"><div className="panel-title"><h2>單日大量分點</h2><span className="tag">≥ 當日量 2%</span></div>
        {heavy.length?<div className="bd-mini-list bd-pad">{heavy.map(f=><button key={f.broker} onClick={()=>pick(f.broker)}><span>{ds.brokers.get(f.broker)?.name??f.broker} <BrokerTags b={ds.brokers.get(f.broker)} p={profiles.get(f.broker)}/></span><b className={tone(f.net)}>{fl(f.buy)} / {fl(f.sell)}</b></button>)}</div>:<p className="live-helper">當日沒有單一分點買或賣超過成交量 2%。</p>}
        <p className="live-helper">左為買進、右為賣出（張）。買賣日報表是分點彙總，不是逐筆大單。</p></div>
    </aside>
  </div>;
}

function TopTable({title,side,flows,volume,ds,profiles,selected,onPick,hq,geo}:{title:string;side:'buy'|'sell';flows:Flow[];volume:number;ds:Dataset;profiles:Map<string,BrokerProfile>;selected:string|null;onPick:(b:string)=>void;hq?:County|null;geo?:Record<string,County>}){
  return <div className="panel"><div className="panel-title"><h2 className={side==='buy'?'up':'down'}>{title}</h2><span className="muted small">點選分點看明細</span></div>
    <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>#</th><th>券商分點</th><th>買進</th><th>賣出</th><th>{side==='buy'?'買超':'賣超'}</th><th>均價</th><th>佔量</th></tr></thead>
      <tbody>{flows.map((f,i)=>{const b=ds.brokers.get(f.broker);const avg=side==='buy'?(f.buy?f.buyAmt/f.buy:null):(f.sell?f.sellAmt/f.sell:null);
        return <tr key={f.broker} className={selected===f.broker?'selected':''} onClick={()=>onPick(f.broker)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onPick(f.broker);}}>
          <td className="muted">{i+1}</td><td className="bd-name">{b?.name??f.broker}<BrokerTags b={b} p={profiles.get(f.broker)}/>{hq&&brokerCounty(b,geo)===hq&&<i className="bd-badge local" title={`分點與公司總部同在${hq}`}>地緣</i>}</td><td>{fl(f.buy)}</td><td>{fl(f.sell)}</td>
          <td className={side==='buy'?'up':'down'}>{fl(Math.abs(f.net))}</td><td>{px(avg)}</td><td className="muted">{volume?(Math.abs(f.net)/volume*100).toFixed(1):'—'}%</td></tr>;})}
        {!flows.length&&<tr><td colSpan={7} className="muted">無資料</td></tr>}</tbody></table></div></div>;
}

function PriceLevels({levels,mark}:{levels:{price:number;mainBuy:number;mainSell:number;all:number}[];mark:number}){
  if(!levels.length)return <p className="live-helper">無價位資料</p>;
  // 價位過多時合併為最多 16 格
  const hi=levels[0].price,lo=levels.at(-1)!.price,bins=Math.min(16,levels.length);const step=(hi-lo)/bins||1;
  const rows=levels.length<=16?levels.map(l=>({label:px(l.price),top:l.price,bottom:l.price,...l})):Array.from({length:bins},(_,i)=>{const top=hi-i*step,bottom=i===bins-1?lo:top-step;const inBin=levels.filter(l=>l.price<=top+1e-9&&(i===bins-1?l.price>=bottom-1e-9:l.price>bottom+1e-9));return {label:`${px(bottom)}–${px(top)}`,top,bottom,price:top,mainBuy:inBin.reduce((s,l)=>s+l.mainBuy,0),mainSell:inBin.reduce((s,l)=>s+l.mainSell,0),all:inBin.reduce((s,l)=>s+l.all,0)};});
  const max=Math.max(1,...rows.map(r=>Math.max(r.mainBuy,r.mainSell)));
  return <div className="bd-levels">{rows.map(r=><div key={r.label} className={mark<=r.top+1e-9&&mark>=r.bottom-1e-9?'current':''} title={`主力買 ${fl(r.mainBuy)} 張 / 主力賣 ${fl(r.mainSell)} 張 / 全部成交 ${fl(r.all)} 張`}>
    <span className="bd-lv-buy"><i style={{width:`${r.mainBuy/max*100}%`}}/></span><b>{r.label}</b><span className="bd-lv-sell"><i style={{width:`${r.mainSell/max*100}%`}}/></span></div>)}
    <p className="bd-lv-legend"><span className="up">◀ 買超前 15 買進</span><span className="down">賣超前 15 賣出 ▶</span></p></div>;
}

// ---------- 分點K線圖 ----------
function BranchChart({days,idx,range,broker,onPick,name}:{days:DayStat[];idx:number;range:number;broker:string|null;onPick:(i:number)=>void;name:string}){
  const [hover,setHover]=useState<number|null>(null);
  const c5=useMemo(()=>concentrationSeries(days,5),[days]),c20=useMemo(()=>concentrationSeries(days,20),[days]);
  const off=Math.max(0,days.length-90),shown=days.slice(off);
  const W=860,L=8,n=shown.length,w=W/n;const x=(i:number)=>L+i*w+w/2;
  const bNet=broker?shown.map(d=>d.byBroker.get(broker)?.net??0):[];
  const panes:{key:string;h:number;label:string}[]=[{key:'price',h:230,label:''},{key:'main',h:62,label:'主力買賣超'},{key:'diff',h:50,label:'買賣家數差'},{key:'conc',h:58,label:'集中度 5日/20日'},...(broker?[{key:'broker',h:62,label:`分點：${name}`}]:[])];
  let top=6;const Y:Record<string,number>={};for(const p of panes){Y[p.key]=top;top+=p.h+14;}const H=top+14;
  const hiP=Math.max(...shown.map(d=>d.high)),loP=Math.min(...shown.map(d=>d.low)),pad=(hiP-loP)*.08||1;
  const py=(v:number)=>Y.price+8+(hiP+pad-v)/(hiP-loP+2*pad)*(230-16);
  const ma=(k:number)=>shown.map((_,i)=>{const s=days.slice(Math.max(0,off+i-k+1),off+i+1);return s.length<k?null:s.reduce((a,d)=>a+d.mark,0)/k;});
  const line=(vals:(number|null)[],y:(v:number)=>number)=>vals.map((v,i)=>v==null?'':`${vals[i-1]==null?'M':'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const bar=(vals:number[],key:string,h:number)=>{const m=Math.max(1,...vals.map(Math.abs)),mid=Y[key]+h/2;return {mid,els:vals.map((v,i)=><rect key={i} x={x(i)-w*.32} width={Math.max(1.5,w*.64)} y={v>=0?mid-v/m*(h/2):mid} height={Math.abs(v)/m*(h/2)} fill={v>=0?'var(--up)':'var(--down)'} opacity={off+i>idx?.35:.85}/>)};};
  const mainB=bar(shown.map(d=>d.mainNet),'main',62),diffB=bar(shown.map(d=>d.diff),'diff',50);
  const cv=[...c5.slice(off),...c20.slice(off)].filter((v):v is number=>v!=null);const cm=Math.max(.01,...cv.map(Math.abs));
  const cy=(v:number)=>Y.conc+29-v/cm*27;
  const selA=Math.max(0,idx-range+1)-off,selB=idx-off;
  const hv=hover??(idx-off);const hd=shown[Math.max(0,Math.min(n-1,hv))];const hPrev=days[off+hv-1];
  let cum=0;const cumPos=bNet.map(v=>(cum+=v));const bm=Math.max(1,...bNet.map(Math.abs));const cmx=Math.max(1,...cumPos.map(Math.abs));
  return <div className="chart-wrap"><div className="ohlc"><span>{hd.date}</span>{hd.open!=null&&<span>開 <b>{px(hd.open)}</b></span>}<span>高 <b>{px(hd.high)}</b></span><span>低 <b>{px(hd.low)}</b></span><span>{hd.close!=null?'收':'均'} <b className={tone(hPrev?hd.mark-hPrev.mark:0)}>{px(hd.mark)}</b></span><span>量 <b>{fl(hd.volume)}</b></span><span>主力 <b className={tone(hd.mainNet)}>{fl(hd.mainNet,true)}</b></span><span>家數差 <b>{hd.diff}</b></span>{broker&&<span>分點 <b className={tone(hd.byBroker.get(broker)?.net??0)}>{fl(hd.byBroker.get(broker)?.net??0,true)}</b></span>}</div>
    <svg viewBox={`0 0 ${W+70} ${H}`} role="img" aria-label="分點K線：日K、主力買賣超、買賣家數差、籌碼集中度" onMouseLeave={()=>setHover(null)}>
      {selB>=0&&<rect x={x(Math.max(0,selA))-w/2} y={2} width={(selB-Math.max(0,selA)+1)*w} height={H-18} fill="#7bd6e5" opacity=".06"/>}
      {panes.map(p=><g key={p.key}>{p.label&&<text x={L+4} y={Y[p.key]+11} fill="#7d8fa1" fontSize="11">{p.label}</text>}<line x1={L} x2={W+L} y1={Y[p.key]+p.h+6} y2={Y[p.key]+p.h+6} stroke="#223040"/></g>)}
      {[0,1,2,3].map(i=>{const v=hiP+pad-i*(hiP-loP+2*pad)/3;return <g key={i}><line x1={L} x2={W+L} y1={py(v)} y2={py(v)} stroke="#1f2b37" strokeDasharray="3 5"/><text x={W+L+6} y={py(v)+4} fill="#758698" fontSize="11">{px(v)}</text></g>;})}
      {shown.map((d,i)=>{const p=days[off+i-1];const upD=d.open!=null?d.close!>=d.open:p?d.mark>=p.mark:true;const col=upD?'var(--up)':'var(--down)';const fade=off+i>idx?.35:1;
        return <g key={d.date} opacity={fade}><line x1={x(i)} x2={x(i)} y1={py(d.high)} y2={py(d.low)} stroke={col}/>
          {d.open!=null&&d.close!=null?<rect x={x(i)-w*.33} width={Math.max(1.5,w*.66)} y={Math.min(py(d.open),py(d.close))} height={Math.max(1,Math.abs(py(d.open)-py(d.close)))} fill={col}/>:<line x1={x(i)-w*.33} x2={x(i)+w*.33} y1={py(d.mark)} y2={py(d.mark)} stroke={col} strokeWidth="2"/>}</g>;})}
      <path d={line(ma(5),py)} fill="none" stroke="#e7b86c" strokeWidth="1.1" opacity=".8"/><path d={line(ma(20),py)} fill="none" stroke="#9d8cf0" strokeWidth="1.1" opacity=".8"/>
      <text x={W-110} y={Y.price+14} fill="#e7b86c" fontSize="11">MA5</text><text x={W-72} y={Y.price+14} fill="#9d8cf0" fontSize="11">MA20</text>
      {broker&&bNet.map((v,i)=>v===0?null:<circle key={i} cx={x(i)} cy={v>0?py(shown[i].low)+9:py(shown[i].high)-9} r={2+Math.sqrt(Math.abs(v)/bm)*6} fill={v>0?'var(--up)':'var(--down)'} opacity=".75" stroke="#0c1118" strokeWidth=".8"><title>{shown[i].date} {name} {fl(v,true)} 張</title></circle>)}
      <line x1={L} x2={W+L} y1={mainB.mid} y2={mainB.mid} stroke="#2a3846"/>{mainB.els}
      <line x1={L} x2={W+L} y1={diffB.mid} y2={diffB.mid} stroke="#2a3846"/>{diffB.els}
      <line x1={L} x2={W+L} y1={cy(0)} y2={cy(0)} stroke="#2a3846"/><path d={line(c5.slice(off),cy)} fill="none" stroke="#e7b86c" strokeWidth="1.3"/><path d={line(c20.slice(off),cy)} fill="none" stroke="#7bd6e5" strokeWidth="1.5"/>
      <text x={W+L+6} y={cy(cm)+8} fill="#758698" fontSize="11">{pct(cm,0)}</text><text x={W+L+6} y={cy(-cm)} fill="#758698" fontSize="11">{pct(-cm,0)}</text>
      {broker&&(()=>{const bB=bar(bNet,'broker',62);return <g>{bB.els}<path d={line(cumPos,v=>bB.mid-v/cmx*29)} fill="none" stroke="#e7b86c" strokeWidth="1.4"/><text x={W+L+6} y={bB.mid+4} fill="#e7b86c" fontSize="11">累積</text></g>;})()}
      {[...new Set([0,.25,.5,.75,1].map(p=>Math.round(p*(n-1))))].map(i=><text key={i} x={x(i)} y={H-3} fill="#758698" fontSize="11" textAnchor={n>4&&i===0?'start':n>4&&i===n-1?'end':'middle'}>{md(shown[i].date)}</text>)}
      <line x1={x(hv)} x2={x(hv)} y1={4} y2={H-16} stroke="#9facbd" strokeDasharray="3 4" opacity=".6"/>
      {shown.map((d,i)=><rect key={d.date} x={x(i)-w/2} y={0} width={w} height={H-14} fill="transparent" style={{cursor:'pointer'}} onMouseEnter={()=>setHover(i)} onClick={()=>onPick(off+i)}/>)}
    </svg></div>;
}

function BrokerDetail({ds,code,days,idx,broker,profile,onClose}:{ds:Dataset;code:string;days:DayStat[];idx:number;broker:string;profile?:BrokerProfile;onClose:()=>void}){
  const [win,setWin]=useState(60);
  const b=ds.brokers.get(broker);
  const slice=days.slice(Math.max(0,idx-win+1),idx+1);
  const rows=ledger(slice,broker);const last=rows.at(-1)!;const active=rows.filter(r=>r.buy||r.sell);
  const tb=rows.reduce((s,r)=>s+r.buy,0),ts=rows.reduce((s,r)=>s+r.sell,0);
  const ab=active.reduce((s,r)=>s+(r.avgBuy??0)*r.buy,0)/(tb||1),as=active.reduce((s,r)=>s+(r.avgSell??0)*r.sell,0)/(ts||1);
  const today=days[idx].fills.filter(f=>f.broker===broker).sort((a,c)=>c.price-a.price);
  const f=profile?.flip;
  return <div className="panel bd-detail"><div className="panel-title"><h2><Users size={16}/>分點明細：{b?.name??broker} <span className="muted small">{broker}</span><BrokerTags b={b} p={profile}/></h2>
    <div className="bd-row"><div className="bd-seg">{[20,60,120].map(n=><button key={n} className={win===n?'active':''} onClick={()=>setWin(n)}>{n}日</button>)}</div><button className="icon-button" aria-label="關閉分點明細" onClick={onClose}><X size={16}/></button></div></div>
    <div className="bd-stats">
      <div><span>區間買進 / 賣出</span><b>{fl(tb)} / {fl(ts)}</b><small>張</small></div>
      <div><span>區間買賣超</span><b className={tone(tb-ts)}>{fl(tb-ts,true)}</b><small>張</small></div>
      <div><span>均買 / 均賣</span><b>{tb?px(ab):'—'} / {ts?px(as):'—'}</b></div>
      <div><span>估計庫存・成本</span><b className={tone(last.position)}>{fl(last.position,true)}</b><small>{last.cost?`@ ${px(last.cost)}`:'張'}</small></div>
      <div><span>已實現 / 未實現</span><b><em className={tone(last.realized)}>{amt(last.realized)}</em> / <em className={tone(last.unrealized)}>{amt(last.unrealized)}</em></b></div>
      <div><span>隔日沖命中</span><b>{f&&f.events?`${f.hits}/${f.events}`:'—'}</b><small>{f&&f.events?pct(f.hits/f.events,0).replace('+',''):''}</small></div>
    </div>
    <div className="bd-detail-grid"><div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>日期</th><th>買進</th><th>賣出</th><th>買賣超</th><th>均買</th><th>均賣</th><th>庫存</th><th>收／均</th></tr></thead>
      <tbody>{active.slice(-15).reverse().map(r=><tr key={r.date}><td className="mono muted">{md(r.date)}</td><td>{fl(r.buy)}</td><td>{fl(r.sell)}</td><td className={tone(r.net)}>{fl(r.net,true)}</td><td>{px(r.avgBuy)}</td><td>{px(r.avgSell)}</td><td className={tone(r.position)}>{fl(r.position,true)}</td><td>{px(r.mark)}</td></tr>)}
        {!active.length&&<tr><td colSpan={8} className="muted">此區間沒有交易</td></tr>}</tbody></table></div>
      <div><h3 className="bd-sub">{md(days[idx].date)} 價位明細 · {ds.names[code]||code}</h3>{today.length?<table className="bd-table"><thead><tr><th>價格</th><th>買進</th><th>賣出</th></tr></thead><tbody>{today.map((x,i)=><tr key={i}><td>{px(x.price)}</td><td className={x.buy?'up':'muted'}>{fl(x.buy)}</td><td className={x.sell?'down':'muted'}>{fl(x.sell)}</td></tr>)}</tbody></table>:<p className="live-helper">當日無成交</p>}</div></div>
    <p className="live-helper">平均成本法：同日買賣先互抵，剩餘淨額進出庫存；以區間起點零庫存估算，不代表該分點實際持股，也不能辨識背後是哪一位投資人。</p></div>;
}

// ================= 主力地圖 =================
function BrokerMapPanel({ds,geo,code,flows,volume,hq,label,selected,onPick}:{ds:Dataset;geo:Record<string,County>;code:string;flows:Flow[];volume:number;hq:County|null;label:string;selected:string|null;onPick:(b:string)=>void}){
  const m=useMemo(()=>brokerMap(ds,flows,hq,geo),[ds,flows,hq,geo]);
  const by=new Map(m.counties.map(c=>[c.county,c]));const max=Math.max(1,...m.counties.map(c=>Math.abs(c.net)));
  const CW=66,CH=36,G=4,W=4*(CW+G),H=11*(CH+G);
  return <div className="panel"><div className="panel-title"><h2><Globe size={16}/>主力地圖 <span className="muted small">/ 分點所在縣市・{label}</span></h2><span className="tag">{hq?`公司總部 ${hq}`:'總部縣市不明'}</span></div>
    <div className="bd-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ds.names[code]??code} 各縣市分點買賣超`} className="bd-map-svg">
        {(Object.entries(TILE) as [County,[number,number]][]).map(([c,[x,y]])=>{const f=by.get(c);const a=f?0.18+0.72*Math.abs(f.net)/max:0;const isHq=c===hq;
          return <g key={c} transform={`translate(${x*(CW+G)},${y*(CH+G)})`}><title>{`${c}${isHq?'（公司總部）':''}：${f?`淨 ${fl(f.net,true)} 張・${f.brokers} 個分點`:'無進出'}`}</title>
            <rect width={CW} height={CH} rx="4" fill={f?(f.net>=0?`rgba(243,109,122,${a})`:`rgba(50,203,165,${a})`):'#141d27'} stroke={isHq?'#f1c57e':'#26313e'} strokeWidth={isHq?2:1}/>
            <text x={CW/2} y={14} textAnchor="middle" fontSize="11" fill={f?'#f1f5f9':'#6f8193'}>{isHq?'★':''}{c.replace(/[市縣]$/,'')}</text>
            {f&&<text x={CW/2} y={28} textAnchor="middle" fontSize="10" fill="#e3ebf3">{fl(f.net,true)}</text>}</g>;})}
      </svg>
      <div className="bd-map-side">
        <div className="bd-stats two"><div><span>地緣券商淨買賣</span><b className={tone(m.localNet)}>{hq?`${fl(m.localNet,true)} 張`:'—'}</b></div><div><span>地緣佔成交量</span><b>{hq&&volume?pct(m.local.reduce((s,f)=>s+Math.abs(f.net),0)/volume):'—'}</b></div></div>
        <h3 className="bd-sub">地緣券商（與總部同縣市）</h3>
        <div className="bd-mini-list bd-pad">{m.local.slice(0,8).map(f=><button key={f.broker} className={selected===f.broker?'active':''} onClick={()=>onPick(f.broker)}><span>{ds.brokers.get(f.broker)?.name??f.broker}</span><b className={tone(f.net)}>{fl(f.net,true)} 張</b></button>)}
          {!m.local.length&&<p className="live-helper">{hq?'區間內沒有同縣市分點進出。':'沒有這檔公司的總部資料。'}</p>}</div>
        <h3 className="bd-sub">縣市淨買賣排行</h3>
        <div className="bd-mini-list bd-pad">{m.counties.slice(0,6).map(c=><div key={c.county} className="bd-map-row"><span>{c.county===hq?'★ ':''}{c.county} <small className="muted">{c.brokers} 家</small></span><b className={tone(c.net)}>{fl(c.net,true)} 張</b></div>)}</div>
      </div></div>
    <p className="live-helper">分點縣市以證交所券商分公司名錄的地址為準，名錄沒有的分點再由名稱中的據點名判斷（例：「元大土城永寧」＝新北市）；外資與判斷不出據點的分點不上圖（{fl(m.unknown)} 張）。公司總部縣市取自證交所、櫃買公司基本資料地址。地緣券商常是公司派、員工或在地大戶，連續買超值得留意，但不等於內線。</p></div>;
}

// ================= 編輯自選股 =================
function WatchEditor({ds,watch,setWatch,initial,onClose}:{ds:Dataset;watch:Watch;setWatch:(w:Watch)=>void;initial:string;onClose:()=>void}){
  const cats=useMemo(()=>categories(ds),[ds]);
  const [cat,setCat]=useState('all'),[gid,setGid]=useState(initial),[input,setInput]=useState(''),[name,setName]=useState(''),[msg,setMsg]=useState('');
  const g=watch.groups.find(x=>x.id===gid)??watch.groups[0];
  const src=cat.startsWith('g:')?watch.groups.find(x=>`g:${x.id}`===cat)?.codes??[]:cats.find(c=>c.key===cat)?.codes??[];
  const nm=(c:string)=>ds.names[c]??'';
  const add=(codes:string[])=>{if(!codes.length){setMsg('沒有可加入的代號');return;}const r=addCodes(watch,g.id,codes);setWatch(r.watch);setMsg(`加入「${g.name}」${r.added} 檔${codes.length-r.added?`，${codes.length-r.added} 檔已存在`:''}${codes.some(c=>!ds.days[c])?'；部分代號目前資料集沒有資料':''}`);};
  const paste=async()=>{try{add(parseCodes(await navigator.clipboard.readText()));}catch{setMsg('瀏覽器不允許讀取剪貼簿：請點輸入框後按 Ctrl+V');}};
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[onClose]);
  return <div className="bd-modal-bg" onClick={onClose}><div className="bd-modal panel" role="dialog" aria-modal="true" aria-label="編輯自選股" onClick={e=>e.stopPropagation()}>
    <div className="panel-title"><h2><Layers3 size={16}/>編輯自選股</h2><button className="text-button" onClick={onClose} aria-label="關閉"><X size={16}/>完成</button></div>
    <div className="bd-modal-body">
      <nav className="bd-modal-cats" aria-label="分類"><h3 className="bd-sub">分類</h3>{cats.map(c=><button key={c.key} className={cat===c.key?'active':''} onClick={()=>setCat(c.key)}>{c.label}<small>{c.codes.length}</small></button>)}
        <h3 className="bd-sub">我的群組</h3>{watch.groups.filter(x=>x.id!==g.id).map(x=><button key={x.id} className={cat===`g:${x.id}`?'active':''} onClick={()=>setCat(`g:${x.id}`)}>{x.name}<small>{x.codes.length}</small></button>)}</nav>
      <div className="bd-modal-src"><div className="bd-row bd-modal-head"><b>{cat.startsWith('g:')?watch.groups.find(x=>`g:${x.id}`===cat)?.name:cats.find(c=>c.key===cat)?.label}</b><button className="button" disabled={!src.length} onClick={()=>add(src)}>全部加入（{src.length}）</button></div>
        <div className="bd-modal-list">{src.map(c=>{const has=g.codes.includes(c);return <div key={c} className="bd-modal-item"><span><b>{c}</b> {nm(c)}</span><button className={`bd-plus ${has?'on':''}`} disabled={has} onClick={()=>add([c])} aria-label={`加入 ${c}`}>{has?'✓':'+'}</button></div>;})}
          {!src.length&&<p className="live-helper">這個分類目前沒有股票。</p>}</div></div>
      <div className="bd-modal-target">
        <div className="bd-groups">{watch.groups.map(x=><button key={x.id} className={x.id===g.id?'active':''} onClick={()=>setGid(x.id)}>{x.name} <small>{x.codes.length}</small></button>)}</div>
        <div className="bd-row"><input value={name} onChange={e=>setName(e.target.value)} placeholder="群組名稱" aria-label="群組名稱" maxLength={20}/>
          <button className="button" onClick={()=>{const r=addGroup(watch,name);setWatch(r.watch);setGid(r.id);setName('');}}>新增群組</button>
          <button className="button" disabled={!name.trim()} onClick={()=>{setWatch(renameGroup(watch,g.id,name));setName('');}}>重新命名</button>
          <button className="text-button" disabled={watch.groups.length<=1} onClick={()=>{if(confirm(`刪除群組「${g.name}」？`)){const w=deleteGroup(watch,g.id);setWatch(w);setGid(w.groups[0].id);}}}>刪除群組</button></div>
        <div className="bd-row"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){add(parseCodes(input));setInput('');}}}
          onPaste={e=>{const c=parseCodes(e.clipboardData.getData('text'));if(c.length>1){e.preventDefault();add(c);}}} placeholder="輸入代號，可一次貼上多檔（空白、逗號、換行分隔）" aria-label="輸入股票代號"/>
          <button className="button primary" onClick={()=>{add(parseCodes(input));setInput('');}}>加入</button><button className="button" onClick={paste}>從剪貼簿貼上</button></div>
        {msg&&<p className="tiny">{msg}</p>}
        <div className="bd-modal-list">{g.codes.map((c,i)=><div key={c} className="bd-modal-item"><span><small className="muted">{i+1}</small> <b>{c}</b> {nm(c)}{!ds.days[c]&&<small className="muted">（無資料）</small>}</span>
          <span className="bd-row"><button className="text-button" disabled={!i} onClick={()=>setWatch(moveCode(watch,g.id,c,-1))} aria-label={`上移 ${c}`}>↑</button><button className="text-button" disabled={i===g.codes.length-1} onClick={()=>setWatch(moveCode(watch,g.id,c,1))} aria-label={`下移 ${c}`}>↓</button><button className="text-button" onClick={()=>setWatch(removeCode(watch,g.id,c))} aria-label={`移除 ${c}`}><X size={13}/></button></span></div>)}
          {!g.codes.length&&<p className="live-helper">群組是空的：從左側分類加入，或輸入／貼上代號。</p>}</div>
      </div></div>
    <p className="live-helper">自選股只存在這個瀏覽器（localStorage）。Esc 或點背景關閉。</p></div></div>;
}

// ================= 分點調查局 =================
type Rank='pnl'|'flip'|'swing'|'win'|'active'|'loser';
function DeskView({ds,onOpen}:{ds:Dataset;onOpen:(code:string,broker:string)=>void}){
  const [win,setWin]=useState(60),[kind,setKind]=useState<'all'|Broker['kind']>('all'),[rank,setRank]=useState<Rank>('pnl'),[sel,setSel]=useState<string|null>(null);
  const profiles=useMemo(()=>profileBrokers(ds,win),[ds,win]);
  const pmap=useMemo(()=>new Map(profiles.map(p=>[p.broker.id,p])),[profiles]);
  const alerts=useMemo(()=>{const seen=new Set<string>();return ds.dates.slice(-10).reverse().flatMap(d=>anomalies(ds,d)).filter(a=>{const k=a.code+a.broker;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,8);},[ds]);
  let list=profiles.filter(p=>kind==='all'||p.broker.kind===kind);
  if(rank==='flip')list=list.filter(p=>p.style==='flip');
  if(rank==='swing')list=list.filter(p=>p.style==='swing');
  if(rank==='win')list=list.filter(p=>p.stocks>=4).sort((a,b)=>(b.winRate??0)-(a.winRate??0)||b.pnl-a.pnl);
  if(rank==='active')list=[...list].sort((a,b)=>b.activeDays-a.activeDays);
  if(rank==='loser')list=[...list].sort((a,b)=>a.pnl-b.pnl);
  list=list.slice(0,30);
  const cur=pmap.get(sel??'')??list[0];
  const hot=useMemo(()=>hotCombos(ds,ds.dates.at(-1)!),[ds]);
  const ranks:[Rank,string][]=[['pnl','贏家券商'],['loser','輸家券商'],['flip','隔日沖報酬王'],['swing','波段報酬王'],['win','常勝軍'],['active','交易狂']];
  return <div className="bd-desk">
    <div className="panel bd-alerts"><div className="panel-title"><h2><Radio size={16}/>異常進駐分點 <span className="muted small">近 10 個交易日</span></h2><span className="tag">對應「神秘券商」概念</span></div>
      {alerts.length?<div className="bd-alert-row">{alerts.map(a=><button key={a.code+a.broker+a.date} className="bd-alert" onClick={()=>onOpen(a.code,a.broker)}>
        <span className="muted small">{md(a.date)} · {a.code} {ds.names[a.code]??''}</span><b>{ds.brokers.get(a.broker)?.name??a.broker}</b>
        <span><em className="up">買超 {fl(a.net)} 張</em> · 佔量 {(a.share*100).toFixed(1)}%</span><small>{a.multiple?`過去 20 日均量 ${a.multiple.toFixed(1)} 倍`:'過去 20 日未交易'}・{a.priorActive} 天有交易</small></button>)}</div>
      :<p className="live-helper">近 10 日沒有符合條件的異常進駐。</p>}
      <p className="live-helper">條件：當日買超前 5 名、買超 ≥ 當日量 1%、過去 20 日有交易 ≤ 5 天，且買超 ≥ 過去平均 3 倍。</p></div>
    <div className="panel"><div className="panel-title"><h2><Radio size={16}/>熱門券商組合 <span className="muted small">{md(ds.dates.at(-1)!)}・分點 × 個股</span></h2><span className="tag">依淨買賣金額</span></div>
      <div className="bottom-grid bd-hot">{(['buy','sell'] as const).map(side=><div key={side} className="bd-table-wrap"><table className="bd-table"><thead><tr><th className={side==='buy'?'up':'down'}>{side==='buy'?'買超組合':'賣超組合'}</th><th>券商分點</th><th>{side==='buy'?'買超':'賣超'}</th><th>金額</th><th>佔量</th></tr></thead>
        <tbody>{hot[side].map(h=><tr key={h.code+h.broker} onClick={()=>onOpen(h.code,h.broker)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onOpen(h.code,h.broker);}}><td className="bd-name">{h.code} {ds.names[h.code]??''}</td><td className="bd-name">{ds.brokers.get(h.broker)?.name??h.broker}<BrokerTags b={ds.brokers.get(h.broker)} p={pmap.get(h.broker)}/></td>
          <td className={tone(h.net)}>{fl(Math.abs(h.net))} 張</td><td>{amt(Math.abs(h.amount))}</td><td className={h.share>=0.05?'amber-text':'muted'}>{(h.share*100).toFixed(1)}%</td></tr>)}</tbody></table></div>)}</div>
      <p className="live-helper">當日所有個股的買超／賣超前 15 分點，依「淨張數 × 當日均價」排行，每檔最多 3 組；點選直接開啟該股並疊加分點。對應籌碼K線的「即時熱門券商」，但這裡是盤後資料。</p></div>
    <div className="bd-desk-grid">
      <div className="panel"><div className="panel-title"><h2><Users size={16}/>券商分點排行</h2>
        <div className="bd-row"><div className="bd-seg">{[20,60,120].map(n=><button key={n} className={win===n?'active':''} onClick={()=>setWin(n)}>{n}日</button>)}</div>
          <div className="bd-seg">{(['all','foreign','gov','domestic'] as const).map(k=><button key={k} className={kind===k?'active':''} onClick={()=>setKind(k)}>{k==='all'?'全部':KIND_LABEL[k]}</button>)}</div></div></div>
        <div className="bd-tabs">{ranks.map(([k,l])=><button key={k} className={rank===k?'active':''} onClick={()=>setRank(k)}>{l}</button>)}</div>
        <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>#</th><th>券商分點</th><th>手法</th><th>區間損益估算</th><th>勝率</th><th>檔數</th><th>交易日</th><th>隔日沖命中</th><th>當沖互抵</th></tr></thead>
          <tbody>{list.map((p,i)=><tr key={p.broker.id} className={cur?.broker.id===p.broker.id?'selected':''} onClick={()=>setSel(p.broker.id)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setSel(p.broker.id);}}>
            <td className="muted">{i+1}</td><td className="bd-name">{p.broker.name}<BrokerTags b={p.broker}/></td><td>{p.style==='mixed'?<span className="muted">一般</span>:<i className={`bd-badge ${p.style}`}>{STYLE_LABEL[p.style]}</i>}</td>
            <td className={tone(p.pnl)}>{amt(p.pnl)}</td><td>{p.winRate==null?'—':`${Math.round(p.winRate*100)}%`}</td><td>{p.stocks}</td><td>{p.activeDays}</td>
            <td>{p.flip.events?`${p.flip.hits}/${p.flip.events}`:'—'}</td><td>{p.offset?`${Math.round(p.offset*100)}%`:'—'}</td></tr>)}
            {!list.length&&<tr><td colSpan={9} className="muted">此分類沒有分點</td></tr>}</tbody></table></div>
        <p className="live-helper">損益以區間起點零庫存、平均成本法估算，含未實現（以收盤或均價計）；勝率＝區間進出 ≥ 20 張的個股中損益為正的比例。未扣手續費與稅。</p></div>
      {cur&&<div className="panel bd-profile"><div className="panel-title"><h2>{cur.broker.name} <span className="muted small">{cur.broker.id}</span></h2><span><BrokerTags b={cur.broker} p={cur}/></span></div>
        <div className="bd-stats two">
          <div><span>區間損益估算</span><b className={tone(cur.pnl)}>{amt(cur.pnl)}</b></div><div><span>已實現 / 未實現</span><b><em className={tone(cur.realized)}>{amt(cur.realized)}</em> / <em className={tone(cur.unrealized)}>{amt(cur.unrealized)}</em></b></div>
          <div><span>淨買進金額</span><b className={tone(cur.netAmt)}>{amt(cur.netAmt)}</b></div><div><span>波段持續度</span><b>{Math.round(cur.persistence*100)}%</b></div></div>
        <h3 className="bd-sub">近 5 日買超個股</h3>
        <div className="bd-mini-list bd-pad">{cur.recent.filter(r=>r.net>0).slice(0,6).map(r=><button key={r.code} onClick={()=>onOpen(r.code,cur.broker.id)}><span>{r.code} {ds.names[r.code]??''}</span><b className="up">{fl(r.net,true)} 張 · {amt(r.amount)}</b></button>)}
          {!cur.recent.some(r=>r.net>0)&&<p className="live-helper">近 5 日沒有淨買超。</p>}</div>
        <h3 className="bd-sub">估計庫存（區間內）</h3>
        <div className="bd-mini-list bd-pad">{cur.holdings.slice(0,6).map(h=><button key={h.code} onClick={()=>onOpen(h.code,cur.broker.id)}><span>{h.code} {ds.names[h.code]??''} <small className="muted">@ {px(h.cost)}</small></span><b className={tone(h.position)}>{fl(h.position,true)} 張 · <em className={tone(h.pnl)}>{amt(h.pnl)}</em></b></button>)}
          {!cur.holdings.length&&<p className="live-helper">區間結束時無庫存。</p>}</div>
        <p className="caution"><TriangleAlert size={14}/>分點是券商營業據點，不等於單一主力；歷史損益不代表未來。</p></div>}
    </div></div>;
}

// ================= 籌碼選股 =================
const PRESETS:[string,Partial<ScreenRule>][]=[
  ['主力進駐',{mainStreak:3,conc20:null,diffNeg:0,foreign5:false,flipMax:0.03}],
  ['籌碼集中',{mainStreak:0,conc20:0.02,diffNeg:0,foreign5:false,flipMax:null}],
  ['多數人賣給少數人',{mainStreak:1,conc20:null,diffNeg:2,foreign5:false,flipMax:null}],
  ['外資券商買超',{mainStreak:0,conc20:null,diffNeg:0,foreign5:true,flipMax:null}],
];
function ScreenView({ds,onOpen}:{ds:Dataset;onOpen:(code:string,broker?:string|null)=>void}){
  const [rule,setRule]=useState<ScreenRule>({mainStreak:3,conc20:null,diffNeg:0,foreign5:false,broker:'',flipMax:0.03});
  const [hold,setHold]=useState(5);
  const profiles=useMemo(()=>new Map(profileBrokers(ds,60).map(p=>[p.broker.id,p])),[ds]);
  const rows=useMemo(()=>ds.stocks.map(c=>screenAt(ds,c,ds.days[c].length-1,rule,profiles)).sort((a,b)=>Number(b.pass)-Number(a.pass)||b.mainStreak-a.mainStreak),[ds,rule,profiles]);
  const bt=useMemo(()=>backtest(ds,rule,profiles,hold),[ds,rule,profiles,hold]);
  const set=(p:Partial<ScreenRule>)=>setRule(r=>({...r,...p}));
  const brokers=[...ds.brokers.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
  const numIn=(v:number|null,f:(n:number|null)=>void,scale=1,step=1)=><input type="number" step={step} value={v==null?'':+(v*scale).toFixed(2)} placeholder="不限" onChange={e=>f(e.target.value===''?null:Number(e.target.value)/scale)}/>;
  return <div className="bd-screen">
    <div className="panel bd-rules"><div className="panel-title"><h2><SlidersHorizontal size={16}/>選股條件</h2><span className="tag">{ds.dates.at(-1)}</span></div>
      <div className="bd-presets">{PRESETS.map(([l,p])=><button key={l} className="button" onClick={()=>set(p)}>{l}</button>)}</div>
      <div className="bd-rule-grid">
        <label>主力連續買超 ≥（日）{numIn(rule.mainStreak,n=>set({mainStreak:n??0}))}</label>
        <label>20 日籌碼集中度 ≥（%）{numIn(rule.conc20,n=>set({conc20:n}),100,0.5)}</label>
        <label>買賣家數差連續為負 ≥（日）{numIn(rule.diffNeg,n=>set({diffNeg:n??0}))}</label>
        <label>隔日沖分點買超佔量 ≤（%）{numIn(rule.flipMax,n=>set({flipMax:n}),100,0.5)}</label>
        <label className="bd-check"><input type="checkbox" checked={rule.foreign5} onChange={e=>set({foreign5:e.target.checked})}/>外資券商 5 日合計買超</label>
        <label>指定分點當日買超<select value={rule.broker} onChange={e=>set({broker:e.target.value})}><option value="">不指定</option>{brokers.map(b=><option key={b.id} value={b.id}>{b.name}（{b.id}）</option>)}</select></label>
      </div></div>
    <div className="bd-screen-grid">
      <div className="panel"><div className="panel-title"><h2>篩選結果 <span className="count">{rows.filter(r=>r.pass).length}</span></h2><span className="muted small">點選個股看分點</span></div>
        <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th></th><th>個股</th><th>收／均</th><th>漲跌</th><th>主力連買</th><th>20日集中</th><th>家數差</th><th>家數差連負</th><th>外資5日</th><th>隔日沖佔量</th>{rule.broker&&<th>指定分點</th>}</tr></thead>
          <tbody>{rows.map(r=><tr key={r.code} className={r.pass?'pass':'dim'} onClick={()=>onOpen(r.code,rule.broker||undefined)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onOpen(r.code,rule.broker||undefined);}}>
            <td>{r.pass?<i className="bd-badge pass">符合</i>:''}</td><td className="bd-name">{r.code} {r.name}</td><td>{px(r.mark)}</td><td className={tone(r.change)}>{pct(r.change,2)}</td>
            <td className={tone(r.mainStreak)}>{r.mainStreak>0?`+${r.mainStreak}`:r.mainStreak}</td><td className={tone(r.conc20)}>{pct(r.conc20)}</td><td>{r.diff}</td><td>{r.diffNeg}</td><td className={tone(r.foreign5)}>{fl(r.foreign5,true)}</td><td>{(r.flipShare*100).toFixed(1)}%</td>{rule.broker&&<td className={tone(r.brokerNet)}>{fl(r.brokerNet,true)}</td>}</tr>)}</tbody></table></div></div>
      <div className="panel"><div className="panel-title"><h2>條件回溯</h2><div className="bd-seg">{[1,5,10,20].map(n=><button key={n} className={hold===n?'active':''} onClick={()=>setHold(n)}>{n}日</button>)}</div></div>
        <div className="bd-stats one"><div><span>歷史觸發次數</span><b>{bt.count}</b><small>次（全部個股 × 交易日）</small></div>
          <div><span>觸發後 {hold} 日平均報酬</span><b className={tone(bt.avg)}>{pct(bt.avg,2)}</b></div>
          <div><span>上漲比例</span><b>{bt.win==null?'—':`${Math.round(bt.win*100)}%`}</b></div></div>
        <p className="caution"><TriangleAlert size={14}/>{ds.source==='synthetic'?'合成資料的結果只驗證程式，沒有市場意義。':'樣本少時結果不穩定；未含成本、滑價。'}隔日沖分類使用最近 60 日資料，回溯含前視偏誤。</p></div>
    </div></div>;
}

// ================= 匯入資料 =================
function ImportView({imported,useImport,onChange,onUse,onDemo}:{imported:ImportState|null;useImport:boolean;onChange:(v:ImportState|null)=>void;onUse:()=>void;onDemo:()=>void}){
  const [fDate,setFDate]=useState(''),[fCode,setFCode]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState('');
  async function onFiles(files:FileList|null){
    if(!files?.length)return;setBusy(true);setNote('');
    const next:ImportState=imported?{files:[...imported.files],raw:[...imported.raw],brokers:[...imported.brokers],names:{...imported.names}}:{files:[],raw:[],brokers:[],names:{}};
    for(const file of Array.from(files)){
      try{
        const text=decodeBytes(await file.arrayBuffer());
        const codeFromName=file.name.match(/(?:^|[^0-9])(\d{4,6}[A-Z]?)(?=[^0-9]|$)/)?.[1]??null;
        const res=parseBrokerCsv(text,{date:dateFromText(file.name)??(fDate||null),code:fCode||codeFromName});
        next.raw.push(...res.days);next.brokers.push(...res.brokers);Object.assign(next.names,res.names);
        next.files.push({name:file.name,format:res.format==='bsr'?'買賣日報表':'FinMind',code:[...new Set(res.days.map(d=>d.code))].join(',')||'—',date:[...new Set(res.days.map(d=>d.date))].slice(0,3).join(',')||'—',rows:res.rows,warnings:res.warnings});
      }catch{next.files.push({name:file.name,format:'—',code:'—',date:'—',rows:0,warnings:['檔案無法讀取']});}
    }
    onChange(next);setBusy(false);
    try{localStorage.setItem(STORE,JSON.stringify(next));}catch{setNote('瀏覽器儲存空間不足，資料只保留在目前頁面。');}
  }
  const clear=()=>{onChange(null);try{localStorage.removeItem(STORE);}catch{/* 忽略 */}};
  return <div className="bd-import">
    <div className="panel"><div className="panel-title"><h2><Upload size={16}/>匯入分點 CSV</h2><span className="tag">只在你的瀏覽器處理</span></div>
      <div className="bd-import-body">
        <div className="two-inputs"><label>交易日期（檔名或內容沒有時使用）<input type="date" value={fDate} onChange={e=>setFDate(e.target.value)}/></label><label>股票代號（檔名或內容沒有時使用）<input value={fCode} onChange={e=>setFCode(e.target.value.trim())} placeholder="例如 2330"/></label></div>
        <label className="bd-drop"><input type="file" accept=".csv,text/csv" multiple onChange={e=>{void onFiles(e.target.files);e.target.value='';}}/><Upload size={22}/><b>{busy?'解析中…':'選擇 CSV 檔（可多選）'}</b><span>支援 Big5 與 UTF-8。多檔會依股票與日期合併。</span></label>
        {note&&<p className="caution"><TriangleAlert size={14}/>{note}</p>}
        {imported?.files.length?<><div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>檔名</th><th>格式</th><th>股票</th><th>日期</th><th>成交列</th><th>提示</th></tr></thead><tbody>{imported.files.map((f,i)=><tr key={i}><td className="bd-name">{f.name}</td><td>{f.format}</td><td>{f.code}</td><td className="mono">{f.date}</td><td>{num(f.rows)}</td><td className={f.warnings.length?'amber-text':'muted'}>{f.warnings.join(' ')||'OK'}</td></tr>)}</tbody></table></div>
          <div className="bd-row"><button className="button primary" disabled={!imported.raw.length} onClick={onUse}>{useImport?'使用中・回到個股分點':'使用匯入資料'}</button><button className="button" onClick={onDemo}>使用示範資料</button><button className="button" onClick={clear}>清除匯入</button></div></>
          :<p className="live-helper">尚未匯入。匯入後可在「個股分點」「分點調查局」「籌碼選股」使用同一套計算。</p>}
      </div></div>
    <div className="panel"><div className="panel-title"><h2>資料來源與限制</h2></div><div className="bd-import-body reading">
      <p><b>證交所買賣日報表</b>：上市股票分點成交資訊，於 <a className="cyan" href="https://bsr.twse.com.tw/bshtm/" target="_blank" rel="noreferrer">bsr.twse.com.tw ↗</a> 輸入股票代號與驗證碼後下載 CSV。格式為每列並排兩筆「序號、券商、價格、買進股數、賣出股數」。</p>
      <p><b>櫃買中心券商買賣證券日報表</b>：上櫃股票，自櫃買中心網站查詢下載；欄位同為券商、價格、買進、賣出股數。</p>
      <p><b>FinMind TaiwanStockTradingDailyReport</b>：含 securities_trader_id、stock_id、date、price、buy、sell 欄位的 CSV 可直接匯入（該資料集需依 FinMind 方案取得）。</p>
      <p>本站不自動抓取買賣日報表，也不繞過驗證碼。分點資料為盤後公布，不能用來產生盤中即時訊號。外資／官股類別依券商名稱關鍵字推定，可能有誤。</p>
      <p>日報表沒有開盤、收盤價；K 線以分點成交的最高、最低與成交均價呈現，漲跌以均價計算。</p></div></div>
  </div>;
}
