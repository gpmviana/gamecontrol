import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {getAuth,setPersistence,inMemoryPersistence,createUserWithEmailAndPassword,signInWithEmailAndPassword,sendEmailVerification,signOut} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const app=initializeApp(firebaseConfig,'registration'),auth=getAuth(app),db=getFirestore(app);
auth.languageCode='pt';await setPersistence(auth,inMemoryPersistence);
const element=id=>document.getElementById(id),status=element('status');let busy=false;
function message(error){return ({'auth/email-already-in-use':'Este email já tem conta. Usa «consultar pedido».','auth/invalid-email':'Indica um email válido.','auth/weak-password':'Escolhe uma palavra-passe mais forte.','auth/invalid-credential':'Email ou palavra-passe incorretos.','auth/too-many-requests':'Demasiadas tentativas. Aguarda antes de tentar novamente.','permission-denied':'O pedido não foi permitido. Confirma com a administração se as regras de registo já foram publicadas.'})[error.code]||'Não foi possível concluir. Verifica a ligação e tenta novamente.';}
async function perform(action){if(busy)return;busy=true;element('create').disabled=true;element('login').disabled=true;try{await action();}catch(error){console.error(error);status.textContent=message(error);}finally{busy=false;element('create').disabled=false;element('login').disabled=false;}}
async function ensureProfile(user){
 const ref=doc(db,'users',user.uid),snapshot=await getDoc(ref);if(snapshot.exists())return snapshot.data();
 const displayName=element('name').value.trim(),club=element('club').value.trim();
 if(!displayName)throw {code:'profile/name-required'};
 const profile={displayName,email:user.email,club,role:'coach',active:false,status:'pending',deviceLimit:3,emailVerified:false,registrationVersion:1,createdAt:serverTimestamp()};
 await setDoc(ref,profile);return profile;
}
async function showState(){
 const user=auth.currentUser;if(!user)return;
 await user.reload();await user.getIdToken(true);
 const profile=await ensureProfile(user);
 if(profile.registrationVersion===1&&user.emailVerified)await updateDoc(doc(db,'users',user.uid),{emailVerified:true});
 element('verification').hidden=false;
 if(!user.emailVerified)status.textContent='Conta criada. Abre a mensagem de confirmação no teu email. Depois volta aqui e carrega em «Já confirmei». Confirma também a pasta de spam.';
 else if(profile.status==='approved'&&profile.active!==false)status.textContent='Email confirmado e conta aprovada. Já podes voltar à aplicação e iniciar sessão.';
 else if(profile.status==='rejected')status.textContent='O pedido foi recusado. Contacta @gamecontrol.app para esclarecer.';
 else status.textContent='Email confirmado. O pedido aguarda aprovação da administração. Volta aqui mais tarde para consultar o estado.';
}
element('form').onsubmit=event=>{event.preventDefault();perform(async()=>{
 if(!element('name').value.trim()){status.textContent='Preenche o teu nome.';return;}
 if(auth.currentUser){await ensureProfile(auth.currentUser);await showState();return;}
 const result=await createUserWithEmailAndPassword(auth,element('email').value.trim(),element('password').value);
 element('password').value='';await ensureProfile(result.user);
 try{await sendEmailVerification(result.user);}catch(error){status.textContent='Conta criada, mas não foi possível enviar a confirmação. Usa Reenviar confirmação.';element('verification').hidden=false;return;}
 await showState();
});};
element('login').onclick=()=>perform(async()=>{await signInWithEmailAndPassword(auth,element('email').value.trim(),element('password').value);element('password').value='';await showState();});
element('check').onclick=()=>perform(showState);
element('resend').onclick=()=>perform(async()=>{if(auth.currentUser){await sendEmailVerification(auth.currentUser);status.textContent='Mensagem de confirmação enviada. Verifica o teu email e a pasta de spam.';}});
element('leave').onclick=()=>perform(async()=>{await signOut(auth);element('verification').hidden=true;status.textContent='Sessão terminada nesta página.';});
