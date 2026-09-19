"use strict";
(function (global) {
  const DB_NAME = "japanese-flashcards-db", DB_VERSION = 1;
  const SCHEDULER_VERSION = "ts-fsrs@5.4.1";
  const scheduler = global.FSRS.fsrs();
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("decks")) db.createObjectStore("decks", {keyPath: "id"});
        if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress", {keyPath: "deckId"});
        if (!db.objectStoreNames.contains("images")) {
          const images = db.createObjectStore("images", {keyPath: ["deckId", "path"]});
          images.createIndex("deckId", "deckId");
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Close other app tabs and reload to update storage."));
    });
  }
  // Resolve on transaction completion, never on an individual write's success.
  function transaction(db, names, mode, work) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      let result, failure;
      const done = value => { result = value; };
      const fail = error => { failure = error; tx.abort(); };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error("Storage operation was cancelled."));
      tx.onerror = () => {};
      try { work(tx, done, fail); } catch (error) { fail(error); }
    });
  }
  function snapshot(db) {
    return transaction(db, ["decks", "progress"], "readonly", (tx, done) => {
      let decks, progress;
      const finish = () => { if (decks && progress) done({decks: decks.sort((a,b) => a.title.localeCompare(b.title)), progress}); };
      tx.objectStore("decks").getAll().onsuccess = e => { decks = e.target.result; finish(); };
      tx.objectStore("progress").getAll().onsuccess = e => { progress = e.target.result; finish(); };
    });
  }
  function image(db, deckId, path) {
    return transaction(db, ["images"], "readonly", (tx, done) => {
      tx.objectStore("images").get([deckId, path]).onsuccess = e => done(e.target.result?.blob);
    });
  }
  function importDeck(db, deck, imageFiles = new Map()) {
    return transaction(db, ["decks", "progress", "images"], "readwrite", (tx, done, fail) => {
      const decks = tx.objectStore("decks"), progress = tx.objectStore("progress"), images = tx.objectStore("images");
      let oldDeck, oldProgress, oldImages, reads = 0;
      const ready = () => {
        if (++reads !== 3) return;
        try {
          const previousCards = new Map((oldDeck?.cards || []).map(c => [c.id, c]));
          const savedImages = new Map(oldImages.map(i => [i.path, i.blob]));
          const blobs = new Map(deck.imagePaths.map(path => [path, imageFiles.get(path) || savedImages.get(path)]));
          for (const [path, blob] of blobs) if (!blob) throw new Error(`Missing image: ${path}. Import a ZIP containing this image.`);
          const compatible = oldProgress?.schedulerVersion === SCHEDULER_VERSION;
          const cards = Object.fromEntries(deck.cards.map(card => {
            const old = previousCards.get(card.id);
            const keep = compatible && old?.identityVersion === card.identityVersion && Object.hasOwn(oldProgress.cards, card.id);
            return [card.id, keep ? oldProgress.cards[card.id] : global.FSRS.createEmptyCard(new Date())];
          }));
          const now = Date.now();
          decks.put({...deck, createdAt: oldDeck?.createdAt || now, updatedAt: now});
          progress.put({deckId: deck.id, schedulerVersion: SCHEDULER_VERSION, cards,
            dailyIntroduction: oldProgress?.dailyIntroduction, updatedAt: now});
          for (const old of oldImages) images.delete([deck.id, old.path]);
          for (const [path, blob] of blobs) images.put({deckId: deck.id, path, blob});
          done({updated: Boolean(oldDeck)});
        } catch (error) { fail(error); }
      };
      decks.get(deck.id).onsuccess = e => { oldDeck = e.target.result; ready(); };
      progress.get(deck.id).onsuccess = e => { oldProgress = e.target.result; ready(); };
      images.index("deckId").getAll(deck.id).onsuccess = e => { oldImages = e.target.result; ready(); };
    });
  }
  function removeDeck(db, id) {
    return transaction(db, ["decks", "progress", "images"], "readwrite", tx => {
      tx.objectStore("decks").delete(id);
      tx.objectStore("progress").delete(id);
      tx.objectStore("images").index("deckId").openCursor(IDBKeyRange.only(id)).onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
    });
  }
  function rate(db, deckId, cardId, rating, newLimit, now = new Date()) {
    return transaction(db, ["decks", "progress"], "readwrite", (tx, done, fail) => {
      let deck, record, reads = 0;
      const ready = () => {
        if (++reads !== 2) return;
        try {
          if (!deck || !record) throw new Error("This deck was removed. Please select another deck.");
          if (record.schedulerVersion !== SCHEDULER_VERSION) throw new Error("Unsupported scheduler version; progress has not been changed.");
          if (![1,2,3,4].includes(rating)) throw new Error("Invalid rating.");
          const queue = global.StudyPolicy.queueForCollection({cards: deck.cards, stateFor: c => record.cards[c.id], states: global.FSRS.State, newLimit, introduction: record.dailyIntroduction, now});
          if (!queue.queue.includes(cardId)) throw new Error("This card is no longer available. The study queue has been refreshed.");
          const state = record.cards[cardId];
          const wasNew = state.state === global.FSRS.State.New;
          record.cards[cardId] = scheduler.next({...state, due: new Date(state.due), last_review: state.last_review ? new Date(state.last_review) : undefined}, now, rating).card;
          if (wasNew) {
            const daily = global.StudyPolicy.dailyIntroductions(record.dailyIntroduction, now);
            record.dailyIntroduction = {date: daily.date, count: daily.count + 1};
          }
          record.updatedAt = now.getTime();
          tx.objectStore("progress").put(record);
          done(record);
        } catch (error) { fail(error); }
      };
      tx.objectStore("decks").get(deckId).onsuccess = e => { deck = e.target.result; ready(); };
      tx.objectStore("progress").get(deckId).onsuccess = e => { record = e.target.result; ready(); };
    });
  }
  global.DeckStorage = Object.freeze({DB_NAME, DB_VERSION, SCHEDULER_VERSION, open, snapshot, image, importDeck, removeDeck, rate});
})(globalThis);
