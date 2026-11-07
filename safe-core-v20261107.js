/* Identidade e conservação de versões. Não altera os registos históricos originais. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function identity(team,p){const links=team.athleteLinks||{};return String(links[p.id]||p.athleteId||team.players?.find(x=>String(x.id)===String(p.id))?.athleteId||p.id);}
function canonicalGame(source,team){const g=clone(source),ids=new Map((g.players||[]).map(p=>[String(p.id),identity(team,p)]));for(const p of team.players||[])ids.set(String(p.id),identity(team,p));const id=v=>v==null?v:ids.get(String(v))||String(v);g.players=(g.players||[]).map(p=>({...p,id:id(p.id)}));for(const e of g.timeline||[]){if(e.playerId!=null)e.playerId=id(e.playerId);if(e.assistPlayerId!=null)e.assistPlayerId=id(e.assistPlayerId);if(e.activeIds)e.activeIds=e.activeIds.map(id);if(e.lineup)e.lineup=e.lineup.map(p=>({...p,id:id(p.id)}));}g.sourceTeamId=team.id;g.sourceTeamName=team.name;return g;}
function canonicalSession(source,team){const s=clone(source),ids=new Map((s.roster||[]).map(p=>[String(p.id),identity(team,p)]));for(const p of team.players||[])ids.set(String(p.id),identity(team,p));const id=v=>ids.get(String(v))||String(v);s.participants=(s.participants||[]).map(id);s.roster=(s.roster||[]).map(p=>({...p,id:id(p.id)}));s.records=Object.fromEntries(Object.entries(s.records||{}).map(([key,value])=>[id(key),value]));s.sourceTeamName=team.name;return s;}
function regressions(previous,next){const a=previous?.state||previous,b=next?.state||next;if(!a||!b)return [];if(previous.matchId&&next.matchId&&previous.matchId!==next.matchId)return [];if(a.id&&b.id&&a.id!==b.id)return [];const result=[];if((a.timeline||[]).length>(b.timeline||[]).length)result.push('Menos eventos registados');for(const part of ['part1','part2']){const sum=g=>(g.players||[]).reduce((n,p)=>n+(Number(p[part])||0),0);if(sum(a)>sum(b))result.push('Menos minutos na '+(part==='part1'?'1.ª':'2.ª parte'));}if((a.scoreA||0)>(b.scoreA||0)||(a.scoreB||0)>(b.scoreB||0))result.push('Resultado inferior');return result;}
// Only generated recovery versions have retention limits. Games, rosters and conflict copies are never pruned here.
const recoveryPolicy=Object.freeze({maxEntries:50,maxPerPath:6,maxChars:350000});
function quotaError(error){return error?.name==='QuotaExceededError'||error?.name==='NS_ERROR_DOM_QUOTA_REACHED'||error?.code===22||error?.code===1014;}
function compactRecovery(entries,options={}){
 if(!Array.isArray(entries))throw Error('As cópias locais têm um formato inválido. Exporta uma cópia antes de continuar.');
 const limits={...recoveryPolicy,...options},rows=entries.map((item,index)=>({item,index,chars:JSON.stringify(item).length+1}));
 const latest=new Set(),phaseSeen=new Set();
 for(let i=rows.length-1;i>=0;i--){const v=rows[i].item,g=v?.payload?.state||v?.payload||{},match=g.id||v?.payload?.matchId||'',phase=g.matchPeriod|| (g.firstHalf===false?2:1),key=String(v?.path)+'|'+match+'|'+phase;if(!phaseSeen.has(key)){phaseSeen.add(key);latest.add(i);}}
 const chosen=new Set(),perPath=new Map();let chars=2;
 const take=r=>{const p=String(r.item?.path||'');if(chosen.size>=limits.maxEntries||(perPath.get(p)||0)>=limits.maxPerPath)return;if(chosen.size&&chars+r.chars>limits.maxChars)return;chosen.add(r.index);perPath.set(p,(perPath.get(p)||0)+1);chars+=r.chars;};
 // Keep recent checkpoints from both halves before filling with intervening versions.
 for(let i=rows.length-1;i>=0;i--)if(latest.has(i))take(rows[i]);
 for(let i=rows.length-1;i>=0;i--)if(!chosen.has(i))take(rows[i]);
 return rows.filter(r=>chosen.has(r.index)).map(r=>r.item);
}
function write(store,key,value,recoveryKey='gc_recovery_v2'){
 value=String(value);if(store.getItem(key)===value)return;
 if(key===recoveryKey)value=JSON.stringify(compactRecovery(JSON.parse(value)));
 try{store.setItem(key,value);return;}catch(error){
  if(!quotaError(error)||key===recoveryKey)throw error;
  const raw=store.getItem(recoveryKey);if(!raw)throw error;
  const entries=JSON.parse(raw);if(!Array.isArray(entries))throw error;
  // Reclaim only this account's automatic versions, and retain at least the latest one.
  for(const limits of [{maxChars:100000,maxEntries:8,maxPerPath:2},{maxChars:1,maxEntries:1,maxPerPath:1}]){
   const trimmed=JSON.stringify(compactRecovery(entries,limits));if(trimmed.length>=raw.length)continue;
   store.setItem(recoveryKey,trimmed);
   try{store.setItem(key,value);return;}catch(retry){if(!quotaError(retry))throw retry;}
  }
  throw error;
 }
}
function remember(store,path,payload,reason){
 if(!payload)return;
 const key='gc_recovery_v2',list=JSON.parse(store.getItem(key)||'[]'),digest=JSON.stringify(payload);
 if(!Array.isArray(list))throw Error('Não foi possível ler as cópias de recuperação.');
 if(list.some(x=>x.path===path&&JSON.stringify(x.payload)===digest))return;
 const entry={id:crypto.randomUUID(),path,at:new Date().toISOString(),reason,payload:clone(payload)};
 let kept=compactRecovery([...list,entry]);
 for(;;){try{store.setItem(key,JSON.stringify(kept));return;}catch(error){if(!quotaError(error)||kept.length<=1)throw error;kept=kept.filter((_,i)=>i!==0);}}
}
function summary(value){const s=value?.state||value||{};return (value?.name||s.teamA||'Equipa')+' · '+(s.firstHalf===false?'2.ª parte / prolongamento':'1.ª parte')+' · '+(s.scoreA||0)+'–'+(s.scoreB||0)+' · '+(s.timeline||[]).length+' eventos · '+Math.round((s.players||[]).reduce((n,p)=>n+(Number(p.seconds)||0),0)/60)+' min somados';}
root.GCSafe={identity,canonicalGame,canonicalSession,regressions,remember,summary,compactRecovery,recoveryPolicy,quotaError,write};
if(typeof module!=='undefined')module.exports=root.GCSafe;
})(typeof window==='undefined'?globalThis:window);

