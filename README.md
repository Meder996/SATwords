# SAT VocaMaster

A local-first, installable vocabulary study app for Digital SAT preparation. It includes 1,000 vocabulary entries, spaced-repetition flashcards, context cloze, a timed match game, SAT-style meaning-in-context questions, progress analytics, browser-based AI features through Puter.js, a streaming AI tutor, and optional Supabase accounts with cloud sync.

Visitors who are not signed in land on a marketing page and can either create a free account or start a **guest session**. Guest progress lives in the browser only; signing in later merges it with the account instead of replacing it.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in your terminal (typically `http://localhost:5173`). `npm test` runs the study, routing, sync, account and AI client tests; `npm run smoke` renders every screen to a string (with a small DOM shim) so a crash in any page fails the command instead of the browser; `npm run build` makes a production bundle, and `npm run preview` serves that bundle plus the icons and app shell through Express (default port 3001). No environment variables are required — the app starts in guest mode with an in-browser word bank.

## Screens

| Screen | What it is for |
| --- | --- |
| Landing page (`/`) | The first thing a signed-out visitor sees: what the app does, and the two ways in. |
| Sign in (`?page=signin`) | A full page for creating an account, signing in, Google sign-in, or continuing as a guest. |
| Dashboard, Flashcards, Practice, Dictionary, Analytics | The study shell, unchanged for guests and accounts alike. |
| AI tutor (`?page=tutor`) | A streaming chat with a SAT verbal coach that can see the words you keep missing. |
| Profile (`?page=profile`) | Study preferences, Puter connection, account actions — including **Sign out** and **Exit guest mode**. |

The account menu in the top bar shows who is signed in, the current sync state, and the same account actions, so signing out or leaving guest mode never requires hunting through settings.

Routing rules live in `src/lib/navigation.js` and are unit-tested: accounts that are still loading see a boot screen, signed-in users always get the app, guests get the app but can still reach sign-in, and everyone else gets the landing page.

## AI features (Puter.js, no API key)

Mnemonics, reading sets, tutor chat and pronunciations are produced **in the browser** by [Puter.js](https://developer.puter.com), the free serverless AI/auth library. There is no API key, no server proxy, and nothing to configure — which is what lets AI work on a public deployment out of the box.

- **Self-hosted SDK.** `public/vendor/puter.js` is the official Puter.js browser build committed to this repo and loaded with a plain `<script src="/vendor/puter.js">` tag, so no third-party CDN is contacted at runtime and the app keeps working when a CDN is blocked. Regenerate it from the pinned npm dependency with `npm run vendor:puter` (also runs automatically before `npm run build`).
- **Per-user authorization.** The first time an AI feature is used, Puter opens its own sign-in window so the user authorizes this site. Usage is then billed to *that user's* Puter account, not to the site owner. This is why no key ever ships to the browser: AI access belongs to the person using it.
- **Streaming tutor.** The tutor page sends the conversation to `puter.ai.chat(..., { stream: true })` and renders each chunk as it arrives, so the first words appear immediately. It keeps the last twelve turns, injects up to eight of the learner's focus words as context, and stores the conversation locally (`vocamaster-tutor-v1`) so it is there when you come back.
- **Reading sets of three.** Practice → *AI reading set* asks for **three** original passages in one request, each with its own title and two meaning-in-context questions, and walks the learner through them passage by passage (or falls back to a bundled offline sample set of three).
- **Connect in the Profile page.** *Your space → Powered by Puter* shows connection status with **Connect Puter** / **Disconnect Puter**. AI buttons also connect on demand: clicking **Ask AI**, **Connect & generate**, or a pronunciation button while signed out opens the Puter window first, inside the click, then runs the request.
- **Optional overrides.** `VITE_PUTER_MODEL` (e.g. `gpt-4o-mini`, `claude-sonnet-4`) and `VITE_PUTER_TTS_VOICE` (e.g. `Joanna`, `alloy`, `Kore`) pick a specific model or voice; by default Puter's own defaults are used.
- **Graceful degradation.** If Puter is unavailable, pronunciation falls back to the browser's Web Speech API, the sample reading set is always available, and every core study feature works without connecting anything.

All AI calls go through `src/lib/puter.js`, which is the only module that touches the SDK; `src/lib/tutor.js` builds the chat prompts and consumes the stream. Both normalise responses, map failures (signed-out, usage limit, offline) to readable messages, and are covered by tests.

## Accounts and guest mode (Supabase, optional)

Cloud accounts are optional. With no Supabase values configured, the landing page still offers **Continue as guest**, the sign-in page explains that accounts are switched off for the deployment, and every study feature works.

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. It creates the `progress` and `sessions` tables and one row-level-security policy per table, so each account can only read and write its own rows — which is what makes it safe to ship the anon key in the browser bundle.
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Optionally enable the Google provider in **Authentication → Providers** and add your deployed domain to the redirect allow-list.

Signing in merges the account's cloud copy, the on-device copy for that account, and the guest session (`src/lib/sync.js`): the most recently updated state of each word wins, daily counts take the larger value, sessions are de-duplicated and capped at 500, XP keeps the highest total, and the cloud copy wins for preferences. Nothing is dropped, and the merged result is pushed back up. Signing out keeps the account's progress safely in the cloud and returns to the landing page; leaving guest mode keeps the guest copy on the device in case you sign in later.

Supabase accounts and the Puter AI connection are independent: you can use AI without an account, and sync progress without AI.

## Icons and installable app (PWA)

Everything is generated from SVG masters so the artwork stays consistent across sizes:

| File | Purpose |
| --- | --- |
| `design/icon.svg` | Master mark: rounded navy square with the amber open book and sparkle. |
| `design/icon-maskable.svg` | Full-bleed variant with the artwork inside the safe zone, used for Android maskable icons and iOS. |
| `design/icon-small.svg` | Simplified two-page mark that stays legible at 16 px. |

```bash
npm run icons   # regenerate every PNG + favicon.ico from design/*.svg
```

That writes `public/icons/icon-{96,144,192,256,384,512,1024}.png`, `public/icons/icon-maskable-{192,512}.png`, `public/icons/apple-touch-icon.png` (180 px), `public/favicon-{16,32,48}.png`, a multi-size `public/favicon.ico`, and the two SVGs. `index.html` links them all (`favicon.ico` → PNG → SVG, `apple-touch-icon`, `mask-icon`, `manifest`, Windows tile config via `public/browserconfig.xml`), `public/manifest.webmanifest` declares the standalone display, theme color, and shortcuts to the flashcards, practice, and dictionary pages. The service worker precaches the icons and the vendored SDK, so an installed copy opens offline.

Edit the SVGs, never the PNGs — the rasters are build output.

## How the code is organised

| Module | Responsibility |
| --- | --- |
| `src/main.jsx` | The study shell: state, progress updates, and every study screen. |
| `src/pages/Landing.jsx`, `SignIn.jsx`, `Tutor.jsx` | The three screens that live outside the study shell. |
| `src/lib/navigation.js` | Page list, URL building, and the signed-in / guest / landing decision. |
| `src/lib/sync.js` | Storage keys and the merge rules used when an account signs in. |
| `src/lib/supabase.js` | The only module that talks to Supabase (auth + two tables + error wording). |
| `src/lib/tutor.js` | Tutor prompts, history handling, and the streaming consumer. |
| `src/lib/puter.js` | The only module that talks to the Puter SDK. |
| `src/lib/study.js` | SM-2 review scheduling, queues, stats, XP. |

## Product notes

- Review scheduling uses an SM-2-inspired ease/interval scheme. **Again** repeats within the session (up to three extra retries); **Hard**, **Good**, and **Easy** schedule increasingly distant reviews. The state is saved per word.
- Quiz/Cloze/reading-set correctness earns 25 XP; each flashcard rating earns 10 XP; finishing Match Sprint earns 50 XP. The heatmap is based on recorded study activity.
- Guest learning works without a login or internet after the app is cached by its service worker. A browser's data clearing also clears unsynced guest progress.
- This is a study aid with original practice content, not an official College Board test. Classroom management, exports, real notifications, and full authored examples for every word are future work.
- The included 36 featured entries have authored examples suitable for context exercises; the remaining entries provide definition/POS/synonyms without invented example sentences or phonetics. See [`src/data/NOTICE.md`](src/data/NOTICE.md) for word-data attribution.
