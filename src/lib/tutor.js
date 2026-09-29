// Streaming AI tutor. Chat lives in the browser against the learner's own Puter account
// (see src/lib/puter.js for the SDK handling and error mapping), and replies are streamed so the
// first words appear while the model is still writing.
//
// Everything here is deliberately injectable: `streamTutor` takes an optional Puter engine and
// yields text chunks, which is what makes the streaming path testable in Node.
import { AIError, sdk, isConnected, friendlyAIError } from './puter.js';

export const TUTOR_MODEL_OPTIONS = { temperature: 0.5 };

// How much of the conversation is sent back to the model.
export const HISTORY_LIMIT = 12;
export const CONTEXT_WORDS = 8;

export const TUTOR_SYSTEM_PROMPT = [
  'You are the VocaMaster tutor, a patient Digital SAT verbal coach.',
  'Explain vocabulary clearly at a high-school level and always tie advice back to how the SAT asks questions.',
  'When a learner asks for practice, give one short question with four options and wait for their answer before explaining.',
  'Use short paragraphs and bold the target word. Never invent fake SAT passages or cite copyrighted text.'
].join(' ');

export const TUTOR_SUGGESTIONS = [
  'Explain the difference between affect and effect',
  'Quiz me on three words I just studied',
  'How do I attack words-in-context questions?',
  'Give me a memory trick for a hard word'
];

// Keeps only well-formed turns, newest last, so a corrupt local history cannot break a request.
export function normalizeHistory(raw, limit = HISTORY_LIMIT) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
    .map(message => ({ role: message.role, content: String(message.content || '').trim() }))
    .filter(message => message.content)
    .slice(-limit);
}

// Builds the message list sent to the model: system prompt first, focus words as context, then chat.
export function buildTutorMessages({ history = [], focusWords = [] } = {}) {
  const words = focusWords
    .filter(word => word?.term)
    .slice(0, CONTEXT_WORDS)
    .map(word => `${word.term} — ${word.definition || 'no definition on file'}`);
  const context = words.length ? `The learner is studying these words right now: ${words.join('; ')}.` : '';
  return [
    { role: 'system', content: context ? `${TUTOR_SYSTEM_PROMPT} ${context}` : TUTOR_SYSTEM_PROMPT },
    ...normalizeHistory(history)
  ];
}

// Pulls the text out of one streamed part. Puter normalises providers but shapes drift, so be forgiving.
export function partText(part) {
  if (!part) return '';
  if (typeof part === 'string') return part;
  if (typeof part.text === 'string') return part.text;
  const content = part.message?.content ?? part.choices?.[0]?.delta?.content ?? part.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => (typeof item === 'string' ? item : item?.text || '')).join('');
  return '';
}

// Yields reply text as it arrives. Resolves the SDK itself unless an engine is injected.
export async function* streamTutor({ messages, puter, options = TUTOR_MODEL_OPTIONS }) {
  let engine = puter;
  if (!engine) {
    if (!isConnected()) throw new AIError('Connect a Puter account to chat with the tutor.', 'signed-out');
    try {
      engine = await sdk();
    } catch (error) {
      throw friendlyAIError(error);
    }
  }
  if (!engine?.ai?.chat) throw new AIError('Connect a Puter account to chat with the tutor.', 'signed-out');

  let stream;
  try {
    stream = await engine.ai.chat(messages, { stream: true, ...options });
  } catch (error) {
    throw friendlyAIError(error);
  }

  // A streaming response is async-iterable; anything else is a complete reply we emit in one chunk.
  if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
    for await (const part of stream) {
      const text = partText(part);
      if (text) yield text;
    }
    return;
  }
  const text = partText(stream);
  if (!text) throw new AIError('The tutor reply could not be read. Please try again.', 'bad-response');
  yield text;
}

// Runs a whole turn: streams every chunk through onDelta and returns the full reply.
export async function askTutor({ history = [], focusWords = [], onDelta, puter, signal } = {}) {
  const messages = buildTutorMessages({ history, focusWords });
  let text = '';
  for await (const chunk of streamTutor({ messages, puter })) {
    if (signal?.aborted) break;
    text += chunk;
    onDelta?.(chunk);
  }
  const reply = text.trim();
  if (!reply) throw new AIError('The tutor did not reply. Please try again.', 'bad-response');
  return reply;
}
