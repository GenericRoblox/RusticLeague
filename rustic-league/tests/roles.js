const S=require('../src/sim.js'); const {Bot}=require('../src/bot.js'); const f=n=>n.toFixed(0);
const n=+(process.argv[2]||3), lvl=process.argv[3]||'hard', mins=+(process.argv[4]||8);
S.setArenaScale(S.teamScale(n));
const cars={2:[['coupe','van'],['buggy','van']],3:[['coupe','van','buggy'],['buggy','van','coupe']],4:[['coupe','van','buggy','coupe'],['buggy','van','coupe','buggy']]}[n];
const sty=c=>c.map((t,i)=>t==='van'&&c.indexOf('van')===i?'defender':t==='buggy'&&c.indexOf('buggy')===i?'striker':i===c.lastIndexOf(t)&&t==='coupe'&&c.indexOf('coupe')!==i?'allrounder':t==='coupe'?'playmaker':'allrounder');
const types=[...cars[0],...cars[1]], styles=[...sty(cars[0]),...sty(cars[1])];
const sim=new S.Sim({teamSize:n, types}); const bots=sim.cars.map((c,i)=>new Bot(sim,i,lvl,styles[i]));
let sc=[0,0],t=0,k=0,since=0; sim.resetKickoff(0); bots.forEach(b=>b.onKickoff());
const zone={goal:0,own:0,opp:0}; const vanIdx=sim.cars.findIndex(c=>c.spec.type==='van'); const vb=bots[vanIdx];
let other=0, passes=0, received=0, intercepted=0, lastPass=null, lastPI=null; const phaseT={keeper:0,sweeper:0,forward:0};
while(t<mins*60){ sim.step(bots.map(b=>b.update(sim.dt))); t+=sim.dt; since+=sim.dt;
 const pis=sim.passInfos||{}; const pi=(e=>null)();
 for(const e of sim.events){ if(e.type!=='ballHit') continue;
   if(lastPass && e.car!==lastPass.from && t-lastPass.t<5){ if(process.env.V) console.log('  next touch by', e.car, 'after', (t-lastPass.t).toFixed(1)); if(e.car===lastPass.to) received++; else if(sim.cars[e.car].team!==sim.cars[lastPass.from].team) intercepted++; else other++; lastPass=null; }
   const pi=(sim.passInfos||{})[sim.cars[e.car].team]; if(pi && pi.from===e.car && t<pi.until && bots[e.car].passTo===pi.to && (!lastPass || lastPass.from!==e.car)){ passes++; lastPass={to:pi.to, from:pi.from, t}; if(process.env.V){ const b=sim.ball, r=sim.cars[pi.to], fr=sim.cars[pi.from]; const bv=b.vel; const dl=S.norm(S.sub(pi.lead,b.pos)); const bvh=S.norm(S.V(bv.x,0,bv.z)); console.log(`PASS t=${t.toFixed(1)} from ${pi.from}(${fr.spec.type}) to ${pi.to} ball(${b.pos.x.toFixed(0)},${b.pos.z.toFixed(0)}) lead(${pi.lead.x.toFixed(0)},${pi.lead.z.toFixed(0)}) recv(${r.pos.x.toFixed(0)},${r.pos.z.toFixed(0)}) ballSpd ${S.len(bv).toFixed(0)} dirErr ${(Math.acos(Math.max(-1,Math.min(1,S.dot(dl,bvh))))*57).toFixed(0)}deg opps ${sim.cars.filter(c=>c.team!==fr.team).map(c=>'('+c.pos.x.toFixed(0)+','+c.pos.z.toFixed(0)+')').join('')}`);} } }
 sim.events.length=0;
 const vc=sim.cars[vanIdx], at=vc.team===0?1:-1, own=-S.A.HZ*at; const dz=(vc.pos.z-own)*at;
 if(dz<22) zone.goal+=sim.dt; else if(vc.pos.z*at<0) zone.own+=sim.dt; else zone.opp+=sim.dt; if(vb.phase) phaseT[vb.phase]+=sim.dt;
 if(process.env.V && lastPass){ const dtp=t-lastPass.t; for(const q of [0.6,1.2,2.0]) if(Math.abs(dtp-q)<sim.dt/2){ const r=sim.cars[lastPass.to], b=sim.ball; console.log(`   +${q}s ball(${b.pos.x.toFixed(0)},${b.pos.y.toFixed(0)},${b.pos.z.toFixed(0)}) v${S.len(b.vel).toFixed(0)} recv(${r.pos.x.toFixed(0)},${r.pos.z.toFixed(0)}) s${r.speed().toFixed(0)} d${S.len(S.sub(b.pos,r.pos)).toFixed(0)} mode ${bots[lastPass.to].mode} first ${bots[lastPass.to].wasFirst} tgt(${bots[lastPass.to].target.x.toFixed(0)},${bots[lastPass.to].target.z.toFixed(0)}) `);} }
 const g=sim.goalCheck(); if(g>=0||since>90){ if(g>=0) sc[g]++; since=0; sim.resetKickoff(++k); sim.passInfos={}; bots.forEach(b=>b.onKickoff()); } }
const T=zone.goal+zone.own+zone.opp, P=phaseT.keeper+phaseT.sweeper+phaseT.forward;
console.log(`${n}v${n} ${lvl}: score ${sc.join('-')} | van position: goal ${f(zone.goal/T*100)}% own half ${f(zone.own/T*100)}% opp half ${f(zone.opp/T*100)}% | phases K${f(phaseT.keeper/P*100)} S${f(phaseT.sweeper/P*100)} F${f(phaseT.forward/P*100)} | passes ${passes} received ${received} intercepted ${intercepted} other ${other}`);
