// Merging rules for study progress. The same data can live in three places at once — the signed-in
// account (cloud), the account's on-device cache, and the guest session in the browser — so signing in
// has to combine them without ever losing a review. Pure functions, so the rules are unit-tested.
import { initialState } from './study.js';

export const PROGRESS_KEY = 'vocamaster-progress-v1';
export const GUEST_KEY = 'vocamaster-guest-v1';
export const SESSION_LIMIT = 500;

// Storage key for one account's cache; guests use the plain key.
export const progressKey = uid => (uid ? `${PROGRESS_KEY}:${uid}` : PROGRESS_KEY);

// Fills in whatever a stored or remote blob is missing.
export function normalizeProgress(value) {
  if (!value || typeof value !== 'object') return { ...initialState };
  return {
    ...initialState,
    ...value,
    states: value.states || {},
    activity: value.activity || {},
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    settings: { ...initialState.settings, ...(value.settings || {}) }
  };
}

// Word states: the most recently updated review wins.
function mergeStates(sources) {
  const states = {};
  for (const source of sources) {
    for (const [id, state] of Object.entries(source.states || {})) {
      if (!state) continue;
      const seen = states[id];
      if (!seen || (state.updatedAt || 0) >= (seen.updatedAt || 0)) states[id] = state;
    }
  }
  return states;
}

// Daily counts: keep the larger number, never sum, so a day is not double-counted.
function mergeActivity(sources) {
  const activity = {};
  for (const source of sources) {
    for (const [day, count] of Object.entries(source.activity || {})) {
      activity[day] = Math.max(activity[day] || 0, Number(count) || 0);
    }
  }
  return activity;
}

// Sessions are keyed by id, newest first, capped at the same limit the app writes.
export function mergeSessions(sources) {
  const sessions = new Map();
  for (const source of sources) {
    for (const session of source.sessions || []) {
      if (session?.id) sessions.set(session.id, session);
    }
  }
  return [...sessions.values()]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, SESSION_LIMIT);
}

// Merges any number of partial progress objects. Later sources win for settings (and for any
// extra field), while the study data is combined by the per-field rules above.
export function mergeProgress(sources = []) {
  const raw = sources.filter(Boolean);
  if (!raw.length) return { ...initialState };
  const list = raw.map(normalizeProgress);
  return {
    // Extra fields (if any) come from the later sources, then the study data is merged properly.
    ...Object.assign({}, ...list),
    states: mergeStates(list),
    activity: mergeActivity(list),
    sessions: mergeSessions(list),
    xp: Math.max(0, ...raw.map(source => Number(source.xp) || 0)),
    // Only the preference keys a source actually sets count, so a later source's defaults
    // never overwrite a choice made in an earlier one.
    settings: raw.reduce((settings, source) => ({ ...settings, ...(source.settings || {}) }), { ...initialState.settings })
  };
}

// Runs when someone signs in: the device copy and the guest session join the account's cloud copy.
// Order matters for settings only (the cloud copy wins); every review is preserved regardless.
export const mergeOnSignIn = ({ remote, cached, guest } = {}) => mergeProgress([cached, guest, remote]);
