/* Diyetisyen Ayşenur Korkmaz — bildirim alıcısı (service worker).
   Push mesajı içerik taşımaz; hangi bildirimin gösterileceğini sayfanın kaydettiği role göre seçeriz. */
const DBN='dyt-push', ST='kv';
function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DBN,1); r.onupgradeneeded=()=>r.result.createObjectStore(ST); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function kvGet(k){ try{ const d=await idb(); return await new Promise(res=>{ const q=d.transaction(ST).objectStore(ST).get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }); }catch(e){ return null; } }
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',e=>{
  e.waitUntil((async()=>{
    const role=(await kvGet('role'))||'client';
    let water=null;
    if(role!=='admin'){ try{
      const m=/[?&]v=([A-Za-z0-9_-]{8,80})/.exec((await kvGet('url'))||'');
      if(m){ const ac=new AbortController(); setTimeout(()=>ac.abort(),3500);
        const r=await fetch('https://dyt-aysenur-korkmaz-default-rtdb.europe-west1.firebasedatabase.app/shares/w_'+m[1]+'/last.json?_='+Date.now(),{cache:'no-store',signal:ac.signal});
        const j=r.ok?await r.json():null; if(j&&j.kind==='water'&&Date.now()-(+j.at||0)<150000&&j.msg) water=j; }
    }catch(e){} }
    const o=water?{title:'💧 Su vakti',body:String(water.msg).slice(0,140),tag:'dyt-water'}:role==='admin'
      ? {title:'💌 Danışandan yeni mesaj',body:'Sohbeti açmak için dokun.',tag:'dyt-admin'}
      : {title:'🌸 Diyetisyeninden mesajın var',body:'Seni görmek için dokun, yanıtlayabilirsin 💛',tag:'dyt-client'};
    await self.registration.showNotification(o.title,{body:o.body,tag:o.tag,renotify:true,icon:'/aysenur.jpg',badge:'/aysenur.jpg',data:{role}});
  })());
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil((async()=>{
    const role=(e.notification.data&&e.notification.data.role)||'client';
    const url=role==='admin'?'/':((await kvGet('url'))||'/');
    const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of all){ if('focus' in c){ try{ await c.focus(); if(role==='admin'&&c.navigate) {} return; }catch(x){} } }
    if(self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
