const S=require('../src/sim.js'); const {Bot}=require('../src/bot.js'); const {Sim,V,len}=S; const f=n=>n.toFixed(1);
const K=+process.argv[2]; let seed=21; const r=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
for(let k=0;k<=K;k++){ const sim=new Sim({teamSize:1}); const b=new Bot(sim,0,'legend'); b.mode='attack';
 sim.placeCar(sim.cars[1],V(-34,0,70),0); sim.cars[1].frozen=true; sim.placeCar(sim.cars[0],V((r()-0.5)*50,0,-40-r()*20),(r()-0.5)*1.5);
 sim.ball.pos=V((r()-0.5)*40,3+r()*5,(r()-0.5)*50); sim.ball.vel=V((r()-0.5)*16,6+r()*10,(r()-0.5)*16); if(k<K) continue;
 let t=0,nl=0; while(t<9){ const inp=b.update(sim.dt); sim.step([inp,{}]); t+=sim.dt; const c=sim.cars[0]; let hit=false; for(const e of sim.events) if(e.type==='ballHit'&&e.car===0) hit=true; sim.events.length=0;
  if(t>nl||hit){ nl+=0.4; console.log(`t=${f(t)} ${b.mode} car(${f(c.pos.x)},${f(c.pos.z)}) s=${f(c.speed())} tgt(${f(b.target.x)},${f(b.target.z)}) cap=${f(Math.min(b.speedCap||99,99))} arr=${f(b.arriveT||0)} thr=${f(inp.throttle)} hb=${inp.handbrake?1:0} ball(${f(sim.ball.pos.x)},${f(sim.ball.pos.y)},${f(sim.ball.pos.z)}) d=${f(len(S.sub(sim.ball.pos,c.pos)))}`);} if(hit){console.log('HIT');break;} } }
