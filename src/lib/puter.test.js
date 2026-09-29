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

test('getPassageSet normalises a set of three passages with their questions', async () => {
  const client = await import('./puter.js');
  const reply = JSON.stringify({
    passages: [1, 2, 3].map(n => ({
      title: `Passage ${n}`,
      passage: `Original passage number ${n}.`,
      questions: [
        { question: `Q${n}`, options: ['a', 'b', 'c', 'd'], correctIndex: n, explanation: 'because' },
        { question: '', options: ['x', 'y'], correctIndex: 0 }
      ]
    }))
  });
  const restore = withFakeBrowser(connectedPuter(async prompt => {
    assert.match(prompt, /Write 3 different original academic passages/);
    return { message: { content: reply } };
  }));
  try {
    const set = await client.getPassageSet([{ term: 'abate', definition: 'to lessen' }]);
    assert.equal(set.passages.length, 3);
    assert.deepEqual(set.passages.map(entry => entry.title), ['Passage 1', 'Passage 2', 'Passage 3']);
    assert.deepEqual(set.passages[1].questions, [{ question: 'Q2', options: ['a', 'b', 'c', 'd'], correctIndex: 2, explanation: 'because' }]);
  } finally { restore(); }
});

test('getPassageSet accepts a single-passage reply and labels it', async () => {
  const client = await import('./puter.js');
  const reply = JSON.stringify({ passage: 'Only one passage came back.', questions: [{ question: 'Q1', options: ['a', 'b'], correctIndex: 0 }] });
  const restore = withFakeBrowser(connectedPuter(async () => reply));
  try {
    const set = await client.getPassageSet([{ term: 'cogent', definition: 'clear' }]);
    assert.equal(set.passages.length, 1);
    assert.equal(set.passages[0].title, 'Passage 1');
    assert.equal(set.passages[0].passage, 'Only one passage came back.');
  } finally { restore(); }
});

test('getPassageSet rejects a reply with no usable passage', async () => {
  const client = await import('./puter.js');
  const restore = withFakeBrowser(connectedPuter(async () => '{"passages":[{"passage":"   ","questions":[]}]}'));
  try {
    await assert.rejects(client.getPassageSet([{ term: 'abate', definition: 'to lessen' }]), error => error.code === 'bad-response');
  } finally { restore(); }
});

test('friendlyAIError classifies auth, quota and network failures', async () => {
  const client = await import('./puter.js');
  assert.equal(client.friendlyAIError({ status: 403 }).code, 'signed-out');
  assert.equal(client.friendlyAIError(new Error('quota exceeded')).code, 'limited');
  assert.equal(client.friendlyAIError(new Error('network error')).code, 'offline');
  assert.equal(client.friendlyAIError(new Error('mystery')).code, 'unavailable');
  const already = new client.AIError('nope', 'signed-out');
  assert.equal(client.friendlyAIError(already), already);
});
