// lone bot vs (a) a ball bouncing through the air, (b) a ball up on a side ramp: time to first touch
const S=require('../src/sim.js'); const {Bot}=require('../src/bot.js'); const {Sim,V}=S; const f=n=>n.toFixed(1);
const lvl=process.argv[2]||'legend', kind=process.argv[3]||'air', N=+(process.argv[4]||40);
let seed=21; const r=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
const times=[]; let fails=0, upRamp=0;
for(let k=0;k<N;k++){
 const sim=new Sim({teamSize:1}); const b=new Bot(sim,0,lvl); b.mode='attack';
 sim.placeCar(sim.cars[1],V(-34,0,70),0); sim.cars[1].frozen=true;
 sim.placeCar(sim.cars[0],V((r()-0.5)*50,0,-40-r()*20),(r()-0.5)*1.5);
 if(kind==='air'){ sim.ball.pos=V((r()-0.5)*40,3+r()*5,(r()-0.5)*50); sim.ball.vel=V((r()-0.5)*16,6+r()*10,(r()-0.5)*16); }
 else { const sx=r()<0.5?-1:1; sim.ball.pos=V(sx*(S.A.HX-1.6),5+r()*3,(r()-0.5)*90); sim.ball.vel=V(0,0,(r()-0.5)*8); }
 let t=0, hit=false; while(t<15){ sim.step([b.update(sim.dt),{throttle:0,steer:0,handbrake:false}]); t+=sim.dt; for(const e of sim.events) if(e.type==='ballHit'&&e.car===0) hit=true; sim.events.length=0; if(hit) break; }
 if(hit){ times.push(t); } else { fails++; if(process.env.V) console.log('fail', k, 'ball', sim.ball.pos.x.toFixed(0), sim.ball.pos.y.toFixed(1), sim.ball.pos.z.toFixed(0), 'car', sim.cars[0].pos.x.toFixed(0), sim.cars[0].pos.z.toFixed(0), b.mode, b.dbg); }
 // after the touch: does the ball end up rolling up a wall within 2 s? (control)
 if(hit){ let up=false; for(let i=0;i<240;i++){ sim.step([b.update(sim.dt),{}]); if(sim.ball.pos.y>5 && S.wallDist(sim.ball.pos.x,sim.ball.pos.z)<4) up=true; } if(up) upRamp++; }
}
times.sort((a,b)=>a-b);
console.log(`${lvl} ${kind}: median ${f(times[times.length>>1]||0)}s  p75 ${f(times[Math.floor(times.length*0.75)]||0)}s  fails ${fails}/${N}  ball sent up a wall after touch ${upRamp}`);
