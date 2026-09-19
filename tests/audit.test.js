const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
test('policy and scheduler exactly match the inspected source blobs',()=>{
 const gitHash=file=>{const bytes=fs.readFileSync(path.join(root,file));return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');};
 assert.equal(gitHash('study-policy.js'),'efa638e554a9d8966206511b6888e564251397df');
 assert.equal(gitHash('vendor/ts-fsrs-5.4.1.umd.js'),'95a321081aa85b1c53da8d7a6c9a54544021ad6f');
});
test('runtime contains only independent namespaces and no automatic content',()=>{
 const banned=new RegExp(['mexican'+'-spanish','phy'+'sio','MEXICAN'+'_SPANISH','data/decks'].join('|'),'i');
 for(const file of ['index.html','app.js','storage.js','import.js','sw.js','register-sw.js','install.js','manifest.webmanifest']) assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),banned,file);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
 assert.equal(manifest.name,'Japanese Flashcards');assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');
 for(const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root,icon.src)));
});
