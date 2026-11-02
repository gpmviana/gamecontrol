import {doc,onSnapshot,runTransaction,serverTimestamp,Timestamp,collection,getDocsFromServer} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
/* Um controlador por equipa. As regras Firestore verificam o mesmo identificador. */
export function createControl(user,db,api,store,bar,callbacks){
 const token=crypto.randomUUID(),label=(/iPad|Tablet/i.test(navigator.userAgent)?'Tablet':/iPhone|Android/i.test(navigator.userAgent)?'Telemóvel':'Computador')+' · '+token.slice(0,4);
 const offlineOwners=new Set(),leases=new Map(),owners=new Set(),stops=[],watched=new Set();let active=true,working=false,lastTeam=null,received=null;const autoTried=new Set(),notes=new Map();
 const ref=id=>doc(db,'users',user.uid,'teams',id,'control','session');
 api.setViewer(true);
 const mode=document.createElement('div');mode.id='gcControlStatus';mode.style.cssText='margin:8px auto;padding:10px 14px;max-width:740px;border:1px solid var(--gc-line);border-radius:10px;font-size:13px';bar.after(mode);
 function button(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=fn;b.dataset.gcRead='true';bar.append(b);return b;}
 const assume=button('Começar a registar',()=>claim()),release=button('Passar para consulta',giveUp);button('Versões e cópias',()=>versions());
 const own=id=>!navigator.onLine&&offlineOwners.has(id)||owners.has(id)&&leases.get(id)?.holder===token;
 const valid=id=>own(id)&&(leases.get(id)?.expiresAt?.toMillis?.()||0)>Date.now();
 function update(){
  const id=api.activeTeam(),lease=leases.get(id),owns=own(id),held=lease?.holder&&lease.holder!==token&&(lease.expiresAt?.toMillis?.()||0)>Date.now();
  api.setViewer(!owns);assume.hidden=owns;release.hidden=!owns;
  assume.textContent=working?'A preparar…':navigator.onLine?'Começar a registar':'Registar offline';assume.disabled=working;release.disabled=working||!navigator.onLine;
  mode.textContent=owns?(navigator.onLine?'A registar nesta equipa · podes usar os jogadores e ações normalmente.':'A registar sem ligação · dados guardados neste dispositivo.'):
   working?'A preparar esta equipa…':notes.has(id)?notes.get(id):held?'Esta equipa está a ser usada em '+lease.label+'. Podes consultar ou escolher outra equipa.':
   !navigator.onLine?'Sem ligação · escolhe Registar offline se fores usar esta equipa.':'Esta equipa está disponível · a preparar o registo.';
  if(!owns&&received&&!working)mode.textContent+=' Última receção: '+received.toLocaleTimeString('pt-PT')+'.';
 }
 function watch(id){if(watched.has(id))return;watched.add(id);stops.push(onSnapshot(ref(id),snap=>{if(!active||snap.metadata.fromCache)return;const v=snap.exists()?snap.data():null;leases.set(id,v);if(v?.holder!==token)owners.delete(id);update();callbacks.schedule();},e=>{owners.delete(id);update();callbacks.report('Não foi possível confirmar o controlo: '+e.code);}));}
 async function claim({automatic=false}={}){if(!navigator.onLine){if(confirm('Registar apenas neste dispositivo, sem sincronização? Confirma que ninguém está a registar a mesma equipa noutro dispositivo. Ao voltar a ligação, compara as versões e assume o controlo para enviar.')){offlineOwners.add(api.activeTeam());update();}return;}if(working)return;const id=api.activeTeam();working=true;update();try{
  const known=leases.get(id);
  if(known?.holder&&known.holder!==token&&(known.expiresAt?.toMillis?.()||0)>Date.now())throw Error('Só esta equipa está ocupada em '+known.label+'. Podes escolher outra equipa e trabalhar nela. Para usar esta, termina o registo no outro dispositivo.');
  if(known?.holder&&known.holder!==token&&!automatic&&!confirm('O outro dispositivo deixou de responder. Confirma que já não está a registar esta equipa antes de continuares.'))return;
  await callbacks.beforeClaim(id);
  const lease=await runTransaction(db,async tx=>{const snapshot=await tx.get(ref(id)),old=snapshot.exists()?snapshot.data():null;if(old?.holder&&old.holder!==token&&(old.expiresAt?.toMillis?.()||0)>Date.now())throw Error('Outro dispositivo controla esta equipa. Nesse dispositivo, pausa e escolhe «Passar para consulta». Se perdeu a ligação, aguarda até 90 segundos e confirma que deixou de registar.');const next={holder:token,label,expiresAt:Timestamp.fromMillis(Date.now()+90000),updatedAt:serverTimestamp(),previousHolder:token};tx.set(ref(id),next);return next;});leases.set(id,lease);owners.add(id);notes.delete(id);watch(id);callbacks.report('Controlo confirmado · a sincronizar esta equipa…');callbacks.schedule();
  }catch(e){
  const text=e.code==='permission-denied'?'O Firebase recusou o registo nesta equipa. Confirma que publicaste as regras novas e reabriste a aplicação.':e.message||'Não foi possível começar a registar.';
  notes.set(id,text);callbacks.report(text);
  if(!automatic&&e.code!=='gc/cancelled')alert(text);
 }finally{working=false;update();}}
 async function renew(id){await runTransaction(db,async tx=>{const snap=await tx.get(ref(id));if(snap.data()?.holder!==token){owners.delete(id);throw Error('O controlo passou para outro dispositivo. A tua versão local foi mantida.');}const lease={holder:token,label,expiresAt:Timestamp.fromMillis(Date.now()+90000),updatedAt:serverTimestamp(),previousHolder:token};tx.set(ref(id),lease);leases.set(id,lease);});}
 async function giveUp(){if(working||!navigator.onLine)return;const id=api.activeTeam();if(!confirm('Pausar, sincronizar e libertar o controlo desta equipa?'))return;api.pause();autoTried.add(id);working=true;update();try{await callbacks.beforeRelease(id);await runTransaction(db,async tx=>{const snap=await tx.get(ref(id));if(snap.data()?.holder!==token)throw Error('O controlo já mudou.');tx.set(ref(id),{holder:'',label:'',expiresAt:Timestamp.fromMillis(0),updatedAt:serverTimestamp(),previousHolder:token});});owners.delete(id);leases.set(id,null);callbacks.report('Sincronizado · controlo libertado');}catch(e){alert(e.message||'Existem alterações pendentes. O controlo foi mantido.');}finally{working=false;update();}}
 async function releaseInactive(id){
  for(let attempt=0;attempt<3&&active&&id!==api.activeTeam()&&own(id);attempt++){
   try{
    await callbacks.beforeRelease(id);
    await runTransaction(db,async tx=>{const snap=await tx.get(ref(id));if(snap.data()?.holder!==token)return;tx.set(ref(id),{holder:'',label:'',expiresAt:Timestamp.fromMillis(0),updatedAt:serverTimestamp(),previousHolder:token});});
    owners.delete(id);leases.set(id,null);return;
   }catch(error){if(attempt===2){callbacks.report('A equipa anterior ainda tem alterações por enviar. Os seus dados foram mantidos.');return;}await new Promise(resolve=>setTimeout(resolve,1200));}
  }
 }
 function dialog(title){const d=document.createElement('dialog');d.className='gc-zone-dialog gc-setup-dialog';d.dataset.gcRead='true';const h=document.createElement('h2');h.textContent=title;const close=document.createElement('button');close.textContent='Fechar';close.onclick=()=>d.close();d.append(close,h);document.body.append(d);d.onclose=()=>d.remove();d.showModal();return d;}
 function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function versions(filter){const d=dialog('Versões e cópias recuperáveis'),note=document.createElement('p');note.textContent='Exporta ou recupera uma versão anterior de um jogo. As versões começam a ser conservadas com esta atualização. Recuperar altera o arquivo; mantém o jogo em curso.';d.append(note);const items=JSON.parse(store.getItem('gc_recovery_v2')||'[]');for(const c of JSON.parse(store.getItem('gc_sync_conflict_copies_v1')||'[]'))for(const k of ['local','cloud'])if(c[k])items.push({path:c.path,at:c.at,payload:c[k],reason:'Conflito antigo · '+k});
  const paths=filter?[filter]:callbacks.paths().filter(p=>p===api.activeTeam()||p.startsWith(api.activeTeam()+'/matches/'));
  const loading=document.createElement('p');loading.textContent='A consultar o servidor…';d.append(loading);let failed=false;
  if(navigator.onLine)for(const p of paths)try{const snapshots=await getDocsFromServer(collection(doc(db,'users',user.uid,'teams',...p.split('/')),'versions'));for(const x of snapshots.docs){const v=x.data();items.push({...v,path:p,at:v.at?.toDate?.().toISOString()||'',reason:'Servidor · '+(v.device||'')});}}catch(e){failed=true;loading.textContent='Não foi possível consultar versões do servidor ('+e.code+'). As cópias locais continuam disponíveis.';}if(!failed)loading.remove();
  const seen=new Set();for(const v of items.filter(v=>!filter||v.path===filter).sort((a,b)=>(b.at||'').localeCompare(a.at||''))){const sig=v.path+JSON.stringify(v.payload);if(seen.has(sig))continue;seen.add(sig);const card=document.createElement('section');card.style.cssText='padding:14px;border-bottom:1px solid var(--gc-line)';const p=document.createElement('p');p.textContent=(v.at?new Date(v.at).toLocaleString('pt-PT'):'')+' · '+v.reason+' · '+GCSafe.summary(v.payload);card.append(p);const exp=document.createElement('button');exp.textContent='Exportar';exp.onclick=()=>download(v,'GameControl-versao');card.append(exp);if(Array.isArray((v.payload?.state||v.payload)?.players)){const restore=document.createElement('button');restore.textContent=v.path.includes('/matches/')?'Recuperar no arquivo':'Guardar como jogo recuperado';restore.onclick=()=>{if(!valid(v.path.split('/')[0])){alert('Assume o controlo desta equipa primeiro.');return;}if(!confirm('Recuperar esta versão no arquivo? A versão atual será conservada.'))return;try{const tid=v.path.split('/')[0];
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
 const online=()=>{update();callbacks.schedule();};window.addEventListener('online',online);window.addEventListener('offline',online);const teamChanged=()=>{const previous=lastTeam;lastTeam=api.activeTeam();watch(lastTeam);update();if(previous&&previous!==lastTeam&&own(previous))releaseInactive(previous);callbacks.schedule();};window.addEventListener('gc:team-changed',teamChanged);
 const nudge=()=>callbacks.schedule();document.addEventListener('close',nudge,true);
 window.gcOpenVersions=versions;
 window.gcCanEditTeam=id=>active&&api.activeTeam()===id&&own(id);
 window.gcRequestControl=async id=>{if(!active||api.activeTeam()!==id)return false;if(!own(id))await claim({automatic:true});return active&&api.activeTeam()===id&&own(id);};
 lastTeam=api.activeTeam();update();watch(lastTeam);
 async function metadataLease(id,task){
  if(id===api.activeTeam()||valid(id))return task();
  const lease=await runTransaction(db,async tx=>{const snap=await tx.get(ref(id)),old=snap.exists()?snap.data():null;
   if(old?.holder&&old.holder!==token&&(old.expiresAt?.toMillis?.()||0)>Date.now()){const error=Error('A alteração da equipa aguarda que o outro dispositivo termine o registo nessa equipa.');error.code='gc/team-busy';throw error;}
   const next={holder:token,label,expiresAt:Timestamp.fromMillis(Date.now()+90000),updatedAt:serverTimestamp(),previousHolder:token};tx.set(ref(id),next);return next;
  });leases.set(id,lease);owners.add(id);
  try{return await task();}finally{
   try{await runTransaction(db,async tx=>{const snap=await tx.get(ref(id));if(snap.data()?.holder===token)tx.set(ref(id),{holder:'',label:'',expiresAt:Timestamp.fromMillis(0),updatedAt:serverTimestamp(),previousHolder:token});});}finally{owners.delete(id);update();}
  }
 }
 function maybeClaim(){const id=api.activeTeam(),lease=leases.get(id);if(!active||working||!navigator.onLine||own(id)||api.running()||!leases.has(id)||autoTried.has(id))return;
  // An expired lease permits a new controller; any offline branch is preserved as a separate version.
  if(lease?.holder&&(lease.expiresAt?.toMillis?.()||0)>Date.now())return;autoTried.add(id);claim({automatic:true});}
 return {token,label,ref,own,valid,watch,compare,maybeClaim,metadataLease,requestCurrent:()=>claim({automatic:true}),received(){received=new Date();update();},async ensure(id){if(own(id)&&!valid(id))await renew(id);},stop(){active=false;document.removeEventListener('close',nudge,true);clearInterval(pulse);stops.forEach(fn=>fn());for(const event of ['click','change','keydown','pointerdown','touchstart'])document.removeEventListener(event,guard,true);window.removeEventListener('online',online);window.removeEventListener('offline',online);window.removeEventListener('gc:team-changed',teamChanged);window.gcCanEditTeam=()=>false;window.gcRequestControl=async()=>false;api.setViewer(true);mode.remove();}};
}

