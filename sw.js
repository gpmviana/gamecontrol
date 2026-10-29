const VERSION='gc-pwa-modules-2026-10-29-6';
const ROOT=new URL('./',self.location.href);
const SHELL=['app.html','sincronizacao.js','modules.css','permissoes.js','wellness.html','wellness-app.js','atletas.html','athletes.js','athletes.css','module-session.js','firebase-config.js','style.css','logo-wellness.png','logo-gc.png','favicon.png','manifest.webmanifest','icon-192.png','icon-512.png'];
const FIREBASE=['firebase-app.js','firebase-auth.js','firebase-firestore.js'].map(file=>'https://www.gstatic.com/firebasejs/12.6.0/'+file);
async function cacheFirebaseModules(cache){
  const visited=new Set();
  async function visit(url){
    if(visited.has(url))return;visited.add(url);
    if(!url.startsWith('https://www.gstatic.com/firebasejs/12.6.0/'))throw Error('Dependência Firebase fora da lista permitida');
    const response=await fetch(url,{mode:'cors'});if(!response.ok)throw Error('Dependência indisponível');
    const source=await response.clone().text();await cache.put(url,response);
    const imports=[...source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)].map(m=>new URL(m[1],url).href);
    await Promise.all(imports.map(visit));
  }
  await Promise.all(FIREBASE.map(visit));
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(VERSION);
  await cache.addAll(SHELL.map(path=>new URL(path,ROOT).href));
  await cacheFirebaseModules(cache);
  try{await cache.add(new URL('logo-gc.png',ROOT).href);}catch(error){/* O logótipo não impede o funcionamento offline. */}
  // Só concluir a instalação se todas as dependências essenciais estiverem guardadas.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('gc-pwa-')&&key!==VERSION)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET')return;
  const firebase=url.href.startsWith('https://www.gstatic.com/firebasejs/12.6.0/');
  if(!firebase&&(url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname)))return;
  // Não guardar respostas de autenticação nem pedidos ao Firestore.
  if(!firebase&&!SHELL.some(file=>url.pathname===new URL(file,ROOT).pathname)&&url.pathname!==ROOT.pathname&&!/\.(png|svg|webp)$/.test(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(VERSION);
    if(url.pathname===ROOT.pathname)return fetch(request);
    const key=firebase?request:new URL(url.pathname,url.origin).href;
    const saved=await cache.match(key);if(saved)return saved;
    const response=await fetch(request);if(response.ok)await cache.put(key,response.clone());return response;
  })());
});



