import test from 'node:test';
import assert from 'node:assert/strict';
import { AIError } from './puter.js';
import { HISTORY_LIMIT, askTutor, buildTutorMessages, normalizeHistory, partText, streamTutor } from './tutor.js';

// A Puter stand-in: `chat` returns whatever the test wants to stream back.
const puterStreaming = parts => ({ ai: { chat: async () => (async function* () { for (const part of parts) yield part; })() } });

const collect = async iterator => {
  const chunks = [];
  for await (const chunk of iterator) chunks.push(chunk);
  return chunks;
};

test('buildTutorMessages starts with the system prompt and the words being studied', () => {
  const messages = buildTutorMessages({
    history: [{ role: 'user', content: 'Hello' }],
    focusWords: [{ term: 'abate', definition: 'to lessen' }, { term: 'cogent', definition: 'clear' }]
  });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /VocaMaster tutor/);
  assert.match(messages[0].content, /abate — to lessen/);
  assert.match(messages[0].content, /cogent — clear/);
  assert.deepEqual(messages[1], { role: 'user', content: 'Hello' });
});

test('buildTutorMessages omits the word context when nothing is being studied', () => {
  const [system] = buildTutorMessages({ focusWords: [] });
  assert.doesNotMatch(system.content, /studying these words/);
});

test('history is cleaned and only the last turns are sent', () => {
  const junk = [{ role: 'system', content: 'ignore me' }, { role: 'user', content: '   ' }, null];
  assert.deepEqual(normalizeHistory(junk), []);
  const long = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `turn ${i}` }));
  const [system, ...turns] = buildTutorMessages({ history: long });
  assert.match(system.content, /VocaMaster tutor/);
  assert.equal(turns.length, HISTORY_LIMIT);
  assert.equal(turns.at(-1).content, 'turn 29');
});

test('partText reads every shape Puter can stream', () => {
  assert.equal(partText('plain'), 'plain');
  assert.equal(partText({ text: 'chunk' }), 'chunk');
  assert.equal(partText({ message: { content: 'chat' } }), 'chat');
  assert.equal(partText({ choices: [{ delta: { content: 'delta' } }] }), 'delta');
  assert.equal(partText({ choices: [{ message: { content: 'full' } }] }), 'full');
  assert.equal(partText({ message: { content: [{ text: 'a' }, { text: 'b' }] } }), 'ab');
  assert.equal(partText(null), '');
});

test('streamTutor yields deltas as they arrive', async () => {
  const chunks = await collect(streamTutor({
    messages: [{ role: 'user', content: 'hi' }],
    puter: puterStreaming([{ text: 'Epi' }, { choices: [{ delta: { content: 'hemeral' } }] }, { text: '' }, { text: ' means short-lived.' }])
  }));
  assert.deepEqual(chunks, ['Epi', 'hemeral', ' means short-lived.']);
});

test('streamTutor emits a non-streaming reply as one chunk', async () => {
  const puter = { ai: { chat: async () => ({ message: { content: 'A single reply.' } }) } };
  assert.deepEqual(await collect(streamTutor({ messages: [], puter })), ['A single reply.']);
});

test('streamTutor refuses to run without a Puter account or engine', async () => {
  await assert.rejects(collect(streamTutor({ messages: [], puter: { ai: {} } })), error => error.code === 'signed-out');
  // No injected engine and no browser session: Puter is not connected in Node.
  await assert.rejects(collect(streamTutor({ messages: [] })), error => error.code === 'signed-out');
});

test('streamTutor maps provider failures through the shared error mapper', async () => {
  const failing = error => ({ ai: { chat: async () => { throw error; } } });
  await assert.rejects(collect(streamTutor({ messages: [], puter: failing({ status: 401, message: 'Unauthorized' }) })), error => error.code === 'signed-out');
  await assert.rejects(
    collect(streamTutor({ messages: [], puter: failing(new Error('usage limit reached')) })),
    error => error.code === 'limited' && /usage limit/i.test(error.message)
  );
  await assert.rejects(
    collect(streamTutor({ messages: [], puter: failing(new Error('fetch failed')) })),
    error => error.code === 'offline'
  );
});

test('askTutor streams a whole turn through onDelta and returns the reply', async () => {
  const seen = [];
  const reply = await askTutor({
    history: [{ role: 'user', content: 'Define abate' }],
    puter: puterStreaming([{ text: 'Abate ' }, { text: 'means to lessen.' }]),
    onDelta: chunk => seen.push(chunk)
  });
  assert.equal(reply, 'Abate means to lessen.');
  assert.deepEqual(seen, ['Abate ', 'means to lessen.']);
});

test('askTutor stops early when the turn is aborted and rejects empty replies', async () => {
  const controller = new AbortController();
  const stream = puterStreaming([{ text: 'one' }, { text: ' two' }]);
  const partial = await askTutor({
    history: [{ role: 'user', content: 'hi' }],
    puter: stream,
    signal: controller.signal,
    onDelta: () => controller.abort()
  });
  assert.equal(partial, 'one');
  await assert.rejects(
    askTutor({ history: [{ role: 'user', content: 'hi' }], puter: puterStreaming([{ text: '' }]) }),
    error => error instanceof AIError && error.code === 'bad-response'
  );
});
