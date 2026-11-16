/* Good & Handy Portal: keeps a copy of the app on the device so it opens with
   no signal. The page itself is always fetched fresh when there is a
   connection, so updates arrive exactly as before. */
const CACHE='gh-portal-v1';
const PAGE=self.registration.scope;
const LIBS=[
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js'
];
const FONT_CSS='https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap';

function timed(promise, ms){
  return new Promise((resolve, reject)=>{
    const t=setTimeout(()=>reject(new Error('timeout')), ms);
    promise.then(v=>{ clearTimeout(t); resolve(v); }, e=>{ clearTimeout(t); reject(e); });
  });
}
async function store(cache, url){
  const r=await fetch(url, {mode:'cors', credentials:'omit'});
  if(r.ok) await cache.put(url, r.clone());
  return r;
}
self.addEventListener('install', e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await Promise.allSettled([
      fetch(PAGE, {cache:'reload'}).then(r=>{ if(r.ok) return c.put(PAGE, r); }),
      store(c, PAGE+'logo.png'),
      store(c, FONT_CSS),
      ...LIBS.map(u=>store(c, u))
    ]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.indexOf('gh-portal-')===0 && k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  const scopePath=new URL(PAGE).pathname;
  // The app page: fresh from the network when possible, saved copy otherwise.
  if(req.mode==='navigate' && url.origin===self.location.origin && (url.pathname===scopePath || url.pathname===scopePath+'index.html')){
    e.respondWith((async()=>{
      const c=await caches.open(CACHE);
      try{
        const r=await timed(fetch(req), 7000);
        if(r && r.ok) c.put(PAGE, r.clone());
        return r;
      }catch(err){
        const hit=await c.match(PAGE);
        if(hit) return hit;
        throw err;
      }
    })());
    return;
  }
  // Libraries, fonts and the logo never change, so the saved copy is used first.
  const fixed = LIBS.indexOf(req.url)!==-1 || url.hostname==='fonts.googleapis.com' || url.hostname==='fonts.gstatic.com'
    || (url.origin===self.location.origin && url.pathname===scopePath+'logo.png');
  if(fixed){
    e.respondWith((async()=>{
      const c=await caches.open(CACHE);
      const hit=await c.match(req.url);
      if(hit) return hit;
      return store(c, req.url);
    })());
  }
});
