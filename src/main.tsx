import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {setStaticMode} from '@/lib/data-mode';
setStaticMode('./');
import BranchDesk from '@/app/branch-desk';
import StrategyDesk from '@/app/strategy-desk';
import PlanDesk from '@/app/plan-desk';
import {Activity,Users,Layers3,Crosshair} from 'lucide-react';

type Tab='strategy'|'plan'|'branch';

type Status={updatedAt:number;taipei:string;blocked:string[]};
const fmt=(t:number)=>new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
function Shell(){
  const init=():Tab=>{try{return location.hash==='#branch'?'branch':location.hash.startsWith('#plan')?'plan':'strategy';}catch{return 'strategy';}};
  const [tab,setTab]=useState<Tab>(init);
  const [status,setStatus]=useState<Status|null>(null);
  useEffect(()=>{fetch('./data/status.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(setStatus).catch(()=>setStatus(null));},[]);
  const go=(t:Tab)=>{setTab(t);try{history.replaceState(null,'',`#${t}`);}catch{/* 忽略 */}};
  return <main className="terminal">
    <header className="topbar"><a className="brand" href="./" aria-label="PULSE 首頁"><span className="brand-symbol"><Activity size={22}/></span><b>PULSE<span>脈動</span></b><small>量價研究終端</small></a>
      <div className="top-actions"><span className={`demo-badge ${status?'live':''}`}><span/>{status?`資料更新 ${fmt(status.updatedAt)}`:'資料尚未產生'}</span></div></header>
    <div className="workspace-nav pv-nav" role="tablist" aria-label="功能">
      <button role="tab" aria-selected={tab==='strategy'} className={tab==='strategy'?'active':''} onClick={()=>go('strategy')}><Layers3 size={16}/>策略工具</button>
      <button role="tab" aria-selected={tab==='plan'} className={tab==='plan'?'active':''} onClick={()=>go('plan')}><Crosshair size={16}/>交易計劃</button>
      <button role="tab" aria-selected={tab==='branch'} className={tab==='branch'?'active':''} onClick={()=>go('branch')}><Users size={16}/>分點籌碼</button>
      <span className="pv-note">公開資料由 GitHub Actions 每個交易日 15:40、21:30 更新；盤中即時行情不在此版。{status?.blocked?.length?`上次被拒：${status.blocked.join('、')}`:''}</span></div>
    {tab==='branch'?<BranchDesk/>:tab==='plan'?<PlanDesk/>:<StrategyDesk/>}
    <footer><span>PULSE / RESEARCH TERMINAL</span><span>資料來源：臺灣證券交易所、證券櫃檯買賣中心、臺灣期貨交易所公開資料。研究用途，非投資建議。</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Shell/>);
