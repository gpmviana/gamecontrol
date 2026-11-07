import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {initializeAuth,inMemoryPersistence,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {firebaseConfig} from './firebase-config.js';
import {startRecovery} from './recuperar-ui.js';

// This page never signs in, signs out, stores credentials or changes the user's password itself.
const app=initializeApp(firebaseConfig,'password-recovery'),auth=initializeAuth(app,{persistence:inMemoryPersistence});
auth.languageCode='pt';
startRecovery({send:email=>sendPasswordResetEmail(auth,email)});

// Refresh future app navigations without restarting any game already open in another tab.
if('serviceWorker' in navigator){
 navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(registration=>{
  const activate=()=>registration.waiting?.postMessage({type:'GC_ACCOUNT_UPDATE_ACTIVATE'});
  activate();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',activate));
  registration.update().catch(()=>{});
 }).catch(()=>{});
}
