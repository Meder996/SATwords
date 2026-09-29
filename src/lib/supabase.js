// Supabase accounts and cloud sync. This module is the only place that talks to the account
// service, so the rest of the app just sees:
//
//   cloud.onChange(user => …)   cloud.signIn(email, password)   cloud.signOut()   …
//   cloud.loadRemote(uid)       cloud.saveRemote(uid, progress, …)
//
// Two tables hold everything (see supabase/schema.sql):
//   progress (user_id pk, states jsonb, activity jsonb, xp int, settings jsonb, updated_at)
//   sessions (id pk, user_id, timestamp, mode, words_reviewed, correct, xp)
//
// With no VITE_SUPABASE_* values the app stays fully usable in guest mode: `enabled` is false and
// nothing here is ever loaded.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';

// Accounts need both values; anything less means guest-only mode.
export function isConfigured(values = {}) {
  return Boolean(values.VITE_SUPABASE_URL && values.VITE_SUPABASE_ANON_KEY);
}

export const enabled = isConfigured(env);

// Turns Supabase's terse auth errors into something a learner can act on.
export function friendlyAuthError(error) {
  const message = error?.message || error?.error_description || (typeof error === 'string' ? error : '');
  const raw = String(message).replace(/\s+/g, ' ').trim();
  if (/invalid login credentials/i.test(raw)) return 'That email and password do not match an account.';
  if (/email not confirmed/i.test(raw)) return 'Confirm your email first — we sent you a link.';
  if (/user already registered|already been registered/i.test(raw)) return 'That email already has an account. Try signing in instead.';
  if (/password should be at least|password is too short/i.test(raw)) return 'Use a password with at least 6 characters.';
  if (/rate limit|too many requests|for security purposes/i.test(raw)) return 'Too many attempts. Wait a minute, then try again.';
  if (/failed to fetch|network|fetch failed|load failed/i.test(raw)) return 'Could not reach the account service. Check your connection and try again.';
  return raw || 'Something went wrong. Please try again.';
}

// --- row <-> progress mapping (pure, so it is unit-tested) -------------------

export function toProgressRow(uid, data = {}, updatedAt = new Date().toISOString()) {
  return {
    user_id: uid,
    states: data.states || {},
    activity: data.activity || {},
    xp: Number(data.xp) || 0,
    settings: data.settings || {},
    updated_at: updatedAt
  };
}

export function fromProgressRow(row) {
  if (!row) return null;
  return {
    states: row.states || {},
    activity: row.activity || {},
    xp: Number(row.xp) || 0,
    settings: row.settings || {},
    sessions: []
  };
}

export function toSessionRows(uid, sessions = []) {
  return sessions
    .filter(session => session?.id)
    .map(session => ({
      id: String(session.id),
      user_id: uid,
      timestamp: Number(session.timestamp) || Date.now(),
      mode: session.mode || 'practice',
      words_reviewed: Number(session.wordsReviewed) || 0,
      correct: Number(session.correct) || 0,
      xp: Number(session.xp) || 0
    }));
}

export function fromSessionRow(row) {
  return {
    id: String(row.id),
    timestamp: Number(row.timestamp) || 0,
    mode: row.mode || 'practice',
    wordsReviewed: Number(row.words_reviewed) || 0,
    correct: Number(row.correct) || 0,
    xp: Number(row.xp) || 0
  };
}

// --- client wrapper ---------------------------------------------------------

// Wraps a Supabase client in the small surface the app uses. Exported separately from `load` so
// tests can drive every query against a fake client.
export function createApi(client) {
  const auth = client.auth;

  const throwIf = error => {
    if (error) throw error;
  };

  return {
    auth,

    async currentSession() {
      try {
        const { data } = await auth.getSession();
        return data?.session || null;
      } catch {
        return null;
      }
    },

    // Calls back with the signed-in user (or null). Returns an unsubscribe function.
    onChange(listener) {
      const { data } = auth.onAuthStateChange((_event, session) => listener(session?.user || null, session));
      return () => data?.subscription?.unsubscribe?.();
    },

    async signUp(email, password, options) {
      const { data, error } = await auth.signUp({ email, password, options });
      throwIf(error);
      return data;
    },

    async signIn(email, password) {
      const { data, error } = await auth.signInWithPassword({ email, password });
      throwIf(error);
      return data;
    },

    // Sends the browser to Google and back; no session is returned here.
    async signInWithGoogle(redirectTo) {
      const { error } = await auth.signInWithOAuth({ provider: 'google', options: redirectTo ? { redirectTo } : undefined });
      throwIf(error);
    },

    async signOut() {
      const { error } = await auth.signOut();
      throwIf(error);
    },

    async resendConfirmation(email) {
      const { error } = await auth.resend({ type: 'signup', email });
      throwIf(error);
    },

    // Everything the account has stored, or null for a brand-new account.
    async loadRemote(uid) {
      const { data, error } = await client
        .from('progress')
        .select('states,activity,xp,settings')
        .eq('user_id', uid)
        .maybeSingle();
      throwIf(error);
      const progress = fromProgressRow(data);
      if (!progress) return null;
      const { data: rows, error: sessionError } = await client
        .from('sessions')
        .select('id,timestamp,mode,words_reviewed,correct,xp')
        .eq('user_id', uid)
        .order('timestamp', { ascending: false })
        .limit(500);
      throwIf(sessionError);
      return { ...progress, sessions: (rows || []).map(fromSessionRow) };
    },

    // Progress plus (optionally) the single session that triggered the save.
    async saveRemote(uid, data, wordId, session) {
      const { error } = await client.from('progress').upsert(toProgressRow(uid, data), { onConflict: 'user_id' });
      throwIf(error);
      const rows = toSessionRows(uid, session ? [session] : []);
      if (rows.length) {
        const { error: sessionError } = await client.from('sessions').upsert(rows, { onConflict: 'id' });
        throwIf(sessionError);
      }
    },

    // Pushes a freshly merged local copy up, including recent session history.
    async uploadLocal(uid, data) {
      const { error } = await client.from('progress').upsert(toProgressRow(uid, data), { onConflict: 'user_id' });
      throwIf(error);
      const rows = toSessionRows(uid, (data.sessions || []).slice(0, 200));
      if (rows.length) {
        const { error: sessionError } = await client.from('sessions').upsert(rows, { onConflict: 'id' });
        throwIf(sessionError);
      }
    }
  };
}

let pending = null;

// Dynamically imports the SDK so the ~100 kB library is only fetched when accounts are configured.
export function load() {
  if (!enabled) return Promise.reject(new Error('Supabase is not configured.'));
  if (pending) return pending;
  pending = import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createApi(
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        })
      )
    )
    .catch(error => {
      pending = null;
      throw error;
    });
  return pending;
}
