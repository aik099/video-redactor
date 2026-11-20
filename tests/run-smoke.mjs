// Runs tests/smoke.js in a real browser: serves the project folder, opens the page, fails if any check fails.
// Browser: BROWSER_PATH (any Chromium-based one, e.g. Brave) or else Google Chrome (`channel: 'chrome'`, preinstalled
// on GitHub's Ubuntu runners). Playwright's own Chromium can't play the H.264 fixture.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.json': 'application/json' };

const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  const file = join(root, path.endsWith('/') ? path + 'index.html' : path);

  if (!file.startsWith(normalize(root + sep))) {
    response.writeHead(403).end();

    return;
  }

  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : { channel: 'chrome' });
let failed = 1;

try {
  const page = await browser.newPage({ viewport: { width: 1430, height: 873 } });
  page.on('pageerror', error => console.error('Page error:', error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const outcome = await page.evaluate(async () => (await import(`${location.origin}/tests/smoke.js`)).run());

  for (const result of outcome.results) {
    if (typeof result === 'object' && !result.ok) {
      console.error(`✖ ${result.name}${result.detail ? ` (${result.detail})` : ''}`);
    }
  }

  console.log(`Smoke test: ${outcome.passed} passed, ${outcome.failed} failed`);
  failed = outcome.failed;
} finally {
  await browser.close();
  server.close();
}

process.exit(failed ? 1 : 0);
