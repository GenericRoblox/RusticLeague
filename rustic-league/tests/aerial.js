const S=require('../src/sim.js'); const {Bot}=require('../src/bot.js'); const {Sim,V,len}=S;
let plans=0, fires=0, airHits=0, N=40; let seed=3; const r=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
for(let k=0;k<N;k++){
 const sim=new Sim(); const b=new Bot(sim,1,process.argv[2]||'hard'); b.mode='attack';
 sim.placeCar(sim.cars[0],V(-34,0,60),0); sim.cars[0].frozen=true;
 sim.placeCar(sim.cars[1],V((r()-0.5)*50,0,10+r()*40),Math.PI+(r()-0.5)*1.5);
 sim.ball.pos=V((r()-0.5)*40,2,(r()-0.5)*60); sim.ball.vel=V((r()-0.5)*10,14+r()*8,(r()-0.5)*14);
 let t=0, hadPlan=false, fired=false, hit=false;
 while(t<5){ sim.step([{},b.update(sim.dt)]); t+=sim.dt; if(b.plan) hadPlan=true;
  for(const e of sim.events){ if(e.type==='padFire'&&e.car===1&&hadPlan) fired=true; if(e.type==='ballHit'&&e.car===1&&sim.cars[1].groundedCount===0&&sim.ball.pos.y>3) hit=true; }
  sim.events.length=0; }
 plans+=hadPlan; fires+=fired; airHits+=hit;
}
console.log('plans',plans,'fires',fires,'airHits',airHits,'of',N);
