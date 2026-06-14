const CACHE = "cet-v5";
const ASSETS = ["./","./index.html","./pwa/app.js","./pwa/styles.css","./pwa/config.js","./pwa/manifest.json","./pwa/icon-192.png","./pwa/icon-512.png"];
self.addEventListener("install",(e)=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",(e)=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",(e)=>{
  const u=new URL(e.request.url);
  if(u.pathname.endsWith("usage.json")||u.href.indexOf("onrender.com")>=0){ e.respondWith(fetch(e.request)); return; }
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r;}).catch(()=>caches.match(e.request)));
});
self.addEventListener("notificationclick",(e)=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(l=>{for(const c of l)if("focus"in c)return c.focus();if(clients.openWindow)return clients.openWindow("../");}));});
