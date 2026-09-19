const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../import.js');
const valid=()=>({id:'hiragana',title:'Hiragana',cards:[{id:'a',front:'あ',back:'a'}]});
test('normalizes text/object sides, numeric IDs and stable identity version',()=>{
 const raw=valid(); raw.cards.push({id:2,front:{text:'猫',image:'images/cat.png',example:'ねこ'},back:'cat'});
 const d=DeckImport.normalize(raw); assert.equal(d.cards[1].id,'2');assert.equal(d.cards[0].identityVersion,'1');assert.deepEqual(d.imagePaths,['images/cat.png']);
});
test('rejects missing/duplicate IDs, empty sides, remote and traversal paths',()=>{
 for(const mutate of [d=>delete d.id,d=>delete d.cards[0].id,d=>d.cards.push(d.cards[0]),d=>d.cards[0].front='',d=>d.cards[0].front={image:'../cat.png'},d=>d.cards[0].front={image:'https://example.com/cat.png'},d=>d.schemaVersion=2]){const d=valid();mutate(d);assert.throws(()=>DeckImport.normalize(d));}
});
test('rejects invalid ZIP and unsupported file types',async()=>{
 await assert.rejects(()=>DeckImport.unzip(new ArrayBuffer(5)));
 await assert.rejects(()=>DeckImport.read(new File(['hello'],'deck.txt')));
});
test('JSON import accepts deck file and never imports supplied FSRS',async()=>{
 const d=valid(); d.cards[0].fsrs={state:2};const result=await DeckImport.read(new File([JSON.stringify(d)],'deck.json'));
 assert.equal(result.deck.cards[0].fsrs,undefined);assert.equal(result.images.size,0);
});
