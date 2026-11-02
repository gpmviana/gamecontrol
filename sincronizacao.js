import {createControl} from './control-sync.js';
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
 const remote=new Map(),conflicts=new Map(),approved=new Map();let pendingTeams=0;
 let controller;
 const meta=JSON.parse(store.getItem('gc_sync_meta_v1')||'{"docs":{}}');meta.docs ||= {};
 const bar=document.createElement('div');bar.id='gcSyncBar';bar.style.cssText='padding:10px 14px;font-size:12px;background:var(--gc-panel);color:var(--gc-muted);border-bottom:1px solid var(--gc-line);display:flex;gap:10px;align-items:center;flex-wrap:wrap';
 document.getElementById('gcSyncBar')?.remove();
 const text=document.createElement('span');text.textContent='A ligar à sincronização…';bar.appendChild(text);
 function button(label,fn){const b=document.createElement('button');b.textContent=label;b.style.cssText='font:inherit;padding:6px 9px;border:1px solid var(--gc-line);border-radius:6px;color:var(--gc-ink);background:var(--gc-raised);cursor:pointer';b.onclick=fn;bar.appendChild(b);return b;}
 button('Sincronizar agora',()=>{lastError='';schedule();});
 const resolveButton=button('Resolver conflito',resolveConflicts);resolveButton.hidden=true;
 document.querySelector('header').after(bar);
 controller=createControl(user,db,api,store,bar,{
  report,schedule,paths:()=>[...remote.keys()],
  async beforeClaim(id){
   if(!ready||pendingTeams)throw Error('Aguarda a consulta das equipas e jogos.');
   const local=api.collect(),cloud=remote.get(id);
   if(cloud&&canonicalString(local[id])!==canonicalString(cloud.payload)&&approved.get(id)!==canonicalString(local[id])){
    const decision=syncDecision(local[id],cloud,meta.docs[id],false);
    if(decision==='download'){preserve(id,local[id],'Antes de assumir controlo');api.apply(id,cloud.payload);acknowledge(id,cloud);api.refresh();}
    else {conflicts.set(id,{local:local[id],remote:cloud});report('Há versões diferentes. Compara antes de assumir o controlo.');throw Error('Compara as versões no menu e escolhe qual manter antes de assumir o controlo.');}
   }
  },
  async beforeRelease(id){await reconcile();if(busy||conflicts.size||lastError)throw Error('Ainda existem alterações pendentes ou conflitos. O controlo foi mantido.');const local=api.collect();for(const [p,v]of Object.entries(local))if(p.split('/')[0]===id&&canonicalString(v)!==canonicalString(remote.get(p)?.payload))throw Error('Há dados por enviar. Tenta sincronizar novamente antes de passar para consulta.');},
  restore(path,payload){const local=api.collect()[path];preserve(path,local,'Antes de recuperar versão');api.restoreArchive(path,payload);if(remote.get(path))acknowledge(path,remote.get(path));approved.set(path,canonicalString(api.collect()[path]));schedule();}
 });
 function preserve(path,payload,reason){GCSafe.remember(store,path,payload,reason);}
 const refFor=path=>doc(db,'users',user.uid,'teams',...path.split('/'));
 const saveMeta=()=>store.setItem('gc_sync_meta_v1',JSON.stringify(meta));
 function acknowledge(path,item){meta.docs[path]={revision:item.revision,digest:canonicalString(item.payload)};saveMeta();}
 function report(message){text.textContent=message;resolveButton.hidden=!conflicts.size;}
 function watchMatches(teamId){
  if(teamsWatched.has(teamId))return;teamsWatched.add(teamId);pendingTeams++;controller.watch(teamId);
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
  if(!snapshot.metadata.fromCache){ready=true;controller.received();}
  schedule();
 },error=>{if(gameWrapper)gameWrapper.inert=false;lastError='Não foi possível sincronizar: '+error.code;report(lastError);});unsubscribers.push(stopTeams);
 async function upload(path,payload){
  if(new TextEncoder().encode(JSON.stringify(payload)).length>750000)throw Error('Um jogo/equipa excede o tamanho seguro. Exporta uma cópia e contacta a administração.');
  const expected=meta.docs[path]?.revision??0,teamId=path.split('/')[0];
  if(!controller.valid(teamId))throw Error('Assume o controlo desta equipa antes de enviar alterações.');
  const item=await runTransaction(db,async transaction=>{
   const reference=refFor(path),snapshot=await transaction.get(reference),existing=snapshot.exists()?snapshot.data():null;
   const controlSnapshot=await transaction.get(controller.ref(teamId));
   if(controlSnapshot.data()?.holder!==controller.token||(controlSnapshot.data()?.expiresAt?.toMillis?.()||0)<=Date.now())throw Error("O controlo expirou ou passou para outro dispositivo.");
   if((existing?.revision??0)!==expected){const error=Error('Conflito de versões');error.code='gc/conflict';throw error;}
   const revision=expected+1;
   // Campos resumidos permitem a consulta pelo painel de administração atual.
   const summary=path.includes('/matches/')?{id:payload.id,date:payload.date,teamA:payload.teamA,teamB:payload.teamB,scoreA:payload.scoreA,scoreB:payload.scoreB}:{name:payload.name,roster:payload.roster};
   if(existing?.payload)transaction.set(doc(reference,'versions','r'+existing.revision),{payload:existing.payload,revision:existing.revision,at:serverTimestamp(),device:existing.device||'Versão anterior'});
   transaction.set(reference,{...summary,payload,revision,updatedAt:serverTimestamp(),updatedBy:user.uid,writer:controller.token,device:controller.label,protocol:2});
   return {payload,revision};
  });
  remote.set(path,item);acknowledge(path,item);approved.delete(path);
 }
 async function reconcile(){
  if(!active||busy){queued=true;return;}
  if(!navigator.onLine){if(gameWrapper)gameWrapper.inert=false;report('Sem ligação · alterações guardadas neste dispositivo e por enviar');return;}
  if(!ready||pendingTeams){report('A consultar as equipas e jogos da tua conta…');return;}
  busy=true;queued=false;let changed=false,waiting=false;lastError="";
  try{
   await controller.ensure(api.activeTeam());
   if(!api.initialised()&&remote.size===0)api.seed();
   const local=api.collect();
   const paths=new Set([...Object.keys(local),...remote.keys()]);
   // Equipas primeiro; jogos a seguir.
   for(const path of [...paths].sort((a,b)=>a.split('/').length-b.split('/').length)){
    if(!active)return;
    const payload=local[path],cloud=remote.get(path);let decision=syncDecision(payload,cloud,meta.docs[path],api.running());
    if(decision!=='ack'&&!path.includes('/')&&window.gcReadOnly&&cloud&&payload&&!api.running()&&!(payload.state?.scoreA||payload.state?.scoreB)&&
      !(payload.state?.timeline||[]).length&&!(payload.state?.players||[]).some(p=>Number(p.seconds)>0)&&
      canonicalString(payload.roster)===canonicalString(cloud.payload.roster)&&payload.name===cloud.payload.name)decision='download';
    if(decision==='ack'){acknowledge(path,cloud);conflicts.delete(path);}
    else if(decision==='download'){preserve(path,payload,'Antes de receber versão sincronizada');api.apply(path,cloud.payload);acknowledge(path,cloud);changed=true;conflicts.delete(path);}
    else if(decision==='upload'){
     if(!controller.valid(path.split('/')[0])){if(path.split('/')[0]===api.activeTeam())waiting=true;continue;}
     if(cloud&&GCSafe.regressions(cloud.payload,payload).length&&approved.get(path)!==canonicalString(payload)){conflicts.set(path,{local:payload,remote:cloud});continue;}
     await upload(path,payload);conflicts.delete(path);
    }
    else if(decision==='wait')waiting=true;
    else if(decision==='conflict')conflicts.set(path,{local:payload,remote:cloud});
   }
   if(changed)api.refresh();
   if(conflicts.size)report('Há versões diferentes em '+conflicts.size+' registo(s). Nenhuma foi substituída.');
   else if(waiting)report('Há alterações por enviar/receber · assume o controlo ou conclui a ação aberta.');
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
  if(api.running()){alert('Pausa o cronómetro e fecha a ação antes de comparar versões.');return;}
  const first=conflicts.entries().next().value;if(!first)return;const [path,item]=first;
  controller.compare(path,item,async kind=>{
   preserve(path,item.local,'Conflito · este dispositivo');preserve(path,item.remote.payload,'Conflito · sincronizada');
   if(kind==='local'){acknowledge(path,item.remote);approved.set(path,canonicalString(item.local));}
   else {api.apply(path,item.remote.payload);acknowledge(path,item.remote);api.refresh();}
   conflicts.delete(path);lastError='';schedule();
  });
 }
 const interval=setInterval(()=>{if(active)reconcile();},15000);
 const online=()=>{lastError='';schedule();};window.addEventListener('online',online);window.addEventListener('offline',schedule);
 window.gcSyncSession={uid:user.uid,stop(){controller.stop();active=false;clearInterval(interval);clearTimeout(timer);unsubscribers.forEach(stop=>stop());window.removeEventListener('online',online);window.removeEventListener('offline',schedule);if(gameWrapper)gameWrapper.inert=false;bar.remove();}};
 schedule();
}



