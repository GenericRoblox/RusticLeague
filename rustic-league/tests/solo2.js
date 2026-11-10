const S=require('../src/sim.js'); const {Bot}=require('../src/bot.js'); const {Sim,V,len}=S; const f=n=>n.toFixed(1);
const lvl=process.argv[2]||'legend', N=+(process.argv[3]||24), verbose=process.argv[4];
let seed=7; const r=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
let tot=0, n=0, fails=0, rampT=0, stuckRamp=0; const times=[];
for(let k=0;k<N;k++){
 const sim=new Sim(); const b=new Bot(sim,0,lvl); b.mode='attack';
 sim.placeCar(sim.cars[1],V(-34,0,0),0); sim.cars[1].frozen=true;
 sim.placeCar(sim.cars[0],V((r()-0.5)*60,0,(r()-0.5)*120),r()*6.28);
 sim.ball.pos=V((r()-0.5)*66,1.6,(r()-0.5)*130); if(r()<0.3) sim.ball.vel=V((r()-0.5)*20,r()*14,(r()-0.5)*20);
 let t=0,g=-1, rs=0;
 while(t<40){ sim.step([b.update(sim.dt),{}]); t+=sim.dt; sim.events.length=0; const c=sim.cars[0];
   if(c.up().y<0.85 && c.groundedCount>=2){ rampT+=sim.dt; rs = len(c.vel)<3? rs+sim.dt:0; if(rs>2.5){stuckRamp++; rs=-99;} }
   g=sim.goalCheck(); if(g>=0) break; }
 if(g===0){tot+=t;n++;times.push(t);} else fails++;
 if(verbose) console.log(k, g===0?'GOAL':g===1?'OWN':'none', f(t));
}
times.sort((a,b)=>a-b);
console.log(lvl,'avg',f(tot/Math.max(n,1)),'median',f(times[times.length>>1]||0),'fails',fails,'/',N,'rampTime',f(rampT),'stuckOnRamp',stuckRamp);
