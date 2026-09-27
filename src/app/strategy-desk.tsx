'use client';
import {useMemo,useState} from 'react';
import {Database,Layers3,Radio,ShieldCheck,SlidersHorizontal,TriangleAlert,TrendingUp,Users} from 'lucide-react';
import {num} from '@/lib/market';
import {px,pct,pp,amt,tone,md,lot,closeOf,Ok,Num,MiniChart,Calculator} from './strategy-ui';
import RealDesk from './real-desk';
import {DATA_MODE} from '@/lib/data-mode';
import FuturesView from './futures-view';
import {demoStockFutures} from '@/lib/futures';
import {demoShared,STYLE_LABEL,type Dataset,type Style} from '@/lib/branch';
import {
  bandBacktest,bands,bondValue,lifeInfo,STAGE_GUIDE,STAGE_RULE,type Stage,type StageRule,cbArbitrage,cbasScenario,cbasTrade,correlations,demoCBs,demoWarrants,DISPO_RULE,dispositionStats,dispositionTimeline,evalCB,evalWarrant,
  forecast,noticeAt,profilesMap,shortCover,threeCheck,WARRANT_RULE,warrantRadar,type CBEval,type DispoRule,type WType,
} from '@/lib/strategy';

type View='dispo'|'fut'|'radar'|'warrant'|'cb'|'band'|'short';

export default function StrategyDesk({allowReal=true}:{allowReal?:boolean}={}){
  const ds=demoShared();
  const [view,setView]=useState<View>('dispo'),[source,setSource]=useState<'demo'|'real'>(DATA_MODE.defaultReal?'real':'demo');
  const nav:[View,string][]=[['dispo','處置股'],['fut','個股期貨'],['radar','權證主力雷達'],['warrant','挑權證'],['cb','可轉債'],['band','地板天花板'],['short','融券回補']];
  return <section className="branch-desk strategy-desk">
    <div className="page-heading"><div><div className="eyebrow">STRATEGY TOOLKIT</div><h1>策略工具・處置／股期／權證／可轉債</h1></div>
      <div className="bd-nav" role="tablist" aria-label="策略工具">{nav.map(([v,l])=><button key={v} role="tab" aria-selected={view===v} className={view===v?'active':''} onClick={()=>setView(v)}>{l}</button>)}</div></div>
    <div className={`feed-status bd-source ${source==='real'?'imported':''}`} role="status"><Database size={17}/><b>{source==='demo'?'合成示範資料':'真實公開資料'}</b>
      <span>{source==='demo'?`${ds.stocks.length} 檔（含 6 檔虛構飆股 P101–P106）、虛構券商與發行商。規則與公式可用，數字不代表真實市場。`:DATA_MODE.kind==='static'?'證交所、櫃買中心、期交所公開資料，由 GitHub Actions 每個交易日 15:40 與 21:30 更新。':'證交所、櫃買中心公開資料，經本站共用快取與限流讀取；需登入。'}</span>
      <div className="bd-seg rd-switch" aria-label="資料來源"><button className={source==='demo'?'active':''} onClick={()=>setSource('demo')}>示範資料</button><button className={source==='real'?'active':''} disabled={!allowReal} title={allowReal?'':'線上預覽沒有伺服器，無法讀取真實資料'} onClick={()=>setSource('real')}>真實資料</button></div></div>
    {source==='real'?<RealDesk view={view}/>:view==='fut'?<FuturesView rows={demoStockFutures(ds)} source="demo"/>:view==='dispo'?<DispoView ds={ds}/>:view==='radar'?<RadarView ds={ds}/>:view==='warrant'?<WarrantView ds={ds}/>:view==='cb'?<CBView ds={ds}/>:view==='band'?<BandView ds={ds}/>:<ShortView ds={ds}/>}
  </section>;
}

// ================= 處置股 =================
function DispoView({ds}:{ds:Dataset}){
  const [rule,setRule]=useState<DispoRule>(DISPO_RULE);
  const rows=useMemo(()=>ds.stocks.map(code=>{const days=ds.days[code],tl=dispositionTimeline(code,days,rule),L=days.length-1;const ev=tl.disposed[L],last=tl.events.at(-1);
    const releasedToday=!!last&&last.end===L-1;const f=forecast(code,days,tl,rule);const chk=threeCheck(days,L);const hi=Math.max(...days.slice(-20).map(closeOf));
    return {code,name:ds.names[code],days,tl,ev,last,releasedToday,f,chk,cum:noticeAt(days,L,rule).cum,count:tl.events.length,pull:closeOf(days[L])/hi-1};}),[ds,rule]);
  const [sel,setSel]=useState<string>(()=>rows.find(r=>r.ev)?.code??rows[0].code);
  const cur=rows.find(r=>r.code===sel)??rows[0];
  const order=(r:typeof rows[number])=>r.ev?0:r.f.light==='red'?1:r.f.light==='amber'?2:r.releasedToday?3:r.f.light==='yellow'?4:5;
  const sorted=[...rows].sort((a,b)=>order(a)-order(b)||Math.abs(b.cum)-Math.abs(a.cum));
  const stats=useMemo(()=>dispositionStats(ds,rule),[ds,rule]);
  const done=stats.filter(s=>s.releaseRet!=null);
  const agg=(list:typeof done)=>({n:list.length,during:avg(list.map(s=>s.during)),gapUp:list.length?list.filter(s=>(s.releaseGap??0)>0).length/list.length:null,oc:avg(list.map(s=>s.releaseOC)),red:list.length?list.filter(s=>(s.releaseOC??0)>0).length/list.length:null,after5:avg(list.map(s=>s.after5))});
  const corr=useMemo(()=>correlations(ds,cur.code).slice(0,5),[ds,cur.code]);
  const counts={disposed:rows.filter(r=>r.ev).length,release:rows.filter(r=>r.releasedToday).length,red:rows.filter(r=>r.f.light==='red'||r.f.light==='amber').length,notice:rows.filter(r=>r.tl.notice.at(-1)).length};
  return <div className="st-body">
    <div className="st-kpis">{[['處置中',counts.disposed,'依公告規則推算'],['今日出關',counts.release,'出關日常開高走低'],['明日可能處置',counts.red,'紅＝必關，橘＝看收盤'],['今日列注意',counts.notice,'第一款：6 日累積漲跌']].map(([l,v,s])=><div key={l as string} className="panel"><span>{l}</span><b>{v}</b><small>{s}</small></div>)}</div>
    <div className="st-grid">
      <div className="panel"><div className="panel-title"><h2><Radio size={16}/>處置監控</h2><span className="muted small">燈號：紅 必關 · 橘 看收盤 · 黃 注意 · 綠 無</span></div>
        <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th></th><th>個股</th><th>狀態</th><th>6 日漲跌</th><th>明日觸發價</th><th>漲停 / 跌停</th><th>三條件</th><th>處置次數</th></tr></thead>
          <tbody>{sorted.map(r=><tr key={r.code} className={sel===r.code?'selected':''} onClick={()=>setSel(r.code)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setSel(r.code);}}>
            <td><i className={`st-light ${r.ev?'jail':r.f.light}`}/></td><td className="bd-name">{r.code} {r.name}</td>
            <td>{r.ev?<span className="amber-text">處置中・{r.ev.level===2?'第二次':'第一次'}・{md(r.ev.releaseDate)} 出關</span>:r.releasedToday?<span className="cyan">今日出關</span>:r.f.label}</td>
            <td className={tone(r.cum)}>{pct(r.cum)}</td><td>{r.f.upAt?`≥ ${px(r.f.upAt)}`:r.f.downAt?`≤ ${px(r.f.downAt)}`:'—'}</td><td className="muted">{px(r.f.limitUp)} / {px(r.f.limitDown)}</td>
            <td>{r.chk.pass?<i className="bd-badge swing">成立</i>:<span className="muted">{[r.chk.ma20Up,r.chk.mainOk,r.chk.concOk].filter(Boolean).length}/3</span>}</td><td>{r.count?`${r.count} 次`:'—'}</td></tr>)}</tbody></table></div>
        <p className="live-helper">觸發價＝明日收盤達此價時，6 日累積漲跌仍符合注意第一款；若已連續注意，達價即進入處置。「必關」＝即使跌停仍會觸發。只實作第一款（漲跌幅），其餘成交量、周轉率、本益比等七類門檻未納入。</p></div>
      <div className="st-side">
        <div className="panel"><div className="panel-title"><h2>{cur.code} {cur.name}</h2><span className="tag">{cur.ev?`處置中 ${cur.ev.startDate.slice(5)}–${cur.ev.endDate.slice(5)}`:cur.releasedToday?'今日出關':cur.f.label}</span></div>
          <MiniChart days={cur.days} disposed={cur.tl.disposed.map(Boolean)} notice={cur.tl.notice}/>
          <div className="st-checks"><h3 className="bd-sub">權證小哥處置股三條件</h3>
            <Ok ok={cur.chk.ma20Up}>月線向上（MA20 {px(cur.chk.ma20)}，高於 5 日前）</Ok>
            <Ok ok={cur.chk.mainOk}>主力未出貨（5 日主力買賣超 {num(lot(cur.chk.main5))} 張）</Ok>
            <Ok ok={cur.chk.concOk}>籌碼集中度為正（5 日 {pct(cur.chk.conc5)}／10 日 {pct(cur.chk.conc10)}）</Ok>
            <div className={`st-verdict ${cur.chk.pass?(cur.pull<=-0.05?'go':'wait'):'stop'}`}>{cur.chk.pass?(cur.pull<=-0.05?`回檔候選：自 20 日高點回落 ${pct(cur.pull)}`:`條件成立，等待回檔（目前距高點 ${pct(cur.pull)}）`):'條件未成立：不選主力正在出貨的標的'}</div>
            <p className="tiny">出關前常見接風行情；出關日易開高走低，已獲利約 10% 可在開高時先落袋。</p></div></div>
        <div className="panel"><div className="panel-title"><h2>雙刀連動股</h2><span className="tag">60 日報酬相關係數</span></div>
          <div className="bd-mini-list bd-pad">{corr.map(c=><button key={c.code} onClick={()=>setSel(c.code)}><span>{c.code} {ds.names[c.code]}</span><b className={c.corr>=0.5?'amber-text':''}>{c.corr.toFixed(2)}</b></button>)}</div>
          <p className="live-helper">相關係數高的股票可作為處置股的替代或對鎖標的；相關不代表未來同步。</p></div>
      </div>
    </div>
    <div className="st-grid">
      <div className="panel"><div className="panel-title"><h2>處置統計</h2><span className="muted small">本資料集全部處置事件</span></div>
        <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>分組</th><th>事件數</th><th>處置期間漲跌</th><th>出關日開高比例</th><th>出關日開收差</th><th>出關日紅K</th><th>出關後 5 日</th></tr></thead>
          <tbody>{([['全部',done],['三條件成立',done.filter(s=>s.check.pass)],['三條件未成立',done.filter(s=>!s.check.pass)],['第一次處置',done.filter(s=>s.event.level===1)],['第二次以上',done.filter(s=>s.event.level===2)]] as const).map(([l,list])=>{const a=agg([...list]);return <tr key={l}><td className="bd-name">{l}</td><td>{a.n}</td><td className={tone(a.during)}>{pct(a.during)}</td><td>{pp(a.gapUp,0)}</td><td className={tone(a.oc)}>{pct(a.oc)}</td><td>{pp(a.red,0)}</td><td className={tone(a.after5)}>{pct(a.after5)}</td></tr>;})}</tbody></table></div>
        <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>個股</th><th>處置期間</th><th>次別</th><th>原因</th><th>期間漲跌</th><th>出關開盤</th><th>出關開收差</th><th>三條件</th></tr></thead>
          <tbody>{stats.map(s=><tr key={s.event.code+s.event.startDate} onClick={()=>setSel(s.event.code)}><td className="bd-name">{s.event.code} {ds.names[s.event.code]}</td><td className="mono">{md(s.event.startDate)}–{md(s.event.endDate)}</td><td>{s.event.level===2?'第二次':'第一次'}</td><td className="muted">{s.event.reason}</td><td className={tone(s.during)}>{pct(s.during)}</td><td className={tone(s.releaseGap)}>{pct(s.releaseGap)}</td><td className={tone(s.releaseOC)}>{pct(s.releaseOC)}</td><td>{s.check.pass?'成立':'未成立'}</td></tr>)}</tbody></table></div>
        <p className="caution"><TriangleAlert size={14}/>2026/8/10 新制處置期縮為 5 個營業日；舊制資料的統計不宜直接套用，應分開計算。</p></div>
      <div className="panel"><div className="panel-title"><h2><SlidersHorizontal size={16}/>規則參數</h2><span className="tag">可調</span></div>
        <div className="st-form">
          <Num label="注意：6 日累積漲跌 >" suffix="%" value={+(rule.cumPct*100).toFixed(1)} onChange={n=>setRule(r=>({...r,cumPct:n/100}))} step={0.5}/>
          <div className="two-inputs"><Num label="或 漲跌 >" suffix="%" value={+(rule.altPct*100).toFixed(1)} onChange={n=>setRule(r=>({...r,altPct:n/100}))}/><Num label="且價差 ≥" suffix="元" value={rule.altDiff} onChange={n=>setRule(r=>({...r,altDiff:n}))}/></div>
          <div className="two-inputs"><Num label="連續注意" suffix="日" value={rule.streak} onChange={n=>setRule(r=>({...r,streak:Math.max(1,Math.round(n))}))}/><Num label="處置天數" suffix="營業日" value={rule.days} onChange={n=>setRule(r=>({...r,days:Math.max(1,Math.round(n))}))}/></div>
          <div className="bd-seg"><button className={rule.days===5?'active':''} onClick={()=>setRule(r=>({...r,days:5}))}>新制 5 日</button><button className={rule.days===10?'active':''} onClick={()=>setRule(r=>({...r,days:10}))}>舊制 10 日</button></div>
          <p className="tiny">新制（2026/8/10）：依 2026/9 證交所實際處置公告，第一次與第二次處置都約每 2 分鐘撮合；第一次為單筆 10 張或累計 30 張以上預收款券，第二次為所有委託全部預收。同時達當沖標準者處置 7 個營業日。另有「10 日內 6 次、30 日內 12 次」注意也會處置。</p>
        </div></div>
    </div>
  </div>;
}
const avg=(a:(number|null)[])=>{const v=a.filter((x):x is number=>x!=null);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null;};

// ================= 權證主力雷達 =================
function RadarView({ds}:{ds:Dataset}){
  const profiles=useMemo(()=>profilesMap(ds),[ds]);
  const [back,setBack]=useState(1),[onlySignal,setOnlySignal]=useState(false);
  const idx=ds.dates.length-1-back;const date=ds.dates[idx];
  const rows=useMemo(()=>warrantRadar(ds,idx,profiles),[ds,idx,profiles]);
  const list=onlySignal?rows.filter(r=>r.signal):rows;
  const byBroker=useMemo(()=>{const m=new Map<string,{code:string;total:number}[]>();for(const r of rows)if(r.top&&r.total>0){const a=m.get(r.top)??[];a.push({code:r.code,total:r.total*r.topShare});m.set(r.top,a);}return [...m.entries()].sort((a,b)=>b[1].reduce((s,x)=>s+x.total,0)-a[1].reduce((s,x)=>s+x.total,0)).slice(0,8);},[rows]);
  return <div className="st-body"><div className="st-grid">
    <div className="panel"><div className="panel-title"><h2><Radio size={16}/>主力收購權證評估</h2>
      <div className="bd-row"><label className="bd-check st-inline"><input type="checkbox" checked={onlySignal} onChange={e=>setOnlySignal(e.target.checked)}/>只看主力信號</label>
        <div className="bd-seg">{[0,1,2,3,5].map(b=><button key={b} className={back===b?'active':''} onClick={()=>setBack(b)}>{b===0?'最新':`前 ${b} 日`}</button>)}</div></div></div>
      <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>個股</th><th>權證淨買超</th><th>最大買超分點</th><th>佔比</th><th>手法</th><th>自營賣出比</th><th>信號</th><th>次日該分點現股</th></tr></thead>
        <tbody>{list.map(r=><tr key={r.code} className={r.signal?'pass':''}><td className="bd-name">{r.code} {r.name}</td><td>{amt(r.total)}</td><td className="bd-name">{r.top?ds.brokers.get(r.top)?.name??r.top:'—'}</td><td className={r.topShare>=0.8?'amber-text':''}>{pp(r.topShare,0)}</td>
          <td>{r.style==='mixed'||r.style==='—'?<span className="muted">一般</span>:<i className={`bd-badge ${r.style}`}>{STYLE_LABEL[r.style as Style]}</i>}</td><td>{pp(r.issuerShare,0)}</td><td>{r.signal?<i className="bd-badge flip">主力</i>:''}</td>
          <td className={tone(r.nextSell)}>{r.nextSell==null?'尚無次日':`${r.nextSell>0?'+':''}${num(lot(r.nextSell))} 張`}</td></tr>)}</tbody></table></div>
      <p className="live-helper">資料日 {date}。信號：單一分點佔權證淨買超 ≥ 80%，且發行商自營賣出比 ≥ 15%。「次日現股」為負，代表該分點隔天在現股賣超，符合隔日沖出場模式。</p></div>
    <div className="st-side">
      <div className="panel"><div className="panel-title"><h2><Users size={16}/>從分點探索權證標的</h2><span className="tag">當日</span></div>
        <div className="bd-mini-list bd-pad">{byBroker.map(([b,list])=><div key={b} className="st-broker"><b>{ds.brokers.get(b)?.name??b}{profiles.get(b)&&profiles.get(b)!.style!=='mixed'&&<i className={`bd-badge ${profiles.get(b)!.style}`}>{STYLE_LABEL[profiles.get(b)!.style]}</i>}</b><span>{list.map(x=>`${x.code} ${ds.names[x.code]} ${amt(x.total)}`).join('、')}</span></div>)}</div></div>
      <div className="panel"><div className="panel-title"><h2>三步驟</h2></div><ol className="st-steps">
        <li><b>找標的：</b>今日權證買超、自營比高（≥ 15%）、排除大型權值股。</li>
        <li><b>看分點：</b>單一一般分點佔買超金額 ≥ 80%，賣方為發行商自營部。</li>
        <li><b>判手法：</b>看該分點過去習慣。隔日沖型通常隔天權證與現股同步賣出，避免隔天高點追價。</li></ol>
        <p className="caution"><TriangleAlert size={14}/>權證分點資料需另行取得；本頁為合成示範。</p></div>
    </div></div></div>;
}

// ================= 挑權證 =================
function WarrantView({ds}:{ds:Dataset}){
  const [code,setCode]=useState('all'),[type,setType]=useState<'all'|WType>('call'),[rule,setRule]=useState(WARRANT_RULE),[hideFlag,setHideFlag]=useState(false);
  const all=useMemo(()=>demoWarrants(ds),[ds]);
  const evals=useMemo(()=>all.map(w=>evalWarrant(w,closeOf(ds.days[w.code].at(-1)!),0.015,rule)),[all,ds,rule]);
  const list=evals.filter(w=>(code==='all'||w.code===code)&&(type==='all'||w.type===type)&&(!hideFlag||!w.flags.length)).sort((a,b)=>b.score-a.score).slice(0,60);
  const [pick,setPick]=useState<string|null>(null);const cur=evals.find(w=>w.id===pick);
  return <div className="st-body"><div className="st-grid wide-side">
    <div className="panel"><div className="panel-title"><h2><SlidersHorizontal size={16}/>挑選權證</h2>
      <div className="bd-row"><select className="st-select" value={code} onChange={e=>setCode(e.target.value)} aria-label="標的"><option value="all">全部標的</option>{ds.stocks.map(c=><option key={c} value={c}>{c} {ds.names[c]}</option>)}</select>
        <div className="bd-seg">{(['call','put','all'] as const).map(t=><button key={t} className={type===t?'active':''} onClick={()=>setType(t)}>{t==='call'?'認購':t==='put'?'認售':'全部'}</button>)}</div>
        <label className="bd-check st-inline"><input type="checkbox" checked={hideFlag} onChange={e=>setHideFlag(e.target.checked)}/>隱藏有警示</label></div></div>
      <div className="st-rules"><Num label="剩餘天數 ≥" value={rule.minDays} onChange={n=>setRule(r=>({...r,minDays:n}))}/><Num label="價差比 ≤" suffix="%" value={+(rule.maxSpread*100).toFixed(1)} step={0.5} onChange={n=>setRule(r=>({...r,maxSpread:n/100}))}/><Num label="價外 ≤" suffix="%" value={+(rule.maxOtm*100).toFixed(0)} onChange={n=>setRule(r=>({...r,maxOtm:n/100}))}/><Num label="實質槓桿 ≥" value={rule.minLeverage} step={0.5} onChange={n=>setRule(r=>({...r,minLeverage:n}))}/></div>
      <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>權證</th><th>發行商</th><th>履約價</th><th>天數</th><th>買 / 賣</th><th>價差比</th><th>委買隱波</th><th>隱波 10 日</th><th>Delta</th><th>實質槓桿</th><th>Theta/日</th><th>溢價比</th><th>價內外</th><th>分數</th><th>警示</th></tr></thead>
        <tbody>{list.map(w=><tr key={w.id} className={pick===w.id?'selected':''} onClick={()=>setPick(w.id)}><td className="bd-name">{w.name}</td><td className="muted">{w.issuer}</td><td>{px(w.K)}</td><td>{w.daysLeft}</td><td>{w.bid.toFixed(2)} / {w.ask.toFixed(2)}</td>
          <td className={w.spread>rule.maxSpread?'down':''}>{pp(w.spread,2)}</td><td>{pp(w.biv)}</td><td className={(w.bivTrend??0)<-0.03?'down':''}>{w.bivTrend==null?'—':`${w.bivTrend>0?'+':''}${(w.bivTrend*100).toFixed(1)}`}</td><td>{w.delta.toFixed(2)}</td><td>{w.leverage.toFixed(1)}</td><td>{pct(w.thetaPct,2)}</td><td>{pp(w.premium)}</td><td className={tone(w.moneyness)}>{pct(w.moneyness)}</td><td><b>{w.score.toFixed(0)}</b></td><td className="amber-text">{w.flags.join('、')}</td></tr>)}</tbody></table></div>
      <p className="live-helper">分數依 6 原則加權：價差比低、委買隱波低且穩定（10 日標準差、是否被調降）、實質槓桿大、Theta 耗損小、溢價比低、天數足夠。隱波為 Black-Scholes 由委買價反推，利率 1.5%，未計股利。</p></div>
    <Calculator key={cur?.id??'none'} init={cur?{S:cur.S,K:cur.K,days:cur.daysLeft,ratio:cur.ratio,bid:cur.bid,ask:cur.ask,type:cur.type}:undefined}/>
  </div></div>;
}
// ================= 可轉債（投資少數派式列表・鄭大選債・CBAS 拆解・套利） =================
type CBTab='life'|'list'|'zheng'|'cbas'|'arb';
type CBFilter='all'|'new'|'due'|'par'|'lowprem'|'cbas'|'ytp'|'low'|'year1';
const FILTERS:[CBFilter,string,(e:CBEval)=>boolean,(a:CBEval,b:CBEval)=>number][]=[
  ['all','按代號',()=>true,(a,b)=>a.id.localeCompare(b.id)],
  ['new','近期發行',e=>e.ageMonths<=3,(a,b)=>a.ageMonths-b.ageMonths],
  ['year1','發行約一年',e=>e.zheng.oneYear,(a,b)=>a.ageMonths-b.ageMonths],
  ['due','一年內到期／賣回',e=>e.years<=1,(a,b)=>a.years-b.years],
  ['par','轉換價值近百元',e=>e.convValue>=95&&e.convValue<=105,(a,b)=>Math.abs(a.convValue-100)-Math.abs(b.convValue-100)],
  ['lowprem','低轉換溢價',()=>true,(a,b)=>a.premium-b.premium],
  ['cbas','CBAS 權利金',e=>e.cbasPerLot>0,(a,b)=>a.cbasPerLot-b.cbasPerLot],
  ['ytp','高賣回報酬率',e=>e.ytp!=null,(a,b)=>(b.ytp??-1)-(a.ytp??-1)],
  ['low','低收盤價',()=>true,(a,b)=>a.price-b.price],
];
function CBView({ds}:{ds:Dataset}){
  const [tab,setTab]=useState<CBTab>('life'),[filter,setFilter]=useState<CBFilter>('all'),[rate,setRate]=useState(2.5),[rule,setRule]=useState<StageRule>(STAGE_RULE);
  const list=useMemo(()=>demoCBs(ds).map(cb=>{const days=ds.days[cb.code];const main5=days.slice(-5).reduce((s,d)=>s+d.mainNet,0);return evalCB(cb,rate/100,0.004,main5,rule);}),[ds,rate,rule]);
  const [pick,setPick]=useState<string|null>(null);
  const f=FILTERS.find(x=>x[0]===filter)!;
  const shown=tab==='zheng'?[...list].sort((a,b)=>Number(b.zheng.pass)-Number(a.zheng.pass)||b.vol/b.vol5-a.vol/a.vol5):tab==='arb'?[...list].sort((a,b)=>b.arbitrage-a.arbitrage):list.filter(f[2]).sort(f[3]);
  const cur=list.find(e=>e.id===pick)??shown[0]??list[0];
  const tabs:[CBTab,string][]=[['life','生命週期'],['list','可轉債列表'],['zheng','鄭大選債'],['cbas','CBAS 拆解'],['arb','靜態套利']];
  return <div className="st-body">
    <div className="bd-tabs st-subtabs">{tabs.map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}<span className="st-rate"><Num label="資產交換利率（折現）" suffix="%" value={rate} step={0.25} onChange={n=>setRate(Math.min(10,Math.max(0,n)))}/></span></div>
    {tab==='life'?<LifeView list={list} rule={rule} setRule={setRule} cur={cur} onPick={setPick} rate={rate/100}/>:tab==='cbas'?<CbasLab cur={cur} list={list} rate={rate/100} onPick={setPick}/>:
    <div className="st-grid">
      <div className="panel"><div className="panel-title"><h2><Layers3 size={16}/>{tab==='zheng'?'鄭大三步驟・主力動向':tab==='arb'?'靜態套利排行':'可轉債列表'}</h2><span className="tag">{shown.length} 檔</span></div>
        {tab==='list'&&<div className="bd-tabs">{FILTERS.map(([k,l])=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{l}</button>)}</div>}
        {tab==='zheng'&&<div className="st-legend st-pad"><span><b>步驟一：</b>CB 105–120 元、週量 &gt; 300 張、今日量 &gt; 前 5 日均量</span><span><b>步驟二：</b>找未來 1–2 季題材（自行研究）</span><span><b>步驟三：</b>150 元以上老年期；量暴增、轉換比例上升、溢價收斂時分批出場</span></div>}
        <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>代碼 / 名稱</th><th>CB 收盤</th><th>漲跌</th><th>轉換價值</th><th>轉換溢價率</th><th>股價</th><th>轉換價</th><th>已轉換</th>
          {tab==='zheng'?<><th>今日量</th><th>5 日均量</th><th>週量</th><th>階段</th><th>步驟一</th><th>出場訊號</th></>:tab==='arb'?<><th>套利空間</th><th>主力 5 日</th></>:<><th>{filter==='ytp'?'賣回報酬率':'CBAS 權利金/張'}</th><th>槓桿</th><th>{filter==='new'||filter==='year1'?'發行月數':'到期／賣回'}</th></>}</tr></thead>
          <tbody>{shown.map(e=>{const exits=[e.zheng.volSpike&&'量暴增',e.zheng.convRise&&'轉換增加',e.zheng.converge&&'溢價收斂',e.zheng.old&&'老年期'].filter(Boolean);
            return <tr key={e.id} className={`${cur.id===e.id?'selected':''} ${tab==='zheng'&&e.zheng.pass?'pass':''}`} onClick={()=>setPick(e.id)}>
            <td className="bd-name">{e.id} {e.name}{e.secured&&<i className="bd-badge gov">擔保</i>}{e.zheng.oneYear&&<i className="bd-badge swing">滿一年</i>}</td><td>{e.price.toFixed(2)}</td><td className={tone(e.change)}>{pct(e.change,2)}</td><td>{e.convValue.toFixed(2)}</td><td className={e.premium<0?'up':''}>{pct(e.premium)}</td><td>{px(e.S)}</td><td>{px(e.convPrice)}</td><td>{pp(e.history.at(-1)!.converted,1)}</td>
            {tab==='zheng'?<><td className={e.zheng.dayVol?'up':''}>{num(e.vol)}</td><td>{num(Math.round(e.vol5))}</td><td className={e.zheng.weekVol?'up':''}>{num(e.week)}</td><td><i className={`st-stage s${e.stage.charAt(0)}`}>{e.stage}</i></td><td>{e.zheng.pass?<i className="bd-badge flip">符合</i>:<span className="muted">{[e.zheng.band,e.zheng.weekVol,e.zheng.dayVol].filter(Boolean).length}/3</span>}</td><td className="amber-text">{exits.join('、')}</td></>
            :tab==='arb'?<><td className={e.arbitrage>0?'up':'muted'}>{pct(e.arbitrage,2)}</td><td className={tone(e.main5)}>{num(lot(e.main5))}</td></>
            :<><td>{filter==='ytp'?pct(e.ytp,2):num(Math.round(e.cbasPerLot))}</td><td>{Number.isFinite(e.leverage)?e.leverage.toFixed(1):'—'}</td><td className="muted">{filter==='new'||filter==='year1'?`${e.ageMonths.toFixed(0)} 個月`:`${(e.putDate&&e.putDate>e.history.at(-1)!.date?e.putDate:e.maturity)}${e.putDate&&e.putDate>e.history.at(-1)!.date?' 賣回':' 到期'}`}</td></>}</tr>;})}</tbody></table></div>
        <p className="live-helper">轉換價值＝100 × 股價 ÷ 轉換價；轉換溢價率＝CB 價 ÷ 轉換價值 − 1。賣回報酬率＝(賣回價 ÷ CB 價)^(1／年) − 1，買在賣回價以上為負。欄位與分類參考投資少數派；數字為合成示範。</p></div>
      <div className="st-side">{tab==='arb'?<ArbPanel cur={cur}/>:<CBDetail e={cur} rate={rate/100} rule={rule}/>}</div>
    </div>}
  </div>;
}
const STAGES:Stage[]=['幼年期','中年期','老年期'];
function LifeView({list,rule,setRule,cur,onPick,rate}:{list:CBEval[];rule:StageRule;setRule:(r:StageRule)=>void;cur:CBEval;onPick:(id:string)=>void;rate:number}){
  const infos=useMemo(()=>new Map(list.map(e=>[e.id,lifeInfo(e,rule)])),[list,rule]);
  const [only,setOnly]=useState<Stage|'moved'|null>(null);
  const rows=list.filter(e=>{const i=infos.get(e.id)!;return only==null||(only==='moved'?i.move!=null&&i.daysInStage<=5:i.stage===only);}).sort((a,b)=>b.price-a.price);
  const byStage=(st:Stage)=>list.filter(e=>infos.get(e.id)!.stage===st);
  const avgOf=(l:CBEval[],f:(e:CBEval)=>number)=>l.length?l.reduce((s,e)=>s+f(e),0)/l.length:null;
  const recent=list.filter(e=>{const i=infos.get(e.id)!;return i.move&&i.daysInStage<=5;});
  const ci=infos.get(cur.id)!;
  return <div className="st-body st-flush">
    <div className="st-kpis">{STAGES.map(st=>{const l=byStage(st);return <button key={st} className={`panel st-stagecard s${st.charAt(0)} ${only===st?'on':''}`} onClick={()=>setOnly(only===st?null:st)}>
      <span>{st}<small>{st==='幼年期'?`< ${rule.young}`:st==='中年期'?`${rule.young}–${rule.old}`:`≥ ${rule.old}`}</small></span><b>{l.length}</b>
      <small>平均溢價 {pct(avgOf(l,e=>e.premium))}・股性 {avgOf(l,e=>infos.get(e.id)!.elasticity)?.toFixed(2)??'—'}・距純債 {pct(avgOf(l,e=>infos.get(e.id)!.downside))}</small></button>;})}
      <button className={`panel st-stagecard moved ${only==='moved'?'on':''}`} onClick={()=>setOnly(only==='moved'?null:'moved')}><span>近 5 日換階段</span><b>{recent.length}</b><small>{recent.filter(e=>infos.get(e.id)!.stage==='老年期').length} 檔剛進入老年期（停利提醒）</small></button></div>
    <div className="st-grid">
      <div className="panel"><div className="panel-title"><h2><Layers3 size={16}/>生命週期地圖</h2><div className="bd-row st-rulebox"><Num label="幼年期上限" value={rule.young} onChange={n=>setRule({...rule,young:Math.min(n,rule.old-1)})}/><Num label="老年期下限" value={rule.old} onChange={n=>setRule({...rule,old:Math.max(n,rule.young+1)})}/><button className="text-button" onClick={()=>setRule(STAGE_RULE)}>重設 120／150</button></div></div>
        <LifeMap list={list} infos={infos} rule={rule} cur={cur.id} onPick={onPick}/>
        <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>可轉債</th><th>CB 價</th><th>階段</th><th>變化</th><th>進入日</th><th>已 N 日</th><th>溢價率</th><th>股性</th><th>跌到純債</th><th>CBAS 槓桿</th><th>近 60 日</th></tr></thead>
          <tbody>{rows.map(e=>{const i=infos.get(e.id)!;return <tr key={e.id} className={cur.id===e.id?'selected':''} onClick={()=>onPick(e.id)}>
            <td className="bd-name">{e.id} {e.name}</td><td>{e.price.toFixed(2)}</td><td><i className={`st-stage s${i.stage.charAt(0)}`}>{i.stage}</i></td>
            <td>{i.move==='up'?<span className="up">▲ 由{i.prevStage}</span>:i.move==='down'?<span className="down">▼ 由{i.prevStage}</span>:<span className="muted">—</span>}</td>
            <td className="mono muted">{i.move?md(i.since):'60 日前以前'}</td><td>{i.daysInStage}</td><td className={e.premium<0.03?'amber-text':''}>{pct(e.premium)}</td><td>{i.elasticity.toFixed(2)}</td><td className="down">{pct(i.downside)}</td><td>{Number.isFinite(e.leverage)?e.leverage.toFixed(1):'—'}</td>
            <td><Strip t={i.timeline}/></td></tr>;})}</tbody></table></div>
        <p className="live-helper">股性＝股價變動 1% 時 CB 約變動幾 %（轉換權 Delta × 股價 ÷ CB 價，波動率假設 40%）；接近 1 代表 CB 已跟股票同漲同跌。跌到純債＝CB 若跌回純債價值的跌幅，是理論上的下檔。階段門檻出自鄭大（120 以下幼年、約 130 中年、150 以上老年），可自行調整。</p></div>
      <div className="st-side">
        <div className="panel"><div className="panel-title"><h2>{cur.id} {cur.name}</h2><i className={`st-stage s${ci.stage.charAt(0)}`}>{ci.stage}</i></div>
          <div className="st-form"><Strip t={ci.timeline} big/><div className="st-out"><p><span>CB 價／轉換價值</span><b>{cur.price.toFixed(2)} ／ {cur.convValue.toFixed(2)}</b></p><p><span>進入{ci.stage}</span><b>{ci.move?`${ci.since}（${ci.daysInStage} 日）`:'60 日以上'}</b></p><p><span>股性（彈性）</span><b>{ci.elasticity.toFixed(2)}</b></p><p><span>跌到純債 {cur.bondValue.toFixed(2)}</span><b className="down">{pct(ci.downside)}</b></p><p><span>距下一階段</span><b>{ci.stage==='老年期'?'已是最後階段':`${pct((ci.stage==='幼年期'?rule.young:rule.old)/cur.price-1)}（${ci.stage==='幼年期'?rule.young:rule.old} 元）`}</b></p><p><span>CBAS 權利金／張・槓桿</span><b>{num(Math.round(cur.cbasPerLot))}・{Number.isFinite(cur.leverage)?cur.leverage.toFixed(1):'—'} 倍</b></p></div>
            <div className={`st-verdict ${ci.stage==='幼年期'?'go':ci.stage==='中年期'?'wait':'stop'}`}>{ci.action}</div></div></div>
        {STAGES.map(st=><div key={st} className={`panel st-guide s${st.charAt(0)}`}><div className="panel-title"><h2><i className={`st-stage s${st.charAt(0)}`}>{st}</i></h2><span className="muted small">{st==='幼年期'?`< ${rule.young} 元`:st==='中年期'?`${rule.young}–${rule.old} 元`:`≥ ${rule.old} 元`}</span></div>
          <p className="st-guide-p"><b>特性：</b>{STAGE_GUIDE[st].trait}</p><p className="st-guide-p"><b>操作：</b>{STAGE_GUIDE[st].action}</p></div>)}
        <p className="tiny st-pad">利率 {pp(rate,2)} 用於純債價值折現；可在上方調整。</p>
      </div></div></div>;
}
function Strip({t,big}:{t:Stage[];big?:boolean}){return <span className={`st-strip ${big?'big':''}`} aria-label="近 60 日階段變化">{t.map((x,i)=><i key={i} className={`s${x.charAt(0)}`}/>)}</span>;}
function LifeMap({list,infos,rule,cur,onPick}:{list:CBEval[];infos:Map<string,ReturnType<typeof lifeInfo>>;rule:StageRule;cur:string;onPick:(id:string)=>void}){
  const W=900,H=300,L=46,R=16,T=14,B=34;
  const maxP=Math.min(rule.old+70,Math.max(rule.old+30,...list.map(e=>e.price))+5),minP=Math.min(95,...list.map(e=>e.price))-2;
  const maxQ=Math.min(0.8,Math.max(0.2,...list.map(e=>e.premium)))+0.03,minQ=Math.min(-0.05,...list.map(e=>e.premium));
  const x=(p:number)=>L+(Math.min(p,maxP)-minP)/(maxP-minP)*(W-L-R),y=(q:number)=>T+(maxQ-Math.min(q,maxQ))/(maxQ-minQ)*(H-T-B);
  const col:Record<Stage,string>={幼年期:'#7fe0c4',中年期:'#f1c57e',老年期:'#f59aa3'};
  return <svg className="st-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="生命週期地圖：橫軸 CB 價，縱軸轉換溢價率">
    <rect x={x(minP)} y={T} width={x(rule.young)-x(minP)} height={H-T-B} fill="#7fe0c4" opacity=".05"/><rect x={x(rule.young)} y={T} width={x(rule.old)-x(rule.young)} height={H-T-B} fill="#f1c57e" opacity=".05"/><rect x={x(rule.old)} y={T} width={x(maxP)-x(rule.old)} height={H-T-B} fill="#f59aa3" opacity=".06"/>
    {[rule.young,rule.old].map(v=><line key={v} x1={x(v)} x2={x(v)} y1={T} y2={H-B} stroke="#3a4a58" strokeDasharray="4 4"/>)}
    <text x={x((minP+rule.young)/2)} y={T+14} textAnchor="middle" fontSize="12" fill="#7fe0c4">幼年期</text><text x={x((rule.young+rule.old)/2)} y={T+14} textAnchor="middle" fontSize="12" fill="#f1c57e">中年期</text><text x={x((rule.old+maxP)/2)} y={T+14} textAnchor="middle" fontSize="12" fill="#f59aa3">老年期・停利</text>
    <line x1={L} x2={W-R} y1={y(0)} y2={y(0)} stroke="#3a4a58"/><text x={L-6} y={y(0)+4} textAnchor="end" fontSize="10" fill="#758698">0%</text>
    {[0.2,0.4,0.6].filter(q=>q<maxQ).map(q=><g key={q}><line x1={L} x2={W-R} y1={y(q)} y2={y(q)} stroke="#1f2b37" strokeDasharray="3 5"/><text x={L-6} y={y(q)+4} textAnchor="end" fontSize="10" fill="#758698">{q*100}%</text></g>)}
    {[100,rule.young,rule.old,Math.round(maxP/10)*10].filter((v,i,a)=>a.indexOf(v)===i&&v>minP&&v<maxP).map(v=><text key={v} x={x(v)} y={H-B+16} textAnchor="middle" fontSize="10" fill="#758698">{v}</text>)}
    <text x={W-R} y={H-4} textAnchor="end" fontSize="10" fill="#758698">CB 價 →</text>{list.some(e=>e.price>maxP)&&<text x={W-R} y={T+30} textAnchor="end" fontSize="10.5" fill="#f59aa3">{list.filter(e=>e.price>maxP).length} 檔高於 {Math.round(maxP)} 元，畫在右緣</text>}<text x={4} y={T+4} fontSize="10" fill="#758698">溢價率</text>
    {list.map(e=>{const i=infos.get(e.id)!;const on=e.id===cur;return <g key={e.id} style={{cursor:'pointer'}} onClick={()=>onPick(e.id)}><circle cx={x(e.price)} cy={y(e.premium)} r={on?7:5} fill={col[i.stage]} opacity={on?1:.8} stroke={on?'#fff':i.move&&i.daysInStage<=5?'#fff':'none'} strokeWidth={on?2:1}/>{(on||i.move&&i.daysInStage<=5)&&<text x={x(e.price)+8} y={y(e.premium)-8} fontSize="10.5" fill={on?'#fff':'#b7c5d1'}>{e.name}{i.move&&i.daysInStage<=5?(i.move==='up'?' ▲':' ▼'):''}</text>}<title>{`${e.id} ${e.name}｜CB ${e.price.toFixed(2)}｜溢價 ${(e.premium*100).toFixed(1)}%｜${i.stage}`}</title></g>;})}
  </svg>;
}
function CBDetail({e,rate,rule=STAGE_RULE}:{e:CBEval;rate:number;rule?:StageRule}){
  const sc=cbasScenario(e,rate,[1,3,6],[110,120,130,150]);
  const h=e.history;const W=320,H=120;const vals=h.flatMap(d=>[d.price,100*d.S/e.convPrice]);const hi=Math.max(...vals),lo=Math.min(...vals,100),pad=(hi-lo)*.08||1;
  const x=(i:number)=>8+i*(W-40)/(h.length-1),y=(v:number)=>6+(hi+pad-v)/(hi-lo+2*pad)*(H-18);
  return <><div className="panel"><div className="panel-title"><h2>{e.id} {e.name}</h2><span><i className={`st-stage s${e.stage.charAt(0)}`}>{e.stage}</i></span></div>
    <svg className="st-mini" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="近 20 日 CB 價與轉換價值"><line x1="8" x2={W-32} y1={y(100)} y2={y(100)} stroke="#2a3846" strokeDasharray="3 4"/><text x={W-30} y={y(100)+4} fontSize="9" fill="#758698">100</text>
      <path d={h.map((d,i)=>`${i?'L':'M'}${x(i)} ${y(100*d.S/e.convPrice)}`).join(' ')} fill="none" stroke="#9d8cf0" strokeWidth="1.3"/><path d={h.map((d,i)=>`${i?'L':'M'}${x(i)} ${y(d.price)}`).join(' ')} fill="none" stroke="#e7b86c" strokeWidth="1.8"/>
      <text x="10" y="14" fontSize="9" fill="#e7b86c">CB 價</text><text x="46" y="14" fontSize="9" fill="#9d8cf0">轉換價值</text></svg>
    <div className="st-life"><span className={e.price<rule.young?'on':''}>幼年 &lt;{rule.young}</span><span className={e.price>=rule.young&&e.price<rule.old?'on':''}>中年 {rule.young}–{rule.old}</span><span className={e.price>=rule.old?'on':''}>老年 ≥{rule.old}・停利</span></div>
    <div className="st-out st-m"><p><span>純債價值（履約參考價）</span><b>{e.bondValue.toFixed(2)}</b></p><p><span>CBAS 百元報價</span><b>{e.quote.toFixed(2)}</b></p><p><span>權利金／張</span><b>{num(Math.round(e.cbasPerLot))} 元</b></p><p><span>槓桿（CB 價 ÷ 權利金）</span><b>{Number.isFinite(e.leverage)?e.leverage.toFixed(1):'—'} 倍</b></p>
      <p><span>剩餘年數（至{e.putDate&&e.putDate>e.history.at(-1)!.date?'賣回':'到期'}）</span><b>{e.years.toFixed(2)} 年 @ {e.exitPrice}</b></p><p><span>信評／擔保</span><b>{e.rating}{e.secured?'・有擔保':''}</b></p><p><span>發行</span><b>{e.issueDate}（{e.ageMonths.toFixed(0)} 個月）・{e.issuedAmt} 億</b></p></div>
    <div className="st-checks"><h3 className="bd-sub">鄭大檢核</h3><Ok ok={e.zheng.band}>CB 在 105–120 元（{e.price.toFixed(2)}）</Ok><Ok ok={e.zheng.weekVol}>週量 &gt; 300 張（{num(e.week)}）</Ok><Ok ok={e.zheng.dayVol}>今日量 &gt; 5 日均量（{num(e.vol)} ／ {num(Math.round(e.vol5))}）</Ok>
      <Ok ok={!(e.zheng.volSpike||e.zheng.convRise||e.zheng.converge||e.zheng.old)}>無出場訊號{[e.zheng.volSpike&&'量暴增',e.zheng.convRise&&'轉換比例上升',e.zheng.converge&&'溢價收斂',e.zheng.old&&'進入老年期'].filter(Boolean).map(s=>`・${s}`).join('')}</Ok></div></div>
    <div className="panel"><div className="panel-title"><h2>CBAS 情境報酬</h2><span className="tag">今日買進</span></div>
      <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>持有 ＼ CB 賣價</th>{[110,120,130,150].map(p=><th key={p}>{p}</th>)}</tr></thead>
        <tbody>{sc.map(r=><tr key={r.months}><td className="bd-name">{r.months} 個月<small className="muted">（參考 {r.ref.toFixed(1)}）</small></td>{r.rows.map((t,i)=><td key={i} className={tone(t.ret)}>{t.ret==null?'—':pct(t.ret,0)}</td>)}</tr>)}</tbody></table></div>
      <p className="live-helper">履約收回＝(CB 賣價 − 當時履約參考價) × 1000；參考價隨時間往賣回價靠近，所以同樣賣價，持有越久報酬越低。</p></div></>;
}
function ArbPanel({cur}:{cur:CBEval}){
  const [lots,setLots]=useState(50);const arb=cbArbitrage(cur,Math.max(1,Math.round(lots)));
  return <div className="panel"><div className="panel-title"><h2><TrendingUp size={16}/>靜態套利試算</h2><span className="tag">{cur.id}</span></div>
    <div className="st-form"><Num label="買進 CB" suffix="張（面額 10 萬）" value={lots} onChange={setLots}/>
      <div className="st-out"><p><span>套利空間（扣 0.4%）</span><b className={tone(cur.arbitrage)}>{pct(cur.arbitrage,2)}</b></p><p><span>可轉換股數</span><b>{num(arb.shares)} 股</b></p><p><span>需融券放空</span><b>{arb.shortLots} 張 + 零股 {arb.oddShares} 股</b></p><p><span>買 CB 成本</span><b>{amt(arb.buyCost)}</b></p><p><span>放空所得（扣費稅借券）</span><b>{amt(arb.shortProceeds)}</b></p><p><span>估計套利損益</span><b className={tone(arb.profit)}>{amt(arb.profit)}</b></p></div>
      <p className="tiny">零股無法融券，需轉換後在盤中零股賣出，有價格風險。轉換到撥券需數個營業日；融券可能遇停券、強制回補（股東會、除權息）。</p></div></div>;
}
const CASES=[{name:'台光電五（2023）',buy:106,quote:5.58,sell:126,ref:94.98,lots:50,expect:'報導：投入 57.9 萬、收回 155.1 萬、報酬 168%'},{name:'凡甲三',buy:108.5,quote:3.92,sell:130,ref:97.5,lots:1,expect:'文章：投入 12,420、收回 32,500、報酬 161.67%'}];
function CbasLab({cur,list,rate,onPick}:{cur:CBEval;list:CBEval[];rate:number;onPick:(id:string)=>void}){
  const [v,setV]=useState({buy:cur.price,quote:+cur.quote.toFixed(2),sell:Math.round(cur.price*1.2),ref:+bondValue(cur.exitPrice,Math.max(0,cur.years-0.25),rate).toFixed(2),lots:10});
  const t=cbasTrade(v.buy,v.quote,v.sell,v.ref,Math.max(1,Math.round(v.lots)));
  const set=(k:keyof typeof v)=>(n:number)=>setV(o=>({...o,[k]:n}));
  const bond=100-v.quote,opt=v.buy-bond;
  return <div className="st-grid">
    <div className="panel"><div className="panel-title"><h2><ShieldCheck size={16}/>CBAS 拆解計算機</h2><div className="bd-row">{CASES.map(c=><button key={c.name} className="button" onClick={()=>setV({buy:c.buy,quote:c.quote,sell:c.sell,ref:c.ref,lots:c.lots})}>範例：{c.name}</button>)}</div></div>
      <div className="st-split"><div className="st-bar-split" aria-label="CB 價拆成純債與選擇權"><i style={{flex:Math.max(1,bond)}}><b>債券端 {bond.toFixed(2)}</b><small>賣給固定收益投資人</small></i><i className="opt" style={{flex:Math.max(1,opt)}}><b>選擇權端 {opt.toFixed(2)}</b><small>CBAS 買方支付</small></i></div>
        <p className="tiny">CB 價 {v.buy.toFixed(2)} ＝ 純債價值 {bond.toFixed(2)}（100 − 百元報價）＋ 選擇權價值 {opt.toFixed(2)}。</p></div>
      <div className="st-form st-cols">
        <div><h3 className="bd-sub">買進</h3><Num label="CB 成交價" value={v.buy} step={0.05} onChange={set('buy')}/><Num label="權利金百元報價" value={v.quote} step={0.01} onChange={set('quote')}/><Num label="張數" value={v.lots} onChange={set('lots')}/></div>
        <div><h3 className="bd-sub">履約／賣出</h3><Num label="CB 賣出價" value={v.sell} step={0.05} onChange={set('sell')}/><Num label="履約參考價（當時純債價值）" value={v.ref} step={0.01} onChange={set('ref')}/></div>
        <div className="st-out"><p><span>權利金／張</span><b>{num(Math.round((v.buy-100+v.quote)*1000))} 元</b></p><p><span>總投入</span><b>{num(Math.round(t.invest))} 元</b></p><p><span>履約收回</span><b>{num(Math.round(t.back))} 元</b></p><p><span>損益</span><b className={tone(t.profit)}>{num(Math.round(t.profit))} 元</b></p><p><span>報酬率</span><b className={tone(t.ret)}>{pct(t.ret,2)}</b></p>
          <p><span>槓桿（CB 價 ÷ 權利金）</span><b>{(v.buy/(v.buy-100+v.quote)).toFixed(1)} 倍</b></p><p><span>損益兩平 CB 價</span><b>{(v.ref+(v.buy-100+v.quote)).toFixed(2)}</b></p></div></div>
      <p className="live-helper">公式：權利金／張 ＝ (CB 價 − 100 ＋ 百元報價) × 1000；履約收回／張 ＝ (CB 賣價 − 履約參考價) × 1000；損益兩平 ＝ 履約參考價 ＋ 權利金百元。兩個範例可用來核對公式與公開案例一致。實際報價、手續費與最短履約期限依券商規定。</p></div>
    <div className="st-side"><div className="panel"><div className="panel-title"><h2>估算百元報價</h2><span className="tag">依利率 {pp(rate,2)}</span></div>
      <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>CB</th><th>價格</th><th>百元報價</th><th>權利金/張</th></tr></thead>
        <tbody>{[...list].filter(e=>e.cbasPerLot>0).sort((a,b)=>a.cbasPerLot-b.cbasPerLot).map(e=><tr key={e.id} className={cur.id===e.id?'selected':''} onClick={()=>{onPick(e.id);setV(o=>({...o,buy:e.price,quote:+e.quote.toFixed(2),ref:+bondValue(e.exitPrice,Math.max(0,e.years-0.25),rate).toFixed(2)}));}}>
          <td className="bd-name">{e.id} {e.name}</td><td>{e.price.toFixed(2)}</td><td>{e.quote.toFixed(2)}</td><td>{num(Math.round(e.cbasPerLot))}</td></tr>)}</tbody></table></div>
      <p className="live-helper">百元報價 ≈ 100 − 賣回（或到期）價 ÷ (1 ＋ 利率)^年數。實際報價由券商依信用、天期與供需決定，本表僅供估算。點選可帶入計算機。</p></div></div>
  </div>;
}

// ================= 地板天花板 =================
function BandView({ds}:{ds:Dataset}){
  const [q,setQ]=useState(5),[mult,setMult]=useState(2);
  const all=useMemo(()=>Object.fromEntries(ds.stocks.map(c=>[c,bands(ds.days[c],q/100,120,mult)])),[ds,q,mult]);
  const recent=ds.stocks.flatMap(c=>all[c].slice(-5).map((b,i)=>({code:c,b,ago:4-i}))).filter(x=>x.b.signal).sort((a,b)=>a.ago-b.ago);
  const [sel,setSel]=useState<string>(()=>recent[0]?.code??ds.stocks[0]);
  const bt=useMemo(()=>bandBacktest(ds,q/100,mult),[ds,q,mult]);const b=all[sel];const last=b.at(-1)!;
  return <div className="st-body"><div className="st-grid">
    <div className="panel"><div className="panel-title"><h2>{sel} {ds.names[sel]} <span className="muted small">地板・天花板</span></h2><select className="st-select" value={sel} onChange={e=>setSel(e.target.value)} aria-label="個股">{ds.stocks.map(c=><option key={c} value={c}>{c} {ds.names[c]}</option>)}</select></div>
      <MiniChart W={1100} H={300} days={ds.days[sel]} floor={b.map(x=>x.floor)} ceil={b.map(x=>x.ceil)} signals={b.map(x=>x.signal)}/>
      <div className="bd-stats"><div><span>收盤</span><b>{px(last.close)}</b></div><div><span>MA20</span><b>{px(last.ma20)}</b></div><div><span>地板</span><b className="down">{px(last.floor)}</b></div><div><span>天花板</span><b className="up">{px(last.ceil)}</b></div><div><span>距地板</span><b>{last.floor?pct(last.close/last.floor-1):'—'}</b></div><div><span>量 / 20 日均量</span><b>{last.volRatio?.toFixed(2)??'—'} 倍</b></div></div>
      <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>持有</th><th>地板訊號次數</th><th>平均報酬</th><th>勝率</th><th>天花板（放空）次數</th><th>平均報酬</th><th>勝率</th></tr></thead>
        <tbody>{bt.map(r=><tr key={r.hold}><td>{r.hold} 日</td><td>{r.floor.n}</td><td className={tone(r.floor.avg)}>{pct(r.floor.avg,2)}</td><td>{pp(r.floor.win,0)}</td><td>{r.ceil.n}</td><td className={tone(r.ceil.avg)}>{pct(r.ceil.avg,2)}</td><td>{pp(r.ceil.win,0)}</td></tr>)}</tbody></table></div>
      <p className="live-helper">地板／天花板＝MA20 ×（1 ＋ 過去 120 日乖離率第 {q}／{100-q} 百分位）。訊號需量 ≥ 20 日均量 {mult} 倍；回測以次日開盤進場、第 N 日收盤出場，未計成本。天花板放空遇飆股會大虧，示範資料中的虛構飆股就是例子。</p></div>
    <div className="st-side">
      <div className="panel"><div className="panel-title"><h2><SlidersHorizontal size={16}/>參數</h2></div><div className="st-form"><div className="two-inputs"><Num label="分位數" suffix="%" value={q} onChange={n=>setQ(Math.min(25,Math.max(1,n)))}/><Num label="量倍數" value={mult} step={0.5} onChange={setMult}/></div></div></div>
      <div className="panel"><div className="panel-title"><h2><Radio size={16}/>近 5 日訊號</h2><span className="tag">{recent.length}</span></div>
        <div className="bd-mini-list bd-pad">{recent.map(x=><button key={x.code+x.b.date} onClick={()=>setSel(x.code)}><span>{md(x.b.date)} {x.code} {ds.names[x.code]}</span><b className={x.b.signal==='floor'?'down':'up'}>{x.b.signal==='floor'?'碰地板':'碰天花板'} · 量 {x.b.volRatio?.toFixed(1)} 倍</b></button>)}
          {!recent.length&&<p className="live-helper">近 5 日沒有訊號。</p>}</div></div>
      <div className="panel"><div className="panel-title"><h2>操作規則</h2></div><ol className="st-steps">
        <li>收盤小於或接近地板，且量達 20 日均量 2 倍以上，列入隔天觀察。</li><li>隔天盤中急殺時分批介入（資金分 10 份）。</li>
        <li>第三天開高走不動就出場；「有賺就要跑，沒賺還是得跑」。</li><li>若第三天再殺低爆量，可用第二份資金搶第二次反彈。</li>
        <li>標的限：有發行權證、本業有獲利、前期沒有非基本面飆漲。</li></ol></div>
    </div></div></div>;
}

// ================= 融券回補 =================
function ShortView({ds}:{ds:Dataset}){
  const rows=useMemo(()=>shortCover(ds),[ds]);const max=Math.max(...rows.map(r=>r.power),0.01);
  return <div className="st-body"><div className="st-grid">
    <div className="panel"><div className="panel-title"><h2><TrendingUp size={16}/>融券回補力道監控</h2><span className="tag">季節性：股東會、除權息前</span></div>
      <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>個股</th><th>融券餘額</th><th>融資餘額</th><th>券資比</th><th>5 日均量</th><th>回補力道</th><th></th><th>最後回補日</th><th>倒數</th><th>事件</th></tr></thead>
        <tbody>{rows.map(r=><tr key={r.code}><td className="bd-name">{r.code} {r.name}</td><td>{num(r.short)}</td><td>{num(r.margin)}</td><td className={r.ratio>=0.3?'amber-text':''}>{pp(r.ratio)}</td><td>{num(Math.round(r.avg5))}</td><td><b>{r.power.toFixed(2)}</b> 倍</td>
          <td className="st-bar"><i style={{width:`${r.power/max*100}%`}}/></td><td className="mono">{r.lastCover??'—'}</td><td className={r.daysLeft!=null&&r.daysLeft<=5?'up':''}>{r.daysLeft!=null?`${r.daysLeft} 日`:'—'}</td><td>{r.event??'—'}</td></tr>)}</tbody></table></div>
      <p className="live-helper">回補力道＝待回補融券張數 ÷ 近 5 日均量：數值越大，強制回補形成的買盤相對成交量越重。券資比＝融券 ÷ 融資。單位：張。</p></div>
    <div className="st-side"><div className="panel"><div className="panel-title"><h2>判讀</h2></div><ol className="st-steps">
      <li>股東會與除權息前，融券須在最後回補日前買回，形成「強迫買盤」。</li><li>力道 ≥ 1 倍代表待回補量已達一天均量，短線買盤支撐較明顯。</li>
      <li>越接近最後回補日，剩餘天數越少，每日平均需回補量越大。</li><li>停止融券賣出期間無新增空單；回補完成後支撐消失。</li></ol>
      <p className="caution"><TriangleAlert size={14}/>合成示範。實際資料可接證交所融資融券餘額與停券公告。</p></div></div>
  </div></div>;
}
