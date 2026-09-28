import test from 'node:test';
import assert from 'node:assert/strict';

// The Puter client is browser-only, so these tests install a fake window/document with a stub SDK.
// Node resolves import.meta.env to undefined, so optional env overrides fall back to defaults.
function withFakeBrowser(puter, extras = {}) {
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = { puter, ...extras };
  globalThis.document = { querySelector: () => ({}), createElement: () => ({ dataset: {} }), head: { appendChild() {} } };
  return () => { globalThis.window = previous.window; globalThis.document = previous.document; };
}

const connectedPuter = (chat, txt2speech) => ({
  ai: { chat, ...(txt2speech ? { txt2speech } : {}) },
  auth: { isSignedIn: () => true, getUser: async () => ({ username: 'learner' }) }
});

test('getInsight parses a JSON reply wrapped in a markdown fence', async () => {
  const client = await import('./puter.js');
  const restore = withFakeBrowser(connectedPuter(async (prompt, options) => {
    assert.match(prompt, /"abate"/);
    assert.equal(options.temperature, 0.4);
    return { message: { content: '```json\n{"mnemonic":"a BATE lure","satContextTip":"watch the verb","correctVsIncorrect":"wrong: abate up"}\n```' } };
  }));
  try {
    const insight = await client.getInsight({ term: 'abate', definition: 'to lessen' });
    assert.deepEqual(insight, { mnemonic: 'a BATE lure', satContextTip: 'watch the verb', correctVsIncorrect: 'wrong: abate up' });
  } finally { restore(); }
});

test('getInsight recovers JSON from prose and collapses escaped newlines', async () => {
  const client = await import('./puter.js');
  const restore = withFakeBrowser(connectedPuter(async () => 'Here you go:\n{"mnemonic":"sound it out","satContextTip":"line one\\nline two"}\nHope that helps!'));
  try {
    const insight = await client.getInsight({ term: 'cogent', definition: 'clear and convincing' });
    assert.equal(insight.mnemonic, 'sound it out');
    assert.equal(insight.satContextTip, 'line one line two');
    assert.equal(insight.correctVsIncorrect, '');
  } finally { restore(); }
});

test('getPassage normalises questions and drops malformed ones', async () => {
  const client = await import('./puter.js');
  const reply = JSON.stringify({
    passage: 'An original passage.',
    questions: [
      { question: 'Q1', options: ['a', 'b', 'c', 'd'], correctIndex: 2, explanation: 'because' },
      { question: '', options: ['a', 'b'], correctIndex: 0 },
      { question: 'Q2', options: ['a'], correctIndex: 9, explanation: 'short' }
    ]
  });
  const restore = withFakeBrowser(connectedPuter(async () => ({ choices: [{ message: { content: reply } }] })));
  try {
    const result = await client.getPassage([{ term: 'abate', definition: 'to lessen' }]);
    assert.equal(result.passage, 'An original passage.');
    assert.deepEqual(result.questions, [{ question: 'Q1', options: ['a', 'b', 'c', 'd'], correctIndex: 2, explanation: 'because' }]);
  } finally { restore(); }
});

test('a 401 from Puter becomes a "connect an account" error', async () => {
  const client = await import('./puter.js');
  const restore = withFakeBrowser(connectedPuter(async () => { throw { status: 401, message: 'Unauthorized' }; }));
  try {
    await assert.rejects(client.getInsight({ term: 'abate', definition: 'to lessen' }), error => {
      assert.equal(error.code, 'signed-out');
      assert.equal(error.message, 'Connect a Puter account to use the AI features.');
      return true;
    });
  } finally { restore(); }
});

test('provider failures surface as a friendly, retryable message', async () => {
  const client = await import('./puter.js');
  const restore = withFakeBrowser(connectedPuter(async () => { throw new Error('upstream exploded'); }));
  try {
    await assert.rejects(client.getInsight({ term: 'abate', definition: 'to lessen' }), error => {
      assert.equal(error.code, 'unavailable');
      assert.match(error.message, /try again in a moment/i);
      return true;
    });
  } finally { restore(); }
});

test('AI refuses to run before a Puter account is connected', async () => {
  const client = await import('./puter.js');
  const restore = withFakeBrowser({ ai: {}, auth: { isSignedIn: () => false } });
  try {
    assert.equal(client.isConnected(), false);
    await assert.rejects(client.getInsight({ term: 'abate', definition: 'to lessen' }), error => error.code === 'signed-out');
  } finally { restore(); }
});

test('isConnected tolerates a missing SDK', async () => {
  const client = await import('./puter.js');
  const restore = withFakeBrowser(undefined);
  try {
    assert.equal(client.isConnected(), false);
  } finally { restore(); }
});

test('playPronunciation prefers Puter audio when connected', async () => {
  const client = await import('./puter.js');
  let spoke = 0;
  let asked = '';
  const restore = withFakeBrowser(connectedPuter(async () => '', async text => {
    asked = text;
    return { play: async () => { spoke += 1; } };
  }));
  try {
    assert.equal(await client.playPronunciation('abate'), 'puter');
    assert.equal(asked, 'abate');
    assert.equal(spoke, 1);
  } finally { restore(); }
});

test('playPronunciation falls back to the browser speech engine', async () => {
  const client = await import('./puter.js');
  let spoken = '';
  const restore = withFakeBrowser(
    connectedPuter(async () => '', async () => { throw new Error('tts offline'); }),
    {
      speechSynthesis: { cancel() {}, speak(utterance) { spoken = utterance.text; } },
      SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }
    }
  );
  try {
    assert.equal(await client.playPronunciation('cogent'), 'browser');
    assert.equal(spoken, 'cogent');
  } finally { restore(); }
});
