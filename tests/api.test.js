import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// New Gemini authorization keys must be sent as a header, not a URL query parameter.
test('Gemini proxy authenticates server-side using x-goog-api-key', async () => {
  process.env.GEMINI_API_KEY = 'test-only-key';
  const originalFetch = globalThis.fetch;
  let upstream;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://generativelanguage.googleapis.com')) {
      upstream = { url: String(url), options };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ mnemonic: 'test', satContextTip: 'test', correctVsIncorrect: 'test' }) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, options);
  };
  const { default: app } = await import('../server.js');
  const server = createServer(app);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/insight`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word: 'abate', definition: 'to lessen' })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).mnemonic, 'test');
    assert.equal(upstream.options.headers['x-goog-api-key'], 'test-only-key');
    assert.equal(upstream.url.includes('test-only-key'), false);
    assert.equal(upstream.url.includes('?key='), false);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
});
