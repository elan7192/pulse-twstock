'use client';
// 籌碼K線桌面版風格的「個股分點」：左＝自選股表格，中＝K 線與可增減的副圖／分頁，右＝統計、今日主力動向、買方／賣方 15 名。
import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Search,Users} from 'lucide-react';
import {num} from '@/lib/market';
import {
  concentrationSeries,flipPressure,heavyBrokers,KIND_LABEL,ledger,mainStreak,mainVerdict,priceLevels,profileBrokers,rangeStat,STYLE_LABEL,
  type Broker,type BrokerProfile,type Dataset,type DayStat,type Flow,
} from '@/lib/branch';
import {brokerCounty,brokerMap,TILE,type County} from '@/lib/geo';
import {addCodes,removeCode,type Watch} from '@/lib/watch';
import {amt,fl,lot,md,pct,px,tone} from './branch-ui';

const ymd=(d:string)=>d.replace(/-/g,'/');
const clamp=(x:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,x));
const sgn=(n:number,d=0)=>`${n>0?'+':''}${num(n,d)}`;

function useSize<T extends HTMLElement>(){
  const ref=useRef<T>(null);const [s,setS]=useState({w:600,h:520});
  useEffect(()=>{const el=ref.current;if(!el)return;const ro=new ResizeObserver(([e])=>{const r=e.contentRect;setS({w:Math.max(240,Math.floor(r.width)),h:Math.max(200,Math.floor(r.height))});});ro.observe(el);return()=>ro.disconnect();},[]);
  return [ref,s] as const;
}

function Tags({b,p,local}:{b?:Broker;p?:BrokerProfile;local?:boolean}){
  if(!b)return null;
  return <>{b.kind!=='domestic'&&<i className={`ck-tag ${b.kind}`}>{KIND_LABEL[b.kind]}</i>}{p&&p.style!=='mixed'&&<i className={`ck-tag ${p.style}`}>{STYLE_LABEL[p.style]}</i>}{local&&<i className="ck-tag local" title="分點與公司總部同縣市">地緣</i>}</>;
}

type Props={ds:Dataset;code:string;setCode:(c:string)=>void;date:string|null;setDate:(d:string|null)=>void;range:number;setRange:(n:number)=>void;broker:string|null;setBroker:(b:string|null)=>void;
  watch:Watch;setWatch:(w:Watch)=>void;group:string;setGroup:(g:string)=>void;onEdit:()=>void;hq:Record<string,County>;geo:Record<string,County>};
type Tab='chip'|'branch'|'big'|'map'|'analysis'|'note';
const TABS:[Tab,string][]=[['chip','籌碼K線'],['branch','分點K線'],['big','大單券商'],['map','主力地圖'],['analysis','個股分析'],['note','筆記']];

export default function ChipView(p:Props){
  const {ds,code,setCode,date,setDate,range,setRange,broker,setBroker,hq,geo}=p;
  const [tab,setTab]=useState<Tab>('chip'),[mode,setMode]=useState<'range'|'day'>('range');
  const days=ds.days[code];
  const found=date?days.findIndex(d=>d.date===date):-1;const idx=found<0?days.length-1:found;
  const day=days[idx],prev=days[idx-1];
  const rdays=days.slice(Math.max(0,idx-range+1),idx+1);
  const rs=useMemo(()=>rangeStat(rdays),[code,idx,range,ds]);// eslint-disable-line react-hooks/exhaustive-deps
  const profiles=useMemo(()=>new Map(profileBrokers(ds,60,day.date).map(x=>[x.broker.id,x])),[ds,day.date]);
  const conc=(n:number)=>idx+1>=n?rangeStat(days.slice(idx-n+1,idx+1)).concentration:null;
  const streak=mainStreak(days,idx);
  const pick=(b:string,go=true)=>{setBroker(b);if(go)setTab('branch');};
  const localOf=(id:string)=>!!hq[code]&&brokerCounty(ds.brokers.get(id),geo)===hq[code];
  const share=day.volume?day.mainNet/day.volume:0;
  const verdict=mainVerdict(share);
  const change=prev?day.mark-prev.mark:null;
  const c20=conc(20);
  const flows=mode==='range'?{buy:rs.topBuy,sell:rs.topSell,days:rdays}:{buy:day.topBuy,sell:day.topSell,days:[day]};
  const dates=days.slice(-80).map(d=>d.date).reverse();
  const stats:[string,string,string?][]=[
    ['統計區間',`${ymd(rs.from)} ~ ${ymd(rs.to)}`],
    ['區間成交量',`${fl(rs.volume)} 張`],
    ['買超前15名合計',`${fl(rs.topBuy.reduce((s,f)=>s+f.net,0))} 張`,'up'],
    ['賣超前15名合計',`${fl(rs.topSell.reduce((s,f)=>s+f.net,0),true)} 張`,'down'],
    ['區間主力買賣超',`${fl(rs.mainNet,true)} 張`,tone(rs.mainNet)],
    ['區間籌碼集中(%)',pct(rs.concentration,2),tone(rs.concentration)],
    ['1日籌碼集中(%)',pct(conc(1),2),tone(conc(1))],
    ['20日籌碼集中(%)',pct(c20,2),tone(c20)],
    ['買 / 賣券商家數',`${day.buyers} / ${day.sellers}`],
    [`主力連續${streak>=0?'買':'賣'}超`,`${Math.abs(streak)} 日`,tone(streak)],
  ];
  return <div className="ck-app">
    <WatchList {...p}/>
    <section className="ck-col ck-mid" aria-label="K 線與分點">
      <div className="ck-subtabs" role="tablist">{TABS.map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}{k==='branch'&&broker?<small>{ds.brokers.get(broker)?.name}</small>:null}</button>)}</div>
      <div className="ck-mid-body">
        {(tab==='chip'||tab==='branch')&&<div className={`ck-chart-wrap ${tab==='branch'?'split':''}`}>
          <ChipChart days={days} idx={idx} range={range} onPick={i=>setDate(days[i].date)} broker={broker} brokerName={broker?ds.brokers.get(broker)?.name??broker:''} forceBroker={tab==='branch'}/>
          {tab==='branch'&&(broker?<BrokerLedger ds={ds} code={code} days={days} idx={idx} broker={broker} profile={profiles.get(broker)} onClose={()=>setBroker(null)}/>:<p className="ck-empty">點選右側買方／賣方 15 名的券商，這裡會顯示該分點的逐日進出、庫存成本與價位明細。</p>)}
        </div>}
        {tab==='big'&&<BigBrokers ds={ds} day={day} profiles={profiles} localOf={localOf} onPick={b=>pick(b)}/>}
        {tab==='map'&&<BrokerMap ds={ds} geo={geo} code={code} flows={rs.flows} volume={rs.volume} hq={hq[code]??null} label={range===1?'當日':`近 ${range} 日`} selected={broker} onPick={b=>pick(b,false)}/>}
        {tab==='analysis'&&<Analysis ds={ds} code={code} days={days} idx={idx} rs={rs} profiles={profiles} onDate={i=>setDate(days[i].date)}/>}
        {tab==='note'&&<Note code={code} name={ds.names[code]}/>}
      </div>
    </section>
    <section className="ck-col ck-right" aria-label="統計與買賣方">
      <div className="ck-rhead"><label>統計天數 <select value={range} onChange={e=>setRange(Number(e.target.value))} aria-label="統計天數">{[1,5,10,20,60].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>日期 <select value={day.date} onChange={e=>setDate(e.target.value===days.at(-1)!.date?null:e.target.value)} aria-label="統計日期">{dates.map(d=><option key={d} value={d}>{ymd(d)}</option>)}</select></label></div>
      <div className="ck-scroll">
        <div className="ck-title"><b>{code}</b> <b>{ds.names[code]||''}</b><span className={`ck-px ${tone(change)}`}>{px(day.mark)}<small>{change==null?'':` ${change>=0?'▲':'▼'} ${px(Math.abs(change))} (${pct(change/prev!.mark,2)})`}</small></span><small className="ck-mute">{ymd(day.date)} {day.close!=null?'收盤':'分點均價'}</small></div>
        <div className="ck-statgrid">
          <table className="ck-table ck-kv"><tbody>{stats.map(([k,v,t])=><tr key={k}><th scope="row">{k}</th><td className={t}>{v}</td></tr>)}</tbody></table>
          <div className={`ck-verdict ${verdict.level}`}><span>{md(day.date)}</span><span>主力動向</span><b>{verdict.label}</b><strong>{verdict.level==='flat'?fl(day.mainNet,true):fl(Math.abs(day.mainNet))} 張</strong><small>佔成交量 {pct(share,1).replace('+','')}</small></div>
        </div>
        <table className="ck-table ck-strip"><thead><tr>{['收盤','漲跌幅','成交量(張)','5日集中','20日集中','60日集中','買均價','賣均價'].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody><tr><td className={tone(change)}>{px(day.mark)}</td><td className={tone(change)}>{change!=null?pct(change/prev!.mark,2):'—'}</td><td>{fl(day.volume)}</td><td className={tone(conc(5))}>{pct(conc(5),1)}</td><td className={tone(c20)}>{pct(c20,1)}</td><td className={tone(conc(60))}>{pct(conc(60),1)}</td><td>{px(rs.mainCost)}</td><td>{px(rs.mainSellCost)}</td></tr></tbody></table>
        <div className="ck-modebar"><span>關鍵券商</span><select value={mode} onChange={e=>setMode(e.target.value as 'range'|'day')} aria-label="統計方式"><option value="range">區間買賣超（{range} 日）</option><option value="day">當日買賣超</option></select><span className="ck-mute">點券商看分點K線</span></div>
        <FlowTable side="buy" flows={flows.buy} days={flows.days} volume={mode==='range'?rs.volume:day.volume} ds={ds} profiles={profiles} selected={broker} onPick={b=>pick(b)} localOf={localOf}/>
        <FlowTable side="sell" flows={flows.sell} days={flows.days} volume={mode==='range'?rs.volume:day.volume} ds={ds} profiles={profiles} selected={broker} onPick={b=>pick(b)} localOf={localOf}/>
      </div>
    </section>
  </div>;
}

// ================= 左：自選股 =================
type SortKey='code'|'close'|'chg'|'main';
function WatchList({ds,code,setCode,watch,setWatch,group,setGroup,onEdit}:Props){
  const [q,setQ]=useState(''),[sort,setSort]=useState<{k:SortKey;d:1|-1}|null>(null);
  const g=watch.groups.find(x=>x.id===group);const target=g??watch.groups[0];
  const base=g?g.codes:ds.stocks;
  const rows=base.map(c=>{const d=ds.days[c];if(!d)return {c,name:ds.names[c]??'',none:true as const};const l=d.at(-1)!,pv=d.at(-2);
    return {c,name:ds.names[c]??c,none:false as const,close:l.mark,chg:pv?l.mark-pv.mark:null,pct:pv?l.mark/pv.mark-1:null,main:l.mainNet};})
    .filter(r=>!q||r.c.includes(q.toUpperCase())||r.name.includes(q));
  if(sort)rows.sort((a,b)=>{const v=(r:typeof a)=>sort.k==='code'?r.c:r.none?-Infinity:sort.k==='close'?r.close:sort.k==='chg'?(r.pct??-Infinity):r.main;const x=v(a),y=v(b);return (x<y?-1:x>y?1:0)*sort.d;});
  const go=()=>{const r=rows.find(x=>x.c===q.toUpperCase()&&!x.none)??rows.find(x=>!x.none);if(r){setCode(r.c);setQ('');}};
  const has=target.codes.includes(code);
  const th=(k:SortKey,l:string)=><th onClick={()=>setSort(s=>s?.k===k?(s.d===1?{k,d:-1}:null):{k,d:1})} aria-sort={sort?.k===k?(sort.d===1?'ascending':'descending'):'none'} className="sortable">{l}{sort?.k===k?(sort.d===1?' ▲':' ▼'):''}</th>;
  return <section className="ck-col ck-left" aria-label="自選股">
    <div className="ck-lhead">
      <label className="ck-code"><span>股票代號</span><input value={q} onChange={e=>setQ(e.target.value.trim())} onKeyDown={e=>{if(e.key==='Enter')go();}} placeholder={`${code} ${ds.names[code]??''}`} aria-label="股票代號或名稱"/>
        <button className="ck-ico" onClick={go} aria-label="搜尋"><Search size={14}/></button>
        <button className="ck-ico" onClick={()=>setWatch(has?removeCode(watch,target.id,code):addCodes(watch,target.id,[code]).watch)} aria-label={has?`從 ${target.name} 移除 ${code}`:`加入 ${target.name}`} title={has?`已在「${target.name}」，點擊移除`:`加入「${target.name}」`}>{has?'★':'＋'}</button></label>
      <div className="ck-lrow"><select value={group} onChange={e=>setGroup(e.target.value)} aria-label="自選股群組"><option value="all">全部個股（{ds.stocks.length}）</option>{watch.groups.map(x=><option key={x.id} value={x.id}>{x.name}（{x.codes.length}）</option>)}</select>
        <button className="ck-btn" onClick={onEdit}>編輯</button></div>
    </div>
    <div className="ck-scroll"><table className="ck-table ck-watch"><thead><tr>{th('code','名稱')}{th('close','最新收盤')}{th('chg','漲跌')}{th('main','主力')}</tr></thead>
      <tbody>{rows.map(r=>r.none?<tr key={r.c} className="dim" onClick={()=>{}}><td colSpan={4}>{r.c} <small>此資料集沒有這檔</small></td></tr>:
        <tr key={r.c} className={r.c===code?'sel':''} onClick={()=>setCode(r.c)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setCode(r.c);}} aria-selected={r.c===code}>
          <td className="nm"><span className="cd">{r.c}</span> {r.name}</td><td className={tone(r.chg)}>{px(r.close)}</td><td className={tone(r.chg)} title={pct(r.pct,2)}>{r.chg==null?'—':sgn(r.chg,r.close>=100?1:2)}</td><td className={tone(r.main)}>{fl(r.main,true)}</td></tr>)}
        {!rows.length&&<tr><td colSpan={4} className="ck-empty">{g?'這個群組沒有符合的股票，點「編輯」加入。':'沒有符合的個股。'}</td></tr>}</tbody></table></div>
  </section>;
}

// ================= 右：買方／賣方 15 名 =================
function FlowTable({side,flows,days,volume,ds,profiles,selected,onPick,localOf}:{side:'buy'|'sell';flows:Flow[];days:DayStat[];volume:number;ds:Dataset;profiles:Map<string,BrokerProfile>;selected:string|null;onPick:(b:string)=>void;localOf:(id:string)=>boolean}){
  const pnl=useMemo(()=>{const m=new Map<string,number>();for(const f of flows){const l=ledger(days,f.broker).at(-1);m.set(f.broker,l?l.realized+l.unrealized:0);}return m;},[flows,days]);
  return <div className={`ck-flow ${side}`}><div className="ck-flow-h"><b>{side==='buy'?'買方15':'賣方15'}</b><span>{fl(flows.reduce((s,f)=>s+f.net,0),true)} 張</span></div>
    <table className="ck-table"><thead><tr><th>券商名稱</th><th>關鍵券商</th><th>買進</th><th>賣出</th><th>買賣超</th><th>交易量</th><th title="以平均成本法估算的區間損益（含未實現）">損益</th></tr></thead>
      <tbody>{flows.map(f=>{const b=ds.brokers.get(f.broker);return <tr key={f.broker} className={selected===f.broker?'sel':''} onClick={()=>onPick(f.broker)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onPick(f.broker);}} aria-selected={selected===f.broker}>
        <td className="nm">{b?.name??f.broker}</td><td className="tg"><Tags b={b} p={profiles.get(f.broker)} local={localOf(f.broker)}/></td><td>{fl(f.buy)}</td><td>{fl(f.sell)}</td>
        <td className={tone(f.net)}><b>{fl(f.net,true)}</b></td><td className="ck-mute" title={volume?`佔成交量 ${(Math.abs(f.net)/volume*100).toFixed(1)}%`:''}>{fl(f.buy+f.sell)}</td><td className={tone(pnl.get(f.broker))}>{amt(pnl.get(f.broker)??0)}</td></tr>;})}
        {!flows.length&&<tr><td colSpan={7} className="ck-empty">無資料</td></tr>}</tbody></table></div>;
}

// ================= 中：K 線與副圖 =================
type Ind='main'|'diff'|'conc'|'vol'|'broker';
const IND_LABEL:Record<Ind,string>={main:'主力買賣超',diff:'買賣家數差',conc:'籌碼集中度',vol:'成交量',broker:'分點買賣超'};
const MA_COLOR:Record<number,string>={5:'#e8a317',10:'#2f7ee6',20:'#9a5be0',60:'#12a5a0'};
const RANGES:[string,number][]=[['3月',60],['6月',120],['1年',250],['全部',0]];

function ChipChart({days,idx,range,onPick,broker,brokerName,forceBroker}:{days:DayStat[];idx:number;range:number;onPick:(i:number)=>void;broker:string|null;brokerName:string;forceBroker:boolean}){
  const [box,size]=useSize<HTMLDivElement>();
  const [win,setWin]=useState(90),[endOff,setEndOff]=useState(0),[hover,setHover]=useState<number|null>(null);
  const [mas,setMas]=useState<Record<number,boolean>>({5:true,10:false,20:true,60:false});
  const [showMain,setShowMain]=useState(false),[showBroker,setShowBroker]=useState(true);
  const [panes,setPanes]=useState<Ind[]>(['main','diff']);
  const N=days.length,nb=Math.max(1,Math.min(N,win)),eo=clamp(endOff,0,N-nb),end=N-eo,start=end-nb;
  useEffect(()=>{if(idx<start||idx>=end)setEndOff(clamp(N-1-idx-Math.floor(nb/2),0,N-nb));},[idx]);// eslint-disable-line react-hooks/exhaustive-deps
  const shown=days.slice(start,end);
  const c5=useMemo(()=>concentrationSeries(days,5),[days]),c20=useMemo(()=>concentrationSeries(days,20),[days]);
  // 分點K線分頁：分點買賣超放最上面，再留一個其他副圖，讓下方的分點明細不用捲很遠
  const eff:Ind[]=forceBroker&&broker?['broker',...panes.filter(k=>k!=='broker').slice(0,1)]:panes;
  const W=size.w,R=54,PW=W-R-4,step=PW/nb,cw=Math.min(18,Math.max(1.5,step*0.62));
  const x=(i:number)=>4+i*step+step/2;
  const nP=eff.length,priceH=nP?Math.max(190,Math.round(size.h*(nP>=3?0.4:0.5))):size.h-2,paneH=nP?Math.max(54,Math.floor((size.h-priceH)/nP)-23):0; // 每個副圖含 22px 標題列與 1px 框線，內容高度永遠 ≤ 量到的高度，避免量測與內容互相撐大
  const hv=clamp(hover??(idx>=start&&idx<end?idx-start:nb-1),0,nb-1);
  const hd=shown[hv],hp=days[start+hv-1];
  // 價格
  const hi=Math.max(...shown.map(d=>d.high)),lo=Math.min(...shown.map(d=>d.low)),pad=(hi-lo)*.1||1;
  const py=(v:number)=>16+(hi+pad-v)/(hi-lo+2*pad)*(priceH-26);
  const maAt=(k:number)=>shown.map((_,i)=>{const e=start+i;if(e+1<k)return null;let s=0;for(let j=e-k+1;j<=e;j++)s+=days[j].mark;return s/k;});
  const maLines=[5,10,20,60].filter(k=>mas[k]).map(k=>({k,v:maAt(k)}));
  const path=(vals:(number|null)[],y:(v:number)=>number)=>vals.map((v,i)=>v==null?'':`${vals[i-1]==null?'M':'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const hiI=shown.findIndex(d=>d.high===hi),loI=shown.findIndex(d=>d.low===lo);
  const selA=Math.max(0,idx-range+1)-start,selB=idx-start;
  const up=(d:DayStat,p?:DayStat)=>d.open!=null&&d.close!=null?d.close>=d.open:p?d.mark>=p.mark:true;
  const bNet=broker?shown.map(d=>(d.byBroker.get(broker)?.net??0)):[];const bMax=Math.max(1,...bNet.map(Math.abs));
  const cum=(v:number[])=>{let s=0;return v.map(a=>(s+=a));};
  const hit=(h:number)=><rect x={0} y={0} width={W} height={h} fill="transparent" style={{cursor:'crosshair'}} onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect();setHover(clamp(Math.floor((e.clientX-r.left-4)/step),0,nb-1));}} onMouseLeave={()=>setHover(null)} onClick={()=>onPick(start+hv)}/>;
  const band=(h:number)=>selB>=0&&selA<nb?<rect x={x(Math.max(0,selA))-step/2} y={0} width={(Math.min(nb-1,selB)-Math.max(0,selA)+1)*step} height={h} className="ck-band"/>:null;
  const cross=(h:number)=><line x1={x(hv)} x2={x(hv)} y1={0} y2={h} className="ck-cross"/>;
  const label=(v:number)=>Math.abs(v)>=1e4?`${num(v/1e3,0)}k`:num(v,Math.abs(v)<10&&v!==0?1:0);
  function pane(kind:Ind,h:number){
    const mid=h/2,vals=kind==='main'?shown.map(d=>d.mainNet/1000):kind==='diff'?shown.map(d=>d.diff):kind==='broker'?bNet.map(v=>v/1000):kind==='vol'?shown.map(d=>d.volume/1000):[];
    const m=Math.max(1e-9,...vals.map(Math.abs));const by=(v:number)=>kind==='vol'?h-4-v/m*(h-10):mid-v/m*(mid-5);
    const cs=kind==='main'||kind==='broker'?cum(vals):null;const cmax=cs?Math.max(0,...cs):0,cmin=cs?Math.min(0,...cs):0;const cy=(v:number)=>4+(cmax-v)/((cmax-cmin)||1)*(h-8);
    let cm=1;if(kind==='conc'){cm=Math.max(.005,...[...c5.slice(start,end),...c20.slice(start,end)].filter((v):v is number=>v!=null).map(Math.abs));}
    const ky=(v:number)=>mid-v/cm*(mid-5);
    return <svg width={W} height={h} role="img" aria-label={IND_LABEL[kind]}>
      {band(h)}
      <line x1={4} x2={W-R} y1={kind==='vol'?h-4:kind==='conc'?ky(0):mid} y2={kind==='vol'?h-4:kind==='conc'?ky(0):mid} className="ck-zero"/>
      {kind==='conc'?<><path d={path(c5.slice(start,end),ky)} className="ck-l5"/><path d={path(c20.slice(start,end),ky)} className="ck-l20"/>
        <text x={W-R+6} y={ky(cm)+9} className="ck-ax">{pct(cm,0)}</text><text x={W-R+6} y={ky(-cm)} className="ck-ax">{pct(-cm,0)}</text></>
      :kind==='broker'&&!broker?<text x={W/2} y={h/2+4} textAnchor="middle" className="ck-ax">點選右側券商，顯示該分點每日買賣超</text>
      :<>{vals.map((v,i)=>{const col=kind==='vol'?(up(shown[i],days[start+i-1])?'up':'down'):v>=0?'up':'down';const y0=kind==='vol'?h-4:mid,y1=by(v);
        return <rect key={i} x={x(i)-cw/2} y={Math.min(y0,y1)} width={cw} height={Math.max(v===0?0:1,Math.abs(y1-y0))} className={`ck-bar ${col}`}/>;})}
        {cs&&<path d={path(cs,cy)} className="ck-lc"/>}
        <text x={W-R+6} y={12} className="ck-ax">{label(m)}</text>{kind!=='vol'&&<text x={W-R+6} y={h-3} className="ck-ax">{label(-m)}</text>}
</>}
      {cross(h)}{hit(h)}</svg>;
  }
  const legend=(kind:Ind)=>{const i=hv;
    if(kind==='main'||kind==='broker'){const v=(kind==='main'?shown.map(d=>d.mainNet):bNet).map(a=>a/1000);const c=cum(v);return <><i className="l lc"/>累計買賣超(張) <b>{num(c[i]??0,0)}</b><i className={`l ${(v[i]??0)>=0?'up':'down'}`}/>{kind==='main'?'主力':brokerName}買賣超(張) <b className={tone(v[i])}>{sgn(v[i]??0)}</b></>;}
    if(kind==='diff')return <><i className={`l ${hd.diff>=0?'up':'down'}`}/>買賣家數差 <b className={tone(hd.diff)}>{sgn(hd.diff)}</b> <span className="ck-mute">買 {hd.buyers} / 賣 {hd.sellers}</span></>;
    if(kind==='vol')return <><i className="l lc"/>成交量(張) <b>{num(lot(hd.volume))}</b></>;
    const a=c5[start+i],b=c20[start+i];return <><i className="l l5"/>5日 <b className={tone(a)}>{pct(a,2)}</b><i className="l l20"/>20日 <b className={tone(b)}>{pct(b,2)}</b></>;
  };
  const free=(Object.keys(IND_LABEL) as Ind[]).filter(k=>!eff.includes(k));
  const ticks=[...new Set([0,.2,.4,.6,.8,1].map(p=>Math.round(p*(nb-1))))];
  const ohlc=hd;
  return <div className="ck-chart">
    <div className="ck-tool" role="toolbar" aria-label="圖表選項">
      {[5,10,20,60].map(k=><button key={k} className={`ck-chip ${mas[k]?'on':''}`} aria-pressed={mas[k]} style={{'--c':MA_COLOR[k]} as CSSProperties} onClick={()=>setMas(o=>({...o,[k]:!o[k]}))}>MA{k}</button>)}
      <span className="ck-sep"/>
      <button className={`ck-chip ${showMain?'on':''}`} aria-pressed={showMain} onClick={()=>setShowMain(v=>!v)} title="主力買賣超佔成交量 ≥ 10% 的日子標三角">主力標記</button>
      <button className={`ck-chip ${showBroker&&broker?'on':''}`} aria-pressed={showBroker} disabled={!broker} onClick={()=>setShowBroker(v=>!v)} title={broker?`標出 ${brokerName} 每日買賣超`:'先點選右側的券商'}>{broker?`券商：${brokerName}`:'券商標記'}</button>
      <span className="ck-grow"/><span className="ck-mute">日線</span>
    </div>
    <div className="ck-ohlc"><b>{ymd(ohlc.date)}</b>{ohlc.open!=null&&<span>開 <b>{px(ohlc.open)}</b></span>}<span>高 <b>{px(ohlc.high)}</b></span><span>低 <b>{px(ohlc.low)}</b></span><span>{ohlc.close!=null?'收':'均'} <b className={tone(hp?ohlc.mark-hp.mark:0)}>{px(ohlc.mark)}</b></span>
      {hp&&<span>漲跌 <b className={tone(ohlc.mark-hp.mark)}>{sgn(ohlc.mark-hp.mark,2)}</b></span>}{hp&&<span>漲幅 <b className={tone(ohlc.mark-hp.mark)}>{pct(ohlc.mark/hp.mark-1,2)}</b></span>}<span>量 <b>{num(lot(ohlc.volume))}</b></span></div>
    <div className="ck-panes" ref={box} style={{minHeight:nP?190+nP*77:220}}>
      <svg width={W} height={priceH} role="img" aria-label="日 K 線與均線">
        {band(priceH)}
        {[0,1,2,3,4].map(i=>{const v=hi+pad-i*(hi-lo+2*pad)/4;return <g key={i}><line x1={4} x2={W-R} y1={py(v)} y2={py(v)} className="ck-grid"/><text x={W-R+6} y={py(v)+4} className="ck-ax">{px(v)}</text></g>;})}
        {shown.map((d,i)=>{const c=up(d,days[start+i-1])?'up':'down';const fade=start+i>idx?.4:1;
          return <g key={d.date} opacity={fade} className={`ck-c ${c}`}><line x1={x(i)} x2={x(i)} y1={py(d.high)} y2={py(d.low)}/>{d.open!=null&&d.close!=null?<rect x={x(i)-cw/2} width={cw} y={Math.min(py(d.open),py(d.close))} height={Math.max(1,Math.abs(py(d.open)-py(d.close)))}/>:<line x1={x(i)-cw/2} x2={x(i)+cw/2} y1={py(d.mark)} y2={py(d.mark)}/>}</g>;})}
        {maLines.map(({k,v})=><path key={k} d={path(v,py)} fill="none" stroke={MA_COLOR[k]} strokeWidth="1.2"/>)}
        {showMain&&shown.map((d,i)=>{const s=d.volume?d.mainNet/d.volume:0;return Math.abs(s)>=0.1?<text key={d.date} x={x(i)} y={s>0?py(d.low)+12:py(d.high)-5} textAnchor="middle" className={`ck-mk ${s>0?'up':'down'}`}>{s>0?'▲':'▼'}</text>:null;})}
        {broker&&showBroker&&bNet.map((v,i)=>v===0?null:<circle key={i} cx={x(i)} cy={v>0?py(shown[i].low)+10:py(shown[i].high)-10} r={2+Math.sqrt(Math.abs(v)/bMax)*6} className={`ck-dot ${v>0?'up':'down'}`}><title>{`${ymd(shown[i].date)} ${brokerName} ${sgn(lot(v))} 張`}</title></circle>)}
        <text x={x(hiI)} y={py(hi)-4} textAnchor={hiI>nb*.85?'end':hiI<nb*.1?'start':'middle'} className="ck-hl">{px(hi)}</text>
        <text x={x(loI)} y={py(lo)+13} textAnchor={loI>nb*.85?'end':loI<nb*.1?'start':'middle'} className="ck-hl">{px(lo)}</text>
        <g className="ck-legend">{maLines.map(({k,v},j)=><text key={k} x={8+j*86} y={12} fill={MA_COLOR[k]}>MA{k} {px(v[hv])}</text>)}</g>
        {cross(priceH)}{hit(priceH)}
      </svg>
      {eff.map((k,i)=><div key={k+i} className="ck-pane"><div className="ck-pane-h"><button className="ck-x" aria-label={`移除 ${IND_LABEL[k]}`} onClick={()=>setPanes(p=>p.filter(v=>v!==k))} disabled={forceBroker&&k==='broker'}>×</button>
        <select value={k} onChange={e=>setPanes(p=>{const n=[...p];const j=n.indexOf(k);const v=e.target.value as Ind;if(j>=0)n[j]=v;else n.unshift(v);return [...new Set(n)];})} aria-label="副圖指標">{(Object.keys(IND_LABEL) as Ind[]).filter(o=>o===k||!eff.includes(o)).map(o=><option key={o} value={o}>{IND_LABEL[o]}</option>)}</select>
        <span className="ck-legend2">{legend(k)}</span></div>{pane(k,paneH)}</div>)}
    </div>
    <svg width={W} height={20} className="ck-axis" role="img" aria-label="日期軸">
      {ticks.map(i=><text key={i} x={x(i)} y={13} textAnchor={i===0&&nb>4?'start':i===nb-1&&nb>4?'end':'middle'} className="ck-ax">{ymd(shown[i].date).slice(2)}</text>)}
      {idx>=start&&idx<end&&<g><rect x={clamp(x(idx-start)-36,0,W-R-72)} y={1} width={72} height={16} rx="3" className="ck-selbox"/><text x={clamp(x(idx-start),36,W-R-36)} y={13} textAnchor="middle" className="ck-seltxt">{ymd(days[idx].date)}</text></g>}
    </svg>
    <div className="ck-ctl">
      <span><button className="ck-btn" onClick={()=>setEndOff(o=>clamp(o+Math.max(1,Math.round(nb/3)),0,N-nb))} disabled={start<=0} aria-label="往前捲動">◀</button><button className="ck-btn" onClick={()=>setEndOff(o=>clamp(o-Math.max(1,Math.round(nb/3)),0,N-nb))} disabled={eo<=0} aria-label="往後捲動">▶</button></span>
      <span>{RANGES.map(([l,n])=><button key={l} className={`ck-btn ${(n||N)===win||(!n&&win>=N)?'on':''}`} onClick={()=>{setWin(n||N);setEndOff(0);}} disabled={n>0&&N<10}>{l}</button>)}</span>
      <span><button className="ck-btn" onClick={()=>setWin(w=>clamp(Math.round(w*1.4),10,Math.max(10,N)))} aria-label="縮小">－</button><button className="ck-btn" onClick={()=>setWin(w=>clamp(Math.round(w/1.4),10,Math.max(10,N)))} aria-label="放大">＋</button></span>
      <span><button className="ck-btn" onClick={()=>free.length&&setPanes(p=>[...p,free[0]])} disabled={!free.length}>＋ 副圖</button></span>
      <span className="ck-grow"/><span className="ck-mute">共 {nb}/{N} 日・點 K 棒切換統計日</span>
    </div>
  </div>;
}

// ================= 中：分點K線的分點明細 =================
function BrokerLedger({ds,code,days,idx,broker,profile,onClose}:{ds:Dataset;code:string;days:DayStat[];idx:number;broker:string;profile?:BrokerProfile;onClose:()=>void}){
  const [win,setWin]=useState(60);
  const b=ds.brokers.get(broker);const slice=days.slice(Math.max(0,idx-win+1),idx+1);
  const rows=ledger(slice,broker);const last=rows.at(-1);const active=rows.filter(r=>r.buy||r.sell);
  const tb=rows.reduce((s,r)=>s+r.buy,0),ts=rows.reduce((s,r)=>s+r.sell,0);
  const ab=active.reduce((s,r)=>s+(r.avgBuy??0)*r.buy,0)/(tb||1),as=active.reduce((s,r)=>s+(r.avgSell??0)*r.sell,0)/(ts||1);
  const today=days[idx].fills.filter(f=>f.broker===broker).sort((a,c)=>c.price-a.price);const f=profile?.flip;
  return <div className="ck-ledger"><div className="ck-ledger-h"><b><Users size={14}/> 分點明細：{b?.name??broker}</b><span className="ck-mute">{broker}</span><Tags b={b} p={profile}/><span className="ck-grow"/>
      {[20,60,120].map(n=><button key={n} className={`ck-btn ${win===n?'on':''}`} onClick={()=>setWin(n)}>{n}日</button>)}<button className="ck-btn" onClick={onClose}>清除</button></div>
    <div className="ck-kpis">
      <div><span>區間買進 / 賣出</span><b>{fl(tb)} / {fl(ts)}</b></div><div><span>區間買賣超</span><b className={tone(tb-ts)}>{fl(tb-ts,true)}</b></div>
      <div><span>均買 / 均賣</span><b>{tb?px(ab):'—'} / {ts?px(as):'—'}</b></div><div><span>估計庫存・成本</span><b className={tone(last?.position)}>{fl(last?.position??0,true)}{last?.cost?` @${px(last.cost)}`:''}</b></div>
      <div><span>已實現 / 未實現</span><b><em className={tone(last?.realized)}>{amt(last?.realized??0)}</em> / <em className={tone(last?.unrealized)}>{amt(last?.unrealized??0)}</em></b></div><div><span>隔日沖命中</span><b>{f&&f.events?`${f.hits}/${f.events}`:'—'}</b></div></div>
    <div className="ck-two"><div><table className="ck-table"><thead><tr><th>日期</th><th>買進</th><th>賣出</th><th>買賣超</th><th>均買</th><th>均賣</th><th>庫存</th><th>收／均</th></tr></thead>
      <tbody>{active.slice(-15).reverse().map(r=><tr key={r.date}><td className="mono ck-mute">{md(r.date)}</td><td>{fl(r.buy)}</td><td>{fl(r.sell)}</td><td className={tone(r.net)}><b>{fl(r.net,true)}</b></td><td>{px(r.avgBuy)}</td><td>{px(r.avgSell)}</td><td className={tone(r.position)}>{fl(r.position,true)}</td><td>{px(r.mark)}</td></tr>)}
        {!active.length&&<tr><td colSpan={8} className="ck-empty">此區間沒有交易</td></tr>}</tbody></table></div>
      <div><h4>{md(days[idx].date)} 價位明細・{ds.names[code]||code}</h4>{today.length?<table className="ck-table"><thead><tr><th>價格</th><th>買進</th><th>賣出</th></tr></thead><tbody>{today.map((x,i)=><tr key={i}><td>{px(x.price)}</td><td className={x.buy?'up':'ck-mute'}>{fl(x.buy)}</td><td className={x.sell?'down':'ck-mute'}>{fl(x.sell)}</td></tr>)}</tbody></table>:<p className="ck-empty">當日沒有成交。</p>}</div></div>
    <p className="ck-note">平均成本法：同日買賣先互抵，剩餘淨額進出庫存；以區間起點零庫存估算，不代表該分點實際持股，也不能辨識背後是哪一位投資人。</p></div>;
}

// ================= 中：大單券商 =================
function BigBrokers({ds,day,profiles,localOf,onPick}:{ds:Dataset;day:DayStat;profiles:Map<string,BrokerProfile>;localOf:(id:string)=>boolean;onPick:(b:string)=>void}){
  const [th,setTh]=useState(2);
  const rows=heavyBrokers(day,th/100).sort((a,b)=>Math.max(b.buy,b.sell)-Math.max(a.buy,a.sell));
  return <div className="ck-pad"><div className="ck-modebar"><span>{ymd(day.date)} 單日買進或賣出 ≥ 成交量</span><input type="number" min={0.5} step={0.5} value={th} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>0)setTh(n);}} aria-label="門檻百分比"/><span>%</span><span className="ck-mute">共 {rows.length} 家</span></div>
    <table className="ck-table"><thead><tr><th>券商名稱</th><th>關鍵券商</th><th>買進</th><th>賣出</th><th>買賣超</th><th>買進佔量</th><th>賣出佔量</th></tr></thead>
      <tbody>{rows.map(f=>{const b=ds.brokers.get(f.broker);return <tr key={f.broker} onClick={()=>onPick(f.broker)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onPick(f.broker);}}><td className="nm">{b?.name??f.broker}</td><td className="tg"><Tags b={b} p={profiles.get(f.broker)} local={localOf(f.broker)}/></td><td className="up">{fl(f.buy)}</td><td className="down">{fl(f.sell)}</td><td className={tone(f.net)}><b>{fl(f.net,true)}</b></td><td>{day.volume?(f.buy/day.volume*100).toFixed(1):'—'}%</td><td>{day.volume?(f.sell/day.volume*100).toFixed(1):'—'}%</td></tr>;})}
        {!rows.length&&<tr><td colSpan={7} className="ck-empty">沒有分點超過門檻，調低百分比試試。</td></tr>}</tbody></table>
    <p className="ck-note">買賣日報表是分點彙總，不是逐筆大單；這裡以單一分點單日成交佔當日總量比例代替「大單」。點選券商看分點K線。</p></div>;
}

// ================= 中：主力地圖 =================
function BrokerMap({ds,geo,code,flows,volume,hq,label,selected,onPick}:{ds:Dataset;geo:Record<string,County>;code:string;flows:Flow[];volume:number;hq:County|null;label:string;selected:string|null;onPick:(b:string)=>void}){
  const m=useMemo(()=>brokerMap(ds,flows,hq,geo),[ds,flows,hq,geo]);
  const by=new Map(m.counties.map(c=>[c.county,c]));const max=Math.max(1,...m.counties.map(c=>Math.abs(c.net)));
  const CW=66,CH=36,G=4,W=4*(CW+G),H=11*(CH+G);
  return <div className="ck-pad"><div className="ck-modebar"><b>{ds.names[code]??code} 分點所在縣市・{label}</b><span className="ck-grow"/><span className="ck-mute">{hq?`公司總部 ${hq}`:'總部縣市不明'}</span></div>
    <div className="ck-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ds.names[code]??code} 各縣市分點買賣超`} className="ck-map-svg">
        {(Object.entries(TILE) as [County,[number,number]][]).map(([c,[cx,cy]])=>{const f=by.get(c);const a=f?0.18+0.72*Math.abs(f.net)/max:0;const isHq=c===hq;
          return <g key={c} transform={`translate(${cx*(CW+G)},${cy*(CH+G)})`}><title>{`${c}${isHq?'（公司總部）':''}：${f?`淨 ${fl(f.net,true)} 張・${f.brokers} 個分點`:'無進出'}`}</title>
            <rect width={CW} height={CH} rx="4" className={f?(f.net>=0?'ck-t up':'ck-t down'):'ck-t none'} fillOpacity={f?a:1} strokeWidth={isHq?2:1} data-hq={isHq||undefined}/>
            <text x={CW/2} y={14} textAnchor="middle" className="ck-tt">{isHq?'★':''}{c.replace(/[市縣]$/,'')}</text>{f&&<text x={CW/2} y={28} textAnchor="middle" className="ck-tt">{fl(f.net,true)}</text>}</g>;})}
      </svg>
      <div className="ck-map-side">
        <div className="ck-kpis two"><div><span>地緣券商淨買賣</span><b className={tone(m.localNet)}>{hq?`${fl(m.localNet,true)} 張`:'—'}</b></div><div><span>地緣佔成交量</span><b>{hq&&volume?pct(m.local.reduce((s,f)=>s+Math.abs(f.net),0)/volume):'—'}</b></div></div>
        <h4>地緣券商（與總部同縣市）</h4>
        <ul className="ck-list">{m.local.slice(0,8).map(f=><li key={f.broker}><button className={selected===f.broker?'sel':''} onClick={()=>onPick(f.broker)}><span>{ds.brokers.get(f.broker)?.name??f.broker}</span><b className={tone(f.net)}>{fl(f.net,true)} 張</b></button></li>)}
          {!m.local.length&&<li className="ck-empty">{hq?'區間內沒有同縣市分點進出。':'沒有這檔公司的總部資料。'}</li>}</ul>
        <h4>縣市淨買賣排行</h4>
        <ul className="ck-list">{m.counties.slice(0,6).map(c=><li key={c.county}><div><span>{c.county===hq?'★ ':''}{c.county} <small className="ck-mute">{c.brokers} 家</small></span><b className={tone(c.net)}>{fl(c.net,true)} 張</b></div></li>)}</ul>
      </div></div>
    <p className="ck-note">分點縣市以證交所券商分公司名錄的地址為準，名錄沒有的分點再由名稱中的據點名判斷；外資與判斷不出據點的分點不上圖（{fl(m.unknown)} 張）。公司總部縣市取自證交所、櫃買公司基本資料地址。地緣券商常是公司派、員工或在地大戶，連續買超值得留意，但不等於內線。</p></div>;
}

// ================= 中：個股分析 =================
function Analysis({ds,code,days,idx,rs,profiles,onDate}:{ds:Dataset;code:string;days:DayStat[];idx:number;rs:ReturnType<typeof rangeStat>;profiles:Map<string,BrokerProfile>;onDate:(i:number)=>void}){
  const levels=useMemo(()=>priceLevels(days.slice(Math.max(0,days.findIndex(d=>d.date===rs.from)),idx+1),rs.topBuy,rs.topSell),[days,idx,rs]);
  const day=days[idx];const flip=flipPressure(day,profiles);const flipOut=day.topSell.filter(f=>profiles.get(f.broker)?.style==='flip').reduce((s,f)=>s-f.net,0);
  const c20=concentrationSeries(days,20);
  const rows=days.slice(Math.max(0,idx-14),idx+1).map((d,k,a)=>({d,i:Math.max(0,idx-14)+k,p:k?a[k-1]:days[Math.max(0,idx-15)]})).reverse();
  return <div className="ck-pad"><div className="ck-two">
    <div><h4>主力價位分布 <span className="ck-mute">買超／賣超前 15 名</span></h4><Levels levels={levels} mark={day.mark}/></div>
    <div><h4>隔日沖賣壓 <span className="ck-mute">{md(day.date)} → 次日</span></h4>
      <div className={`ck-flip ${flip.share>=0.03?'hot':''}`}><div><span>隔日沖型分點今日買超</span><b>{fl(flip.total)} 張</b><small>{pct(flip.share)} 佔量</small></div><div><span>隔日沖型分點今日賣超（前日買進出貨）</span><b>{fl(flipOut)} 張</b></div></div>
      <ul className="ck-list">{flip.list.slice(0,5).map(f=><li key={f.broker}><div><span>{ds.brokers.get(f.broker)?.name??f.broker}</span><b className="up">{fl(f.net,true)}</b></div></li>)}</ul>
      <p className="ck-note">手法以近 60 日行為推定，不保證次日必賣。</p></div></div>
    <h4>近 15 日籌碼 <span className="ck-mute">{ds.names[code]??code}・點日期切換</span></h4>
    <table className="ck-table"><thead><tr><th>日期</th><th>收盤</th><th>漲跌幅</th><th>成交量</th><th>主力買賣超</th><th>買賣家數差</th><th>20日集中</th></tr></thead>
      <tbody>{rows.map(({d,i,p})=>{const ch=p&&p!==d?d.mark/p.mark-1:null;return <tr key={d.date} className={i===idx?'sel':''} onClick={()=>onDate(i)}><td className="mono">{ymd(d.date)}</td><td className={tone(ch)}>{px(d.mark)}</td><td className={tone(ch)}>{pct(ch,2)}</td><td>{fl(d.volume)}</td><td className={tone(d.mainNet)}><b>{fl(d.mainNet,true)}</b></td><td className={tone(-d.diff)}>{sgn(d.diff)}</td><td className={tone(c20[i])}>{pct(c20[i],1)}</td></tr>;})}</tbody></table></div>;
}
function Levels({levels,mark}:{levels:{price:number;mainBuy:number;mainSell:number;all:number}[];mark:number}){
  if(!levels.length)return <p className="ck-empty">無價位資料</p>;
  const hi=levels[0].price,lo=levels.at(-1)!.price,bins=Math.min(16,levels.length);const st=(hi-lo)/bins||1;
  const rows=levels.length<=16?levels.map(l=>({label:px(l.price),top:l.price,bottom:l.price,mainBuy:l.mainBuy,mainSell:l.mainSell,all:l.all})):Array.from({length:bins},(_,i)=>{const top=hi-i*st,bottom=i===bins-1?lo:top-st;const inBin=levels.filter(l=>l.price<=top+1e-9&&(i===bins-1?l.price>=bottom-1e-9:l.price>bottom+1e-9));
    return {label:`${px(bottom)}–${px(top)}`,top,bottom,mainBuy:inBin.reduce((s,l)=>s+l.mainBuy,0),mainSell:inBin.reduce((s,l)=>s+l.mainSell,0),all:inBin.reduce((s,l)=>s+l.all,0)};});
  const max=Math.max(1,...rows.map(r=>Math.max(r.mainBuy,r.mainSell)));
  return <div className="ck-levels">{rows.map(r=><div key={r.label} className={mark<=r.top+1e-9&&mark>=r.bottom-1e-9?'cur':''} title={`主力買 ${fl(r.mainBuy)} 張 / 主力賣 ${fl(r.mainSell)} 張 / 全部成交 ${fl(r.all)} 張`}>
    <span className="b"><i style={{width:`${r.mainBuy/max*100}%`}}/></span><b>{r.label}</b><span className="s"><i style={{width:`${r.mainSell/max*100}%`}}/></span></div>)}
    <p className="ck-lv-l"><span className="up">◀ 買超前 15 買進</span><span className="down">賣超前 15 賣出 ▶</span></p></div>;
}

// ================= 中：筆記 =================
function Note({code,name}:{code:string;name?:string}){
  const key=`pulse-note-${code}`;const [v,setV]=useState('');
  useEffect(()=>{try{setV(localStorage.getItem(key)??'');}catch{setV('');}},[key]);
  const save=(t:string)=>{setV(t);try{if(t)localStorage.setItem(key,t);else localStorage.removeItem(key);}catch{/* 無法保存時只保留在本頁 */}};
  return <div className="ck-pad"><div className="ck-modebar"><b>{code} {name}</b><span className="ck-grow"/><span className="ck-mute">只存在這個瀏覽器（localStorage）</span></div>
    <textarea className="ck-note-area" value={v} onChange={e=>save(e.target.value)} placeholder="記下這檔的觀察：主力進出、成本區、停損價、等待的條件…" aria-label={`${code} 筆記`}/></div>;
}
