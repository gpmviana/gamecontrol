import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {getFirestore,doc,getDoc,onSnapshot,collection,getDocs,updateDoc,serverTimestamp,query,limit,orderBy,startAfter,documentId} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js';
import {firebaseConfig} from './firebase-config.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);let cursor=null;
const unpack=d=>({... (d.data().payload||d.data()),id:d.id});
async function all(path){let out=[],last;for(;;){const q=query(collection(db,...path),orderBy(documentId()),...(last?[startAfter(last)]:[]),limit(300));const s=await getDocs(q);out.push(...s.docs.map(unpack));if(s.size<300)return out;last=s.docs.at(-1);if(out.length>=9000)throw Error('A consulta excede 9000 registos; exporta os dados pela consola Firebase.');}}
export const data={
watch:fn=>onAuthStateChanged(auth,fn),get currentUid(){return auth.currentUser?.uid;},login:(email,password)=>signInWithEmailAndPassword(auth,email,password),logout:()=>signOut(auth),
async profile(uid){const d=await getDoc(doc(db,'users',uid));return d.exists()?unpack(d):null;},watchProfile:(uid,fn,error)=>onSnapshot(doc(db,'users',uid),s=>fn(s.exists()?unpack(s):null),error),
async users(reset=true){if(reset)cursor=null;const s=await getDocs(query(collection(db,'users'),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(100)));cursor=s.docs.at(-1)||cursor;return {rows:s.docs.map(unpack),more:s.size===100};},
async update(uid,value){await updateDoc(doc(db,'users',uid),{...value,reviewedAt:serverTimestamp(),reviewedBy:auth.currentUser.uid});},
teams:uid=>all(['users',uid,'teams']),matches:(uid,team)=>all(['users',uid,'teams',team,'matches']),devices:uid=>all(['users',uid,'devices']),
async device(uid,id,blocked){await updateDoc(doc(db,'users',uid,'devices',id),{blocked});},
async backup(uid){const teams=await this.teams(uid),wellness=await all(['users',uid,'wellness']),devices=await this.devices(uid);for(const t of teams)t.matches=await this.matches(uid,t.id);return {version:1,exportedAt:new Date().toISOString(),uid,profile:await this.profile(uid),teams,wellness,devices};},
async remove(uid,confirmationUid){return (await httpsCallable(getFunctions(app,'europe-west1'),'deleteGameControlAccount')({uid,confirmationUid})).data;}
};
