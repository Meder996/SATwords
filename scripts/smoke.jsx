// Render smoke test: mounts every screen to a string with a small DOM shim, so a crash in
// any page (a missing import, a bad hook order) fails here instead of in the browser.
// Run with `npm run smoke`.
import { renderToString } from 'react-dom/server';
import React from 'react';

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
};
const location = { href: 'http://localhost:5173/', origin: 'http://localhost:5173', pathname: '/', search: '', hash: '' };
globalThis.window = {
  location,
  localStorage: globalThis.localStorage,
  history: { pushState() {}, replaceState() {} },
  addEventListener() {}, removeEventListener() {}, scrollTo() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
};
globalThis.document = {
  documentElement: { dataset: {} },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ dataset: {}, style: {}, setAttribute() {} }),
  head: { appendChild() {} },
  addEventListener() {}, removeEventListener() {}
};
// Node 22 already defines a read-only `navigator`; the app only checks for serviceWorker support.

async function main() {
const { default: Landing } = await import('../src/pages/Landing.jsx');
const { default: SignIn } = await import('../src/pages/SignIn.jsx');
const { default: Tutor } = await import('../src/pages/Tutor.jsx');
const { App } = await import('../src/main.jsx');

const results = [];
const check = async (name, render) => {
  try {
    const html = render();
    results.push(`ok   ${name} (${html.length} chars)`);
    if (html.length < 200) throw new Error('suspiciously small output');
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
};

await check('landing', () => renderToString(React.createElement(Landing, { onSignIn() {}, onGuest() {}, cloudEnabled: false })));
await check('signin (accounts off)', () => renderToString(React.createElement(SignIn, { tab: 'signup', cloud: null, cloudEnabled: false, onGuest() {}, onBack() {}, notify() {} })));
await check('tutor', () => renderToString(React.createElement(Tutor, { data: { states: {} }, ensureAI() {}, aiConnected: false, notify() {} })));

// Guest mode unlocks the shell; walk every page through it.
store.clear();
store.set('vocamaster-guest-v1', '1');
for (const page of ['dashboard', 'study', 'practice', 'tutor', 'dictionary', 'analytics', 'profile', 'landing', 'signin']) {
  location.search = page === 'dashboard' ? '' : `?page=${page}`;
  await check(`app:${page}`, () => renderToString(React.createElement(App)));
}
store.clear();
location.search = '?page=signin';
await check('app:signed-out signin', () => renderToString(React.createElement(App)));
location.search = '';
await check('app:signed-out landing', () => renderToString(React.createElement(App)));

console.log(results.join('\n'));
}
main();
