const S=require('../src/sim.js'); const {Sim,V,len}=S; const f=n=>n.toFixed(1);
for (const ty of ['coupe','van','buggy']) {
  // straight line accel & top speed
  let sim=new Sim({teamSize:1, types:[ty,'coupe']}); sim.ball.pos=V(30,1.6,40); sim.placeCar(sim.cars[1],V(-34,0,0),0); sim.cars[1].frozen=true;
  const c=sim.cars[0]; let t=0, t20=0; const rest=c.pos.y;
  for(let i=0;i<120;i++) sim.step([{},{}]);
  const restY=c.pos.y;
  let top=0; while(t<4.5){ sim.step([{throttle:1,steer:0},{}]); t+=sim.dt; top=Math.max(top,c.speed()); if(!t20 && c.speed()>20) t20=t; }
  // turning circle at 20 m/s
  sim=new Sim({teamSize:1, types:[ty,'coupe']}); sim.placeCar(sim.cars[1],V(-34,0,60),0); sim.cars[1].frozen=true; sim.ball.pos=V(30,1.6,60);
  const d=sim.cars[0]; sim.placeCar(d,V(0,0,-40),0); d.vel=V(0,0,18); let maxLat=0;
  for(let i=0;i<240;i++){ sim.step([{throttle:0.6,steer:1},{}]); maxLat=Math.max(maxLat,Math.abs(d.pos.x)); }
  // ball hit at 20 m/s
  sim=new Sim({teamSize:1, types:[ty,'coupe']}); sim.placeCar(sim.cars[1],V(-34,0,60),0); sim.cars[1].frozen=true;
  const e=sim.cars[0]; sim.placeCar(e,V(0,0,-15),0); e.vel=V(0,0,20); let bv=0;
  for(let i=0;i<180;i++){ sim.step([{throttle:0},{}]); bv=Math.max(bv,len(sim.ball.vel)); }
  console.log(`${ty}: 0-20 ${f(t20)}s top ${f(top)} rideY ${restY.toFixed(2)} turnDia ${f(maxLat)} ballSpeed@20 ${f(bv)} mass ${e.spec.mass}`);
}
