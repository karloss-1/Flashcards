"use strict";
const SELECTED_DECK_KEY = "japanese-flashcards:selected-deck", NEW_LIMIT_KEY = "japanese-flashcards:new-limit";
const $ = id => document.getElementById(id);
const gradeButtons = [...document.querySelectorAll(".grade")];
let db, decks = [], progressByDeck = new Map(), deck = null, currentCardId = null;
let studyQueue = [], queueSnapshot = null, showing = false, dueTimer = null, busy = false, renderToken = 0;
let imageUrls = [];
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("japanese-flashcards:changes") : null;
function preference(key, value) {
  try { if (value === undefined) return localStorage.getItem(key); if (value === null) localStorage.removeItem(key); else localStorage.setItem(key,value); } catch (_) { /* Preferences are optional; study data is in IndexedDB. */ }
}
function setStatus(message) { $("status").textContent = message; }
function record() { return progressByDeck.get(deck?.id); }
function fsrsFor(card) { return record().cards[card.id]; }
function currentCard() { return deck?.cards.find(c => c.id === currentCardId); }
function selectedNewLimit() { return StudyPolicy.validNewLimit($("newLimitSelect").value); }
function nextDueAt(now = Date.now()) {
  return deck?.cards.map(fsrsFor).filter(s => s.state !== FSRS.State.New).map(s => new Date(s.due).getTime()).filter(t => Number.isFinite(t) && t > now).sort((a,b)=>a-b)[0] || null;
}
function scheduleNextDueCheck() {
  clearTimeout(dueTimer);
  if (!deck) return;
  const tomorrow = new Date(); tomorrow.setHours(24,0,0,0);
  const due = Math.min(nextDueAt() || Infinity, tomorrow.getTime());
  dueTimer = setTimeout(() => { if (!busy) rebuildQueue(); else scheduleNextDueCheck(); }, Math.min(Math.max(50,due-Date.now()),2147483647));
}
function rebuildQueue() {
  clearTimeout(dueTimer);
  if (!deck) { studyQueue=[]; queueSnapshot=null; currentCardId=null; showing=false; render(); return; }
  queueSnapshot = StudyPolicy.queueForCollection({cards:deck.cards,stateFor:fsrsFor,states:FSRS.State,newLimit:selectedNewLimit(),introduction:record().dailyIntroduction,now:new Date()});
  studyQueue=queueSnapshot.queue;
  if (!studyQueue.includes(currentCardId)) { currentCardId=studyQueue[0]||null; showing=false; }
  render(); scheduleNextDueCheck();
}
function nextReviewText() { const due=nextDueAt(); return due ? `Next review ${new Date(due).toLocaleString()}` : "No reviews are scheduled"; }
function emptyText() {
  if (!queueSnapshot.remainingUnintroduced) return `All cards introduced · ${nextReviewText()}`;
  if (!queueSnapshot.remainingAllowance) return `Today's new-card limit is complete · ${nextReviewText()}`;
  return nextReviewText();
}
function queueSummary() {
  if(queueSnapshot.backlogPaused) return `${queueSnapshot.dueCount} due reviews · New cards paused until you catch up`;
  return `${queueSnapshot.dueCount} due · ${queueSnapshot.availableNew} new available`;
}
function updateButtons() {
  gradeButtons.forEach(b=>b.disabled=busy||!showing||!currentCard());
  for(const id of ["previousButton","nextButton"]) $(id).disabled=busy||!studyQueue.length;
  $("deckSelect").disabled=busy||!decks.length;
  $("newLimitSelect").disabled=busy;
  $("importButton").disabled=busy||!db;
  document.querySelectorAll(".delete-deck").forEach(b=>b.disabled=busy);
}
function releaseImages() { for(const url of imageUrls) URL.revokeObjectURL(url); imageUrls=[]; }
async function renderContent(container, side, token) {
  container.replaceChildren();
  if(side.text) { const el=document.createElement("div"); el.className=`content-text ${showing?"answer":"front-text"}`; el.textContent=side.text; container.append(el); }
  if(side.example) { const el=document.createElement("div"); el.className=showing?"example-ja":"example-en"; el.textContent=side.example; container.append(el); }
  if(side.image) {
    try {
      const blob=await DeckStorage.image(db,deck.id,side.image);
      if(token!==renderToken) return;
      if(!blob) throw new Error("A stored image is missing. Reimport the deck ZIP to restore it.");
      const image=document.createElement("img"), url=URL.createObjectURL(blob);
      imageUrls.push(url); image.src=url; image.alt=side.text||"Card illustration";
      container.prepend(image);
    } catch(error) { if(token===renderToken) setStatus(error.message); }
  }
}
function render() {
  const current=currentCard(), token=++renderToken;
  releaseImages();
  $("progress").hidden=!studyQueue.length;
  $("emptyState").hidden=Boolean(current);
  $("card").hidden=!current;
  $("revealNote").hidden=!current||showing;
  $("emptyState").querySelector("strong").textContent=deck?"No cards are due":"No decks installed";
  $("emptyMessage").textContent=deck?emptyText():"Open Manage decks to import your first JSON or ZIP deck.";
  $("deckMeta").textContent=deck?`${deck.cards.length} cards · ${queueSummary()}`:"Your decks and progress stay on this device.";
  updateButtons();
  if(!current) { $("front").replaceChildren(); $("back").replaceChildren(); return; }
  const position=Math.max(1,studyQueue.indexOf(currentCardId)+1), state=fsrsFor(current).state===FSRS.State.New?"New":"Due";
  $("progressCount").textContent=`${position} / ${studyQueue.length}`;
  $("progressState").textContent=state;
  $("progressFill").style.width=`${position/studyQueue.length*100}%`;
  $("progress").setAttribute("aria-label",`Card ${position} of ${studyQueue.length}, ${state}`);
  $("sideLabel").textContent=showing?"Answer":"Front";
  $("card").setAttribute("aria-label",showing?"Answer, tap to show front":"Card, tap to reveal");
  $("front").hidden=showing; $("back").hidden=!showing;
  renderContent(showing?$("back"):$("front"),showing?current.back:current.front,token);
}
function renderDeckSelector() {
  $("deckSelect").replaceChildren(); $("deckList").replaceChildren();
  if(!decks.length) $("deckSelect").add(new Option("No decks installed",""));
  for(const item of decks) {
    $("deckSelect").add(new Option(item.title,item.id));
    const li=document.createElement("li"), title=document.createElement("span"), button=document.createElement("button");
    title.textContent=`${item.title} · ${item.cards.length} cards`;
    button.textContent="Delete"; button.className="delete-deck"; button.setAttribute("aria-label",`Delete ${item.title}`);
    button.addEventListener("click",()=>removeDeck(item.id));
    li.append(title,button); $("deckList").append(li);
  }
  $("deckSelect").value=deck?.id||"";
}
function selectDeck(id) {
  deck=decks.find(d=>d.id===id)||decks[0]||null;
  currentCardId=null; showing=false;
  preference(SELECTED_DECK_KEY,deck?.id||null);
  renderDeckSelector(); rebuildQueue();
}
async function refresh(preferred=deck?.id||preference(SELECTED_DECK_KEY)) {
  const snapshot=await DeckStorage.snapshot(db);
  decks=snapshot.decks; progressByDeck=new Map(snapshot.progress.map(p=>[p.deckId,p]));
  for(const item of decks) if(progressByDeck.get(item.id)?.schedulerVersion!==DeckStorage.SCHEDULER_VERSION) throw new Error("Unsupported scheduler data. No progress has been changed.");
  selectDeck(preferred);
}
function reveal() { if(!busy&&currentCard()) { showing=!showing; render(); } }
function navigate(direction) {
  if(busy||!studyQueue.length) return;
  const i=studyQueue.indexOf(currentCardId);
  currentCardId=studyQueue[(i+direction+studyQueue.length)%studyQueue.length]; showing=false; render();
}
async function grade(rating) {
  if(busy||!currentCard()||!showing) return;
  busy=true; updateButtons(); setStatus("");
  try { await DeckStorage.rate(db,deck.id,currentCardId,rating,selectedNewLimit()); await refresh(); channel?.postMessage("changed"); }
  catch(error) { setStatus(error.message); await refresh().catch(e=>setStatus(e.message)); }
  finally { busy=false; updateButtons(); }
}
async function importFile(file) {
  if(!file||busy) return;
  busy=true; updateButtons(); $("importStatus").textContent="Importing…";
  try {
    const {deck:incoming,images}=await DeckImport.read(file);
    if(decks.some(d=>d.id===incoming.id)&&!confirm(`Update “${incoming.title}”? Matching card IDs keep their compatible progress. Removed cards and unused images will be deleted.`)) { $("importStatus").textContent="Update cancelled."; return; }
    const result=await DeckStorage.importDeck(db,incoming,images);
    await refresh(incoming.id); channel?.postMessage("changed");
    $("importStatus").textContent=result.updated?"Deck updated. Compatible progress was preserved.":"Deck imported and stored on this device.";
    navigator.storage?.persist?.().catch(()=>{});
  } catch(error) { $("importStatus").textContent=error.message||"Import failed. Existing decks were not changed."; }
  finally { busy=false; $("file").value=""; updateButtons(); }
}
async function removeDeck(id) {
  if(busy) return;
  const target=decks.find(d=>d.id===id);
  if(!target||!confirm(`Delete “${target.title}”, all its images and study progress? This cannot be undone.`)) return;
  busy=true; updateButtons();
  try { await DeckStorage.removeDeck(db,id); await refresh(); channel?.postMessage("changed"); $("importStatus").textContent="Deck, images and progress deleted."; }
  catch(error) { $("importStatus").textContent=error.message; }
  finally { busy=false; updateButtons(); }
}
$("deckSelect").addEventListener("change",()=>selectDeck($("deckSelect").value));
$("newLimitSelect").addEventListener("change",()=>{ preference(NEW_LIMIT_KEY,String(selectedNewLimit())); currentCardId=null; showing=false; rebuildQueue(); });
for(const [dialogId,openId,closeId] of [["helpDialog","helpButton","closeHelpButton"],["decksDialog","manageButton","closeDecksButton"]]) {
  const dialog=$(dialogId);
  $(openId).addEventListener("click",()=>dialog.showModal()); $(closeId).addEventListener("click",()=>dialog.close());
  dialog.addEventListener("click",event=>{if(event.target===dialog) dialog.close();});
}
$("importButton").addEventListener("click",()=>$("file").click());
$("file").addEventListener("change",()=>importFile($("file").files[0]));
$("card").addEventListener("click",reveal);
$("card").addEventListener("keydown",event=>{ if(["Space","Enter"].includes(event.code)){event.preventDefault();event.stopPropagation();reveal();} });
$("previousButton").addEventListener("click",()=>navigate(-1)); $("nextButton").addEventListener("click",()=>navigate(1));
gradeButtons.forEach(button=>button.addEventListener("click",()=>grade(Number(button.dataset.grade))));
document.addEventListener("keydown",event=>{
  if(event.target.matches("input,select,textarea,button,[contenteditable]")||document.querySelector("dialog[open]")||event.repeat) return;
  if(event.code==="Space"){event.preventDefault();reveal();}
  if(event.key==="ArrowRight") navigate(1);
  if(event.key==="ArrowLeft") navigate(-1);
});
async function onRefresh() { if(db&&!busy) { busy=true; try { await refresh(); } catch(error){setStatus(error.message);} finally{busy=false;updateButtons();} } }
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible") onRefresh();});
window.addEventListener("pageshow",onRefresh);
if(channel) channel.onmessage=onRefresh;
window.addEventListener("storage",event=>{if(event.key===NEW_LIMIT_KEY){$("newLimitSelect").value=String(StudyPolicy.validNewLimit(event.newValue));rebuildQueue();}});
async function init() {
  try { db=await DeckStorage.open(); $("newLimitSelect").value=String(StudyPolicy.validNewLimit(preference(NEW_LIMIT_KEY))); await refresh(); }
  catch(error) { render(); setStatus(error.message||"Local storage could not be opened. Please check your browser settings."); }
}
init();
