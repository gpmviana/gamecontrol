import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs,updateDoc,serverTimestamp,query,limit} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),el=id=>document.getElementById(id);let admin=false;
el('loginForm').onsubmit=async event=>{event.preventDefault();try{await signInWithEmailAndPassword(auth,el('email').value.trim(),el('password').value);el('password').value='';}catch(error){el('status').textContent='Não foi possível iniciar sessão. Confirma o email e a palavra-passe.';}};
onAuthStateChanged(auth,async user=>{
 admin=false;el('panel').hidden=true;el('loginForm').hidden=!!user;
 if(!user){el('loginForm').hidden=false;return;}
 try{const profile=await getDoc(doc(db,'users',user.uid));admin=profile.exists()&&profile.data().role==='admin';
 if(!admin){el('status').textContent='Esta conta não tem permissões de administração.';el('loginForm').hidden=false;return;}
 el('panel').hidden=false;await refresh();
 }catch(error){el('status').textContent='Não foi possível verificar as permissões. Confirma as regras do Firestore.';el('loginForm').hidden=false;}
});
async function refresh(){
 if(!admin)return;el('requests').replaceChildren();el('status').textContent='A consultar contas…';
 try{const snapshot=await getDocs(query(collection(db,'users'),limit(200)));let count=0;
 snapshot.forEach(item=>{
  const p=item.data(),state=p.status||(p.active===false?'rejected':'approved');
  if(el('filter').value!=='all'&&el('filter').value!==state)return;count++;
  const row=document.createElement('article');row.className='row';
  const title=document.createElement('h2');title.textContent=p.displayName||p.name||p.email||item.id;row.appendChild(title);
  const details=document.createElement('p');details.textContent=[p.email,p.club,'Estado: '+({pending:'pendente',approved:'aprovado',rejected:'recusado'}[state]||state),'Email: '+(p.emailVerified?'confirmado':p.registrationVersion===1?'por confirmar':'conta anterior')].filter(Boolean).join(' · ');row.appendChild(details);
  const inspect=document.createElement('button');inspect.textContent='Consultar equipas e jogos';row.appendChild(inspect);
  const content=document.createElement('div');row.appendChild(content);
  inspect.onclick=async()=>{
    inspect.disabled=true;content.replaceChildren();
    try{
      const teams=await getDocs(collection(db,'users',item.id,'teams'));
      if(teams.empty){content.textContent='Ainda não existem equipas sincronizadas nesta conta. Os dados que estão apenas no dispositivo não podem ser consultados aqui.';return;}
      for(const team of teams.docs){
        const data=team.data(),heading=document.createElement('h3');heading.textContent=data.name||data.teamName||team.id;content.appendChild(heading);
        const roster=document.createElement('p');roster.textContent='Plantel: '+(Array.isArray(data.roster)?data.roster.map(p=>p.name).join(', '):'Ainda sem plantel sincronizado.');content.appendChild(roster);
        const matches=await getDocs(query(collection(db,'users',item.id,'teams',team.id,'matches'),limit(100)));
        if(matches.empty){const note=document.createElement('p');note.textContent='Ainda sem jogos sincronizados.';content.appendChild(note);}
        for(const match of matches.docs){
          const game=match.data(),line=document.createElement('p');line.textContent=[game.date,game.teamA,(game.scoreA??0)+' — '+(game.scoreB??0),game.teamB].filter(Boolean).join(' · ');content.appendChild(line);
          const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Consultar dados do jogo';details.appendChild(summary);
          const pre=document.createElement('pre');pre.style.cssText='font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere';pre.textContent=JSON.stringify(game,null,2);details.appendChild(pre);content.appendChild(details);
        }
      }
    }catch(error){content.textContent='Não foi possível consultar os dados. Confirma as permissões de administração.';}finally{inspect.disabled=false;}
  };
  if(p.role==='admin'){const note=document.createElement('p');note.textContent='Administrador — alterações reservadas à consola Firebase.';row.appendChild(note);}
  else{
   const label=document.createElement('label');label.textContent='Limite de dispositivos';const devices=document.createElement('input');devices.type='number';devices.min='1';devices.max='100';devices.value=p.deviceLimit??3;label.appendChild(devices);row.appendChild(label);
   for(const [state,text]of [['approved','Aprovar / guardar limite'],['rejected','Recusar / suspender']]){
    const button=document.createElement('button');button.textContent=text;
    button.disabled=state==='approved'&&p.registrationVersion===1&&!p.emailVerified;
    button.onclick=async()=>{
     const deviceLimit=Number(devices.value);if(!Number.isInteger(deviceLimit)||deviceLimit<1||deviceLimit>100){el('status').textContent='Escolhe entre 1 e 100 dispositivos.';return;}
     if(!confirm(text+' para '+(p.email||p.displayName||p.name||item.id)+'?'))return;
     button.disabled=true;
     try{await updateDoc(doc(db,'users',item.id),{status:state,active:state==='approved',deviceLimit,reviewedAt:serverTimestamp(),reviewedBy:auth.currentUser.uid});await refresh();}
     catch(error){el('status').textContent='Não foi possível guardar a decisão. Confirma as permissões.';button.disabled=false;}
    };row.appendChild(button);
   }
  }
  el('requests').appendChild(row);
 });
 el('status').textContent=count+' conta(s) apresentadas.'+(snapshot.size===200?' Consulta limitada às primeiras 200 contas.':'');
 }catch(error){el('status').textContent='Não foi possível consultar os pedidos. Confirma o acesso de administrador e as regras.';}
}
el('refresh').onclick=refresh;el('filter').onchange=refresh;el('signout').onclick=()=>signOut(auth);
