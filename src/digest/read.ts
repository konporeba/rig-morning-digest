// Reads one night's run log (runs/<night>.jsonl) into one DigestRow per job.
// Lines are parsed and validated here, at the edge; everything after trusts the types.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestCounts, DigestRow, DigestStatus, NightResult, ReadNight } from './types.js';

// One valid line of the log.
type Entry = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
};

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

function isStatus(value: unknown): value is DigestStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// One line into an Entry, or null when it is not a valid entry.
function parseLine(line: string): Entry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || at === '' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, job, status, owner, error: typeof error === 'string' ? error : null };
}

// The file's text, or null when there is no file for the night.
function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (isRecord(err) && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night): NightResult => {
  // Only YYYY-MM-DD names a night; anything else (e.g. "../x") has no file.
  if (!NIGHT.test(night)) return { found: false, night };
  const text = readText(join(runsDir, `${night}.jsonl`));
  if (text === null) return { found: false, night };

  const counts: DigestCounts = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const entry = parseLine(line);
    if (entry === null) {
      badLines += 1;
      continue;
    }
    counts[entry.status] += 1;
    const row = byJob.get(entry.job) ?? {
      job: entry.job,
      owner: entry.owner,
      runs: 0,
      retries: 0,
      fails: 0,
      lastStatus: entry.status,
      lastError: null,
      firstAt: entry.at,
      lastAt: entry.at,
    };
    row.owner = entry.owner;
    row.runs += 1;
    if (entry.status === 'retry') row.retries += 1;
    if (entry.status === 'fail') row.fails += 1;
    row.lastStatus = entry.status;
    if (entry.error !== null) row.lastError = entry.error;
    row.lastAt = entry.at;
    byJob.set(entry.job, row);
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { found: true, night, rows, badLines, counts };
};
