// time for a lone bot to first touch a ball sitting still somewhere in the arena
const S=require('../src/sim.js'); const {Bot}=require('../src/bot.js'); const {Sim,V,len}=S; const f=n=>n.toFixed(1);
const lvl=process.argv[2]||'legend', N=+(process.argv[3]||40), car=process.argv[4]||'coupe', verbose=process.argv[5];
let seed=11; const r=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
let tot=0, fails=0, slow=0; const times=[];
for(let k=0;k<N;k++){
 const sim=new Sim({teamSize:1, types:[car,'coupe']}); const b=new Bot(sim,0,lvl); b.mode='attack';
 sim.placeCar(sim.cars[1],V(-34,0,0),0); sim.cars[1].frozen=true;
 sim.placeCar(sim.cars[0],V((r()-0.5)*60,0,(r()-0.5)*130),r()*6.28);
 const wall = r()<0.25; sim.ball.pos = wall ? V((r()<0.5?-1:1)*(S.A.HX-3), 3, (r()-0.5)*110) : V((r()-0.5)*60,1.6,(r()-0.5)*130);
 for(let i=0;i<60;i++) sim.step([{},{}]); // let the ball settle
 sim.placeCar(sim.cars[0],sim.cars[0].pos,Math.atan2(sim.cars[0].forward().x,sim.cars[0].forward().z));
 let t=0, hit=false; while(t<20){ sim.step([b.update(sim.dt),{}]); t+=sim.dt; for(const e of sim.events) if(e.type==='ballHit'&&e.car===0) hit=true; sim.events.length=0; if(hit) break; }
 if(hit){ times.push(t); tot+=t; if(t>8) slow++; } else fails++;
 if(verbose) console.log(k, hit?f(t):'FAIL', 'ball', f(sim.ball.pos.x), f(sim.ball.pos.y), f(sim.ball.pos.z));
}
times.sort((a,b)=>a-b);
console.log(`${lvl} ${car}: median ${f(times[times.length>>1]||0)}s avg ${f(tot/Math.max(1,times.length))} slow(>8s) ${slow} fails(>20s) ${fails} / ${N}`);
