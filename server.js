import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Production/preview host: serves the built app from dist/ and nothing else.
// AI now runs entirely in the browser through the self-hosted Puter.js SDK
// (public/vendor/puter.js), so there is no server-side proxy or API key to guard.
const app = express();

if (existsSync('dist')) {
  app.use(express.static(resolve('dist')));
  app.get('*', (_, res) => res.sendFile(resolve('dist/index.html')));
}

app.use((_, res) => res.status(404).json({ error: 'Not found. Run `npm run build` before `npm run preview`.' }));

export default app;

// Listen only when this file is run directly (`npm run preview`); Vercel imports the handler instead.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, '0.0.0.0', () => console.log(`Serving the built app on http://localhost:${port}`));
}
