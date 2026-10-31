export const MODULE_LABELS={gameControl:'Game Control',wellness:'Wellness',athleteStats:'Estatísticas dos atletas'};
export function modulePermissions(profile={}){if(profile.role==='admin')return {gameControl:true,wellness:true,athleteStats:true};const value=profile.modules||{};return {gameControl:value.gameControl===undefined?true:value.gameControl===true,wellness:value.wellness===true,athleteStats:value.athleteStats===true};}
export function profileApproved(profile={},user={}){return profile.active!==false&&(!profile.status||profile.status==='approved')&&(profile.registrationVersion!==1||user.emailVerified===true);}
export function moduleAllowed(profile,user,module){return profileApproved(profile,user)&&modulePermissions(profile)[module]===true;}
export function canonical(value){function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}return JSON.stringify(sort(value));}
// A resolução é partilhada com os testes: nunca substituir alterações locais por uma versão remota sem decisão.
export function wellnessMerge(local,remote,ack){if(!remote)return local?'upload':'none';if(!local)return 'download';const own=canonical(local),cloud=canonical(remote.payload);if(own===cloud)return 'ack';if(ack?.digest===own)return 'download';if((ack?.revision??0)===remote.revision)return 'upload';return 'conflict';}

