import { useState } from 'react';
import { ArrowRight, BarChart3, BookOpen, Brain, Check, Cloud, GraduationCap, Layers, Library, MessageCircle, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import words from '../data/words.json';

const curated = words.filter(w => w.satExample);
const showcase = curated[0] || words[0];

const FEATURES = [
  { icon: Brain, title: 'Spaced-repetition flashcards', text: 'SM-2 style scheduling brings each word back right before you would forget it.' },
  { icon: Target, title: 'Context cloze', text: 'Fill the blank in a real sentence so meaning sticks, not just the definition.' },
  { icon: Zap, title: 'Match sprint', text: 'A 60-second word-to-meaning game that builds fast recall under pressure.' },
  { icon: GraduationCap, title: 'SAT-style questions', text: 'Words-in-context items written the way the Digital SAT asks them.' },
  { icon: MessageCircle, title: 'Streaming AI tutor', text: 'Ask anything and watch the answer arrive word by word, with your own words in context.' },
  { icon: Layers, title: 'AI reading sets', text: 'Three original passages per set, each with meaning-in-context questions.' },
  { icon: BarChart3, title: 'Progress that shows', text: 'Streaks, mastery levels, XP and a study heatmap keep the habit visible.' },
  { icon: Cloud, title: 'Synced when you sign in', text: 'Create an account and your progress follows you to every device.' }
];

const STEPS = [
  { title: 'Pick up your deck', text: 'A thousand SAT words, ordered by what is due and what is new.' },
  { title: 'Study ten minutes', text: 'Flashcards, cloze, quiz and match sprint — whatever fits your mood today.' },
  { title: 'Ask the tutor', text: 'Stuck on a word? Get a mnemonic, a contrast, or a mini quiz on the spot.' }
];

export default function Landing({ onSignIn, onGuest, cloudEnabled }) {
  const [preview, setPreview] = useState(showcase);

  return (
    <div className="landing app-shell">
      <header className="landing-nav">
        <span className="brand landing-brand">
          <span className="brand-icon"><BookOpen size={22} strokeWidth={2.5} /></span>
          <span className="brand-text">voca<span>master</span><small>SAT PREP STUDIO</small></span>
        </span>
        <nav className="landing-links" aria-label="Landing">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#start">Guest mode</a>
        </nav>
        <div className="landing-nav-actions">
          <button className="ghost-button" onClick={() => onSignIn('signin')}>Sign in</button>
          <button className="primary-button" onClick={() => onSignIn('signup')}>Get started <ArrowRight size={16} /></button>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="eyebrow">DIGITAL SAT VOCABULARY STUDIO</div>
            <h1>Make every word <em>count.</em></h1>
            <p>
              VocaMaster turns 1,000 SAT words into spaced-repetition flashcards, context practice,
              and an AI tutor that explains the words you keep missing. Free, installable, and ready
              to work offline.
            </p>
            <div className="landing-cta">
              <button className="primary-button landing-primary" onClick={() => onSignIn('signup')}>
                Create a free account <ArrowRight size={17} />
              </button>
              <button className="secondary-button" onClick={onGuest}>
                Continue as guest
              </button>
            </div>
            <ul className="landing-assurances">
              <li><Check size={15} /> No credit card, no ads</li>
              <li><Check size={15} /> Works offline once installed</li>
              <li><Check size={15} /> Guest progress stays on your device</li>
            </ul>
            {!cloudEnabled && (
              <p className="landing-note">
                Accounts are optional: this deployment runs without them, so guest mode is fully functional.
              </p>
            )}
          </div>

          <div className="landing-hero-card" aria-hidden="true">
            <div className="landing-card-topline"><span>WORD 01</span><span>ADVANCED</span></div>
            <div className="landing-card-word">{preview.term}</div>
            <p className="landing-card-def">{preview.definition}</p>
            {preview.satExample && <p className="landing-card-example">“{preview.satExample}”</p>}
            <div className="landing-card-actions">
              {curated.slice(0, 4).map(word => (
                <button key={word.id} onClick={() => setPreview(word)} className={word.id === preview.id ? 'active' : ''}>
                  {word.term}
                </button>
              ))}
            </div>
            <div className="landing-card-ai"><Sparkles size={16} /> Ask the tutor for a memory hook</div>
          </div>
        </section>

        <section className="landing-stats">
          {[['1,000', 'SAT words'], ['36', 'authored examples'], ['4', 'practice modes'], ['3', 'passages per AI set']].map(([value, label]) => (
            <div key={label}><strong>{value}</strong><span>{label}</span></div>
          ))}
        </section>

        <section className="landing-section" id="features">
          <div className="landing-section-head">
            <div className="eyebrow">EVERYTHING IN ONE PLACE</div>
            <h2>Study tools that pull their weight.</h2>
            <p>Each mode targets a different part of remembering a word: recognition, meaning, and speed.</p>
          </div>
          <div className="landing-features">
            {FEATURES.map(feature => (
              <article key={feature.title} className="landing-feature">
                <span className="landing-feature-icon"><feature.icon size={20} /></span>
                <strong>{feature.title}</strong>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" id="how">
          <div className="landing-section-head">
            <div className="eyebrow">HOW IT WORKS</div>
            <h2>Three habits, one stronger vocabulary.</h2>
          </div>
          <ol className="landing-steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="landing-step-number">{index + 1}</span>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" id="start">
          <div className="landing-start">
            <div>
              <div className="eyebrow">TWO WAYS TO START</div>
              <h2>Sign in to sync, or stay a guest.</h2>
              <p>
                An account keeps your streak, mastery levels and history in the cloud, so a new device
                picks up exactly where you left off. Guest mode needs nothing at all — everything is
                saved in this browser, and you can create an account later without losing a single review.
              </p>
              <div className="landing-cta">
                <button className="primary-button landing-primary" onClick={() => onSignIn('signup')}>Create your account <ArrowRight size={17} /></button>
                <button className="secondary-button" onClick={onGuest}>Start as guest</button>
              </div>
            </div>
            <div className="landing-start-cards">
              <div className="landing-start-card">
                <Cloud size={20} />
                <strong>With an account</strong>
                <ul>
                  <li><Check size={14} /> Progress synced across devices</li>
                  <li><Check size={14} /> Sign in after studying as a guest and everything merges</li>
                  <li><Check size={14} /> Sign out whenever you like</li>
                </ul>
              </div>
              <div className="landing-start-card">
                <BookOpen size={20} />
                <strong>As a guest</strong>
                <ul>
                  <li><Check size={14} /> No email needed to start</li>
                  <li><Check size={14} /> Saved in this browser only</li>
                  <li><Check size={14} /> Exit guest mode any time from the account menu</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-footer-cta">
          <Trophy size={26} />
          <div>
            <strong>Ten minutes today beats a cram the night before.</strong>
            <p>Start with the deck you already have waiting.</p>
          </div>
          <button className="primary-button landing-primary" onClick={onGuest}>Study now <ArrowRight size={17} /></button>
        </section>
      </main>

      <footer className="landing-footer">
        <span><Library size={15} /> SAT VocaMaster — a study aid with original practice content, not an official College Board product.</span>
        <span className="landing-footer-links">
          <button className="ghost-button" onClick={() => onSignIn('signin')}>Sign in</button>
          <button className="ghost-button" onClick={onGuest}>Guest mode</button>
        </span>
      </footer>
    </div>
  );
}
