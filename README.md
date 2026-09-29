# SAT VocaMaster

A local-first, installable vocabulary study app for Digital SAT preparation. It includes 1,000 vocabulary entries, spaced-repetition flashcards, context cloze, a timed match game, SAT-style meaning-in-context questions, progress analytics, browser-based AI features through Puter.js, and optional Firebase sync.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in your terminal (typically `http://localhost:5173`). `npm test` runs the spaced-repetition/queue tests and the Puter AI client tests; `npm run build` makes a production bundle, and `npm run preview` serves that bundle plus the icons and app shell through Express (default port 3001). No environment variables are required — the app starts in guest mode with an in-browser word bank.

## AI features (Puter.js, no API key)

Mnemonics, generated reading passages, and pronunciations are produced **in the browser** by [Puter.js](https://developer.puter.com), the free serverless AI/auth library. There is no API key, no server proxy, and nothing to configure — which is what lets AI work on a public deployment out of the box.

- **Self-hosted SDK.** `public/vendor/puter.js` is the official Puter.js browser build committed to this repo and loaded with a plain `<script src="/vendor/puter.js">` tag, so no third-party CDN is contacted at runtime and the app keeps working when a CDN is blocked. Regenerate it from the pinned npm dependency with `npm run vendor:puter` (also runs automatically before `npm run build`).
- **Per-user authorization.** The first time an AI feature is used, Puter opens its own sign-in window so the user authorizes this site. Usage is then billed to *that user's* Puter account, not to the site owner. This is why no key ever ships to the browser: AI access belongs to the person using it.
- **Connect in the Profile page.** *Your space → Powered by Puter* shows connection status with **Connect Puter** / **Disconnect Puter**. AI buttons also connect on demand: clicking **Ask AI**, **Connect & generate**, or a pronunciation button while signed out opens the Puter window first, inside the click, then runs the request.
- **Optional overrides.** `VITE_PUTER_MODEL` (e.g. `gpt-4o-mini`, `claude-sonnet-4`) and `VITE_PUTER_TTS_VOICE` (e.g. `Joanna`, `alloy`, `Kore`) pick a specific model or voice; by default Puter's own defaults are used.
- **Graceful degradation.** If Puter is unavailable, pronunciation falls back to the browser's Web Speech API. A clearly labeled offline sample passage is always available for reading practice, and every core study feature works without connecting anything.

All AI calls are made through `src/lib/puter.js`, which is the only module that touches the SDK; it normalises responses, maps failures (signed-out, usage limit, offline) to readable messages, and is covered by `src/lib/puter.test.js`.

> Earlier versions of this app proxied Google Gemini through `api/` Vercel Functions with a `GEMINI_API_KEY`. Puter replaces that entirely — the functions, the proxy, the key, and the per-IP throttle are gone, so no server-side secret is needed anywhere.

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

## Optional cloud sync

1. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values from your Firebase web app. Enable **Email/Password**, **Google**, and **Anonymous** providers as desired in Firebase Authentication; add your deployed domain to the authorized domains list. Enable Cloud Firestore.
2. Deploy `firestore.rules` to your Firebase project (for example, with `firebase deploy --only firestore:rules`). Rules allow everyone to read the dictionary path but only each authenticated user to read/write their own profile, word states, and session history.
3. To seed the optional shared Firestore dictionary, run `GOOGLE_APPLICATION_CREDENTIALS=/path/to/admin-service-account.json npm run seed:firestore -- sat-vocamaster` (or your chosen `VITE_FIREBASE_ARTIFACT_ID`). Keep Admin credentials **outside** this repository. The app ships with a bundled word bank so the dictionary works offline without a Firestore connection.

Signing in merges locally saved progress with the account's cloud records. An anonymous Firebase session can sync, but may not be recoverable after sign-out unless linked to a permanent account. Settings contain a preferred study time; browser notifications/reminder scheduling are not implemented yet. Firebase sync and the Puter AI connection are independent: you can use AI without an account, and sync progress without AI.

## Product notes

- Review scheduling uses an SM-2-inspired ease/interval scheme. **Again** repeats within the session (up to three extra retries); **Hard**, **Good**, and **Easy** schedule increasingly distant reviews. The state is saved per word.
- Quiz/Cloze correctness earns 25 XP; each flashcard rating earns 10 XP; finishing Match Sprint earns 50 XP. The heatmap is based on recorded study activity.
- Guest learning works without a login or internet after the app is cached by its service worker. A browser's data clearing also clears unsynced guest progress.
- This is a study aid with original practice content, not an official College Board test. Tutor/classroom management, exports, real notifications, and full authored examples for every word are future work.
- The included 36 featured entries have authored examples suitable for context exercises; the remaining entries provide definition/POS/synonyms without invented example sentences or phonetics. See [`src/data/NOTICE.md`](src/data/NOTICE.md) for word-data attribution.

## Deploy on Vercel

1. Import this GitHub repository into Vercel. Choose **Vite** as the framework preset. The committed `vercel.json` runs `npm run build` (which vendors Puter.js first) and serves `dist`. There is no API directory and no server function to deploy.
2. No environment variables are needed for AI: users connect their own Puter account in the Profile page. Optionally set `VITE_PUTER_MODEL` / `VITE_PUTER_TTS_VOICE`, and for cloud sync set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, and `VITE_FIREBASE_ARTIFACT_ID`. `VITE_` values are embedded into the build, so redeploy after adding or changing them.
3. If using Firebase Auth, add your Vercel production domain (and any preview domains you plan to use) to Firebase Authentication's authorized domains. Deploy `firestore.rules` and optionally run the dictionary seeder as described above.
4. Deploy from the `arena/01a0e873-satwords` branch to preview these changes now, or merge its pull request into `main` to deploy from `main`.

Because `/vendor/puter.js` is committed, the deployed site never depends on `js.puter.com` being reachable at build time. Puter's own per-account usage limits and quotas apply to each connected user; the app surfaces them as a friendly message rather than failing silently.
