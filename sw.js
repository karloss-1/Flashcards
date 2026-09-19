"use strict";
const CACHE_PREFIX = "japanese-flashcards:" + self.registration.scope + ":";
const CACHE_NAME = CACHE_PREFIX + "v2";
const APP_FILES = ["./", "./index.html", "./manifest.webmanifest", "./study-policy.js", "./storage.js", "./import.js", "./app.js", "./install.js", "./register-sw.js", "./vendor/ts-fsrs-5.4.1.umd.js", "./assets/favicon-32.png", "./assets/apple-touch-icon.png", "./assets/isotype-128.png", "./assets/icon-192.png", "./assets/icon-512.png"];
const APP_URLS = new Set(APP_FILES.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_FILES))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET" || url.origin!==self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // One coherent precached app version; updates activate after old app tabs close.
  if(event.request.mode==="navigate") {
    event.respondWith(caches.open(CACHE_NAME).then(cache=>cache.match(new URL("./index.html",self.registration.scope).href)).then(cached=>cached||fetch(event.request)));
  } else if(APP_URLS.has(url.href)) {
    event.respondWith(caches.open(CACHE_NAME).then(cache=>cache.match(event.request)).then(cached=>cached||fetch(event.request)));
  }
});
