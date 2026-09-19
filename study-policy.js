"use strict";

(function exposeStudyPolicy(global) {
  const DEFAULT_NEW_LIMIT = 5;
  const NEW_LIMIT_OPTIONS = Object.freeze([5, 10, 15]);
  const BACKLOG_THRESHOLD = 20;

  function calendarDayKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function validNewLimit(value) {
    const number = Number(value);
    return NEW_LIMIT_OPTIONS.includes(number) ? number : DEFAULT_NEW_LIMIT;
  }

  function dailyIntroductions(value, now = new Date()) {
    const today = calendarDayKey(now);
    const count = value?.date === today && Number.isInteger(value.count) && value.count > 0
      ? value.count
      : 0;
    return { date: today, count };
  }

  function queueForCollection({ cards, stateFor, states, newLimit, introduction, now = new Date() }) {
    const timestamp = now.getTime();
    const indexed = cards.map((card, index) => ({ card, index, state: stateFor(card) }));
    const due = indexed.filter(item => {
      if (item.state.state === states.New) return false;
      const dueAt = new Date(item.state.due).getTime();
      return !Number.isFinite(dueAt) || dueAt <= timestamp;
    });
    const rank = item => item.state.state === states.Learning || item.state.state === states.Relearning ? 0 : 1;
    due.sort((a, b) => {
      const rankDifference = rank(a) - rank(b);
      if (rankDifference) return rankDifference;
      const aDue = new Date(a.state.due).getTime();
      const bDue = new Date(b.state.due).getTime();
      const dueDifference = (Number.isFinite(aDue) ? aDue : 0) - (Number.isFinite(bDue) ? bDue : 0);
      return dueDifference || a.index - b.index;
    });

    const daily = dailyIntroductions(introduction, now);
    const remainingAllowance = Math.max(0, validNewLimit(newLimit) - daily.count);
    const newCards = indexed.filter(item => item.state.state === states.New);
    const backlogPaused = due.length >= BACKLOG_THRESHOLD;
    const availableNew = backlogPaused ? 0 : Math.min(remainingAllowance, newCards.length);
    const queue = due.concat(newCards.slice(0, availableNew)).map(item => item.card.id);

    return {
      queue,
      dueCount: due.length,
      availableNew,
      remainingAllowance,
      remainingUnintroduced: newCards.length,
      backlogPaused,
      daily
    };
  }

  global.StudyPolicy = Object.freeze({
    DEFAULT_NEW_LIMIT,
    NEW_LIMIT_OPTIONS,
    BACKLOG_THRESHOLD,
    calendarDayKey,
    validNewLimit,
    dailyIntroductions,
    queueForCollection
  });
})(typeof window === "undefined" ? globalThis : window);
