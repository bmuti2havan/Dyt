/* Diyetisyen Ayşenur Korkmaz — service worker:
   1) bildirim alıcısı (push mesajı içerik taşımaz; metni Firebase'deki w_<token>/last'tan okuruz)
   2) danışan sayfası için "anında açılış" önbelleği (stale-while-revalidate) */
const DBN='dyt-push', ST='kv', CACHE='dyt-shell-v1', FB='https://dyt-aysenur-korkmaz-default-rtdb.europe-west1.firebasedatabase.app';
function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DBN,1); r.onupgradeneeded=()=>r.result.createObjectStore(ST); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function kvGet(k){ try{ const d=await idb(); return await new Promise(res=>{ const q=d.transaction(ST).objectStore(ST).get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }); }catch(e){ return null; } }
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{ try{ for(const k of await caches.keys()) if(k!==CACHE) await caches.delete(k); }catch(x){} await self.clients.claim(); })()));

/* ── Önbellek ── */
async function swr(e,key,req,notify){
  const c=await caches.open(CACHE); const hit=await c.match(key);
  const net=fetch(req).then(async r=>{
    if(r&&r.ok){
      const old=hit&&(hit.headers.get('etag')||hit.headers.get('last-modified')||''), nw=r.headers.get('etag')||r.headers.get('last-modified')||'';
      await c.put(key,r.clone());
      if(notify&&hit&&old&&nw&&old!==nw){ (await self.clients.matchAll()).forEach(x=>x.postMessage({type:'shell-updated'})); }
    }
    return r;
  }).catch(()=>null);
  if(hit){ e.waitUntil(net); return hit; }
  return (await net)||Response.error();
}
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  let u; try{ u=new URL(req.url); }catch(x){ return; }
  if(u.origin!==location.origin) return;
  if(req.mode==='navigate'&&(u.pathname==='/'||u.pathname.endsWith('/index.html'))&&(u.searchParams.has('v')||u.searchParams.has('promo'))){ e.respondWith(swr(e,'/__shell',req,true)); return; }
  if(/^\/(img|fonts|vendor)\//.test(u.pathname)||u.pathname==='/aysenur.jpg'){ e.respondWith(swr(e,req.url,req,false)); }
});

/* ── Bildirimler ── */
self.addEventListener('push',e=>{
  e.waitUntil((async()=>{
    const role=(await kvGet('role'))||'client';
    let info=null;
    if(role!=='admin'){ try{
      const m=/[?&]v=([A-Za-z0-9_-]{8,80})/.exec((await kvGet('url'))||'');
      if(m){ const ac=new AbortController(); setTimeout(()=>ac.abort(),3500);
        const r=await fetch(FB+'/shares/w_'+m[1]+'/last.json?_='+Date.now(),{cache:'no-store',signal:ac.signal});
        const j=r.ok?await r.json():null; if(j&&j.msg&&Date.now()-(+j.at||0)<150000&&(j.kind==='water'||j.kind==='msg')) info=j; }
    }catch(x){} }
    const o=info&&info.kind==='water'?{title:'💧 Su vakti',body:String(info.msg).slice(0,140),tag:'dyt-water',tab:'today'}
      :info?{title:'💌 Diyetisyeninden mesaj',body:String(info.msg).slice(0,140),tag:'dyt-client',tab:'chat'}
      :role==='admin'?{title:'💌 Danışandan yeni mesaj',body:'Sohbeti açmak için dokun.',tag:'dyt-admin'}
      :{title:'🌸 Diyetisyeninden mesajın var',body:'Seni görmek için dokun, yanıtlayabilirsin 💛',tag:'dyt-client',tab:'chat'};
    try{ if(self.navigator&&self.navigator.setAppBadge) await self.navigator.setAppBadge(1); }catch(x){}
    await self.registration.showNotification(o.title,{body:o.body,tag:o.tag,renotify:true,icon:'/aysenur.jpg',badge:'/aysenur.jpg',data:{role,tab:o.tab||''}});
  })());
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil((async()=>{
    const d=e.notification.data||{}, role=d.role||'client', tab=d.tab||'';
    let url=role==='admin'?'/':((await kvGet('url'))||'/');
    if(tab&&role!=='admin') url+=(url.includes('?')?'&':'?')+'tab='+tab;
    const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of all){ if('focus' in c){ try{ await c.focus(); if(tab) c.postMessage({type:'goto',tab}); return; }catch(x){} } }
    if(self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
