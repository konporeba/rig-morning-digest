import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Temp runs dir: runs/ is read-only fixtures and never written from tests.
let runsDir: string;

const line = (job: string, status: 'ok' | 'retry' | 'fail', owner: string | null, at: string, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

const config = (dir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: dir,
});

// Job names in the order they appear in the page HTML.
const jobsInPageOrder = (html: string, jobs: string[]) =>
  jobs
    .map((job) => ({ job, at: html.indexOf(job) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.job);

const JOBS = ['lane/sync', 'digest/build', 'backup/nightly', 'cache/warm'];

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));

  // A normal night: four jobs, digest/build retried 3 times, backup/nightly failed with no owner.
  // Lines are deliberately out of job order in the file.
  writeFileSync(
    join(runsDir, '2026-11-01.jsonl'),
    [
      line('lane/sync', 'ok', 'konrad', '2026-11-01T02:00:00+01:00'),
      line('digest/build', 'retry', 'rook', '2026-11-01T02:05:00+01:00', 'timeout'),
      line('backup/nightly', 'fail', null, '2026-11-01T02:10:00+01:00', 'disk full'),
      line('digest/build', 'retry', 'rook', '2026-11-01T02:06:00+01:00', 'timeout'),
      line('cache/warm', 'ok', 'rook', '2026-11-01T02:20:00+01:00'),
      line('digest/build', 'retry', 'rook', '2026-11-01T02:07:00+01:00', 'timeout'),
      line('digest/build', 'ok', 'rook', '2026-11-01T02:08:00+01:00'),
      '',
    ].join('\n'),
  );

  // An empty night: the file exists, nothing ran.
  writeFileSync(join(runsDir, '2026-11-02.jsonl'), '');

  // A night with one bad line; the good rows must still render.
  writeFileSync(
    join(runsDir, '2026-11-03.jsonl'),
    [
      line('lane/sync', 'ok', 'konrad', '2026-11-03T02:00:00+01:00'),
      'this is not json',
      line('cache/warm', 'ok', 'rook', '2026-11-03T02:20:00+01:00'),
      '',
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('digest page', () => {
  it('renders the night as a table with the jobs, warn rows and the em dash for a null owner', async () => {
    const res = await createApp(config(runsDir)).request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS) expect(html).toContain(job);
    expect(html).toContain('warn');
    expect(html).toContain('—');
  });

  it('lists jobs sorted by job name', async () => {
    const res = await createApp(config(runsDir)).request('/digest/2026-11-01');
    const html = await res.text();
    expect(jobsInPageOrder(html, JOBS)).toEqual(['backup/nightly', 'cache/warm', 'digest/build', 'lane/sync']);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config(runsDir)).request('/digest/2026-11-04');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await createApp(config(runsDir)).request('/digest/2026-11-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('renders a night with a bad line and reports the count', async () => {
    const res = await createApp(config(runsDir)).request('/digest/2026-11-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('cache/warm');
    expect(html).toMatch(/1 lines? did not parse/);
  });
});

describe('digest JSON', () => {
  it('returns night, rows, badLines and counts with the same jobs in the same order as the page', async () => {
    const app = createApp(config(runsDir));
    const page = await (await app.request('/digest/2026-11-01')).text();
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({ night: '2026-11-01', badLines: 0 });
    expect(body.counts).toBeDefined();

    const jobs = body.rows.map((r: { job: string }) => r.job);
    expect(jobs).toEqual(['backup/nightly', 'cache/warm', 'digest/build', 'lane/sync']);
    expect(jobsInPageOrder(page, JOBS)).toEqual(jobs);

    const digest = body.rows.find((r: { job: string }) => r.job === 'digest/build');
    expect(digest.retries).toBe(3);
    const backup = body.rows.find((r: { job: string }) => r.job === 'backup/nightly');
    expect(backup.owner).toBeNull();
    expect(backup.fails).toBeGreaterThan(0);
  });

  it('answers 404 JSON for a night with no file', async () => {
    const res = await createApp(config(runsDir)).request('/api/digest/2026-11-04');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toBeDefined();
  });

  it('returns no rows for an empty night', async () => {
    const res = await createApp(config(runsDir)).request('/api/digest/2026-11-02');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toEqual([]);
  });

  it('counts a bad line and still returns the good rows', async () => {
    const res = await createApp(config(runsDir)).request('/api/digest/2026-11-03');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['cache/warm', 'lane/sync']);
  });
});
