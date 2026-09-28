'use client';
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {Crosshair,SlidersHorizontal,Upload,Users,X,Layers3,Radio,Search,TriangleAlert} from 'lucide-react';
import {DATA_MODE} from '@/lib/data-mode';
import {DEMO_HQ,type County} from '@/lib/geo';
import {addCodes,addGroup,categories,DEFAULT_WATCH,deleteGroup,hotCombos,moveCode,parseCodes,removeCode,renameGroup,sanitizeWatch,type Watch} from '@/lib/watch';
import {
  anomalies,backtest,buildDataset,fillPrices,type SeriesBar,dateFromText,decodeBytes,demoShared,
  KIND_LABEL,parseBrokerCsv,profileBrokers,screenAt,STYLE_LABEL,
  type Broker,type Dataset,type RawDay,type ScreenRule,
} from '@/lib/branch';
import {num} from '@/lib/market';
import {amt,fl,md,pct,px,tone,BrokerTags} from './branch-ui';
import ChipView from './chip-desk';

const getDemo=demoShared;
type ImportState={files:{name:string;format:string;code:string;date:string;rows:number;warnings:string[]}[];raw:RawDay[];brokers:Broker[];names:Record<string,string>};
const STORE='pulse-branch-import-v1',WATCH='pulse-watch-v1',THEME='pulse-ck-theme-v1';
type View='stock'|'desk'|'screen'|'import';

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
  const [theme,setTheme]=useState<'light'|'dark'>('light'),[menu,setMenu]=useState(false);
  useEffect(()=>{try{const t=localStorage.getItem(THEME);if(t==='dark'||t==='light')setTheme(t);}catch{/* 預設淺色 */}},[]);
  const chooseTheme=(t:'light'|'dark')=>{setTheme(t);setMenu(false);try{localStorage.setItem(THEME,t);}catch{/* 只套用在本頁 */}};
  useEffect(()=>{if(!menu)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(false);};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[menu]);
  const nav:[View,string,ReactNode][]=[['stock','籌碼K線',<Crosshair key="a" size={15}/>],['desk','分點調查局',<Users key="b" size={15}/>],['screen','籌碼選股',<SlidersHorizontal key="c" size={15}/>],['import','匯入資料',<Upload key="d" size={15}/>]];
  const demo=ds.source==='synthetic';
  return <section className={`ck ${theme}`} aria-label="分點籌碼">
    <div className="ck-bar"><div className="ck-tabs" role="tablist" aria-label="分點功能">{nav.map(([v,l,i])=><button key={v} role="tab" aria-selected={view===v} className={view===v?'active':''} onClick={()=>setView(v)}>{i}{l}</button>)}</div>
      <div className="ck-bar-r"><span className={`ck-src ${demo?'demo':'live'}`} role="status" title={demo?'虛構券商、固定亂數；證交所買賣日報表需人工輸入驗證碼下載，匯入 CSV 後即為真實分點':`${ds.stocks.length} 檔、${ds.dates.length} 個交易日（${ds.dates[0]} ~ ${ds.dates.at(-1)}）`}>{demo?'示範資料':'已匯入分點'}</span>
        {demo?<button className="ck-bar-btn" onClick={()=>setView('import')}>匯入真實資料</button>:<button className="ck-bar-btn" onClick={()=>setUseImport(false)}>切回示範</button>}
        <div className="ck-menu"><button className="ck-bar-btn" aria-haspopup="menu" aria-expanded={menu} onClick={()=>setMenu(m=>!m)}>設定 ▾</button>
          {menu&&<><div className="ck-menu-bg" onClick={()=>setMenu(false)}/><div className="ck-pop" role="menu"><button role="menuitemradio" aria-checked={theme==='light'} onClick={()=>chooseTheme('light')}>{theme==='light'?'✓ ':'　'}淺色（籌碼K線風格）</button><button role="menuitemradio" aria-checked={theme==='dark'} onClick={()=>chooseTheme('dark')}>{theme==='dark'?'✓ ':'　'}深色</button>
            <hr/><button role="menuitem" onClick={()=>{setMenu(false);setEditing(true);}}>編輯自選股…</button><button role="menuitem" onClick={()=>{setMenu(false);setView('import');}}>匯入分點資料…</button></div></>}</div></div></div>
    {!ds.stocks.length?<p className="ck-empty ck-pad">目前沒有可用資料。</p>:
     view==='stock'?<ChipView ds={ds} code={cur} setCode={c=>{setCode(c);}} date={date} setDate={setDate} range={range} setRange={setRange} broker={broker} setBroker={setBroker} watch={watch} setWatch={setWatch} group={group} setGroup={setGroup} onEdit={()=>setEditing(true)} hq={demo?DEMO_HQ:{...DEMO_HQ,...hq}} geo={demo?{}:bgeo}/>:
     <div className="ck-legacy">{view==='desk'?<DeskView ds={ds} onOpen={open}/>:view==='screen'?<ScreenView ds={ds} onOpen={open}/>:
      <ImportView imported={imported} useImport={useImport} onChange={v=>{setImported(v);if(!v)setUseImport(false);}} onUse={()=>{setUseImport(true);setDate(null);setBroker(null);setView('stock');}} onDemo={()=>setUseImport(false)}/>}</div>}
    {editing&&<WatchEditor ds={ds} watch={watch} setWatch={setWatch} initial={group==='all'?watch.groups[0].id:group} onClose={()=>setEditing(false)}/>}
  </section>;
}


// ---------- 分點K線圖 ----------


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
  return <div className="bd-modal-bg" onClick={onClose}><div className="bd-modal" role="dialog" aria-modal="true" aria-label="編輯自選股" onClick={e=>e.stopPropagation()}>
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
