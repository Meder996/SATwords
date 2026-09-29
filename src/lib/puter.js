// Puter.js integration: the SDK is self-hosted at /vendor/puter.js (see public/vendor/README.md),
// so nothing is fetched from a third-party CDN at runtime and the app keeps working offline.
//
// AI calls run in the browser against the signed-in user's own Puter account, which is what
// makes the features work on a public deployment without shipping an API key. Everything the
// app needs from the SDK goes through this module.
const VENDOR_URL = '/vendor/puter.js';
const LOAD_TIMEOUT_MS = 15000;
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
// Optional overrides; by default Puter picks its own default model and voice.
const MODEL = env.VITE_PUTER_MODEL || '';
const VOICE = env.VITE_PUTER_TTS_VOICE || '';

export class AIError extends Error {
  constructor(message, code = 'unavailable', cause) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

let pending = null;

// Resolves the global Puter SDK, injecting /vendor/puter.js on demand if index.html did not load it.
export function sdk() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new AIError('AI features need a browser.', 'unavailable'));
  }
  if (window.puter?.ai) return Promise.resolve(window.puter);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.puter?.ai) { clearInterval(timer); resolve(window.puter); return; }
      if (Date.now() - started > LOAD_TIMEOUT_MS) {
        clearInterval(timer);
        pending = null;
        reject(new AIError('The Puter library could not be loaded. Reload the page to try again.', 'unavailable'));
      }
    }, 50);
    if (!document.querySelector('script[src*="puter"]')) {
      const script = document.createElement('script');
      script.src = VENDOR_URL;
      script.async = true;
      script.dataset.puterSdk = 'local';
      script.onerror = () => {
        clearInterval(timer);
        pending = null;
        reject(new AIError('The Puter library is missing from the deployment.', 'unavailable'));
      };
      document.head.appendChild(script);
    }
  });
  return pending;
}

const engine = () => (typeof window !== 'undefined' ? window.puter : null);

// Synchronous and safe to call during render: only reads the locally stored Puter token.
export function isConnected() {
  const puter = engine();
  if (!puter?.auth) return false;
  try {
    return puter.auth.isSignedIn ? puter.auth.isSignedIn() : Boolean(puter.auth.getAuthToken?.());
  } catch {
    return false;
  }
}

export async function currentUser() {
  if (!isConnected()) return null;
  try {
    const puter = await sdk();
    const user = await puter.auth.getUser();
    return user || null;
  } catch {
    return null;
  }
}

// Opens the Puter sign-in window. Resolves once the user has authorized this site.
export async function connect() {
  const puter = await sdk();
  const result = await puter.auth.signIn();
  const user = await currentUser();
  return user || result || null;
}

export function disconnect() {
  const puter = engine();
  if (puter?.auth?.signOut) puter.auth.signOut();
}

// Subscribes to Puter auth changes (sign-in, sign-out, token refresh). Returns an unsubscribe function.
export function onAuthChange(listener) {
  let off = () => {};
  let cancelled = false;
  sdk().then(puter => {
    if (cancelled) return;
    if (typeof puter.auth?.onAuthStateChanged === 'function') {
      off = puter.auth.onAuthStateChanged(() => listener(isConnected())) || (() => {});
    }
  }).catch(() => {});
  return () => { cancelled = true; off(); };
}

function friendly(error) {
  if (error instanceof AIError) return error;
  const status = error?.status ?? error?.response?.status ?? error?.error?.status;
  const raw = String(error?.message || error?.error?.message || error?.error || error || '');
  if (status === 401 || /unauthori[sz]ed|not signed in|no auth token/i.test(raw)) {
    return new AIError('Connect a Puter account to use the AI features.', 'signed-out', error);
  }
  if (/usage|limit|quota|credit|payment|upgrade/i.test(raw)) {
    return new AIError('Your Puter account has reached its AI usage limit for now.', 'limited', error);
  }
  if (/network|failed to fetch|load failed|offline|timeout|aborted/i.test(raw)) {
    return new AIError("Couldn't reach Puter. Check your connection and try again.", 'offline', error);
  }
  return new AIError('AI is unavailable right now. Please try again in a moment.', 'unavailable', error);
}

const unescape = value => String(value ?? '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();

// Puter has normalised responses across providers, but be forgiving about shape drift.
function textOf(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;
  const content = response.message?.content ?? response.choices?.[0]?.message?.content ?? response.text;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => (typeof part === 'string' ? part : part?.text || '')).join('');
  return '';
}

function parseJson(text) {
  const cleaned = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {}
  }
  throw new AIError('The AI reply could not be read. Please try again.', 'bad-response');
}

async function ask(prompt) {
  if (!isConnected()) throw new AIError('Connect a Puter account to use the AI features.', 'signed-out');
  let puter;
  try {
    puter = await sdk();
  } catch (error) {
    throw friendly(error);
  }
  try {
    const options = { temperature: 0.4 };
    if (MODEL) options.model = MODEL;
    return textOf(await puter.ai.chat(prompt, options));
  } catch (error) {
    throw friendly(error);
  }
}

// Returns { mnemonic, satContextTip, correctVsIncorrect } for one vocabulary word.
export async function getInsight(word) {
  const prompt = 'You are an expert Digital SAT verbal tutor. '
    + `For the vocabulary word ${JSON.stringify(word.term)} meaning ${JSON.stringify(word.definition)}, `
    + 'write a memorable visual mnemonic, a practical SAT context tip, and an example contrasting '
    + 'incorrect versus correct usage. Be concise and factually precise. '
    + 'Reply with JSON only, shaped exactly like {"mnemonic":"...","satContextTip":"...","correctVsIncorrect":"..."}.';
  const data = parseJson(await ask(prompt));
  const insight = {
    mnemonic: unescape(data.mnemonic || data.memoryHook || data.hook),
    satContextTip: unescape(data.satContextTip || data.tip || data.contextTip),
    correctVsIncorrect: unescape(data.correctVsIncorrect || data.usage || data.correct_vs_incorrect)
  };
  if (!insight.mnemonic && !insight.satContextTip) {
    throw new AIError('The AI reply could not be read. Please try again.', 'bad-response');
  }
  return insight;
}

// Returns { passage, questions: [{ question, options[], correctIndex, explanation }] } using the given words.
export async function getPassage(words) {
  const focus = words.map(word => ({ word: word.term, definition: word.definition }));
  const prompt = 'You are a Digital SAT reading tutor. '
    + `Write an original 100-150 word academic passage using these words naturally: ${JSON.stringify(focus)}. `
    + 'Write exactly two multiple-choice questions testing word meaning in this passage, each with four '
    + 'short answer choices, a zero-based correctIndex, and a short explanation. Avoid copyrighted passage text. '
    + 'Reply with JSON only, shaped exactly like {"passage":"...","questions":[{"question":"...","options":["..."],"correctIndex":0,"explanation":"..."}]}.';
  const data = parseJson(await ask(prompt));
  const passage = unescape(data.passage || data.text);
  const questions = (Array.isArray(data.questions) ? data.questions : [])
    .map(question => ({
      question: unescape(question?.question),
      options: (Array.isArray(question?.options) ? question.options : []).map(option => unescape(option)),
      correctIndex: Number(question?.correctIndex ?? question?.correct_index ?? 0),
      explanation: unescape(question?.explanation)
    }))
    .filter(question => question.question && question.options.length >= 2)
    .slice(0, 3);
  if (!passage) throw new AIError('The AI reply could not be read. Please try again.', 'bad-response');
  return { passage, questions };
}

function speakLocally(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
  window.speechSynthesis.cancel();
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
  return true;
}

// Speaks a word through Puter when connected, otherwise falls back to the browser's speech engine.
export async function playPronunciation(text) {
  try {
    if (isConnected()) {
      const puter = await sdk();
      const options = VOICE ? { voice: VOICE } : undefined;
      const audio = options ? await puter.ai.txt2speech(text, options) : await puter.ai.txt2speech(text);
      if (audio && typeof audio.play === 'function') { await audio.play(); return 'puter'; }
      if (audio?.src) { await new Audio(audio.src).play(); return 'puter'; }
    }
  } catch {
    // Fall through to the browser engine so pronunciation always works.
  }
  speakLocally(text);
  return 'browser';
}
