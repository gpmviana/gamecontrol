import {doc,onSnapshot,runTransaction,serverTimestamp,Timestamp,collection,getDocsFromServer,getDocFromServer} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
/* Um controlador por equipa. As regras Firestore verificam o mesmo identificador. */
export function createControl(user,db,api,store,bar,callbacks){
 let token=crypto.randomUUID();try{const key='gc_control_tab_v3_'+user.uid;if(globalThis.performance?.getEntriesByType('navigation')[0]?.type==='reload')token=sessionStorage.getItem(key)||token;sessionStorage.setItem(key,token);}catch{}
 let label=(/iPad|Tablet/i.test(navigator.userAgent)?'Tablet':/iPhone|Android/i.test(navigator.userAgent)?'Telemóvel':'Computador')+' · '+token.slice(0,4);try{label=store.getItem('gc_device_name_v1')||label;}catch{}
 const transferring=new Set(),requestStops=new Map();let outgoing=null,incoming=null;const offlineOwners=new Set(),leases=new Map(),owners=new Set(),stops=[],watched=new Set();let active=true,working=false,lastTeam=null,received=null;const autoTried=new Set(),notes=new Map();
 const ref=id=>doc(db,'users',user.uid,'teams',id,'control','session');
 api.setViewer(true);
 const mode=document.createElement('div');mode.id='gcControlStatus';mode.style.cssText='margin:8px auto;padding:10px 14px;max-width:740px;border:1px solid var(--gc-line);border-radius:10px;font-size:13px';bar.after(mode);
 function button(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=fn;b.dataset.gcRead='true';bar.append(b);return b;}
 const assume=button('Começar a registar',()=>claim()),release=button('Passar para consulta',giveUp);button('Versões e cópias',()=>versions());button('Nome deste dispositivo',()=>{const value=prompt('Como queres identificar este dispositivo?',label);if(!value?.trim())return;label=value.trim().slice(0,80);store.setItem('gc_device_name_v1',label);if(own(api.activeTeam())&&navigator.onLine)renew(api.activeTeam()).catch(error=>callbacks.report(error.message));update();});
 const own=id=>!navigator.onLine&&offlineOwners.has(id)||owners.has(id)&&leases.get(id)?.holder===token;
 const valid=id=>owners.has(id)&&leases.get(id)?.holder===token&&leases.get(id)?.protocol===3;
 function update(){
  const id=api.activeTeam(),lease=leases.get(id),owns=own(id),held=lease?.holder&&lease.holder!==token;
  api.setViewer(!owns||transferring.has(id));assume.hidden=owns;release.hidden=!owns;
  assume.textContent=working?'A preparar…':navigator.onLine?(held?'Pedir registo':'Começar a registar'):'Registar offline';assume.disabled=working;release.disabled=working||!navigator.onLine;
  mode.textContent=owns?(navigator.onLine?'A registar nesta equipa · podes usar os jogadores e ações normalmente.':'A registar sem ligação · dados guardados neste dispositivo.'):
   working?'A preparar esta equipa…':notes.has(id)?notes.get(id):held?'Esta equipa está a ser usada em '+lease.label+'. Podes consultar ou escolher outra equipa.':
   !navigator.onLine?'Sem ligação · escolhe Registar offline se fores usar esta equipa.':'Esta equipa está disponível · a preparar o registo.';
  renderRequests();if(!owns&&received&&!working)mode.textContent+=' Última receção: '+received.toLocaleTimeString('pt-PT')+'.';
 }
 function watch(id){if(watched.has(id))return;watched.add(id);watchRequests(id);stops.push(onSnapshot(ref(id),snap=>{if(!active||snap.metadata.fromCache)return;const v=snap.exists()?snap.data():null;leases.set(id,v);if(v?.holder!==token){if(owners.has(id)){try{GCSafe.remember(store,id,api.collect()[id],'Controlo alterado · cópia deste dispositivo');}catch(error){callbacks.report('Mantém esta janela aberta: não foi possível conservar a cópia local.');}}owners.delete(id);}update();callbacks.schedule();},e=>{owners.delete(id);update();callbacks.report('Não foi possível confirmar o controlo: '+e.code);}));}
 async function claim({automatic=false,emergency=false}={}){if(!navigator.onLine){if(confirm('Registar apenas neste dispositivo, sem sincronização? Confirma que ninguém está a registar a mesma equipa noutro dispositivo. Ao voltar a ligação, compara as versões e assume o controlo para enviar.')){offlineOwners.add(api.activeTeam());update();}return;}if(working)return;const id=api.activeTeam();working=true;update();try{
  const known=leases.get(id);
  if(known?.holder&&known.holder!==token&&!emergency){if(!automatic)await requestRegistration(id,known);return;}
  if(emergency){if(Date.now()-(known?.updatedAt?.toMillis?.()||Date.now())<90000)throw Error('O outro dispositivo ainda está a comunicar. Usa Pedir registo.');if(!confirm('Continuação de emergência. Confirma que o outro dispositivo PAROU de registar. A última comunicação foi '+new Date(known.updatedAt.toMillis()).toLocaleString('pt-PT')+'. As versões diferentes terão de ser comparadas.'))return;}
  await callbacks.beforeClaim(id);
  const lease=await runTransaction(db,async tx=>{const snapshot=await tx.get(ref(id)),old=snapshot.exists()?snapshot.data():null;if(old?.holder&&old.holder!==token&&(!emergency||Date.now()-(old.updatedAt?.toMillis?.()||Date.now())<90000))throw Error('O controlo continua reservado. Pede a passagem de registo.');const next={holder:token,label,expiresAt:Timestamp.fromMillis(Date.now()+90000),updatedAt:serverTimestamp(),previousHolder:token,protocol:3};if(emergency){next.emergency=true;next.previousHolder=old?.holder||token;}tx.set(ref(id),next);return next;});leases.set(id,lease);offlineOwners.delete(id);owners.add(id);notes.delete(id);watch(id);callbacks.report('Controlo confirmado · a sincronizar esta equipa…');callbacks.schedule();
  }catch(e){
  const text=e.code==='permission-denied'?'O Firebase recusou o registo nesta equipa. Confirma que publicaste as regras novas e reabriste a aplicação.':e.message||'Não foi possível começar a registar.';
  notes.set(id,text);callbacks.report(text);
  if(!automatic&&e.code!=='gc/cancelled')alert(text);
 }finally{working=false;update();}}
 async function renew(id){await runTransaction(db,async tx=>{const snap=await tx.get(ref(id));if(snap.data()?.holder!==token){owners.delete(id);throw Error('O controlo passou para outro dispositivo. A tua versão local foi mantida.');}const lease={holder:token,label,expiresAt:Timestamp.fromMillis(Date.now()+90000),updatedAt:serverTimestamp(),previousHolder:token,protocol:3};tx.set(ref(id),lease);leases.set(id,lease);});}
 async function giveUp(){if(working||!navigator.onLine)return;const id=api.activeTeam();if(!confirm('Pausar, sincronizar e libertar o controlo desta equipa?'))return;api.pause();autoTried.add(id);working=true;update();try{await callbacks.beforeRelease(id);await runTransaction(db,async tx=>{const snap=await tx.get(ref(id));if(snap.data()?.holder!==token)throw Error('O controlo já mudou.');tx.set(ref(id),{holder:'',label:'',expiresAt:Timestamp.fromMillis(0),updatedAt:serverTimestamp(),previousHolder:token,protocol:3});});owners.delete(id);leases.set(id,null);callbacks.report('Sincronizado · controlo libertado');}catch(e){alert(e.message||'Existem alterações pendentes. O controlo foi mantido.');}finally{working=false;update();}}
 async function releaseInactive(id){
  for(let attempt=0;attempt<3&&active&&id!==api.activeTeam()&&own(id);attempt++){
   try{
    await callbacks.beforeRelease(id);
    await runTransaction(db,async tx=>{const snap=await tx.get(ref(id));if(snap.data()?.holder!==token)return;tx.set(ref(id),{holder:'',label:'',expiresAt:Timestamp.fromMillis(0),updatedAt:serverTimestamp(),previousHolder:token,protocol:3});});
    owners.delete(id);leases.set(id,null);return;
   }catch(error){if(attempt===2){callbacks.report('A equipa anterior ainda tem alterações por enviar. Os seus dados foram mantidos.');return;}await new Promise(resolve=>setTimeout(resolve,1200));}
  }
 }

 const requestHost=document.createElement('div');requestHost.dataset.gcRead='true';requestHost.style.cssText='padding:10px;max-width:740px;margin:auto;font-size:13px';mode.after(requestHost);
 const requestRef=(id,rid)=>doc(db,'users',user.uid,'teams',id,'controlRequests',rid);
 const milliseconds=v=>v?.toMillis?.()||0;
 function renderRequests(){
  if(!requestHost)return;requestHost.replaceChildren();const id=api.activeTeam(),lease=leases.get(id);
  const add=(title,fn)=>{const b=document.createElement('button');b.textContent=title;b.onclick=async()=>{b.disabled=true;try{await fn();}catch(error){callbacks.report(error.message);alert(error.message);}finally{b.disabled=false;}};requestHost.append(b);};
  if(incoming?.teamId===id&&transferring.has(id))requestHost.append(document.createTextNode('A confirmar a receção. Se não for concluída em 90 segundos, o registo continua neste dispositivo.'));
  if(outgoing?.teamId===id&&outgoing.status==='pending'&&milliseconds(outgoing.expiresAt)>Date.now()){requestHost.append(document.createTextNode('Pedido enviado · aguarda autorização (até 90 segundos). '));add('Cancelar pedido',()=>finishRequest(outgoing,'cancelled'));}
  if(incoming?.teamId===id&&own(id)&&!transferring.has(id)&&incoming.status==='pending'&&milliseconds(incoming.expiresAt)>Date.now()){requestHost.append(document.createTextNode(incoming.requesterLabel+' pede para registar esta equipa. '));add('Guardar e passar registo',()=>acceptRequest(incoming));add('Recusar',()=>finishRequest(incoming,'declined'));}
  if(navigator.onLine&&lease?.holder&&lease.holder!==token&&Date.now()-milliseconds(lease.updatedAt)>=90000)add('Continuar em emergência…',()=>claim({emergency:true}));
 }
 async function requestRegistration(id,lease){
  if(outgoing?.status==='pending'&&milliseconds(outgoing.expiresAt)>Date.now())return;
  const rid=crypto.randomUUID();const value={requester:token,requesterLabel:label,holder:lease.holder,status:'pending',expiresAt:Timestamp.fromMillis(Date.now()+90000),createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  await runTransaction(db,async tx=>{const current=(await tx.get(ref(id))).data();if(current?.holder!==lease.holder)throw Error('O controlo mudou. Tenta novamente.');tx.set(requestRef(id,rid),value);});outgoing={...value,id:rid,teamId:id};renderRequests();
 }
 async function finishRequest(r,status){await runTransaction(db,async tx=>{const s=await tx.get(requestRef(r.teamId,r.id));if(!['pending','accepted'].includes(s.data()?.status))return;tx.update(requestRef(r.teamId,r.id),{status,updatedAt:serverTimestamp()});});if(outgoing?.id===r.id)outgoing=null;if(incoming?.id===r.id)incoming=null;if(r.holder===token&&status==='expired')transferring.delete(r.teamId);update();}
 async function acceptRequest(r){
  const id=r.teamId;if(working||transferring.has(id)||!own(id)||id!==api.activeTeam())throw Error('Já não estás a registar esta equipa.');
  if(api.transferReady&&!api.transferReady())throw Error('Conclui a ação ou fecha a janela aberta antes de passar o registo.');
  api.pause();transferring.add(id);working=true;update();
  let accepted=false;try{const expected=await callbacks.beforeRelease(id);await runTransaction(db,async tx=>{
   const l=(await tx.get(ref(id))).data(),req=(await tx.get(requestRef(id,r.id))).data(),team=(await tx.get(doc(db,'users',user.uid,'teams',id))).data();
   if(l?.holder!==token||req?.status!=='pending'||milliseconds(req.expiresAt)<=Date.now()||team?.revision!==expected.revision)throw Error('O pedido expirou ou os dados mudaram. O controlo foi mantido.');
   tx.update(requestRef(id,r.id),{status:'accepted',acceptedRevision:team.revision,updatedAt:serverTimestamp()});
  });accepted=true;incoming={...r,status:'accepted'};callbacks.report('A aguardar confirmação da receção · jogo pausado.');}
  finally{if(!accepted)transferring.delete(id);working=false;update();}
 }
 async function receiveRequest(r){
  if(working||api.activeTeam()!==r.teamId)return;working=true;update();
  try{await callbacks.receive(r.teamId,r.acceptedRevision);const lease=await runTransaction(db,async tx=>{
   const current=(await tx.get(ref(r.teamId))).data(),req=(await tx.get(requestRef(r.teamId,r.id))).data(),team=(await tx.get(doc(db,'users',user.uid,'teams',r.teamId))).data();
   if(req?.status!=='accepted'||milliseconds(req.expiresAt)<=Date.now()||current?.holder!==r.holder||team?.revision!==r.acceptedRevision)throw Error('O pedido expirou ou os dados mudaram. O outro dispositivo mantém o controlo.');
   const next={holder:token,label,previousHolder:r.holder,protocol:3,requestId:r.id,expiresAt:Timestamp.fromMillis(Date.now()+90000),updatedAt:serverTimestamp()};tx.set(ref(r.teamId),next);tx.update(requestRef(r.teamId,r.id),{status:'completed',updatedAt:serverTimestamp()});return next;
  });leases.set(r.teamId,lease);owners.add(r.teamId);offlineOwners.delete(r.teamId);outgoing=null;notes.delete(r.teamId);callbacks.report('Dados recebidos e confirmados · podes registar.');callbacks.schedule();}
  catch(error){notes.set(r.teamId,'Receção por concluir · mantém a ligação e tenta novamente.');callbacks.report(error.message);}
  finally{working=false;update();}
 }
 function watchRequests(id){if(requestStops.has(id))return;const stop=onSnapshot(collection(db,'users',user.uid,'teams',id,'controlRequests'),snapshot=>{if(!active||snapshot.metadata.fromCache)return;for(const d of snapshot.docs){const r={...d.data(),id:d.id,teamId:id};if(r.requester===token){if(r.status==='accepted'&&!own(id)&&api.activeTeam()===id){outgoing=r;receiveRequest(r);}else if(r.status==='pending'&&milliseconds(r.expiresAt)>Date.now())outgoing=r;else if(outgoing?.id===r.id){outgoing=null;notes.set(id,r.status==='declined'?'Pedido recusado. O outro dispositivo mantém o registo.':'Pedido terminado. O controlo não foi alterado.');}}if(r.holder===token&&r.status==='completed'&&incoming?.id===r.id){transferring.delete(id);owners.delete(id);incoming=null;update();}if(r.holder===token&&['cancelled','declined','expired'].includes(r.status)&&incoming?.id===r.id){transferring.delete(id);incoming=null;update();}if(!transferring.has(id)&&r.holder===token&&r.status==='pending'&&milliseconds(r.expiresAt)>Date.now()&&api.activeTeam()===id)incoming=r;}renderRequests();},error=>callbacks.report('Não foi possível consultar pedidos: '+error.code));requestStops.set(id,stop);stops.push(stop);}
 const requestPulse=setInterval(()=>{if(outgoing&&['pending','accepted'].includes(outgoing.status)&&milliseconds(outgoing.expiresAt)<=Date.now()){const r=outgoing;outgoing=null;notes.set(r.teamId,'O pedido expirou. O controlo não foi alterado.');finishRequest(r,'expired').catch(()=>{});}if(incoming&&milliseconds(incoming.expiresAt)<=Date.now()){const r=incoming;finishRequest(r,'expired').catch(()=>{});}renderRequests();if(outgoing?.status==='accepted'&&!working&&!own(outgoing.teamId))receiveRequest(outgoing);},3000);stops.push(()=>{clearInterval(requestPulse);requestHost.remove();});
 let deviceNameOffered=false;
 function offerDeviceName(){if(!active||deviceNameOffered||store.getItem('gc_device_name_v1')||api.running()||document.querySelector('dialog[open]'))return;deviceNameOffered=true;
  const d=document.createElement('dialog');d.className='gc-zone-dialog gc-setup-dialog';d.dataset.gcRead='true';d.style.cssText='max-width:440px;text-align:left';
  const title=document.createElement('h2');title.textContent='Identifica este dispositivo';const note=document.createElement('p');note.textContent='O nome aparece quando estás a registar e nos pedidos de passagem de registo. Assim sabes qual é o telemóvel ou tablet em utilização. Exemplos: Tablet do X ou Telemóvel do X.';
  const form=document.createElement('form'),input=document.createElement('input');input.required=true;input.maxLength=80;input.placeholder='Ex.: Tablet do X ou Telemóvel do X';input.setAttribute('aria-label','Nome deste dispositivo');input.style.cssText='width:100%;box-sizing:border-box;padding:12px;margin:12px 0';
  const save=document.createElement('button');save.type='submit';save.textContent='Guardar nome';const later=document.createElement('button');later.type='button';later.textContent='Mais tarde';later.onclick=()=>d.close();form.append(input,save,later);form.onsubmit=async e=>{e.preventDefault();const value=input.value.trim();if(!value)return;try{store.setItem('gc_device_name_v1',value);label=value;d.close();if(own(api.activeTeam())&&navigator.onLine)await renew(api.activeTeam());update();}catch(error){alert('Não foi possível concluir: '+error.message);}};d.append(title,note,form);document.body.append(d);d.onclose=()=>d.remove();d.showModal();input.focus?.();
 }
 const devicePromptTimer=setInterval(offerDeviceName,3000);stops.push(()=>clearInterval(devicePromptTimer));
 function dialog(title){const d=document.createElement('dialog');d.className='gc-zone-dialog gc-setup-dialog';d.dataset.gcRead='true';const h=document.createElement('h2');h.textContent=title;const close=document.createElement('button');close.textContent='Fechar';close.onclick=()=>d.close();d.append(close,h);document.body.append(d);d.onclose=()=>d.remove();d.showModal();return d;}
 function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function versions(filter){const d=dialog('Versões e cópias recuperáveis'),note=document.createElement('p');note.textContent='Exporta ou recupera uma versão anterior de um jogo. As versões começam a ser conservadas com esta atualização. Recuperar altera o arquivo; mantém o jogo em curso.';d.append(note);const items=JSON.parse(store.getItem('gc_recovery_v2')||'[]');for(const c of JSON.parse(store.getItem('gc_sync_conflict_copies_v1')||'[]'))for(const k of ['local','cloud'])if(c[k])items.push({path:c.path,at:c.at,payload:c[k],reason:'Conflito antigo · '+k});
  const paths=filter?[filter]:callbacks.paths().filter(p=>p===api.activeTeam()||p.startsWith(api.activeTeam()+'/matches/'));
  const loading=document.createElement('p');loading.textContent='A consultar o servidor…';d.append(loading);let failed=false;
  if(navigator.onLine)for(const p of paths)try{const snapshots=await getDocsFromServer(collection(doc(db,'users',user.uid,'teams',...p.split('/')),'versions'));for(const x of snapshots.docs){const v=x.data();items.push({...v,versionId:x.id,path:p,at:v.at?.toDate?.().toISOString()||'',reason:'Servidor · '+(v.device||'')});}}catch(e){failed=true;loading.textContent='Não foi possível consultar versões do servidor ('+e.code+'). As cópias locais continuam disponíveis.';}if(!failed)loading.remove();
  const seen=new Set();for(const v of items.filter(v=>(!filter||v.path===filter)&&!window.gcPermanent?.blocks(v.path)&&!(v.versionId&&window.gcPermanent?.versionBlocked(v.path,v.versionId))).sort((a,b)=>(b.at||'').localeCompare(a.at||''))){const sig=v.path+JSON.stringify(v.payload);if(seen.has(sig))continue;seen.add(sig);const card=document.createElement('section');card.style.cssText='padding:14px;border-bottom:1px solid var(--gc-line)';const p=document.createElement('p');p.textContent=(v.at?new Date(v.at).toLocaleString('pt-PT'):'')+' · '+v.reason+' · '+GCSafe.summary(v.payload);card.append(p);const exp=document.createElement('button');exp.textContent='Exportar';exp.onclick=()=>download(v,'GameControl-versao');card.append(exp);const purge=document.createElement('button');purge.textContent='Eliminar definitivamente';purge.onclick=async()=>{purge.disabled=true;try{if(api.deletionReady&&!api.deletionReady())throw Error('Pausa o jogo antes de eliminar uma cópia.');if(v.versionId){if(!window.gcPermanent)throw Error('Aguarda pela sincronização.');if(await gcPermanent.remove('version',v.path.split('/')[0],v.versionId,{matchId:v.path.split('/')[2]||''})){d.close();versions(filter);}}else{if(prompt('Eliminar esta cópia local sem possibilidade de recuperação? Escreve ELIMINAR:')!=='ELIMINAR')return;const payload=JSON.stringify(v.payload);const recovery=JSON.parse(store.getItem('gc_recovery_v2')||'[]').filter(x=>!(x.path===v.path&&JSON.stringify(x.payload)===payload));store.setItem('gc_recovery_v2',JSON.stringify(recovery));const conflicts=JSON.parse(store.getItem('gc_sync_conflict_copies_v1')||'[]').map(x=>{if(x.path!==v.path)return x;const copy={...x};for(const k of ['local','cloud'])if(JSON.stringify(copy[k])===payload)delete copy[k];return copy;}).filter(x=>x.local||x.cloud);store.setItem('gc_sync_conflict_copies_v1',JSON.stringify(conflicts));d.close();versions(filter);}}catch(e){alert(e.message);}finally{purge.disabled=false;}};card.append(purge);if(Array.isArray((v.payload?.state||v.payload)?.players)){const restore=document.createElement('button');restore.textContent=v.path.includes('/matches/')?'Recuperar no arquivo':'Guardar como jogo recuperado';restore.onclick=()=>{if(!valid(v.path.split('/')[0])){alert('Assume o controlo desta equipa primeiro.');return;}if(!confirm('Recuperar esta versão no arquivo? A versão atual será conservada.'))return;try{const tid=v.path.split('/')[0];
      if(v.path.includes('/matches/'))callbacks.restore(v.path,v.payload);
      else {const state=v.payload.state||v.payload,id=crypto.randomUUID();callbacks.restore(tid+'/matches/'+id,{...state,id,teamProfile:tid,date:v.payload.matchDate||state.date||new Date().toISOString().slice(0,10),savedAt:new Date().toISOString(),teamA:state.teamA||v.payload.name||'Equipa',teamB:state.teamB||'Adversário',recoveredFrom:v.at||''});}
      d.close();}catch(e){alert(e.message);}};card.append(restore);}d.append(card);}if(!seen.size){const p=document.createElement('p');p.textContent='Ainda sem versões conservadas para este jogo.';d.append(p);}}
 function compare(path,item,choose,options={}){
  return new Promise(resolve=>{
   const d=dialog('Escolhe a versão que queres usar');d.style.cssText+=';width:min(900px,calc(100vw - 24px));max-width:900px;text-align:left';
   let settled=false,choosing=false;const finish=value=>{if(!settled){settled=true;resolve(value);}};
   const close=d.onclose;d.onclose=()=>{close?.();finish(false);};
   const subtitle=document.createElement('p');subtitle.textContent=options.teamName+(path.includes('/matches/')?' · Jogo guardado':' · Jogo atual');subtitle.style.cssText='font-size:14px;margin:8px 0 18px;color:var(--gc-muted)';d.append(subtitle);
   const state=v=>v?.state||v||{},num=v=>Number.isFinite(Number(v))?Number(v):0;
   const mins=(v,key)=>((state(v).players||[]).reduce((s,p)=>s+num(p[key]),0)/60).toLocaleString('pt-PT',{maximumFractionDigits:1})+' min';
   const clock=v=>Number.isFinite(state(v).remaining)?Math.floor(state(v).remaining/60)+':'+String(state(v).remaining%60).padStart(2,'0'):'—';
   const period=v=>{const s=state(v);return s.matchPeriod>2?'Prolongamento · '+(s.matchPeriod-2):s.firstHalf===false?'2.ª parte':'1.ª parte';};
   const values=v=>{const s=state(v);return [s.teamB||'—',v?.matchDate||v?.date||'—',(s.scoreA??'—')+' — '+(s.scoreB??'—'),period(v),clock(v),mins(v,'part1'),mins(v,'part2'),String((s.timeline||[]).length),String((s.players||[]).length),String((v?.roster||[]).length),path.includes('/matches/')?(v?.deleted?'Apagado':'Guardado'):(v?.archiveStatus?.archived?'Arquivada':'Ativa')];};
   const labels=['Adversário','Data do jogo','Resultado','Parte','Cronómetro','Minutos na 1.ª parte · soma','Minutos na 2.ª parte · soma','Eventos registados','Jogadores no jogo','Jogadores no plantel',path.includes('/matches/')?'Estado do jogo':'Estado da equipa'];
   const localValues=values(item.local),cloudValues=values(item.remote.payload);
   const grid=document.createElement('div');grid.className='gc-version-grid';
   const css=document.createElement('style');css.textContent='.gc-version-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.gc-version-card{padding:18px;border:1px solid var(--gc-line);border-radius:12px;background:var(--gc-raised)}.gc-version-card h3{font-size:17px;margin:0 0 7px}.gc-version-row{display:flex;justify-content:space-between;gap:14px;font-size:12px;padding:9px 0;border-bottom:1px solid var(--gc-line)}.gc-version-row span{color:var(--gc-muted)}.gc-version-row.is-different{border-left:3px solid #95bdd7;padding-left:8px}.gc-version-card button{width:100%;margin:12px 0 0;padding:12px;border:1px solid var(--gc-line);border-radius:8px;background:var(--gc-bg);color:var(--gc-ink);cursor:pointer}.gc-version-card button.gc-use-version{background:#95bdd726;border-color:#95bdd777;font-weight:600}.gc-version-error{padding:12px;border:1px solid #d4ae7380;border-radius:8px;margin-top:14px}.gc-version-card details{margin:13px 0;font-size:12px}.gc-version-card table{font-size:11px;width:100%}.gc-version-card th,.gc-version-card td{padding:6px 4px;white-space:normal}@media(max-width:620px){.gc-version-grid{grid-template-columns:1fr}.gc-version-card{padding:14px}}';d.append(css);
   const errorBox=document.createElement('p');errorBox.className='gc-version-error';errorBox.hidden=true;errorBox.role='status';
   const buttons=[];
   for(const kind of ['local','cloud']){
    const value=kind==='local'?item.local:item.remote.payload,rows=kind==='local'?localValues:cloudValues;
    const card=document.createElement('section');card.className='gc-version-card';const title=document.createElement('h3');title.textContent=kind==='local'?'Neste dispositivo':'Na tua conta';card.append(title);
    const info=document.createElement('p');info.style.cssText='font-size:11px;color:var(--gc-muted);margin-bottom:12px';const at=kind==='local'?value?.savedAt:item.remote.updatedAt?.toDate?.().toISOString();info.textContent=(kind==='cloud'?item.remote.device||'Última versão sincronizada':'Dados que estão abertos aqui')+(at?' · '+new Date(at).toLocaleString('pt-PT'):'');card.append(info);
    rows.forEach((value,index)=>{const row=document.createElement('div');row.className='gc-version-row'+(localValues[index]!==cloudValues[index]?' is-different':'');const k=document.createElement('span');k.textContent=labels[index];const b=document.createElement('strong');b.textContent=value;row.append(k,b);card.append(row);});
    const players=state(value).players||[];
    if(players.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Ver minutos por jogador';details.append(summary);const table=document.createElement('table');const header=document.createElement('tr');for(const label of ['Jogador','1.ª','2.ª','Total']){const cell=document.createElement('th');cell.textContent=label;header.append(cell);}table.append(header);for(const p of players){const row=document.createElement('tr');for(const value of [p.name||'Atleta',...['part1','part2','seconds'].map(k=>(num(p[k])/60).toLocaleString('pt-PT',{maximumFractionDigits:1}))]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}table.append(row);}details.append(table);card.append(details);}
    const use=document.createElement('button');use.className='gc-use-version';use.textContent=kind==='local'?'Usar versão deste dispositivo':'Usar versão sincronizada';use.onclick=async()=>{if(choosing)return;choosing=true;buttons.forEach(b=>b.disabled=true);errorBox.hidden=true;try{await choose(kind);finish(true);d.close();}catch(error){errorBox.textContent=error.message;errorBox.hidden=false;choosing=false;buttons.forEach(b=>b.disabled=false);if(error.code==='gc/newer'){const refresh=document.createElement('button');refresh.textContent='Atualizar comparação';refresh.onclick=()=>{finish(false);d.close();options.refresh?.();};errorBox.append(refresh);}}};buttons.push(use);card.append(use);
    const exp=document.createElement('button');exp.textContent='Exportar cópia desta versão';exp.onclick=()=>download(value,'GameControl-versao-'+kind);card.append(exp);grid.append(card);
   }
   d.append(grid,errorBox);const footer=document.createElement('p');footer.style.cssText='font-size:12px;line-height:1.6;color:var(--gc-muted);margin:16px 0 0';footer.textContent='As linhas assinaladas têm valores diferentes. As duas versões ficam conservadas antes da troca. Os minutos não são somados automaticamente.'+(options.claiming?' Depois de escolheres, a aplicação começa a registar nesta equipa.':'');d.append(footer);
  });
 }

 function guard(e){if(!window.gcReadOnly)return;const t=e.target;if(t.closest?.('#gcUpdatesDialog,#gcFAQDialog,#gcCompactStatus,.gc-dialog-closebar,#closePanel,#closePresets,#closeLoad,#closeEvents,#loginScreen,#gcSyncBar,#gcControlStatus,[data-gc-read],header,[data-lower-tab],#currentTeamSelect,[data-module-link]'))return;if(e.type==='keydown'&&e.key==='Escape')return;if(e.type!=='keydown'&&!t.closest?.('button,input,select,[onclick],.player'))return;e.preventDefault();e.stopImmediatePropagation();}
 for(const event of ['click','change','keydown','pointerdown','touchstart'])document.addEventListener(event,guard,true);
 const pulse=setInterval(async()=>{if(!active)return;const id=api.activeTeam();if(lastTeam!==id)teamChanged();if(navigator.onLine&&own(id)&&!working)try{await renew(id);}catch(e){callbacks.report(e.message);update();}},15000);
 const online=()=>{update();callbacks.schedule();};window.addEventListener('online',online);window.addEventListener('offline',online);const teamChanged=()=>{const previous=lastTeam;if(previous&&transferring.has(previous)){callbacks.report('A concluir a passagem da equipa anterior.');}if(outgoing&&outgoing.teamId!==api.activeTeam())finishRequest(outgoing,'cancelled').catch(()=>{});incoming=null;lastTeam=api.activeTeam();watch(lastTeam);update();if(previous&&previous!==lastTeam&&own(previous)&&!transferring.has(previous))releaseInactive(previous);callbacks.schedule();};window.addEventListener('gc:team-changed',teamChanged);
 const nudge=()=>callbacks.schedule();document.addEventListener('close',nudge,true);
 window.gcOpenVersions=versions;
 window.gcCanEditTeam=id=>active&&api.activeTeam()===id&&own(id)&&!transferring.has(id);
 window.gcRequestControl=async id=>{if(!active||api.activeTeam()!==id)return false;if(!own(id))await claim({automatic:true});return active&&api.activeTeam()===id&&own(id)&&!transferring.has(id);};
 lastTeam=api.activeTeam();update();watch(lastTeam);
 async function metadataLease(id,task){
  if(id===api.activeTeam()||valid(id))return task();
  const lease=await runTransaction(db,async tx=>{const snap=await tx.get(ref(id)),old=snap.exists()?snap.data():null;
   if(old?.holder&&old.holder!==token){const error=Error('A alteração da equipa aguarda que o outro dispositivo termine o registo nessa equipa.');error.code='gc/team-busy';throw error;}
   const next={holder:token,label,expiresAt:Timestamp.fromMillis(Date.now()+90000),updatedAt:serverTimestamp(),previousHolder:token,protocol:3};tx.set(ref(id),next);return next;
  });leases.set(id,lease);owners.add(id);
  try{return await task();}finally{
   try{await runTransaction(db,async tx=>{const snap=await tx.get(ref(id));if(snap.data()?.holder===token)tx.set(ref(id),{holder:'',label:'',expiresAt:Timestamp.fromMillis(0),updatedAt:serverTimestamp(),previousHolder:token,protocol:3});});}finally{owners.delete(id);update();}
  }
 }
 function maybeClaim(){const id=api.activeTeam(),lease=leases.get(id);if(!active||working||!navigator.onLine||own(id)||api.running()||!leases.has(id)||autoTried.has(id))return;
  // A reservation survives disconnection. Only an empty reservation is acquired automatically.
  if(lease?.holder&&lease.holder!==token)return;autoTried.add(id);claim({automatic:true});}
 return {token,get label(){return label;},ref,own,valid,watch,compare,maybeClaim,metadataLease,requestCurrent:()=>claim({automatic:true}),received(){received=new Date();update();},async ensure(id){if(own(id)&&!valid(id))await renew(id);},stop(){active=false;document.removeEventListener('close',nudge,true);clearInterval(pulse);stops.forEach(fn=>fn());for(const event of ['click','change','keydown','pointerdown','touchstart'])document.removeEventListener(event,guard,true);window.removeEventListener('online',online);window.removeEventListener('offline',online);window.removeEventListener('gc:team-changed',teamChanged);window.gcCanEditTeam=()=>false;window.gcRequestControl=async()=>false;api.setViewer(true);mode.remove();}};
}




