"use strict";

const assert = require("node:assert/strict");
require("../study-policy.js");

const { calendarDayKey, dailyIntroductions, queueForCollection, validNewLimit } = globalThis.StudyPolicy;
const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };
const NOW = new Date(2026, 8, 17, 12, 0, 0);
const due = new Date(NOW.getTime() - 60_000).toISOString();
const future = new Date(NOW.getTime() + 60_000).toISOString();
const card = (id, state = State.New, when = due) => ({ id, state: { state, due: when } });
const run = (items, options = {}) => queueForCollection({
  cards: items.map(item => ({ id: item.id })),
  stateFor: item => items.find(candidate => candidate.id === item.id).state,
  states: State,
  newLimit: options.limit ?? 5,
  introduction: options.introduction,
  now: options.now ?? NOW
});

assert.equal(validNewLimit(undefined), 5);
assert.equal(validNewLimit(10), 10);
assert.equal(validNewLimit(7), 5);
assert.equal(calendarDayKey(NOW), "2026-09-17");

{
  const result = run(Array.from({ length: 600 }, (_, index) => card(`w${index + 1}`)));
  assert.deepEqual(result.queue, ["w1", "w2", "w3", "w4", "w5"]);
  assert.equal(result.availableNew, 5);
}

{
  const today = { date: "2026-09-17", count: 5 };
  const items = Array.from({ length: 20 }, (_, index) => card(`n${index}`));
  assert.equal(run(items, { introduction: today }).availableNew, 0);
  assert.equal(run(items, { introduction: today }).queue.length, 0);
  assert.equal(run(items, { introduction: today }).daily.count, 5);
}

{
  const yesterday = { date: "2026-09-16", count: 5 };
  assert.deepEqual(dailyIntroductions(yesterday, NOW), { date: "2026-09-17", count: 0 });
  assert.equal(run([card("n1")], { introduction: yesterday }).availableNew, 1);
}

{
  const missedDays = { date: "2026-09-12", count: 5 };
  assert.equal(run(Array.from({ length: 20 }, (_, index) => card(`n${index}`)), { introduction: missedDays }).availableNew, 5);
}

{
  const threeToday = { date: "2026-09-17", count: 3 };
  assert.equal(run(Array.from({ length: 20 }, (_, index) => card(`n${index}`)), { limit: 10, introduction: threeToday }).availableNew, 7);
  assert.equal(run(Array.from({ length: 20 }, (_, index) => card(`n${index}`)), { limit: 5, introduction: { ...threeToday, count: 8 } }).availableNew, 0);
}

assert.equal(run([card("n1"), card("n2")]).availableNew, 2);

for (const count of [19, 20, 21]) {
  const items = Array.from({ length: count }, (_, index) => card(`r${index}`, State.Review)).concat(card("new"));
  const result = run(items);
  assert.equal(result.dueCount, count);
  assert.equal(result.backlogPaused, count >= 20);
  assert.equal(result.availableNew, count >= 20 ? 0 : 1);
}

{
  const items = [card("learn", State.Learning), card("review", State.Review), card("relearn", State.Relearning), card("new")];
  assert.deepEqual(run(items).queue, ["learn", "relearn", "review", "new"]);
}

{
  const above = Array.from({ length: 22 }, (_, index) => card(`r${index}`, State.Review)).concat(card("new"));
  assert.equal(run(above).availableNew, 0);
  const below = above.slice(14);
  assert.equal(run(below).availableNew, 1);
}

{
  const allIntroduced = [card("r1", State.Review, future), card("r2", State.Learning, future)];
  const result = run(allIntroduced);
  assert.equal(result.remainingUnintroduced, 0);
  assert.equal(result.queue.length, 0);
}

{
  const words = run(Array.from({ length: 10 }, (_, index) => card(`w${index}`)), { introduction: { date: "2026-09-17", count: 5 } });
  const verbs = run(Array.from({ length: 10 }, (_, index) => card(`v${index}`)), { introduction: { date: "2026-09-17", count: 0 } });
  assert.equal(words.availableNew, 0);
  assert.equal(verbs.availableNew, 5);
}

console.log("study-policy tests passed");

for (const limit of [5,10,15]) {
  assert.equal(run(Array.from({length:30},(_,i)=>card(`n${i}`)),{limit}).availableNew,limit);
}
{
 const items=[card('r-newer',State.Review,due),card('l-newer',State.Learning,due),card('r-older',State.Review,'2020-01-01'),card('l-older',State.Relearning,'2020-01-01'),card('invalid',State.Review,'bad'),card('future',State.Learning,future),card('new')];
 assert.deepEqual(run(items).queue,['l-older','l-newer','invalid','r-older','r-newer','new']);
}
