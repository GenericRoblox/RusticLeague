const S=require('../src/sim.js'); const {Sim,V,len,dot,Q,qaxis,qmul,qyaw}=S; const f=n=>n.toFixed(2);
for (const [name,q] of [['roof',qaxis(V(0,0,1),Math.PI)],['side',qaxis(V(0,0,1),Math.PI/2)],['nose',qaxis(V(1,0,0),Math.PI/2)]]){
 const sim=new Sim(); sim.ball.pos=V(30,1.6,30); const c=sim.cars[0]; c.q=q; c.pos=V(0,2,-20);
 let t=0, rt=null; while(t<8){ sim.step([{},{}]); t+=sim.dt; for(const e of sim.events) if(e.type==='rock') console.log(' rock at',f(t)); sim.events.length=0; if(!rt && c.up().y>0.9 && c.groundedCount>=3 && t>0.5) rt=t; }
 console.log(name,'righted at',rt&&f(rt),'up',f(c.up().y),'pos',f(c.pos.x),f(c.pos.y),f(c.pos.z));
}
