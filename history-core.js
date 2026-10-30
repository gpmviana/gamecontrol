(function(root){
 'use strict';
 const known=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 function number(value,label,max,integer=false){if(value===''||value===null||value===undefined)return null;const n=Number(value);if(!Number.isFinite(n)||n<0||n>max||(integer&&!Number.isInteger(n)))throw Error(label+': indica um valor entre 0 e '+max+'.');return n;}
 function date(value,today){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value||value>today)throw Error('Escolhe uma data válida, até hoje.');return value;}
 function playerValue(game,p,key){
  if(game.source!=='manual-history')return known(p[key])?p[key]:0;
  if(known(p[key]))return p[key];
  if(key==='goals'||key==='assists'){const id=String(p.id),field=key==='goals'?'playerId':'assistPlayerId',events=(game.timeline||[]).filter(e=>e.type==='GF_A');const n=events.filter(e=>String(e[field])===id).length;if(n)return n;if(!events.length||events.every(e=>e[field]||(key==='assists'&&e.noAssist)))return 0;}
  return null;
 }
 function buildMatch(config,roster,{id,teamId,teamName,today,now}){
  date(config.date,today);if(!config.opponent?.trim())throw Error('Indica o nome do adversário.');
  const a=number(config.scoreA,'Golos marcados',99,true),b=number(config.scoreB,'Golos sofridos',99,true);if(a===null||b===null)throw Error('Preenche o resultado final.');
  const regulation=number(config.regulationMinutes,'Minutos por parte',120,true);if(!regulation)throw Error('Indica a duração de cada parte.');
  const rosterMap=new Map(roster.map(p=>[String(p.id),p])),seen=new Set(),players=[];
  for(const entry of config.players||[]){const key=String(entry.id),base=rosterMap.get(key);if(!base||seen.has(key))throw Error('Convocados inválidos.');seen.add(key);const minutes=number(entry.minutes,'Minutos de '+base.name,360),goals=number(entry.goals,'Golos de '+base.name,a,true),assists=number(entry.assists,'Assistências de '+base.name,a,true);players.push({id:base.id,name:base.name,isGK:!!base.isGK,active:false,seconds:minutes===null?null:Math.round(minutes*60),part1:null,part2:null,secondsOut:null,rotations:null,goals,assists});}
  if(!players.length)throw Error('Seleciona pelo menos um convocado.');
  const selected=new Map(players.map(p=>[String(p.id),p])),timeline=[];
  for(const side of ['A','B']){
   const goals=config.goals?.[side]||[],score=side==='A'?a:b;if(goals.length!==score)throw Error('Confirma os detalhes dos golos após alterar o resultado.');
   goals.forEach((g,index)=>{
    const e={type:side==='A'?'GF_A':'GA_A',team:side,historical:true,half:g.half?Number(g.half):null,clock:g.minute!==''&&g.minute!=null?String(number(g.minute,'Minuto do golo',360))+"'":null,goalCategory:g.category||null};
    if(e.half!==null&&![1,2,3,4].includes(e.half))throw Error('Parte do golo inválida.');
    if(g.playerId){if(side!=='A'||!selected.has(String(g.playerId)))throw Error('O marcador tem de estar convocado.');e.playerId=selected.get(String(g.playerId)).id;}
    if(g.assistPlayerId){if(side!=='A'||!selected.has(String(g.assistPlayerId)))throw Error('O autor da assistência tem de estar convocado.');if(String(g.assistPlayerId)===String(g.playerId))throw Error('O marcador não pode assistir o próprio golo.');e.assistPlayerId=selected.get(String(g.assistPlayerId)).id;}
    e.noAssist=!!g.noAssist;if(e.noAssist&&e.assistPlayerId)throw Error('Confirma a assistência do golo.');
    if(Array.isArray(g.lineup)){
     const ids=[...new Set(g.lineup.map(String))];if(!ids.length||ids.length>5||ids.some(key=>!selected.has(key)))throw Error('Seleciona entre 1 e 5 jogadores convocados para a formação conhecida.');
     e.lineup=ids.map(key=>{const p=selected.get(key);return {id:p.id,name:p.name,isGK:p.isGK};});e.activeIds=e.lineup.map(p=>p.id);
     if(e.playerId&&!ids.includes(String(e.playerId)))throw Error('O marcador tem de estar em campo no golo.');if(e.assistPlayerId&&!ids.includes(String(e.assistPlayerId)))throw Error('O autor da assistência tem de estar em campo.');
    }
    timeline.push(e);
   });
  }
  for(const [key,field]of [['goals','playerId'],['assists','assistPlayerId']]){let minimum=0;for(const p of players){const count=timeline.filter(e=>e.type==='GF_A'&&String(e[field])===String(p.id)).length;if(known(p[key])&&p[key]<count)throw Error('O total de '+key.replace('goals','golos').replace('assists','assistências')+' de '+p.name+' é inferior aos golos detalhados.');minimum+=Math.max(count,p[key]||0);}if(minimum>a)throw Error('Os totais individuais excedem os golos marcados.');}
  const actions=new Set(['SHOT_ON','SHOT_OFF','SAVE','RECOVERY','LOSS','FOUL','YELLOW','RED']);
  for(const action of config.actions||[]){if(!actions.has(action.action)||!['A','B'].includes(action.team))throw Error('Ação inválida.');const count=number(action.count,'Quantidade de ações',200,true);if(!count)throw Error('Indica a quantidade de ações.');if(action.playerId&&!selected.has(String(action.playerId)))throw Error('O jogador da ação tem de estar convocado.');for(let i=0;i<count;i++)timeline.push({type:'ACTION',team:action.team,action:action.action,playerId:action.team==='A'&&action.playerId?selected.get(String(action.playerId)).id:null,shotCategory:action.category||null,historical:true,half:null,clock:null});}
  return {id,teamProfile:teamId,teamA:teamName,teamB:config.opponent.trim(),date:config.date,savedAt:now,source:'manual-history',historyVersion:1,regulationMinutes:regulation,extraMinutes:5,matchPeriod:2,firstHalf:false,duration:regulation*60,remaining:0,scoreA:a,scoreB:b,players,timeline,historyNotes:String(config.notes||'').slice(0,1000)};
 }
 root.GCHistory={known,number,date,playerValue,buildMatch};
})(typeof window!=='undefined'?window:globalThis);
