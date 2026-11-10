const S=require('../src/sim.js'); const {Sim,V,len,qmul,qaxis,qyaw}=S; const f=n=>n.toFixed(2);
for (const st of [1,-1,0]) for (const v0 of [8,14]) {
 const sim=new Sim({teamSize:1}); sim.placeCar(sim.cars[1],V(-34,0,60),0); sim.cars[1].frozen=true; sim.ball.pos=V(-20,1.6,60);
 const c=sim.cars[0]; // on the right-hand ramp, about 2.5 m up, heading -z, rolled 45 degrees onto the bank
 c.q=qmul(qaxis(V(0,0,1),Math.PI/4), qyaw(Math.PI)); c.pos=V(35.0,2.6,-30); c.vel=V(0,0,-v0); c.ang=V();
 for(let i=0;i<60;i++) sim.step([{throttle:0.6,steer:0},{}]);
 const y0=c.pos.y; let maxYaw=0;
 for(let i=0;i<180;i++){ sim.step([{throttle:0.6,steer:st},{}]); maxYaw=Math.max(maxYaw,Math.abs(S.dot(c.ang,c.up()))); }
 console.log(`steer ${st} v0 ${v0}: after 1.5s pos x ${f(c.pos.x)} y ${f(c.pos.y)} (was y ${f(y0)}) up.y ${f(c.up().y)} maxYaw ${f(maxYaw)} speed ${f(c.speed())} g ${c.groundedCount}`);
}
