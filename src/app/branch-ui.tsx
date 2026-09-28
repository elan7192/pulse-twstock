'use client';
// 分點籌碼共用：數字格式與券商標籤。
import {num} from '@/lib/market';
import {KIND_LABEL,STYLE_LABEL,type Broker,type BrokerProfile} from '@/lib/branch';

// ---------- 格式 ----------
export const lot=(s:number)=>Math.round(s/1000);
export const fl=(s:number,sign=false)=>{const v=lot(s);return (sign&&v>0?'+':'')+num(v);};
export const px=(p:number|null|undefined)=>p==null||!Number.isFinite(p)?'—':num(p,p>=1000?0:p>=100?1:2);
export const pct=(x:number|null|undefined,d=1)=>x==null?'—':`${x>0?'+':''}${(x*100).toFixed(d)}%`;
export const amt=(n:number)=>{const a=Math.abs(n),s=n<0?'−':'';return a>=1e8?`${s}${(a/1e8).toFixed(2)} 億`:a>=1e4?`${s}${num(Math.round(a/1e4))} 萬`:`${s}${num(Math.round(a))}`;};
export const tone=(n:number|null|undefined)=>n==null||n===0?'':n>0?'up':'down';
export const md=(d:string)=>d.slice(5).replace('-','/');


export function BrokerTags({b,p}:{b?:Broker;p?:BrokerProfile}){
  if(!b)return null;
  return <>{b.kind!=='domestic'&&<i className={`bd-badge ${b.kind}`}>{KIND_LABEL[b.kind]}</i>}{p&&p.style!=='mixed'&&<i className={`bd-badge ${p.style}`}>{STYLE_LABEL[p.style]}</i>}</>;
}
