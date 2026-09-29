import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApi,
  friendlyAuthError,
  fromProgressRow,
  fromSessionRow,
  isConfigured,
  toProgressRow,
  toSessionRows
} from './supabase.js';

// A chainable stand-in for the Supabase client: records every resolved query so the tests can
// assert on the rows and filters the real client would have sent.
function fakeSupabase({ progress = null, sessions = [], errors = {}, user = { id: 'u1' } } = {}) {
  const calls = [];
  const record = query => {
    calls.push({ table: query._table, action: query._action, columns: query._columns, filters: { ...query._filters }, limit: query._limit, payload: query._payload, options: query._options });
    if (errors[query._table]) return Promise.resolve({ data: null, error: errors[query._table] });
    const data = query._action === 'select' ? (query._table === 'progress' ? progress : sessions) : null;
    return Promise.resolve({ data, error: null });
  };
  return {
    calls,
    auth: {
      getSession: async () => ({ data: { session: { user } } }),
      onAuthStateChange: callback => {
        const subscription = { unsubscribe: () => calls.push({ action: 'unsubscribe' }) };
        setTimeout(() => callback('SIGNED_IN', { user }), 0);
        return { data: { subscription } };
      },
      signUp: async payload => (errors.signUp ? { error: errors.signUp } : { data: { user, payload } }),
      signInWithPassword: async payload => (errors.signIn ? { error: errors.signIn } : { data: { user, payload } }),
      signInWithOAuth: async payload => {
        calls.push({ action: 'signInWithOAuth', ...payload });
        return errors.oauth ? { error: errors.oauth } : { data: payload };
      },
      signOut: async () => (errors.signOut ? { error: errors.signOut } : { data: null }),
      resend: async payload => (errors.resend ? { error: errors.resend } : { data: payload })
    },
    from(table) {
      const query = {
        _table: table,
        _action: null,
        _payload: null,
        _filters: {},
        _limit: null,
        select(columns) { this._action = 'select'; this._columns = columns; return this; },
        eq(column, value) { this._filters[column] = value; return this; },
        order(column, options) { this._order = [column, options]; return this; },
        limit(count) { this._limit = count; return this; },
        upsert(payload, options) { this._action = 'upsert'; this._payload = payload; this._options = options; return this; },
        maybeSingle() { return record(this); },
        then(resolve, reject) { return record(this).then(resolve, reject); }
      };
      return query;
    }
  };
}

test('accounts need both Supabase values to be configured', () => {
  assert.equal(isConfigured({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'key' }), true);
  assert.equal(isConfigured({ VITE_SUPABASE_URL: 'https://x.supabase.co' }), false);
  assert.equal(isConfigured({}), false);
});

test('auth errors are rewritten for humans', () => {
  assert.match(friendlyAuthError(new Error('Invalid login credentials')), /do not match an account/);
  assert.match(friendlyAuthError(new Error('Email not confirmed')), /Confirm your email/);
  assert.match(friendlyAuthError(new Error('User already registered')), /already has an account/);
  assert.match(friendlyAuthError(new Error('Password should be at least 6 characters')), /at least 6 characters/);
  assert.match(friendlyAuthError(new Error('fetch failed')), /Check your connection/);
  assert.equal(friendlyAuthError({}), 'Something went wrong. Please try again.');
});

test('progress rows round-trip between the app shape and the database shape', () => {
  const row = toProgressRow('u1', { states: { a: 1 }, activity: { day: 2 }, xp: '30', settings: { theme: 'light' } }, '2026-09-29T00:00:00.000Z');
  assert.deepEqual(row, {
    user_id: 'u1',
    states: { a: 1 },
    activity: { day: 2 },
    xp: 30,
    settings: { theme: 'light' },
    updated_at: '2026-09-29T00:00:00.000Z'
  });
  const back = fromProgressRow(row);
  assert.equal(back.xp, 30);
  assert.deepEqual(back.states, { a: 1 });
  assert.deepEqual(back.sessions, []);
  assert.equal(fromProgressRow(null), null);
  assert.deepEqual(toProgressRow('u1', {}).states, {});
});

test('session rows map both ways and skip records without an id', () => {
  const rows = toSessionRows('u1', [{ id: 7, timestamp: '99', mode: 'quiz', wordsReviewed: 1, correct: 1, xp: 25 }, { mode: 'match' }]);
  assert.deepEqual(rows, [{
    id: '7', user_id: 'u1', timestamp: 99, mode: 'quiz', words_reviewed: 1, correct: 1, xp: 25
  }]);
  assert.deepEqual(fromSessionRow({ id: 7, timestamp: '99', mode: 'quiz', words_reviewed: 1, correct: 1, xp: 25 }), {
    id: '7', timestamp: 99, mode: 'quiz', wordsReviewed: 1, correct: 1, xp: 25
  });
});

test('loadRemote returns null for a brand-new account', async () => {
  const client = fakeSupabase({ progress: null });
  const cloud = createApi(client);
  assert.equal(await cloud.loadRemote('u1'), null);
  assert.deepEqual(client.calls[0].filters, { user_id: 'u1' });
  assert.equal(client.calls[0].table, 'progress');
});

test('loadRemote combines the progress row with the newest session history', async () => {
  const client = fakeSupabase({
    progress: { states: { a: 1 }, activity: { day: 3 }, xp: 120, settings: { theme: 'light' } },
    sessions: [{ id: 's1', timestamp: 20, mode: 'quiz', words_reviewed: 2, correct: 1, xp: 25 }]
  });
  const remote = await createApi(client).loadRemote('u1');
  assert.equal(remote.xp, 120);
  assert.deepEqual(remote.settings, { theme: 'light' });
  assert.deepEqual(remote.sessions, [{ id: 's1', timestamp: 20, mode: 'quiz', wordsReviewed: 2, correct: 1, xp: 25 }]);
  assert.equal(client.calls[1].table, 'sessions');
  assert.equal(client.calls[1].limit, 500);
});

test('loadRemote surfaces database errors', async () => {
  const client = fakeSupabase({ errors: { progress: new Error('relation missing') } });
  await assert.rejects(createApi(client).loadRemote('u1'), /relation missing/);
});

test('saveRemote upserts progress and only writes a session when one is given', async () => {
  const client = fakeSupabase();
  const cloud = createApi(client);
  await cloud.saveRemote('u1', { states: {}, xp: 10, sessions: [{ id: 's1', timestamp: 1 }] }, 'word_abate', null);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].action, 'upsert');
  assert.deepEqual(client.calls[0].options, { onConflict: 'user_id' });

  await cloud.saveRemote('u1', { states: {}, xp: 20 }, 'word_abate', { id: 's9', timestamp: 5, mode: 'flashcard', wordsReviewed: 1 });
  assert.equal(client.calls[1].table, 'progress');
  assert.equal(client.calls[2].table, 'sessions');
  assert.equal(client.calls[2].payload[0].id, 's9');
  assert.equal(client.calls[2].payload[0].words_reviewed, 1);
});

test('uploadLocal pushes the merged copy plus recent session history', async () => {
  const client = fakeSupabase();
  const sessions = Array.from({ length: 260 }, (_, i) => ({ id: `s${i}`, timestamp: i, mode: 'quiz' }));
  await createApi(client).uploadLocal('u1', { states: {}, xp: 5, sessions });
  assert.equal(client.calls[0].table, 'progress');
  assert.equal(client.calls[0].payload.xp, 5);
  assert.equal(client.calls[1].payload.length, 200);
});

test('auth wrappers pass payloads through and raise failures', async () => {
  const client = fakeSupabase();
  const cloud = createApi(client);
  const signUp = await cloud.signUp('learner@example.com', 'secret123', { emailRedirectTo: 'https://app.test/' });
  assert.equal(signUp.user.id, 'u1');
  await cloud.signIn('learner@example.com', 'secret123');
  await cloud.resendConfirmation('learner@example.com');
  await cloud.signOut();
  // Auth calls go straight to the client, not through the table API.
  assert.equal(client.calls.length, 0);

  const broken = createApi(fakeSupabase({ errors: { signIn: new Error('Invalid login credentials') } }));
  await assert.rejects(broken.signIn('learner@example.com', 'nope'), /Invalid login credentials/);
});

test('Google sign-in asks for the google provider and returns to the given URL', async () => {
  const client = fakeSupabase();
  await createApi(client).signInWithGoogle('https://app.test/?page=dashboard');
  assert.deepEqual(client.calls[0], {
    action: 'signInWithOAuth',
    provider: 'google',
    options: { redirectTo: 'https://app.test/?page=dashboard' }
  });
});

test('onChange forwards the signed-in user and can be unsubscribed', async () => {
  const client = fakeSupabase({ user: { id: 'u7' } });
  const cloud = createApi(client);
  const users = [];
  const unsubscribe = cloud.onChange(user => users.push(user?.id));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(users, ['u7']);
  unsubscribe();
  assert.ok(client.calls.some(call => call.action === 'unsubscribe'));
  assert.equal((await cloud.currentSession()).user.id, 'u7');
});

test('the cached session is used when the auth client throws', async () => {
  const client = fakeSupabase();
  client.auth.getSession = async () => { throw new Error('no storage'); };
  assert.equal(await createApi(client).currentSession(), null);
});
