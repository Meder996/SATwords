# SAT VocaMaster

A local-first, responsive vocabulary study app for Digital SAT preparation. It includes 1,000 vocabulary entries, spaced-repetition flashcards, context cloze, a timed match game, SAT-style meaning-in-context questions, progress analytics, and optional Firebase/Gemini integrations.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in your terminal (typically `http://localhost:5173`). `npm run dev` starts both the Vite frontend and a small server-side AI proxy. Without external credentials, all core study, dictionary, practice, progress, and theme features work in guest mode. Progress is stored in browser localStorage. `npm test` runs SRS/queue tests; `npm run build` makes a production bundle. After building, `npm run preview` serves the production bundle and API via Express (default port 3001).

## Optional cloud sync

1. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values from your Firebase web app. Enable **Email/Password**, **Google**, and **Anonymous** providers as desired in Firebase Authentication; add your deployed domain to the authorized domains list. Enable Cloud Firestore.
2. Deploy `firestore.rules` to your Firebase project (for example, with `firebase deploy --only firestore:rules`). Rules allow everyone to read the dictionary path but only each authenticated user to read/write their own profile, word states, and session history.
3. To seed the optional shared Firestore dictionary, run `GOOGLE_APPLICATION_CREDENTIALS=/path/to/admin-service-account.json npm run seed:firestore -- sat-vocamaster` (or your chosen `VITE_FIREBASE_ARTIFACT_ID`). Keep Admin credentials **outside** this repository. The app ships with a bundled word bank so the dictionary works offline without a Firestore connection.

Signing in merges locally saved progress with the account's cloud records. An anonymous Firebase session can sync, but may not be recoverable after sign-out unless linked to a permanent account. Settings contain a preferred study time; browser notifications/reminder scheduling are not implemented yet.

## Optional Gemini features

Set `GEMINI_API_KEY` in `.env` **without** a `VITE_` prefix. The Express proxy keeps it off the browser and sends it to Google in an `x-goog-api-key` header (including support for the newer authorization-key format). It powers:

- Mnemonics, SAT context tips, and usage explanations via `gemini-3-flash-preview`.
- Short personalized reading passages and two multiple-choice questions via the same model.
- Pronunciation via `gemini-2.5-flash-preview-tts`, with Web Speech API fallback if the service is unavailable.

AI model access, pricing and availability depend on your Google API project. AI buttons display a clear error when no key is configured; a clearly labeled offline sample passage remains available for practice. The text-to-speech button falls back to your browser's speech engine. The included 36 featured entries have authored examples suitable for context exercises; the remaining entries provide definition/POS/synonyms without invented example sentences or phonetics. See [`src/data/NOTICE.md`](src/data/NOTICE.md) for word-data attribution.

## Product notes

- Review scheduling uses an SM-2-inspired ease/interval scheme. **Again** repeats within the session (up to three extra retries); **Hard**, **Good**, and **Easy** schedule increasingly distant reviews. The state is saved per word.
- Quiz/Cloze correctness earns 25 XP; each flashcard rating earns 10 XP; finishing Match Sprint earns 50 XP. The heatmap is based on recorded study activity.
- Guest learning works without a login or internet after the app is cached by its service worker. A browser's data clearing also clears unsynced guest progress.
- This is a study aid with original practice content, not an official College Board test. Tutor/classroom management, exports, real notifications, and full authored examples for every word are future work.

## Deploy on Vercel

1. Import this GitHub repository into Vercel. Choose **Vite** as the framework preset. The committed `vercel.json` runs `npm run build` and serves `dist`. The three files in `api/` deploy the Gemini proxy as Vercel Functions; the browser calls them via relative `/api/...` URLs. No separate server or localhost URL is needed in production.
2. The app works immediately in local guest mode with no environment variables. For optional AI, set `GEMINI_API_KEY` in your Vercel project **Settings → Environment Variables** (server-side only), choose the environments where it should work (Production and/or Preview), then redeploy. A local `.env` is ignored by Git and does not get uploaded to Vercel. For optional Firebase, set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, and `VITE_FIREBASE_ARTIFACT_ID`. `VITE_` values are embedded into the build, so redeploy after adding or changing them. **Do not** put `GEMINI_API_KEY` in a `VITE_` variable.
3. If using Firebase Auth, add your Vercel production domain (and any preview domains you plan to use) to Firebase Authentication's authorized domains. Deploy `firestore.rules` and optionally run the dictionary seeder as described above.
4. Deploy from the `arena/01a0e73e-satwords` branch to preview these changes now, or merge its pull request into `main` to deploy from `main`.

The Gemini functions have a 30-second maximum duration and a 20-second upstream request timeout. On free/serverless deployments, the included per-IP rate limiter is best-effort per function instance, not a global billing guard; configure your own API quotas for production.
