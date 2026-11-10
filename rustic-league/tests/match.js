const S=require('../src/sim.js'); const {Bot}=require('../src/bot.js'); const {Sim,len}=S; const f=n=>n.toFixed(1);
const [l0,l1,mins]=[process.argv[2]||'normal',process.argv[3]||'normal',parseFloat(process.argv[4]||3)];
const sim=new Sim(); const b0=new Bot(sim,0,l0), b1=new Bot(sim,1,l1);
let accid=0, score=[0,0], t=0, kick=0, pads=0, hits=[0,0], flips=0, stuckMax=0, lastTouch=0;
sim.resetKickoff(0); b0.onKickoff(); b1.onKickoff(); let since=0, longest=0;
const t0=Date.now();
while(t<mins*60){ const dt=sim.dt; sim.step([b0.update(dt), b1.update(dt)]); t+=dt; since+=dt;
  for(const e of sim.events){ if(e.type==="padFire"){pads++; if(e.car===1 && !b1.plan) accid++;} if(e.type==='ballHit')hits[e.car]++; if(e.type==='rock')flips++; }
  sim.events.length=0;
  const g=sim.goalCheck(); if(g>=0){ score[g]++; longest=Math.max(longest,since); since=0; kick++; sim.resetKickoff(kick); b0.onKickoff(); b1.onKickoff(); }
  if(since>90){ console.log('stalled 90s, ball',f(sim.ball.pos.x),f(sim.ball.pos.y),f(sim.ball.pos.z),'cars',sim.cars.map(c=>[f(c.pos.x),f(c.pos.y),f(c.pos.z),b0.mode,b1.mode].join(',')).join(' | ')); since=0; kick++; sim.resetKickoff(kick); b0.onKickoff(); b1.onKickoff(); }
}
console.log(`${l0} vs ${l1}: ${score[0]}-${score[1]}  hits ${hits} pads ${pads} rocks ${flips} accidentalPads1 ${accid} longestNoGoal ${f(longest)}s  wall ${(Date.now()-t0)/1000}s`);
