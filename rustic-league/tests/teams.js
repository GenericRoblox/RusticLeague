const S=require('../src/sim.js'); const {Bot,STYLES}=require('../src/bot.js'); const f=n=>n.toFixed(1);
const n=+(process.argv[2]||2), lvl=process.argv[3]||'hard', mins=+(process.argv[4]||5);
S.setArenaScale(S.teamScale(n));
const st0=['allrounder','defender','striker','playmaker'].slice(0,n), st1=['striker','defender','playmaker','allrounder'].slice(0,n);
const types=[...st0,...st1].map(k=>STYLES[k].car);
const sim=new S.Sim({teamSize:n, types}); const bots=sim.cars.map((c,i)=>new Bot(sim,i,lvl,(i<n?st0:st1)[i%n]));
let sc=[0,0],t=0,k=0,since=0,longest=0; const hits=sim.cars.map(()=>0), pads=sim.cars.map(()=>0); let maxStill=0; const still=sim.cars.map(()=>0);
sim.resetKickoff(0); bots.forEach(b=>b.onKickoff());
while(t<mins*60){ sim.step(bots.map(b=>b.update(sim.dt))); t+=sim.dt; since+=sim.dt;
 for(const e of sim.events){ if(e.type==='ballHit') hits[e.car]++; if(e.type==='padFire') pads[e.car]++; } sim.events.length=0;
 sim.cars.forEach((c,i)=>{ still[i] = (Math.hypot(c.vel.x,c.vel.z)<1 && bots[i].mode!=='support') ? still[i]+sim.dt : 0; maxStill=Math.max(maxStill,still[i]); if(still[i]>8 && still[i]<8.01) console.log('still',i,bots[i].mode,bots[i].dbg,f(c.pos.x),f(c.pos.y),f(c.pos.z),'up',f(c.up().y),'g',c.groundedCount,'ball',f(sim.ball.pos.x),f(sim.ball.pos.y),f(sim.ball.pos.z)); });
 const g=sim.goalCheck(); if(g>=0||since>90){ if(g>=0) sc[g]++; else console.log('stall'); longest=Math.max(longest,since); since=0; sim.resetKickoff(++k); bots.forEach(b=>b.onKickoff()); } }
console.log(`${n}v${n} ${lvl}: ${sc[0]}-${sc[1]} arena HX ${f(S.A.HX)} HZ ${f(S.A.HZ)} hits ${hits} pads ${pads} longestNoGoal ${f(longest)} maxStuck ${f(maxStill)}`);
