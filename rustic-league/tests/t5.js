const S=require('../src/sim.js'); const {Sim,V,len,dot,PAD}=S; const f=n=>n.toFixed(2);
const a=process.argv.slice(2).map(parseFloat); if(a.length){PAD.lift=a[0];PAD.thetaMax=a[1];PAD.fireTime=a[2];}
let ok=0,n=0; const rows=[];
for(const spd of [8,12,16,20,24,28]) for(const off of [0,0.8]) {
const sim=new Sim(); sim.ball.pos=V(30,1.6,30);
sim.placeCar(sim.cars[0], V(-22+off,0,-48), 0); sim.cars[1].pos=V(30,0.62,40);
const c=sim.cars[0]; c.vel=V(0,0,spd);
let t=0, maxY=0, fired=false, tf=0, wAfter=0, vy0=0, res='none';
while(t<6){ sim.step([{throttle:spd/34,steer:0},{}]); t+=sim.dt;
 for(const e of sim.events) if(e.type==='padFire'&&!fired&&e.pad===0){fired=true;tf=t;}
 sim.events.length=0;
 if(fired){ maxY=Math.max(maxY,c.pos.y); if(Math.abs(t-tf-0.3)<0.005){wAfter=c.ang.x; vy0=c.vel.y;} }
 if(fired && t-tf>4) break;
}
const good=c.up().y>0.8; n++; if(good) ok++;
rows.push(`spd ${spd} off ${off}: maxY=${f(maxY)} vy=${f(vy0)} pitchW=${f(wAfter)} endUp=${f(c.up().y)} z=${f(c.pos.z)} ${good?'OK':'FLIP'}`);
}
console.log(rows.join('\n')); console.log('upright',ok,'/',n);
