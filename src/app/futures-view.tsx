'use client';
// 個股期貨：行情、基差、保證金與追繳試算。示範與真實模式共用。
import {useMemo,useState} from 'react';
import {Search,ShieldCheck,TriangleAlert} from 'lucide-react';
import {num} from '@/lib/market';
import {tickSize} from '@/lib/branch';
import {LEVELS,type StockFutRow} from '@/lib/futures';
import {px,pct,pp,tone,Num} from './strategy-ui';

const money=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?'—':`${num(Math.round(n))}`;
const monthLabel=(m:string|null)=>m?(m.length>=6?`${m.slice(0,4)}/${m.slice(4,6)}${m.length>6?m.slice(6):''}`:m):'—';
/** 由級距基準比例推估目前是否因處置而調高（1.5／2／3 倍）。 */
export function marginMultiple(r:StockFutRow){const lv=LEVELS.find(l=>r.group.includes(l[0].slice(-1)));if(!lv||r.initialRate==null)return null;const m=r.initialRate/lv[3];return m>1.2?Math.round(m*2)/2:null;}

export default function FuturesView({rows,source,loading,note}:{rows:StockFutRow[];source:'demo'|'real';loading?:boolean;note?:string}){
 const [q,setQ]=useState(''),[sort,setSort]=useState<'volume'|'oi'|'basis'|'margin'>('volume'),[sel,setSel]=useState<string|null>(null),[smallOnly,setSmallOnly]=useState<'all'|'std'|'small'>('all');
 const list=useMemo(()=>rows.filter(r=>(!q||r.code.includes(q)||r.name.includes(q)||r.contract.includes(q.toUpperCase()))&&(smallOnly==='all'||(smallOnly==='small'?r.size===100:r.size!==100)))
  .sort((a,b)=>sort==='volume'?b.volume-a.volume:sort==='oi'?b.oi-a.oi:sort==='basis'?Math.abs(b.basisPct??0)-Math.abs(a.basisPct??0):(a.initial??Infinity)-(b.initial??Infinity)).slice(0,200),[rows,q,sort,smallOnly]);
 const cur=rows.find(r=>r.contract===sel)??list[0];
 return <div className="st-body"><div className="st-grid">
  <div className="panel"><div className="panel-title"><h2>個股期貨・保證金</h2>
   <div className="bd-row"><label className="bd-search st-inline"><Search size={14}/><input value={q} onChange={e=>setQ(e.target.value.trim())} placeholder="代號、名稱或契約" aria-label="搜尋股票期貨"/></label>
    <div className="bd-seg">{([['all','全部'],['std','一般 2,000 股'],['small','小型 100 股']] as const).map(([k,l])=><button key={k} className={smallOnly===k?'active':''} onClick={()=>setSmallOnly(k)}>{l}</button>)}</div>
    <div className="bd-seg">{([['volume','成交量'],['oi','未平倉'],['basis','基差'],['margin','保證金低']] as const).map(([k,l])=><button key={k} className={sort===k?'active':''} onClick={()=>setSort(k)}>{l}</button>)}</div></div></div>
   <div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>標的</th><th>契約</th><th>近月</th><th>結算／收盤</th><th>漲跌</th><th>現股收盤</th><th>基差</th><th>成交量</th><th>未平倉</th><th>規模</th><th>級距</th><th>原始保證金</th><th>維持保證金</th><th>槓桿</th></tr></thead>
    <tbody>{list.map(r=>{const mm=marginMultiple(r);return <tr key={r.contract} className={cur?.contract===r.contract?'selected':''} onClick={()=>setSel(r.contract)}>
     <td className="bd-name">{r.code} {r.name}</td><td className="mono">{r.contract}</td><td className="mono muted">{monthLabel(r.month)}</td><td>{px(r.price)}</td><td className={tone(r.change)}>{r.change!=null?`${r.change>0?'+':''}${px(r.change)}`:'—'}</td>
     <td>{px(r.stock)}</td><td className={tone(r.basis)}>{r.basis!=null?`${r.basis>0?'+':''}${px(r.basis)}（${pct(r.basisPct,2)}）`:'—'}</td><td>{num(r.volume)}</td><td>{num(r.oi)}</td><td>{num(r.size)}</td>
     <td>{r.group||'—'}{mm&&<i className="bd-badge daytrade" title="保證金高於級距基準，可能因標的處置調高">×{mm}</i>}</td><td>{money(r.initial)}<small className="muted"> {pp(r.initialRate,2)}</small></td><td>{money(r.maintenance)}<small className="muted"> {pp(r.maintRate,2)}</small></td><td>{r.leverage?.toFixed(1)??'—'} 倍</td></tr>;})}
     {!list.length&&<tr><td colSpan={14} className="muted">{loading?'讀取期交所資料中…':'沒有符合的股票期貨。'}</td></tr>}</tbody></table></div>
   <p className="live-helper">{source==='demo'?'示範資料：契約代碼、行情與未平倉為合成；保證金比例採期交所三級距（13.5%／16.2%／20.25%）。':'資料：期交所 DailyMarketReportFut（一般交易時段）、SingleStockFuturesMargining；現股收盤取自證交所、櫃買日成交。'}保證金（元／口）＝ 結算價 × 契約規模 × 比例；基差＝期貨 − 現股。{note}</p></div>
  <div className="st-side">{cur&&<MarginCalc key={`${cur.contract}:${cur.price??''}`} r={cur}/>}
   <div className="panel"><div className="panel-title"><h2>規則</h2></div><ol className="st-steps">
    <li>股票期貨一般 2,000 股、小型 100 股（ETF 期貨依契約規格）；調整型契約依期交所公告。</li>
    <li>級距 1／2／3：原始 13.5%／16.2%／20.25%，維持 10.35%／12.42%／15.53%，結算 10%／12%／15%。</li>
    <li>權益低於維持保證金即追繳，須補足到原始保證金。</li>
    <li>標的被處置時，期交所自處置生效次一營業日收盤後，將保證金調為原比例 1.5、2 或 3 倍。</li>
    <li>標的股票處置期間股期照常連續撮合，但保證金提高、流動性可能下降。</li></ol></div></div>
 </div></div>;
}

function MarginCalc({r}:{r:StockFutRow}){
 const [side,setSide]=useState<'long'|'short'>('long'),[lots,setLots]=useState(1),[entry,setEntry]=useState(r.price??0),[extra,setExtra]=useState(0);
 const size=r.size,init=(r.initialRate??0)*entry*size,maint=(r.maintRate??0)*entry*size;
 const equity=init*lots+extra;const cushion=equity/lots-maint;
 const call=entry&&size?(side==='long'?entry-cushion/size:entry+cushion/size):null;
 const tick=entry?tickSize(entry):0;
 return <div className="panel"><div className="panel-title"><h2><ShieldCheck size={16}/>{r.contract} {r.name}</h2><span className="tag">{monthLabel(r.month)}</span></div>
  <div className="st-form">
   {r.months.length>0&&<div className="bd-table-wrap"><table className="bd-table"><thead><tr><th>月份</th><th>結算</th><th>成交量</th><th>未平倉</th><th>買／賣</th></tr></thead><tbody>{r.months.map(m=><tr key={m.month}><td className="mono">{monthLabel(m.month)}</td><td>{px(m.settle??m.last)}</td><td>{num(m.volume??0)}</td><td>{num(m.oi??0)}</td><td className="muted">{px(m.bid)}／{px(m.ask)}</td></tr>)}</tbody></table></div>}
   <div className="bd-seg">{(['long','short'] as const).map(s=><button key={s} className={side===s?'active':''} onClick={()=>setSide(s)}>{s==='long'?'多單':'空單'}</button>)}</div>
   <div className="two-inputs"><Num label="口數" value={lots} onChange={n=>setLots(Math.max(1,Math.round(n)))}/><Num label="進場價" value={entry} step={tick||0.01} onChange={setEntry}/></div>
   <Num label="額外權益（元，原始保證金以外）" value={extra} step={1000} onChange={n=>setExtra(Math.max(0,n))}/>
   <div className="st-out"><p><span>契約價值</span><b>{money(entry*size*lots)} 元</b></p><p><span>原始保證金</span><b>{money(init*lots)} 元（{pp(r.initialRate,2)}）</b></p><p><span>維持保證金</span><b>{money(maint*lots)} 元（{pp(r.maintRate,2)}）</b></p>
    <p><span>追繳價位</span><b className="amber-text">{call!=null&&r.initialRate?px(call):'—'}（{call&&entry?pct(call/entry-1,2):'—'}）</b></p>
    <p><span>每跳損益</span><b>{tick?`${px(tick)} × ${num(size)} × ${lots} = ${money(tick*size*lots)} 元`:'—'}</b></p>
    <p><span>處置時保證金（×1.5／×2）</span><b>{money(init*lots*1.5)}／{money(init*lots*2)} 元</b></p>
    <p><span>與現股基差</span><b className={tone(r.basis)}>{r.basis!=null?`${r.basis>0?'+':''}${px(r.basis)}（${pct(r.basisPct,2)}）`:'—'}</b></p></div>
   <p className="tiny">追繳價＝權益（原始保證金＋額外權益）降到維持保證金時的期貨價格；不含手續費、期交稅（契約價值 × 十萬分之二）與跳空。</p>
   {r.initialRate&&r.initialRate>0.21&&<p className="caution"><TriangleAlert size={14}/>保證金比例高於級距 3 基準，可能因標的處置或特殊情況調高。</p>}
  </div></div>;
}
