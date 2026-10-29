import {collection,doc,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

export function canonicalString(value){
 if(value===undefined)return undefined;
 function sorted(item){if(Array.isArray(item))return item.map(sorted);if(item&&typeof item==='object')return Object.fromEntries(Object.keys(item).sort().map(key=>[key,sorted(item[key])]));return item;}
 return JSON.stringify(sorted(value));
}
export function syncDecision(local,remote,ack,running){
 const own=canonicalString(local),cloud=canonicalString(remote?.payload);
 if(!remote)return local===undefined?'none':'upload';
 if(own===cloud)return 'ack';
 if(local===undefined||own===ack?.digest)return running?'wait':'download';
 if((ack?.revision??0)===(remote.revision??0))return 'upload';
 return 'conflict';
}
export async function startAccountSync(user,db,options={}){
 const api=window.gcSyncAPI,store=window.gcAccountStorage;
 if(!api)throw Error('Interface de sincronização indisponível.');
 if(window.gcSyncSession?.uid===user.uid)return;
 window.gcSyncSession?.stop();
 let active=true,busy=false,queued=false,ready=false,lastError='',unsubscribers=[],teamsWatched=new Set(),matchesReady=new Set();
 const gameWrapper=document.getElementById('appWrapper');if(gameWrapper)gameWrapper.inert=!options.offline;
 const remote=new Map(),conflicts=new Map();let pendingTeams=0;
 const meta=JSON.parse(store.getItem('gc_sync_meta_v1')||'{"docs":{}}');meta.docs ||= {};
 const bar=document.createElement('div');bar.id='gcSyncBar';bar.style.cssText='padding:10px 14px;font-size:12px;background:var(--gc-panel);color:var(--gc-muted);border-bottom:1px solid var(--gc-line);display:flex;gap:10px;align-items:center;flex-wrap:wrap';
 document.getElementById('gcSyncBar')?.remove();
 const text=document.createElement('span');text.textContent='A ligar à sincronização…';bar.appendChild(text);
 function button(label,fn){const b=document.createElement('button');b.textContent=label;b.style.cssText='font:inherit;padding:6px 9px;border:1px solid var(--gc-line);border-radius:6px;color:var(--gc-ink);background:var(--gc-raised);cursor:pointer';b.onclick=fn;bar.appendChild(b);return b;}
 button('Sincronizar agora',()=>{lastError='';schedule();});
 const resolveButton=button('Resolver conflito',resolveConflicts);resolveButton.hidden=true;
 document.querySelector('header').after(bar);
 const refFor=path=>doc(db,'users',user.uid,'teams',...path.split('/'));
 const saveMeta=()=>store.setItem('gc_sync_meta_v1',JSON.stringify(meta));
 function acknowledge(path,item){meta.docs[path]={revision:item.revision,digest:canonicalString(item.payload)};saveMeta();}
 function report(message){text.textContent=message;resolveButton.hidden=!conflicts.size;}
 function watchMatches(teamId){
  if(teamsWatched.has(teamId))return;teamsWatched.add(teamId);pendingTeams++;
  const stop=onSnapshot(collection(db,'users',user.uid,'teams',teamId,'matches'),snapshot=>{
    if(!active)return;
    snapshot.docChanges().forEach(change=>{if(change.type!=='removed'){const value=change.doc.data();if(value.payload&&Number.isInteger(value.revision))remote.set(teamId+'/matches/'+change.doc.id,value);}});
    if(!snapshot.metadata.fromCache&&!matchesReady.has(teamId)){matchesReady.add(teamId);pendingTeams--;}
    schedule();
  },error=>{if(gameWrapper)gameWrapper.inert=false;lastError='Não foi possível consultar os jogos: '+error.code;report(lastError);});unsubscribers.push(stop);
 }
 const stopTeams=onSnapshot(collection(db,'users',user.uid,'teams'),snapshot=>{
  if(!active)return;
  snapshot.docChanges().forEach(change=>{
   if(change.type==='removed')return;
   const value=change.doc.data();if(!value.payload||!Number.isInteger(value.revision))return;
   remote.set(change.doc.id,value);watchMatches(change.doc.id);
  });
  if(!snapshot.metadata.fromCache)ready=true;
  schedule();
 },error=>{if(gameWrapper)gameWrapper.inert=false;lastError='Não foi possível sincronizar: '+error.code;report(lastError);});unsubscribers.push(stopTeams);
 async function upload(path,payload){
  if(new TextEncoder().encode(JSON.stringify(payload)).length>750000)throw Error('Um jogo/equipa excede o tamanho seguro. Exporta uma cópia e contacta a administração.');
  const expected=meta.docs[path]?.revision??0;
  const item=await runTransaction(db,async transaction=>{
   const reference=refFor(path),snapshot=await transaction.get(reference),existing=snapshot.exists()?snapshot.data():null;
   if((existing?.revision??0)!==expected){const error=Error('Conflito de versões');error.code='gc/conflict';throw error;}
   const revision=expected+1;
   // Campos resumidos permitem a consulta pelo painel de administração atual.
   const summary=path.includes('/matches/')?{id:payload.id,date:payload.date,teamA:payload.teamA,teamB:payload.teamB,scoreA:payload.scoreA,scoreB:payload.scoreB}:{name:payload.name,roster:payload.roster};
   transaction.set(reference,{...summary,payload,revision,updatedAt:serverTimestamp(),updatedBy:user.uid});
   return {payload,revision};
  });
  remote.set(path,item);acknowledge(path,item);
 }
 async function reconcile(){
  if(!active||busy){queued=true;return;}
  if(!navigator.onLine){if(gameWrapper)gameWrapper.inert=false;report('Sem ligação · alterações guardadas neste dispositivo e por enviar');return;}
  if(!ready||pendingTeams){report('A consultar as equipas e jogos da tua conta…');return;}
  busy=true;queued=false;let changed=false,waiting=false;
  try{
   if(!api.initialised()&&remote.size===0)api.seed();
   const local=api.collect();
   const paths=new Set([...Object.keys(local),...remote.keys()]);
   // Equipas primeiro; jogos a seguir.
   for(const path of [...paths].sort((a,b)=>a.split('/').length-b.split('/').length)){
    if(!active)return;
    const payload=local[path],cloud=remote.get(path),decision=syncDecision(payload,cloud,meta.docs[path],api.running());
    if(decision==='ack'){acknowledge(path,cloud);conflicts.delete(path);}
    else if(decision==='download'){api.apply(path,cloud.payload);acknowledge(path,cloud);changed=true;conflicts.delete(path);}
    else if(decision==='upload'){await upload(path,payload);conflicts.delete(path);}
    else if(decision==='wait')waiting=true;
    else if(decision==='conflict')conflicts.set(path,{local:payload,remote:cloud});
   }
   if(changed)api.refresh();
   if(conflicts.size)report('Há versões diferentes em '+conflicts.size+' registo(s). Nenhuma foi substituída.');
   else if(waiting)report('Há alterações por receber · pausa o cronómetro e conclui a ação/janela aberta.');
   else if(lastError)report(lastError);
   else report('Sincronizado · '+new Date().toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'}));
  }catch(error){
   if(error.code==='gc/conflict')report('Outro dispositivo alterou estes dados. A aguardar a nova versão para comparar.');
   else{lastError='Alterações locais mantidas · sincronização pendente: '+(error.code||error.message);report(lastError);}
  }finally{busy=false;if(gameWrapper)gameWrapper.inert=false;if(queued&&active)setTimeout(reconcile,1500);}
 }
 let timer;
 function schedule(){if(!active)return;clearTimeout(timer);timer=setTimeout(reconcile,900);}
 async function resolveConflicts(){
  if(api.running()){alert('Pausa o cronómetro antes de resolver as versões.');return;}
  const first=conflicts.entries().next().value;if(!first)return;
  const [path,item]=first;
  const keepLocal=confirm('Versões diferentes: '+path+'\n\nOK: manter a versão deste dispositivo e enviá-la.\nCancelar: ver a opção para receber a versão do Firebase.');
  if(!keepLocal&&!confirm('Receber a versão do Firebase neste dispositivo? Será guardada uma cópia local das duas versões antes de substituir.'))return;
  try{
   const copies=JSON.parse(store.getItem('gc_sync_conflict_copies_v1')||'[]');copies.push({path,at:new Date().toISOString(),local:item.local,cloud:item.remote.payload});store.setItem('gc_sync_conflict_copies_v1',JSON.stringify(copies));
   if(keepLocal)acknowledge(path,item.remote);
   else{api.apply(path,item.remote.payload);acknowledge(path,item.remote);api.refresh();}
   conflicts.delete(path);lastError='';schedule();
  }catch(error){report('Não foi possível guardar a cópia de segurança. Nenhuma versão foi substituída.');}
 }
 const interval=setInterval(()=>{if(active)reconcile();},15000);
 const online=()=>{lastError='';schedule();};window.addEventListener('online',online);window.addEventListener('offline',schedule);
 window.gcSyncSession={uid:user.uid,stop(){active=false;clearInterval(interval);clearTimeout(timer);unsubscribers.forEach(stop=>stop());window.removeEventListener('online',online);window.removeEventListener('offline',schedule);if(gameWrapper)gameWrapper.inert=false;bar.remove();}};
 schedule();
}

