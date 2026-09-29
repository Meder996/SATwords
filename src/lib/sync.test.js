import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, DAY } from './study.js';
import { mergeProgress, mergeOnSignIn, mergeSessions, normalizeProgress, progressKey } from './sync.js';

const word = (updatedAt, masteryLevel = 1) => ({ updatedAt, masteryLevel, interval: 1, repetitions: 1, nextReviewDate: updatedAt + DAY });

test('the most recently updated review of a word wins', () => {
  const merged = mergeProgress([
    { states: { a: word(100), b: word(500) } },
    { states: { a: word(900), c: word(50) } }
  ]);
  assert.equal(merged.states.a.updatedAt, 900);
  assert.equal(merged.states.b.updatedAt, 500);
  assert.equal(merged.states.c.updatedAt, 50);
});

test('daily activity keeps the larger count instead of summing', () => {
  const merged = mergeProgress([
    { activity: { '2026-09-28': 4, '2026-09-29': 2 } },
    { activity: { '2026-09-28': 7 } }
  ]);
  assert.deepEqual(merged.activity, { '2026-09-28': 7, '2026-09-29': 2 });
});

test('sessions are de-duplicated by id and sorted newest first', () => {
  const merged = mergeProgress([
    { sessions: [{ id: 'old', timestamp: 10, mode: 'quiz' }] },
    { sessions: [{ id: 'new', timestamp: 30 }, { id: 'old', timestamp: 10, mode: 'quiz' }] }
  ]);
  assert.deepEqual(merged.sessions.map(s => s.id), ['new', 'old']);
});

test('session history is capped at the same limit the app writes', () => {
  const many = Array.from({ length: 620 }, (_, i) => ({ id: `s${i}`, timestamp: i }));
  assert.equal(mergeSessions([{ sessions: many }]).length, 500);
});

test('xp keeps the highest total and settings come from the later source', () => {
  const merged = mergeProgress([
    { xp: 120, settings: { dailyGoal: 10, theme: 'dark' } },
    { xp: 40, settings: { theme: 'light' } }
  ]);
  assert.equal(merged.xp, 120);
  assert.deepEqual(merged.settings, { ...initialState.settings, dailyGoal: 10, theme: 'light' });
});

test('merging nothing yields a clean starting state', () => {
  assert.deepEqual(mergeProgress([]), initialState);
  assert.deepEqual(mergeProgress([null, undefined]), initialState);
});

test('signing in merges the guest and device copies with the account copy', () => {
  const merged = mergeOnSignIn({
    remote: { states: { a: word(200) }, xp: 300, sessions: [{ id: 'cloud', timestamp: 5 }], settings: { theme: 'dark' } },
    cached: { states: { c: word(400) } },
    guest: { states: { a: word(800), b: word(10) }, xp: 90, sessions: [{ id: 'guest', timestamp: 9 }], settings: { dailyGoal: 20, theme: 'light' } }
  });
  assert.equal(merged.states.a.updatedAt, 800);
  assert.equal(merged.states.b.updatedAt, 10);
  assert.equal(merged.states.c.updatedAt, 400);
  assert.equal(merged.xp, 300);
  assert.deepEqual(merged.sessions.map(s => s.id), ['guest', 'cloud']);
  assert.equal(merged.settings.dailyGoal, 20);
  // The account copy is the source of truth for preferences.
  assert.equal(merged.settings.theme, 'dark');
});

test('normalizeProgress repairs partial stored blobs and names keys per account', () => {
  const repaired = normalizeProgress({ xp: 30, settings: { theme: 'light' } });
  assert.equal(repaired.xp, 30);
  assert.deepEqual(repaired.states, {});
  assert.equal(repaired.settings.dailyGoal, initialState.settings.dailyGoal);
  assert.equal(progressKey('abc'), 'vocamaster-progress-v1:abc');
  assert.equal(progressKey(null), 'vocamaster-progress-v1');
});
