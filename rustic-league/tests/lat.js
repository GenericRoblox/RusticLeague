const S=require('../src/sim.js'); const {Sim,V,len,dot}=S;
for (const ty of ['coupe','van','buggy']) for (const v0 of [10,18]) {
  const sim=new Sim({teamSize:1, types:[ty,'coupe']}); sim.placeCar(sim.cars[1],V(-34,0,60),0); sim.cars[1].frozen=true; sim.ball.pos=V(30,1.6,60);
  const d=sim.cars[0]; sim.placeCar(d,V(0,0,-30),0); d.vel=V(0,0,v0); let acc=0,n=0;
  for(let i=0;i<300;i++){ const sp=len(d.vel); const thr= sp<v0? 0.7:0; sim.step([{throttle:thr,steer:1},{}]); if(i>120){acc+=Math.abs(d.ang.y)*len(d.vel); n++;} }
  console.log(ty, v0, 'lat accel', (acc/n).toFixed(1), 'radius', (len(d.vel)/Math.abs(d.ang.y)).toFixed(1), 'up', d.up().y.toFixed(2));
}
