import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { DigestRow } from '../src/digest/types.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function rowsOf(runsDir: string, night: string): DigestRow[] {
  const result = readNight(runsDir, night);
  if (!result.found) throw new Error(`no night ${night}`);
  return result.rows;
}

function row(rows: DigestRow[], job: string): DigestRow {
  const found = rows.find((r) => r.job === job);
  if (!found) throw new Error(`no row ${job}`);
  return found;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const result = readNight('runs', '2026-10-28');

  it('reads 5 jobs, sorted by job, and counts the bad line', () => {
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.night).toBe('2026-10-28');
    expect(result.badLines).toBe(1);
    expect(result.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(result.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('folds retries, fails, errors, owners and times per job', () => {
    const rows = rowsOf('runs', '2026-10-28');
    expect(row(rows, 'fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row(rows, 'notes/backup')).toMatchObject({ fails: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(row(rows, 'digest/render')).toMatchObject({ owner: null, runs: 1, lastError: null });
    expect(row(rows, 'lane/sync')).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held', owner: 'rook' });
  });
});

describe('readNight edge cases', () => {
  it('a night with no file is not found', () => {
    expect(readNight(tmp, '2026-01-01')).toEqual({ found: false, night: '2026-01-01' });
    expect(readNight('runs', '1999-12-31')).toEqual({ found: false, night: '1999-12-31' });
  });

  it('an empty file is found with no rows', () => {
    writeFileSync(join(tmp, '2026-01-02.jsonl'), '');
    expect(readNight(tmp, '2026-01-02')).toEqual({
      found: true,
      night: '2026-01-02',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts invalid entries as bad lines and takes the owner from the last line', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T02:00:00+02:00","job":"a","status":"done","owner":"x"}',
      '{"job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T02:00:00+02:00","job":"a","status":"ok","owner":7}',
      '{"at":"2026-01-03T02:00:00+02:00","job":"a","status":"ok"}',
      '[1,2]',
      'not json',
      '',
      '{"at":"2026-01-03T03:00:00+02:00","job":"a","status":"retry","owner":null}',
    ];
    writeFileSync(join(tmp, '2026-01-03.jsonl'), lines.join('\n') + '\n');
    const result = readNight(tmp, '2026-01-03');
    expect(result).toMatchObject({ found: true, badLines: 6, counts: { ok: 1, retry: 1, fail: 0 } });
    expect(rowsOf(tmp, '2026-01-03')).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 2,
        retries: 1,
        fails: 0,
        lastStatus: 'retry',
        lastError: null,
        firstAt: '2026-01-03T01:00:00+02:00',
        lastAt: '2026-01-03T03:00:00+02:00',
      },
    ]);
  });

  it('does not read outside the runs dir for a malformed night', () => {
    expect(readNight(tmp, '../etc/passwd')).toEqual({ found: false, night: '../etc/passwd' });
  });
});
