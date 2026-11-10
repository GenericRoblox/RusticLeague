// lone bot dribbles a ball from its own half to goal: time, touches, wall rides, per-touch direction error vs the goal
const S=require('../src/sim.js'); const {Bot}=require('../src/bot.js'); const {Sim,V,len}=S; const f=n=>n.toFixed(1);
const lvl=process.argv[2]||'legend', N=+(process.argv[3]||30), car=process.argv[4]||'coupe';
let seed=5; const r=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
const times=[]; let fails=0, touches=0, walls=0, errs=[], runs=0;
for(let k=0;k<N;k++){
 const sim=new Sim({teamSize:1, types:[car,'coupe']}); const b=new Bot(sim,0,lvl); b.mode='attack';
 sim.placeCar(sim.cars[1],V(-34,0,70),0); sim.cars[1].frozen=true;
 const bx=(r()-0.5)*50, bz=-60+r()*55; sim.ball.pos=V(bx,1.56,bz);
 sim.placeCar(sim.cars[0],V(bx+(r()-0.5)*20,0,bz-12-r()*10),(r()-0.5)*1.2);
 let t=0,g=-1, onWall=false; runs++;
 while(t<30){ sim.step([b.update(sim.dt),{}]); t+=sim.dt;
   for(const e of sim.events) if(e.type==='ballHit'&&e.car===0){ touches++; const bv=sim.ball.vel, gp=V(0,0,S.A.HZ), d=S.norm(S.V(gp.x-sim.ball.pos.x,0,gp.z-sim.ball.pos.z)), h=S.norm(S.V(bv.x,0,bv.z)); errs.push(Math.acos(Math.max(-1,Math.min(1,S.dot(d,h))))*57.3); }
   sim.events.length=0;
   const w = sim.ball.pos.y>4 && S.wallDist(sim.ball.pos.x,sim.ball.pos.z)<5; if(w&&!onWall) walls++; onWall=w;
   g=sim.goalCheck(); if(g>=0) break; }
 if(g===0) times.push(t); else { fails++; if(process.env.V) console.log('fail', k, 'ball', f(sim.ball.pos.x), f(sim.ball.pos.y), f(sim.ball.pos.z), 'wallDist', f(S.wallDist(sim.ball.pos.x,sim.ball.pos.z)), 'car', f(sim.cars[0].pos.x), f(sim.cars[0].pos.z), b.mode, b.dbg); }
}
times.sort((a,b)=>a-b); errs.sort((a,b)=>a-b);
console.log(`${lvl} ${car}: goals ${times.length}/${N} median ${f(times[times.length>>1]||0)}s | touches/run ${f(touches/runs)} | wall rides/run ${f(walls/runs)} | touch dir error median ${f(errs[errs.length>>1]||0)}° p75 ${f(errs[Math.floor(errs.length*.75)]||0)}°`);
