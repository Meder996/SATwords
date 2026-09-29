import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Cloud, LoaderCircle, LockKeyhole, Mail, Sparkles } from 'lucide-react';
import { friendlyAuthError } from '../lib/supabase.js';

const PERKS = [
  'Your streak, mastery levels and history follow you to any device.',
  'Studying as a guest first? Signing in merges that progress instead of replacing it.',
  'Your data stays yours — progress is stored per account behind row-level security.'
];

// Full-page accounts screen (replaces the old modal): create an account, sign in, use Google,
// or drop into guest mode. `cloud` is the loaded Supabase wrapper, or null when unconfigured.
export default function SignIn({ tab: initialTab = 'signup', cloud, cloudEnabled, onGuest, onBack, notify }) {
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const switchTab = next => { setTab(next); setError(''); setSentTo(''); };

  async function submit(event) {
    event.preventDefault();
    if (!cloud) return;
    setBusy(true);
    setError('');
    try {
      if (tab === 'signup') {
        const result = await cloud.signUp(email, password, { emailRedirectTo: `${window.location.origin}/` });
        // With email confirmation on, Supabase returns a user but no session.
        if (result?.session) notify?.('Welcome aboard. Your progress will now sync.');
        else setSentTo(email);
      } else {
        await cloud.signIn(email, password);
        notify?.('Welcome back.');
      }
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!cloud) return;
    setBusy(true);
    setError('');
    try {
      await cloud.signInWithGoogle(`${window.location.origin}/`);
    } catch (authError) {
      setError(friendlyAuthError(authError));
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    try {
      await cloud.resendConfirmation(sentTo);
      notify?.('Confirmation email sent again.');
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-page app-shell">
      <button className="back-link signin-back" onClick={onBack}><ArrowLeft size={17} /> Back to home</button>
      <div className="signin-split">
        <aside className="signin-aside">
          <span className="brand signin-brand">
            <span className="brand-icon"><BookOpen size={22} strokeWidth={2.5} /></span>
            <span className="brand-text">voca<span>master</span><small>SAT PREP STUDIO</small></span>
          </span>
          <h2>Keep the streak going on every device.</h2>
          <ul className="signin-perks">
            {PERKS.map(perk => <li key={perk}><Check size={15} /> {perk}</li>)}
          </ul>
          <div className="signin-aside-card">
            <Sparkles size={18} />
            <div>
              <strong>AI features need no account key</strong>
              <p>The tutor runs on your own Puter connection, separate from your VocaMaster account.</p>
            </div>
          </div>
        </aside>

        <section className="signin-card">
          {cloudEnabled && !cloud ? (
            <>
              <div className="eyebrow">PREPARING ACCOUNTS</div>
              <h1>One moment…</h1>
              <p className="signin-copy">Loading the account service. You can also start studying right away as a guest.</p>
              <button className="secondary-button" onClick={onGuest}>Continue as guest <ArrowRight size={16} /></button>
            </>
          ) : !cloudEnabled || !cloud ? (
            <>
              <div className="eyebrow">ACCOUNTS ARE OFF IN THIS DEPLOYMENT</div>
              <h1>Study as a guest.</h1>
              <p className="signin-copy">
                This build has no <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> configured,
                so cloud accounts are unavailable. Everything else works — start a guest session and your progress
                is saved in this browser.
              </p>
              <button className="primary-button auth-submit" onClick={onGuest}>Continue as guest <ArrowRight size={17} /></button>
              <button className="guest-cloud-button" onClick={onBack}>Back to the landing page</button>
            </>
          ) : sentTo ? (
            <>
              <span className="auth-mark"><Mail size={24} /></span>
              <div className="eyebrow">ONE MORE STEP</div>
              <h1>Check your inbox.</h1>
              <p className="signin-copy">
                We sent a confirmation link to <strong>{sentTo}</strong>. Open it to activate the account, then come
                back and sign in — your progress syncs from then on.
              </p>
              {error && <div className="inline-error">{error}</div>}
              <button className="secondary-button" onClick={resend} disabled={busy}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Mail size={16} />} Resend the email
              </button>
              <button className="guest-cloud-button" onClick={() => switchTab('signin')}>Already confirmed? Sign in</button>
            </>
          ) : (
            <>
              <span className="auth-mark"><LockKeyhole size={24} /></span>
              <div className="eyebrow">{tab === 'signup' ? 'YOUR WORDS, EVERYWHERE' : 'GOOD TO SEE YOU AGAIN'}</div>
              <h1>{tab === 'signup' ? 'Make progress that stays.' : 'Welcome back.'}</h1>
              <p className="signin-copy">Save your study journey and pick up on any device.</p>

              <div className="auth-tabs">
                <button className={tab === 'signup' ? 'active' : ''} onClick={() => switchTab('signup')}>Create account</button>
                <button className={tab === 'signin' ? 'active' : ''} onClick={() => switchTab('signin')}>Sign in</button>
              </div>

              <form onSubmit={submit}>
                <label>
                  Email address
                  <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} />
                </label>
                <label>
                  Password
                  <input
                    type="password" minLength={6} required
                    autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                    placeholder="At least 6 characters"
                    value={password} onChange={event => setPassword(event.target.value)}
                  />
                </label>
                {error && <div className="inline-error">{error}</div>}
                <button className="primary-button auth-submit" type="submit" disabled={busy}>
                  {busy ? <LoaderCircle size={17} className="spin" /> : tab === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={17} />
                </button>
              </form>

              <div className="auth-divider">OR CONTINUE WITH</div>
              <button className="social-button" onClick={google} disabled={busy}><Cloud size={16} /> Google account</button>
              <button className="guest-cloud-button" onClick={onGuest} disabled={busy}>Continue as guest instead</button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
