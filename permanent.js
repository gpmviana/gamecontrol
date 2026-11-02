import {doc,collection,getDocsFromServer,getDocFromServer,onSnapshot,runTransaction,serverTimestamp,writeBatch,where,query} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

export const purgeKey=(kind,teamId,id='',matchId='')=>kind+'_'+teamId+(kind==='version'?'_'+(matchId||'current'):'')+(id?'_'+id:'');
export function purgeBlocks(items,path){const [teamId,,matchId]=path.split('/');return items.some(v=>v.teamId===teamId&&(v.kind==='team'||v.kind==='match'&&v.id===matchId));}

export async function startPermanent(user,db,options={}){
 const base=doc(db,'users',user.uid),ledger=collection(base,'purges');let active=true,busy=false;
 let items=[];try{items=(await getDocsFromServer(ledger)).docs.map(d=>({...d.data(),key:d.id}));}catch(e){if(navigator.onLine)throw e;items=JSON.parse(options.storage?.getItem('gc_purges_v1')||'[]');}
 const api={blocks:path=>purgeBlocks(items,path),versionBlocked:(path,id)=>items.some(v=>v.kind==='version'&&v.teamId===path.split('/')[0]&&(v.matchId||'')===(path.split('/')[2]||'')&&v.id===id),sessionBlocked:s=>items.some(v=>v.kind==='team'&&v.teamId===s.teamId||v.kind==='session'&&v.id===s.id),items:()=>items,
  async remove(kind,teamId,id='',extra={}){
   if(busy)throw Error('Já existe uma eliminação em curso. Aguarda.');
   if(!active||!navigator.onLine)throw Error('A eliminação definitiva precisa de ligação à internet.');
   options.guard?.();
   const message=kind==='team'?'Esta equipa, o plantel, todos os jogos, sessões de Wellness e versões serão eliminados.':kind==='match'?'Este jogo e as suas versões serão eliminados. A sessão de Wellness associada mantém-se; pode ser eliminada no Wellness.':kind==='session'?'Esta sessão e todas as respostas serão eliminadas.':'Esta cópia será eliminada.';
   if(prompt(message+' Não será possível recuperar na aplicação.\n\nEscreve ELIMINAR para confirmar:')!=='ELIMINAR')return false;
   busy=true;window.gcPurgeBusy=true;
   try{
    await options.flush?.();
    const execute=async()=>{
     const key=purgeKey(kind,teamId,id,extra.matchId),ref=doc(ledger,key);
     await runTransaction(db,async tx=>{const old=await tx.get(ref);if(old.exists()){tx.update(ref,{writer:options.writer?.()||''});return;}tx.set(ref,{kind,teamId,id,matchId:'',...extra,status:'pending',writer:options.writer?.()||'',at:serverTimestamp()});});
     // Apply the durable exclusion before removing documents. A stale device cannot recreate them.
     const saved=(await getDocFromServer(ref)).data();items=[...items.filter(v=>v.key!==key),{...saved,key}];options.changed?.(api);
     await cleanup({kind,teamId,id,...extra});await runTransaction(db,async tx=>{await tx.get(ref);tx.update(ref,{status:'done'});});items=items.map(v=>v.key===key?{...v,status:'done'}:v);options.changed?.(api);return true;
    };
    return kind==='session'?await execute():await options.withTeam(teamId,execute);
   }catch(error){throw Error('Não foi possível concluir a eliminação: '+(error.code||error.message)+'. Se já ficou marcada, mantém a ligação e usa Concluir eliminação.');}
   finally{busy=false;window.gcPurgeBusy=false;}
  },
  async resume(item){if(busy)throw Error('Aguarda pela eliminação em curso.');if(!navigator.onLine)throw Error('Liga-te à internet para concluir.');options.guard?.();busy=true;window.gcPurgeBusy=true;try{const execute=async()=>{const ref=doc(ledger,item.key);await runTransaction(db,async tx=>{await tx.get(ref);tx.update(ref,{writer:options.writer?.()||''});});await cleanup(item);await runTransaction(db,async tx=>{await tx.get(ref);tx.update(ref,{status:'done'});});return true;};return item.kind==='session'?await execute():await options.withTeam(item.teamId,execute);}finally{busy=false;window.gcPurgeBusy=false;}},
  openPending(){const d=document.createElement('dialog');d.className='gc-zone-dialog';d.dataset.gcRead='true';const h=document.createElement('h2');h.textContent='Eliminações por concluir';d.append(h);const rows=items.filter(v=>v.status!=='done'&&(!options.kinds||options.kinds.includes(v.kind)));for(const item of rows){const p=document.createElement('p');p.textContent=({team:'Equipa',match:'Jogo',session:'Sessão',version:'Cópia'}[item.kind]||'Item')+' · '+item.teamId.slice(0,8);const btn=document.createElement('button');btn.textContent='Concluir eliminação';btn.onclick=async()=>{btn.disabled=true;try{await api.resume(item);p.textContent='Eliminação concluída.';btn.remove();}catch(e){alert(e.message);btn.disabled=false;}};d.append(p,btn);}if(!rows.length)d.append(document.createTextNode('Não há eliminações por concluir.'));const close=document.createElement('button');close.textContent='Fechar';close.onclick=()=>d.close();d.append(close);document.body.append(d);d.onclose=()=>d.remove();d.showModal();},
  stop(){active=false;stop();if(window.gcPermanent===api)delete window.gcPermanent;}
 };
 async function erase(refs){for(let i=0;i<refs.length;i+=200){const docs=await Promise.all(refs.slice(i,i+200).map(getDocFromServer)),existing=docs.filter(d=>d.exists());if(!existing.length)continue;const batch=writeBatch(db);for(const d of existing)batch.delete(d.ref);await batch.commit();}}
 async function children(ref,name){return (await getDocsFromServer(collection(ref,name))).docs.map(d=>d.ref);}
 async function game(ref){await erase(await children(ref,'versions'));await erase([ref]);}
 async function cleanup(v){
  const team=doc(base,'teams',v.teamId);
  if(v.kind==='session'){await erase([doc(base,'wellness',v.id)]);return;}
  if(v.kind==='version'){const parent=v.matchId?doc(team,'matches',v.matchId):team;await erase([doc(parent,'versions',v.id)]);return;}
  if(v.kind==='match'){await game(doc(team,'matches',v.id));return;}
  const matches=await children(team,'matches');for(const match of matches)await game(match);
  await erase(await children(team,'versions'));
  const sessions=await getDocsFromServer(query(collection(base,'wellness'),where('payload.teamId','==',v.teamId)));await erase(sessions.docs.map(d=>d.ref));
  await erase(await children(team,'controlRequests'));
  // Keep the small control reservation so interrupted cleanups can be resumed safely.
  await erase([team]);
 }
 const stop=onSnapshot(ledger,snapshot=>{if(!active||snapshot.metadata.fromCache)return;const known=new Map(items.map(v=>[v.key,v]));for(const d of snapshot.docs){const old=known.get(d.id),value={...d.data(),key:d.id};known.set(d.id,old?.status==='done'?{...value,status:'done'}:value);}items=[...known.values()];options.storage?.setItem('gc_purges_v1',JSON.stringify(items));options.changed?.(api);},error=>options.error?.(error));
 window.gcPermanent=api;options.changed?.(api);return api;
}
