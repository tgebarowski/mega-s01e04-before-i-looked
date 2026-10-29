import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const temporaryDirs: string[] = [];

function makeRunsDir(): string {
  const path = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  temporaryDirs.push(path);
  return path;
}

function writeNight(runsDir: string, night: string, lines: string[]): void {
  writeFileSync(join(runsDir, night + '.jsonl'), lines.join('\n'));
}

function appFor(runsDir: string) {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

afterEach(() => {
  for (const path of temporaryDirs.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('digest routes', () => {
  it('serves the page and JSON with the same jobs in sorted order', async () => {
    const runsDir = makeRunsDir();
    const night = '2026-10-28';
    writeNight(runsDir, night, [
      JSON.stringify({ at: '2026-10-29T02:00:00+01:00', job: 'zeta', status: 'ok', owner: 'lane-07' }),
      JSON.stringify({ at: '2026-10-29T01:00:00+01:00', job: 'alpha', status: 'retry', owner: 'rook' }),
    ]);
    const app = appFor(runsDir);

    const page = await app.request('/digest/' + night);
    const html = await page.text();
    const json = await app.request('/api/digest/' + night);
    const rows = await json.json();

    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    expect(rows.map((row: { job: string }) => row.job)).toEqual(['alpha', 'zeta']);
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
  });

  it('returns 404 for a night with no file on both routes', async () => {
    const app = appFor(makeRunsDir());

    expect((await app.request('/digest/2026-10-28')).status).toBe(404);
    expect((await app.request('/api/digest/2026-10-28')).status).toBe(404);
  });

  it('renders an empty night and returns an empty JSON array', async () => {
    const runsDir = makeRunsDir();
    const night = '2026-10-28';
    writeNight(runsDir, night, []);
    const app = appFor(runsDir);

    const page = await app.request('/digest/' + night);
    const html = await page.text();
    const json = await app.request('/api/digest/' + night);

    expect(page.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual([]);
  });

  it('counts a bad line and still serves the valid row on both routes', async () => {
    const runsDir = makeRunsDir();
    const night = '2026-10-28';
    writeNight(runsDir, night, [
      JSON.stringify({ at: '2026-10-29T01:00:00+01:00', job: 'digest/render', status: 'ok', owner: null }),
      '{"at":',
    ]);
    const app = appFor(runsDir);

    const page = await app.request('/digest/' + night);
    const html = await page.text();
    const json = await app.request('/api/digest/' + night);

    expect(page.status).toBe(200);
    expect(html).toContain('1 malformed line counted');
    expect(html).toContain('digest/render');
    expect(json.status).toBe(200);
    expect((await json.json()).map((row: { job: string }) => row.job)).toEqual(['digest/render']);
  });
});
