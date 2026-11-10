const S=require('../src/sim.js'); const {Bot}=require('../src/bot.js'); const {Sim,V,len}=S; const f=n=>n.toFixed(1);
const K=+process.argv[2]; let seed=11; const r=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
for(let k=0;k<=K;k++){
 const sim=new Sim({teamSize:1, types:['coupe','coupe']}); const b=new Bot(sim,0,'legend'); b.mode='attack';
 sim.placeCar(sim.cars[1],V(-34,0,0),0); sim.cars[1].frozen=true;
 sim.placeCar(sim.cars[0],V((r()-0.5)*60,0,(r()-0.5)*130),r()*6.28);
 const wall = r()<0.25; sim.ball.pos = wall ? V((r()<0.5?-1:1)*(S.A.HX-3), 3, (r()-0.5)*110) : V((r()-0.5)*60,1.6,(r()-0.5)*130);
 for(let i=0;i<60;i++) sim.step([{},{}]);
 sim.placeCar(sim.cars[0],sim.cars[0].pos,Math.atan2(sim.cars[0].forward().x,sim.cars[0].forward().z));
 if(k<K) continue;
 let t=0,nl=0; while(t<14){ const inp=b.update(sim.dt); sim.step([inp,{}]); t+=sim.dt; const c=sim.cars[0]; let hit=false; for(const e of sim.events) if(e.type==='ballHit') hit=true; sim.events.length=0;
  if(t>nl||hit){nl+=0.5; console.log(`t=${f(t)} ${b.mode} car(${f(c.pos.x)},${f(c.pos.z)}) s=${f(c.speed())} y=${f(c.pos.y)} up=(${f(c.up().x)},${f(c.up().y)},${f(c.up().z)}) yaw=${f(S.dot(c.ang,c.up()))} sc=${f(c.steerCur)} in=${f(c.input.steer)} g=${c.groundedCount} tgt(${f(b.target.x)},${f(b.target.z)}) thr=${f(inp.throttle)} st=${f(inp.steer)} hb=${inp.handbrake?1:0} [${b.dbg}] ball(${f(sim.ball.pos.x)},${f(sim.ball.pos.z)}) d=${f(len(S.sub(sim.ball.pos,c.pos)))}`);} if(hit){console.log('HIT');break;} }
}
