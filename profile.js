import {onSnapshot,updateDoc} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

export function needsProfile(profile){
 return !String(profile?.displayName||profile?.name||'').trim()||!String(profile?.club||'').trim();
}
export function startProfile(user,db,reference){
 let profile=null,stopped=false,automaticShown=false,opened=null;
 const button=document.createElement('button');button.id='gcProfileButton';button.textContent='Perfil';button.dataset.gcRead='true';button.onclick=()=>open(false);
 document.querySelector('.top-buttons')?.append(button);
 const stop=onSnapshot(reference,snapshot=>{if(stopped||!snapshot.exists()||snapshot.metadata.fromCache)return;profile=snapshot.data();
  // Auth supplies the trusted email for old accounts. It never changes credentials.
  if(user.email&&profile.email!==user.email)updateDoc(reference,{email:user.email}).catch(()=>{});
  offer();
 });
 function offer(){if(stopped||automaticShown||!profile||!needsProfile(profile)||window.gcSyncAPI?.running()||opened)return;automaticShown=true;open(true);}
 function open(required){
  if(opened||!profile)return;
  if(window.gcSyncAPI?.running()){alert('Pausa o jogo e conclui a ação aberta antes de editar o perfil.');return;}
  const d=document.createElement('dialog');opened=d;d.className='gc-zone-dialog gc-setup-dialog';d.dataset.gcRead='true';d.style.cssText='width:min(440px,calc(100vw - 32px));text-align:left';
  const title=document.createElement('h2');title.textContent=required?'Completa o teu perfil':'O meu perfil';
  const note=document.createElement('p');note.textContent='Cada conta deve pertencer a uma só pessoa. O nome e o clube ajudam a identificar o teu acesso.';
  const form=document.createElement('form');form.style.cssText='display:grid;gap:14px';
  function field(label,value,max,readOnly=false){const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.value=value||'';input.maxLength=max;input.required=!readOnly;input.readOnly=readOnly;input.style.cssText='display:block;width:100%;box-sizing:border-box;padding:12px;margin-top:6px';l.append(input);form.append(l);return input;}
  const name=field('Nome',profile.displayName||profile.name,100),email=field('Email',user.email||profile.email,254,true),club=field('Clube',profile.club,120);
  const message=document.createElement('p');message.role='status';
  const save=document.createElement('button');save.type='submit';save.textContent='Guardar perfil';
  const later=document.createElement('button');later.type='button';later.textContent='Fechar';later.onclick=()=>d.close();
  form.append(message,save,later);d.append(title,note,form);document.body.append(d);
  form.onsubmit=async event=>{event.preventDefault();const displayName=name.value.trim(),clubName=club.value.trim();if(!displayName||!clubName){message.textContent='Preenche o nome e o clube.';return;}if(!navigator.onLine){message.textContent='Liga-te à internet para guardar o perfil.';return;}save.disabled=true;try{await updateDoc(reference,{displayName,club:clubName,...(user.email?{email:user.email}:{})});profile={...profile,displayName,club:clubName};d.close();}catch{message.textContent='Não foi possível guardar. Confirma a ligação e as regras do Firebase.';}finally{save.disabled=false;}};
  d.onclose=()=>{d.remove();opened=null;};d.showModal();
 }
 const timer=setInterval(offer,4000);
 return ()=>{stopped=true;stop();clearInterval(timer);opened?.close();button.remove();};
}
