export type Scenario = 'buy' | 'sell' | 'trend';
export type Tick = { t: number; price: number; volume: number; side: 0 | 1 | -1 };
export type Bar = { t:number; open:number; high:number; low:number; close:number; volume:number; buy:number; sell:number; direction:number; streak:number; runVolume:number; signal: 'buy'|'sell'|null; peakCount:number; peakVolume:number; runHigh:number; runLow:number };
export const stocks = [
  {code:'2330',name:'台積電',base:1030,step:5,sector:'半導體',basis:5},
  {code:'2317',name:'鴻海',base:198,step:0.5,sector:'電子代工',basis:0.5},
  {code:'2454',name:'聯發科',base:1250,step:5,sector:'半導體',basis:-5},
  {code:'2382',name:'廣達',base:270,step:0.5,sector:'電腦週邊',basis:1},
  {code:'3231',name:'緯創',base:112,step:0.5,sector:'電子代工',basis:0.5},
  {code:'2603',name:'長榮',base:185,step:0.5,sector:'航運',basis:-0.5},
];
export function makeTicks(stock:typeof stocks[number],scenario:Scenario):Tick[] {
  const ticks:Tick[]=[]; const sign=scenario==='sell'?-1:1;
  for(let i=0;i<96;i++){
    const burst=i>=52&&i<=65; const after=i>65;
    const path = i<52 ? Math.round(i/10+Math.sin(i*.55)*1.4) : i<=65 ? 6+Math.min(5,Math.floor((i-52)/2)) : scenario==='trend' ? 11+Math.floor((i-65)/3) : 10-Math.min(5,Math.floor((i-66)/5));
    const direction = burst||scenario==='trend'&&after ? sign : after ? (i%5===0?sign:-sign) : (Math.floor(i/3)%2===0?1:-1);
    for(let j=0;j<8;j++){
      const offset=j===2?-1:j===5?1:0;
      ticks.push({t:34200+i*5+j*.55,price:j===0&&ticks.length?ticks.at(-1)!.price:stock.base+sign*path*stock.step+offset*stock.step,
        volume:burst?20+(i-52)*2+(j*7%13):3+((i*7+j*11)%14),side:j===7?0:j<6?direction as 1|-1:-direction as 1|-1});
    }
  }
  return ticks;
}
// Event-time 5 s buckets; unknown side counts in total volume only. Ties reset the run.
export function aggregate(ticks:Tick[],threshold=8,volumeThreshold=1200):Bar[]{
  const groups=new Map<number,Tick[]>();
  for(const tick of [...ticks].sort((a,b)=>a.t-b.t)){const key=Math.floor(tick.t/5)*5;const arr=groups.get(key)||[];arr.push(tick);groups.set(key,arr);}
  const result:Bar[]=[];let prev:Bar|undefined;
  for(const [t,g] of groups){
    const buy=g.filter(x=>x.side===1).reduce((s,x)=>s+x.volume,0),sell=g.filter(x=>x.side===-1).reduce((s,x)=>s+x.volume,0);
    const direction=Math.sign(buy-sell),volume=g.reduce((s,x)=>s+x.volume,0),high=Math.max(...g.map(x=>x.price)),low=Math.min(...g.map(x=>x.price));
    const continuous=prev&&t-prev.t===5;
    const same=continuous&&direction!==0&&direction===prev!.direction;
    const streak=direction===0?0:same?prev!.streak+direction:direction;
    const runVolume=direction===0?0:same?prev!.runVolume+volume:volume;
    let signal:Bar['signal']=null;
    if(continuous&&prev&&direction!==prev.direction&&Math.abs(prev.streak)>=threshold&&prev.runVolume>=volumeThreshold){
      if(prev.direction===1&&high<=prev.runHigh&&g.at(-1)!.price<prev.close) signal='buy';
      if(prev.direction===-1&&low>=prev.runLow&&g.at(-1)!.price>prev.close) signal='sell';
    }
    const bar:Bar={t,open:g[0].price,high,low,close:g.at(-1)!.price,volume,buy,sell,direction,streak,runVolume,signal,peakCount:signal?Math.abs(prev!.streak):Math.abs(streak),peakVolume:signal?prev!.runVolume:runVolume,runHigh:same?Math.max(prev!.runHigh,high):high,runLow:same?Math.min(prev!.runLow,low):low};
    result.push(bar);prev=bar;
  }return result;
}
export const clock=(t:number)=>new Date(t*1000).toISOString().slice(11,19);
export const num=(n:number,d=0)=>n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
