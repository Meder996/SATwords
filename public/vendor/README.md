# Vendored Puter.js

`puter.js` is the **official Puter.js browser build**, copied out of the
[`@heyputer/puter.js`](https://www.npmjs.com/package/@heyputer/puter.js) npm package
(`dist/puter.cjs`) instead of being loaded from `https://js.puter.com/v2/`.

Copyright 2024-present Puter Technologies Inc. — licensed under **Apache-2.0**.

## Why self-host it

- The app loads no third-party script from a CDN at runtime, so it keeps working when
  a CDN is blocked, and `index.html` has no remote `<script src>`.
- The `postinstall`/`prebuild` script (`npm run vendor:puter`) refreshes this file, plus
  the matching version banner, straight from the pinned dependency.
- One copy is shared by every deployment because it is committed to `public/`.

## Updating

```bash
npm install @heyputer/puter.js@latest
npm run vendor:puter
```

Do not edit `puter.js` by hand — regenerate it. `index.html` loads it with a plain
`<script src="/vendor/puter.js">` tag, which exposes the global `window.puter`.
The app talks to it only through `src/lib/puter.js`.
