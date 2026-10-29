import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, NightDigest, ReadNight } from './types.js';

type ParsedRun = {
  at: string;
  atMs: number;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
};

type AggregatedRow = {
  row: DigestRow;
  firstAtMs: number;
  lastAtMs: number;
  lastErrorAtMs: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDigestStatus(value: unknown): value is DigestStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function parseRun(value: unknown): ParsedRun | null {
  if (!isRecord(value)) return null;

  const at = value.at;
  const atMs = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  if (typeof at !== 'string' || !Number.isFinite(atMs)) return null;
  if (typeof value.job !== 'string' || !isDigestStatus(value.status)) return null;
  if (value.owner !== null && typeof value.owner !== 'string') return null;

  const error = value.error;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;

  return {
    at,
    atMs,
    job: value.job,
    status: value.status,
    owner: value.owner,
    error: typeof error === 'string' && error.length > 0 ? error : null,
  };
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export const readNight: ReadNight = (runsDir, night): NightDigest | null => {
  // Keep the night to a filename, even when the caller passes a URL parameter.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }

  if (contents.length === 0) return { rows: [], badLines: 0 };

  const lines = contents.split(/\r?\n/);
  // A final line break terminates the previous JSON object; it is not another record.
  if (lines[lines.length - 1] === '') lines.pop();

  const rowsByJob = new Map<string, AggregatedRow>();
  let badLines = 0;

  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      badLines += 1;
      continue;
    }

    const run = parseRun(value);
    if (!run) {
      badLines += 1;
      continue;
    }

    const aggregate = rowsByJob.get(run.job);
    if (!aggregate) {
      rowsByJob.set(run.job, {
        row: {
          job: run.job,
          owner: run.owner,
          runs: 1,
          retries: run.status === 'retry' ? 1 : 0,
          lastStatus: run.status,
          lastError: run.error,
          firstAt: run.at,
          lastAt: run.at,
        },
        firstAtMs: run.atMs,
        lastAtMs: run.atMs,
        lastErrorAtMs: run.error === null ? Number.NEGATIVE_INFINITY : run.atMs,
      });
      continue;
    }

    aggregate.row.runs += 1;
    if (run.status === 'retry') aggregate.row.retries += 1;

    if (run.atMs < aggregate.firstAtMs) {
      aggregate.firstAtMs = run.atMs;
      aggregate.row.firstAt = run.at;
    }

    if (run.atMs >= aggregate.lastAtMs) {
      aggregate.lastAtMs = run.atMs;
      aggregate.row.lastAt = run.at;
      aggregate.row.lastStatus = run.status;
      aggregate.row.owner = run.owner;
    }

    if (run.error !== null && run.atMs >= aggregate.lastErrorAtMs) {
      aggregate.lastErrorAtMs = run.atMs;
      aggregate.row.lastError = run.error;
    }
  }

  const rows = [...rowsByJob.values()]
    .map(({ row }) => row)
    .sort((left, right) => left.job.localeCompare(right.job));

  return { rows, badLines };
};
