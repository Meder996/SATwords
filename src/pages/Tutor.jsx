import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Eraser, LoaderCircle, MessageCircle, Send, Sparkles, Square, WifiOff } from 'lucide-react';
import { askTutor, TUTOR_SUGGESTIONS } from '../lib/tutor.js';
import words from '../data/words.json';

const HISTORY_KEY = 'vocamaster-tutor-v1';
const MAX_STORED = 60;

const curated = words.filter(w => w.satExample);

// Light formatting for tutor replies: line breaks, **bold** and `code`.
const renderInline = line => line
  .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  .filter(Boolean)
  .map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });

function RichText({ text }) {
  const lines = String(text || '').split('\n');
  return lines.map((line, index) => <p key={index}>{line ? renderInline(line) : <br />}</p>);
}

function readHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(stored) ? stored.filter(message => message?.content && message?.role) : [];
  } catch {
    return [];
  }
}

export default function Tutor({ data, ensureAI, aiConnected, notify }) {
  const [messages, setMessages] = useState(readHistory);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const threadRef = useRef(null);

  // Focus words: what the learner keeps getting wrong, topped up with the curated list.
  const focusWords = useMemo(() => {
    const weak = words.filter(word => data.states[word.id] && (data.states[word.id].totalIncorrect > 0 || data.states[word.id].masteryLevel < 2));
    return (weak.length >= 4 ? weak : [...weak, ...curated]).slice(0, 6);
  }, [data.states]);

  useEffect(() => {
    const trimmed = messages.slice(-MAX_STORED);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed)); } catch { /* storage full or blocked */ }
  }, [messages]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text) {
    const prompt = String(text ?? input).trim();
    if (!prompt || busy) return;
    setInput('');
    setError('');
    const userMessage = { id: `u-${Date.now()}`, role: 'user', content: prompt };
    const replyId = `a-${Date.now()}`;
    const history = [...messages, userMessage];
    setMessages([...history, { id: replyId, role: 'assistant', content: '', streaming: true }]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await ensureAI();
      const reply = await askTutor({
        history: history.map(({ role, content }) => ({ role, content })),
        focusWords,
        signal: controller.signal,
        onDelta: chunk => setMessages(current => current.map(message => (
          message.id === replyId ? { ...message, content: message.content + chunk } : message
        )))
      });
      setMessages(current => current.map(message => (
        message.id === replyId ? { ...message, content: reply, streaming: false } : message
      )));
    } catch (tutorError) {
      const message = tutorError?.code === 'signed-out'
        ? 'Connect a Puter account to chat with the tutor.'
        : tutorError?.message || 'The tutor is unavailable right now.';
      setError(message);
      // Keep a partial answer if some text arrived; otherwise drop the empty bubble.
      setMessages(current => current
        .map(item => (item.id === replyId ? { ...item, streaming: false } : item))
        .filter(item => item.id !== replyId || item.content));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  function clearChat() {
    stop();
    setMessages([]);
    setError('');
    notify?.('Tutor conversation cleared.');
  }

  const onKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="tutor-page">
      <div className="page-header compact-header">
        <div className="eyebrow">ALWAYS-ON STUDY HELP</div>
        <h1>AI tutor<span className="title-period">.</span></h1>
        <p>Ask about a word, a question type, or your own sentence — replies stream in as they are written.</p>
      </div>

      <div className="tutor-layout">
        <section className="tutor-panel">
          <header className="tutor-head">
            <span className={`tutor-status ${aiConnected ? 'connected' : ''}`}>
              {aiConnected ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
              {aiConnected ? 'Puter connected — streaming live' : 'Puter connects on your first question'}
            </span>
            <button className="ghost-button" onClick={clearChat} disabled={!messages.length}><Eraser size={15} /> Clear chat</button>
          </header>

          <div className="tutor-thread" ref={threadRef} aria-live="polite">
            {!messages.length && (
              <div className="tutor-empty">
                <span className="tutor-empty-icon"><MessageCircle size={26} /></span>
                <strong>What should we work on?</strong>
                <p>Your focus words are already in context — the tutor can see them.</p>
                <div className="tutor-suggestions">
                  {TUTOR_SUGGESTIONS.map(suggestion => (
                    <button key={suggestion} onClick={() => send(suggestion)}>{suggestion}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(message => (
              <article key={message.id} className={`tutor-message ${message.role}`}>
                <span className="tutor-avatar">{message.role === 'user' ? 'You' : <Sparkles size={16} />}</span>
                <div className="tutor-bubble">
                  <RichText text={message.content} />
                  {message.streaming && <span className="tutor-caret" aria-label="Tutor is writing" />}
                </div>
              </article>
            ))}
          </div>

          {error && <div className="inline-error"><WifiOff size={16} />{error}</div>}

          <div className="tutor-composer">
            <textarea
              rows={2}
              value={input}
              placeholder="Ask the tutor anything — “Why is abstruse harder than obscure?”"
              onChange={event => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Message the AI tutor"
            />
            {busy
              ? <button className="secondary-button" onClick={stop}><Square size={15} /> Stop</button>
              : <button className="primary-button" onClick={() => send()} disabled={!input.trim()}>
                  {aiConnected ? <Send size={16} /> : <Sparkles size={16} />} {aiConnected ? 'Send' : 'Connect & ask'}
                </button>}
          </div>
        </section>

        <aside className="tutor-side">
          <div className="panel tutor-context">
            <div className="eyebrow">IN CONTEXT</div>
            <h3>Words you are working on</h3>
            <p>Tap one to have the tutor explain it.</p>
            <div className="tutor-chips">
              {focusWords.map(word => (
                <button key={word.id} onClick={() => send(`Explain ${word.term} in a way I will remember, and use it in a sentence.`)}>
                  {word.term}
                </button>
              ))}
            </div>
          </div>
          <div className="panel tutor-tips">
            <span className="tip-icon"><BookOpen size={20} /></span>
            <h3>Getting good answers</h3>
            <ul>
              <li>Ask for a contrast: “abate vs. subside”.</li>
              <li>Request a question, then answer it before asking for the explanation.</li>
              <li>Paste your own sentence and ask if the word fits.</li>
            </ul>
            <button className="text-link" onClick={() => send('Quiz me on my focus words, one question at a time.')}>
              Quiz me now <ArrowRight size={15} />
            </button>
          </div>
          {busy && <div className="tutor-hint"><LoaderCircle size={15} className="spin" /> Streaming the reply…</div>}
        </aside>
      </div>
    </div>
  );
}
