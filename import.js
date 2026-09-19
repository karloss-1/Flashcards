"use strict";
(function (global) {
  const MAX_FILE = 50 * 1024 * 1024, MAX_EXPANDED = 100 * 1024 * 1024, MAX_ENTRIES = 5000;
  function path(value) {
    const normalized = String(value).replaceAll("\\", "/").replace(/^\.\//, "");
    if (!normalized || normalized.startsWith("/") || /[:?#\u0000-\u001f]/.test(normalized) || normalized.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Invalid image or archive path.");
    return normalized;
  }
  function mime(name) {
    return ({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",svg:"image/svg+xml"})[name.split(".").pop().toLowerCase()];
  }
  function id(value, label) {
    if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim() || String(value).length > 200) throw new Error(`${label} requires a stable ID (up to 200 characters).`);
    return String(value);
  }
  function content(value) {
    if (typeof value === "string" || typeof value === "number") value = {text: String(value)};
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Each card side must contain text or an image.");
    const side = {text: String(value.text ?? ""), image: value.image ? path(value.image) : "", example: String(value.example ?? "")};
    if (!side.text.trim() && !side.image) throw new Error("Each card side must contain text or an image.");
    if (side.image && !mime(side.image)) throw new Error("Images must be PNG, JPEG, WebP, GIF or SVG.");
    return side;
  }
  function normalize(raw) {
    if (!raw || !Array.isArray(raw.cards) || !raw.cards.length || raw.cards.length > 10000) throw new Error("A deck must contain between 1 and 10,000 cards.");
    if (raw.schemaVersion != null && raw.schemaVersion !== 1) throw new Error("Unsupported deck schemaVersion.");
    const deckId = id(raw.id, "Deck"), title = String(raw.title || raw.name || "").trim();
    if (!title || title.length > 300) throw new Error("A deck needs a title (up to 300 characters).");
    const seen = new Set();
    const cards = raw.cards.map(item => {
      if (!item || typeof item !== "object") throw new Error("Invalid card.");
      const cardId = id(item.id, "Card");
      if (seen.has(cardId)) throw new Error(`Duplicate card ID: ${cardId}`);
      seen.add(cardId);
      return {id: cardId, identityVersion: id(item.identityVersion ?? 1, "Card identityVersion"), front: content(item.front), back: content(item.back)};
    });
    return {id: deckId, title, schemaVersion: 1, cards, imagePaths: [...new Set(cards.flatMap(c => [c.front.image, c.back.image]).filter(Boolean))]};
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function unzip(buffer) {
    if (buffer.byteLength > MAX_FILE) throw new Error("The file exceeds 50 MB.");
    const bytes = new Uint8Array(buffer), view = new DataView(buffer);
    const check = (offset, size) => { if (offset < 0 || offset + size > bytes.length) throw new Error("Truncated ZIP archive."); };
    let end = -1;
    for (let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) {
      if (view.getUint32(i,true) === 0x06054b50 && i+22+view.getUint16(i+20,true) === bytes.length) { end=i; break; }
    }
    if (end < 0) throw new Error("Invalid ZIP archive.");
    const count = view.getUint16(end+10,true), centralSize = view.getUint32(end+12,true);
    let cursor = view.getUint32(end+16,true), expanded = 0;
    if (view.getUint16(end+4,true) || view.getUint16(end+6,true) || view.getUint16(end+8,true) !== count || count > MAX_ENTRIES || cursor+centralSize !== end) throw new Error("Split, ZIP64 or oversized ZIP archives are not supported.");
    const entries = new Map();
    for (let i=0;i<count;i++) {
      check(cursor,46);
      if (view.getUint32(cursor,true) !== 0x02014b50) throw new Error("Invalid ZIP directory.");
      const flags=view.getUint16(cursor+8,true), method=view.getUint16(cursor+10,true), crc=view.getUint32(cursor+16,true), compressedSize=view.getUint32(cursor+20,true), size=view.getUint32(cursor+24,true), nameLength=view.getUint16(cursor+28,true), extra=view.getUint16(cursor+30,true), comment=view.getUint16(cursor+32,true), local=view.getUint32(cursor+42,true);
      check(cursor+46,nameLength+extra+comment);
      const name = new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(cursor+46,cursor+46+nameLength));
      cursor += 46+nameLength+extra+comment;
      if (flags & 1 || ![0,8].includes(method)) throw new Error("Encrypted or unsupported ZIP compression.");
      expanded += size;
      if (expanded > MAX_EXPANDED) throw new Error("Expanded archive exceeds 100 MB.");
      if (name.endsWith("/")) continue;
      const normalized = path(name);
      if (entries.has(normalized)) throw new Error("Duplicate ZIP path.");
      check(local,30);
      if (view.getUint32(local,true) !== 0x04034b50) throw new Error("Invalid ZIP entry.");
      const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
      check(start,compressedSize);
      if (start+compressedSize > end-centralSize) throw new Error("Invalid ZIP data range.");
      let raw = bytes.subarray(start,start+compressedSize);
      if (method === 8) {
        if (!global.DecompressionStream) throw new Error("ZIP import needs a newer browser. Use JSON for text decks.");
        const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
        const chunks=[]; let length=0;
        while (true) {
          const {done,value}=await reader.read(); if(done) break;
          length+=value.length;
          if(length>size) { await reader.cancel(); throw new Error("Invalid expanded ZIP size."); }
          chunks.push(value);
        }
        raw=new Uint8Array(length); let offset=0; for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
      }
      if (raw.length !== size || crc32(raw) !== crc) throw new Error("Corrupted ZIP entry.");
      entries.set(normalized,new Blob([raw],{type:mime(normalized)||"application/json"}));
    }
    if(cursor !== end) throw new Error("Invalid ZIP directory length.");
    return entries;
  }
  async function read(file) {
    if (file.size > MAX_FILE) throw new Error("The file exceeds 50 MB.");
    if (file.name.toLowerCase().endsWith(".json")) return {deck: normalize(JSON.parse(await file.text())), images: new Map()};
    if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Choose a .json or .zip file.");
    const entries=await unzip(await file.arrayBuffer());
    const manifests=[...entries.keys()].filter(p=>p === "deck.json" || p.endsWith("/deck.json"));
    if(manifests.length !== 1) throw new Error("ZIP must contain exactly one deck.json.");
    const manifest=manifests[0], base=manifest.slice(0,-"deck.json".length);
    const deck=normalize(JSON.parse(await entries.get(manifest).text()));
    const images=new Map();
    for(const image of deck.imagePaths) {
      const blob=entries.get(base+image);
      if(!blob) throw new Error(`Missing image: ${image}`);
      images.set(image,blob);
    }
    return {deck,images};
  }
  global.DeckImport = Object.freeze({normalize,read,unzip});
})(globalThis);
