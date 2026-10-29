import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/readNight.js';

const temporaryDirs: string[] = [];

function makeTempDir(): string {
  const path = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  temporaryDirs.push(path);
  return path;
}

afterEach(() => {
  for (const path of temporaryDirs.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('readNight', () => {
  it('aggregates the checked-in night and counts its malformed line', () => {
    const digest = readNight('runs', '2026-10-28');

    expect(digest).not.toBeNull();
    expect(digest?.rows).toHaveLength(5);
    expect(digest?.badLines).toBe(1);

    const refresh = digest?.rows.find((row) => row.job === 'fixtures/refresh');
    expect(refresh).toMatchObject({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });

    const render = digest?.rows.find((row) => row.job === 'digest/render');
    expect(render).toMatchObject({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
    });
  });

  it('returns null for a missing night and unsafe night names', () => {
    expect(readNight(makeTempDir(), '2026-10-28')).toBeNull();
    expect(readNight(makeTempDir(), '../2026-10-28')).toBeNull();
  });

  it('returns an empty digest for an empty file', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, '2026-10-28.jsonl'), '');

    expect(readNight(dir, '2026-10-28')).toEqual({ rows: [], badLines: 0 });
  });

  it('counts malformed lines and keeps parsing later records', () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, '2026-10-28.jsonl'),
      [
        JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'first', status: 'ok', owner: null }),
        '{"at":',
        JSON.stringify({ at: '2026-10-29T00:00:00+01:00', job: 'second', status: 'fail', owner: 'lane-07' }),
        '',
      ].join('\n'),
    );

    const digest = readNight(dir, '2026-10-28');

    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((row) => row.job)).toEqual(['first', 'second']);
    expect(digest?.rows[0]?.firstAt).toBe('2026-10-28T23:00:00+01:00');
    expect(digest?.rows[1]?.lastStatus).toBe('fail');
  });
});
