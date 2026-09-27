'use client';
// 策略工具共用元件：格式、表單欄位、檢核列、迷你 K 線、權證試算器。
import {useState,type ReactNode} from 'react';
import {ShieldCheck} from 'lucide-react';
import {num} from '@/lib/market';
import type {DayStat} from '@/lib/branch';
import {bs,impliedVol,ma,type WType} from '@/lib/strategy';

export const px=(p:number|null|undefined,d?:number)=>p==null||!Number.isFinite(p)?'—':num(p,d??(p>=1000?0:p>=100?1:2));
export const pct=(x:number|null|undefined,d=1)=>x==null||!Number.isFinite(x)?'—':`${x>0?'+':''}${(x*100).toFixed(d)}%`;
export const pp=(x:number|null|undefined,d=1)=>x==null||!Number.isFinite(x)?'—':`${(x*100).toFixed(d)}%`;
export const amt=(n:number)=>{const a=Math.abs(n),s=n<0?'−':'';return a>=1e8?`${s}${(a/1e8).toFixed(2)} 億`:a>=1e4?`${s}${num(Math.round(a/1e4))} 萬`:`${s}${num(Math.round(a))}`;};
export const tone=(n:number|null|undefined)=>n==null||n===0?'':n>0?'up':'down';
export const md=(d:string)=>d.slice(5).replace('-','/');
export const lot=(s:number)=>Math.round(s/1000);
export const closeOf=(d:DayStat)=>d.close??d.mark;

export function Ok({ok,children}:{ok:boolean;children:ReactNode}){return <div className={`st-check ${ok?'ok':'no'}`}><span>{ok?'✓':'✕'}</span>{children}</div>;}
export function Num({label,value,onChange,step=1,suffix}:{label:string;value:number;onChange:(n:number)=>void;step?:number;suffix?:string}){return <label className="st-field"><span>{label}{suffix&&<small> {suffix}</small>}</span><input type="number" step={step} value={value} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))onChange(n);}}/></label>;}


export function MiniChart({days,disposed,notice,floor,ceil,signals,W=520,H=200}:{days:DayStat[];disposed?:boolean[];notice?:boolean[];floor?:(number|null)[];ceil?:(number|null)[];signals?:('floor'|'ceil'|null)[];W?:number;H?:number}){
  const n=Math.min(80,days.length),off=days.length-n,shown=days.slice(off);const L=6;
  const vals=[...shown.map(d=>d.high),...shown.map(d=>d.low),...(floor??[]).slice(off).filter((x):x is number=>x!=null),...(ceil??[]).slice(off).filter((x):x is number=>x!=null)];
  const hi=Math.max(...vals),lo=Math.min(...vals),pad=(hi-lo)*.06||1;const w=(W-50)/n;const x=(i:number)=>L+i*w+w/2;const y=(v:number)=>8+(hi+pad-v)/(hi-lo+2*pad)*(H-30);
  const path=(arr:(number|null)[])=>arr.map((v,i)=>v==null?'':`${arr[i-1]==null?'M':'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const m20=shown.map((_,i)=>ma(days,off+i,20));
  return <svg className="st-mini" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="近 80 日價格、月線與處置期間">
    {disposed&&shown.map((_,i)=>disposed[off+i]?<rect key={'d'+i} x={x(i)-w/2} y={4} width={w} height={H-26} fill="#e7b86c" opacity=".13"/>:null)}
    {notice&&shown.map((_,i)=>notice[off+i]?<rect key={'n'+i} x={x(i)-w/2} y={H-22} width={w} height={4} fill="#e7b86c"/>:null)}
    {floor&&<path d={path(floor.slice(off))} fill="none" stroke="var(--down)" strokeDasharray="4 3" strokeWidth="1.2"/>}{ceil&&<path d={path(ceil.slice(off))} fill="none" stroke="var(--up)" strokeDasharray="4 3" strokeWidth="1.2"/>}
    {shown.map((d,i)=>{const up=d.open==null||closeOf(d)>=d.open;const c=up?'var(--up)':'var(--down)';return <g key={d.date}><line x1={x(i)} x2={x(i)} y1={y(d.high)} y2={y(d.low)} stroke={c}/><rect x={x(i)-w*.3} width={Math.max(1,w*.6)} y={Math.min(y(d.open??closeOf(d)),y(closeOf(d)))} height={Math.max(1,Math.abs(y(d.open??closeOf(d))-y(closeOf(d))))} fill={c}/></g>;})}
    <path d={path(m20)} fill="none" stroke="#9d8cf0" strokeWidth="1.3"/>
    {signals&&shown.map((_,i)=>{const s=signals[off+i];return s?<text key={'s'+i} x={x(i)} y={s==='floor'?y(shown[i].low)+13:y(shown[i].high)-5} textAnchor="middle" fontSize="11" fill={s==='floor'?'#7fe0c4':'#f59aa3'}>{s==='floor'?'▲':'▼'}</text>:null;})}
    {[0,.5,1].map(p=>{const v=hi+pad-p*(hi-lo+2*pad);return <text key={p} x={W-40} y={y(v)+4} fontSize="10" fill="#758698">{px(v)}</text>;})}
    <text x={L} y={H-4} fontSize="10" fill="#758698">{md(shown[0].date)}</text><text x={W-50} y={H-4} fontSize="10" fill="#758698" textAnchor="end">{md(shown.at(-1)!.date)}</text>
    <text x={L+4} y={16} fontSize="10" fill="#9d8cf0">MA20</text>{disposed&&<text x={L+44} y={16} fontSize="10" fill="#e7b86c">■ 處置期間　▬ 注意</text>}
  </svg>;
}


export function Calculator({init}:{init?:{S:number;K:number;days:number;ratio:number;bid:number;ask:number;type:WType}}){
  const [v,setV]=useState(init??{S:100,K:105,days:120,ratio:0.1,bid:0.75,ask:0.76,type:'call' as WType});
  const set=(k:keyof typeof v)=>(n:number)=>setV(o=>({...o,[k]:n}));
  const T=v.days/365,ok=v.S>0&&v.K>0&&v.days>0&&v.ratio>0&&v.bid>0;
  const iv=ok?impliedVol(v.type,v.bid/v.ratio,v.S,v.K,T,0.015):null;const g=ok?bs(v.type,v.S,v.K,T,0.015,iv??0.4):null;
  return <div className="panel st-calc"><div className="panel-title"><h2><ShieldCheck size={16}/>單檔權證試算</h2><div className="bd-seg">{(['call','put'] as const).map(t=><button key={t} className={v.type===t?'active':''} onClick={()=>setV(o=>({...o,type:t}))}>{t==='call'?'認購':'認售'}</button>)}</div></div>
    <div className="st-form"><div className="two-inputs"><Num label="標的股價" value={v.S} onChange={set('S')} step={0.5}/><Num label="履約價" value={v.K} onChange={set('K')} step={0.5}/></div>
      <div className="two-inputs"><Num label="剩餘天數" value={v.days} onChange={set('days')}/><Num label="行使比例" value={v.ratio} onChange={set('ratio')} step={0.001}/></div>
      <div className="two-inputs"><Num label="委買價" value={v.bid} onChange={set('bid')} step={0.01}/><Num label="委賣價" value={v.ask} onChange={set('ask')} step={0.01}/></div>
      {g?<div className="st-out"><p><span>委買隱含波動率</span><b>{iv==null?'低於內含價值':pp(iv)}</b></p><p><span>價差比</span><b>{pp((v.ask-v.bid)/v.bid,2)}</b></p><p><span>Delta</span><b>{g.delta.toFixed(3)}</b></p>
        <p><span>實質槓桿</span><b>{(Math.abs(g.delta)*v.S*v.ratio/v.ask).toFixed(2)} 倍</b></p><p><span>每日時間價值耗損</span><b>{(g.theta*v.ratio).toFixed(4)} 元（{pct(g.theta*v.ratio/v.bid,2)}）</b></p>
        <p><span>溢價比（回本需漲跌）</span><b>{pp(v.type==='call'?(v.K+v.ask/v.ratio)/v.S-1:1-(v.K-v.ask/v.ratio)/v.S)}</b></p><p><span>標的漲 1 元，權證約</span><b>{(g.delta*v.ratio).toFixed(3)} 元</b></p></div>:<p className="live-helper">請輸入正數。</p>}
      <p className="tiny">點左表任一權證可帶入。週末前 Theta 會連算 3 天，小哥建議週五前先處理。</p></div></div>;
}

