const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return(crc^0xffffffff)>>>0;}
function zip(files,method=8){const locals=[],central=[];let offset=0;for(const [name,value]of Object.entries(files)){const raw=Buffer.from(value),data=method===8?zlib.deflateRawSync(raw):raw,n=Buffer.from(name),crc=crc32(raw),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(method,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(raw.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);locals.push(l,n,data);central.push(c,n);offset+=l.length+n.length+data.length;}const cd=Buffer.concat(central),e=Buffer.alloc(22),count=Object.keys(files).length;e.writeUInt32LE(0x06054b50);e.writeUInt16LE(count,8);e.writeUInt16LE(count,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(offset,16);return Buffer.concat([...locals,cd,e]);}
const makeDeck=(id='basic',count=30)=>({id,title:`Japanese ${id}`,cards:Array.from({length:count},(_,i)=>({id:`c${i}`,front:`Question ${i}`,back:{text:`答え ${i}`,example:'日本語'}}))});
test('browser study, atomic persistence, imports, isolation, mobile and offline', {timeout:120000}, async t=>{
 const server=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/Flashcards\//,'');if(!p)p='index.html';const full=path.resolve(root,p);if(!full.startsWith(root+path.sep)){res.writeHead(404).end();return;}fs.readFile(full,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'html':'text/html','js':'text/javascript','webmanifest':'application/manifest+json','png':'image/png','svg':'image/svg+xml'})[p.split('.').pop()]||'application/octet-stream');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 t.after(async()=>{await browser.close();await new Promise(r=>server.close(r));});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const url=`http://127.0.0.1:${server.address().port}/Flashcards/`;
 await page.goto(url);await page.waitForFunction(()=>Boolean(globalThis.DeckStorage)&&!document.getElementById('importButton').disabled);
 const snapshot=()=>page.evaluate(async()=>DeckStorage.snapshot(await DeckStorage.open()));
 const importJSON=async raw=>{await page.locator('#manageButton').click();await page.locator('#file').setInputFiles({name:'deck.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});await page.waitForFunction(()=>!document.getElementById('importButton').disabled);await page.locator('#closeDecksButton').click();};
 const rate=async grade=>{await page.locator('#card').click();await page.locator(`[data-grade="${grade}"]`).click();await page.waitForFunction(()=>!document.getElementById('newLimitSelect').disabled);};
 await t.test('starts empty; JSON import and navigation/reveal do not consume quota',async()=>{
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/empty-mobile.png'),fullPage:true});
  assert.equal((await snapshot()).decks.length,0);assert.equal(await page.locator('#card').isVisible(),false);assert.match(await page.locator('#emptyState').innerText(),/No decks installed/);
  await importJSON(makeDeck());assert.match(await page.locator('#deckMeta').innerText(),/5 new available/);
  await page.locator('#nextButton').click();await page.locator('#previousButton').click();await page.locator('#card').focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('#back').isVisible(),true);assert.equal((await snapshot()).progress[0].dailyIntroduction,undefined);
  await page.keyboard.press('Space');assert.equal(await page.locator('#front').isVisible(),true);
  await page.screenshot({path:path.join(root,'test-results/study-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1200,height:1000});await page.screenshot({path:path.join(root,'test-results/study-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
 });
 await t.test('first rating counts exactly once; limits 5/10/15, independent decks, reload',async()=>{
  await rate(4);assert.equal((await snapshot()).progress[0].dailyIntroduction.count,1);
  await page.locator('#newLimitSelect').selectOption('10');assert.match(await page.locator('#deckMeta').innerText(),/9 new available/);
  await page.locator('#newLimitSelect').selectOption('15');assert.match(await page.locator('#deckMeta').innerText(),/14 new available/);
  await page.reload();await page.waitForFunction(()=>document.getElementById('deckSelect').value==='basic');assert.equal((await snapshot()).progress[0].dailyIntroduction.count,1);
  await importJSON(makeDeck('second'));assert.match(await page.locator('#deckMeta').innerText(),/15 new available/);
  await rate(1);const s=await snapshot();assert.equal(s.progress.find(p=>p.deckId==='second').dailyIntroduction.count,1);assert.equal(s.progress.find(p=>p.deckId==='basic').dailyIntroduction.count,1);
 });
 await t.test('updates preserve stable IDs and quota, reset changed identity, discard removed cards',async()=>{
  const before=(await snapshot()).progress.find(p=>p.deckId==='basic').cards.c0;
  const raw=makeDeck();raw.cards=raw.cards.slice(0,3);raw.cards[0].back='Corrected answer';await importJSON(raw);
  let p=(await snapshot()).progress.find(p=>p.deckId==='basic');assert.deepEqual(p.cards.c0,before);assert.equal(p.dailyIntroduction.count,1);assert.equal(Object.keys(p.cards).length,3);
  raw.cards[0].identityVersion=2;await importJSON(raw);p=(await snapshot()).progress.find(p=>p.deckId==='basic');assert.equal(p.cards.c0.state,0);assert.equal(p.dailyIntroduction.count,1);
 });
 await t.test('ZIP store/deflate, images, rollback on invalid import, image cleanup',async()=>{
  const d=makeDeck('images',2);d.cards[0].front={image:'images/card.png',text:'Picture'};
  const png=fs.readFileSync(path.join(root,'assets/icon-192.png'));
  for(const method of [0,8]){
   await page.locator('#manageButton').click();await page.locator('#file').setInputFiles({name:'deck.zip',mimeType:'application/zip',buffer:zip({'sample/deck.json':JSON.stringify(d),'sample/images/card.png':png},method)});
   await page.waitForFunction(()=>!document.getElementById('importButton').disabled);assert.match(await page.locator('#importStatus').innerText(),/imported|updated/);await page.locator('#closeDecksButton').click();
   await page.waitForFunction(()=>document.querySelector('#front img')?.naturalWidth>0);
  }
  const result=await page.evaluate(async()=>{const db=await DeckStorage.open();const old=await DeckStorage.snapshot(db);const raw={id:'images',title:'Broken',cards:[{id:'c0',front:{image:'missing.png'},back:'answer'}]};try{await DeckStorage.importDeck(db,DeckImport.normalize(raw));return false;}catch{}return JSON.stringify(old)===JSON.stringify(await DeckStorage.snapshot(db));});assert.equal(result,true);
  // A JSON text update can reuse an existing local image.
  await importJSON(d);await page.waitForFunction(()=>document.querySelector('#front img')?.naturalWidth>0);
  d.cards[0].front='No image now';await importJSON(d);
  assert.equal(await page.evaluate(async()=>Boolean(await DeckStorage.image(await DeckStorage.open(),'images','images/card.png'))),false);
 });
 await t.test('backlog 20 blocks new; 19 resumes; overdue learning precedes reviews',async()=>{
  const result=await page.evaluate(async raw=>{
   const db=await DeckStorage.open();await DeckStorage.importDeck(db,DeckImport.normalize(raw));
   await new Promise((resolve,reject)=>{const tx=db.transaction('progress','readwrite'),store=tx.objectStore('progress');store.get(raw.id).onsuccess=e=>{const p=e.target.result;for(let i=0;i<20;i++){p.cards[`c${i}`].state=i===19?1:2;p.cards[`c${i}`].due=new Date(2020,0,1);}store.put(p);};tx.oncomplete=resolve;tx.onabort=reject;});
   const p=(await DeckStorage.snapshot(db)).progress.find(p=>p.deckId===raw.id);const q=StudyPolicy.queueForCollection({cards:raw.cards,stateFor:c=>p.cards[c.id],states:FSRS.State,newLimit:15});return q;
  },makeDeck('backlog'));assert.equal(result.availableNew,0);assert.equal(result.queue[0],'c19');
  await page.reload();await page.waitForFunction(()=>!document.getElementById('deckSelect').disabled);await page.locator('#deckSelect').selectOption('backlog');assert.match(await page.locator('#deckMeta').innerText(),/New cards paused/);
  await rate(4);assert.match(await page.locator('#deckMeta').innerText(),/15 new available|10 new available/);
 });
 await t.test('atomic concurrent grading and calendar-day reset',async()=>{
  const result=await page.evaluate(async raw=>{
   const db=await DeckStorage.open();await DeckStorage.importDeck(db,DeckImport.normalize(raw));
   const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
   await DeckStorage.rate(db,raw.id,'c0',4,5,yesterday);
   const results=await Promise.allSettled([DeckStorage.rate(db,raw.id,'c1',4,5),DeckStorage.rate(db,raw.id,'c1',4,5)]);
   const p=(await DeckStorage.snapshot(db)).progress.find(p=>p.deckId===raw.id);
   return {success:results.filter(r=>r.status==='fulfilled').length,count:p.dailyIntroduction.count};
  },makeDeck('concurrent'));assert.deepEqual(result,{success:1,count:1});
 });
 await t.test('PWA precache, unrelated cache isolation, offline reload and image study',async()=>{
  await page.evaluate(async()=>{await caches.open('other-app-cache');await navigator.serviceWorker.ready;});await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const d=makeDeck('offline',2);d.cards[0].front={text:'Offline image',image:'card.png'};
  await page.evaluate(async({raw,bytes})=>{await DeckStorage.importDeck(await DeckStorage.open(),DeckImport.normalize(raw),new Map([['card.png',new Blob([new Uint8Array(bytes)],{type:'image/png'})]]));},{raw:d,bytes:[...fs.readFileSync(path.join(root,'assets/icon-192.png'))]});
  await page.reload();await page.waitForFunction(()=>!document.getElementById('deckSelect').disabled);await page.locator('#deckSelect').selectOption('offline');
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>document.querySelector('#front img')?.naturalWidth>0);await rate(3);
  assert.equal((await snapshot()).progress.find(p=>p.deckId==='offline').dailyIntroduction.count,1);
  assert.equal(await page.evaluate(async()=> (await caches.keys()).includes('other-app-cache')),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await context.setOffline(false);
 });
 await t.test('delete removes images and progress; no runtime errors',async()=>{
  await page.locator('#manageButton').click();await page.getByRole('button',{name:'Delete Japanese offline',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('importButton').disabled);
  const s=await snapshot();assert.equal(s.decks.some(d=>d.id==='offline'),false);assert.equal(s.progress.some(p=>p.deckId==='offline'),false);
  assert.equal(await page.evaluate(async()=>Boolean(await DeckStorage.image(await DeckStorage.open(),'offline','card.png'))),false);
  await page.locator('#closeDecksButton').click();
  await page.evaluate(async()=>{const db=await DeckStorage.open();for(const d of (await DeckStorage.snapshot(db)).decks) await DeckStorage.removeDeck(db,d.id);});await page.reload();await page.waitForFunction(()=>document.getElementById('emptyState').innerText.includes('No decks installed'));assert.equal(await page.locator('#card').isVisible(),false);
  assert.deepEqual(errors,[]);
 });
});
