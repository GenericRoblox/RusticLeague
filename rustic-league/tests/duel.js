// attacker (no defending) as car 0 vs level under test as car 1; reports goals for/against per 10 minutes
const S=require('../src/sim.js'); const {Bot,LEVELS}=require('../src/bot.js'); const {Sim}=S;
const lvl=process.argv[2]||'legend', mins=+(process.argv[3]||10);
LEVELS.attacker={...LEVELS.hard, name:'Atk', defend:0, pads:0.3};
const sim=new Sim(); const a=new Bot(sim,0,'attacker'), d=new Bot(sim,1,lvl);
let sc=[0,0], t=0, k=0; sim.resetKickoff(0); a.onKickoff(); d.onKickoff(); let since=0;
while(t<mins*60){ sim.step([a.update(sim.dt), d.update(sim.dt)]); t+=sim.dt; since+=sim.dt; sim.events.length=0;
 const g=sim.goalCheck(); if(g>=0 || since>60){ if(g>=0) sc[g]++; since=0; sim.resetKickoff(++k); a.onKickoff(); d.onKickoff(); } }
console.log(`${lvl}: scored ${sc[1]} conceded ${sc[0]} in ${mins} min`);
