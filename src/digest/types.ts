// The night's run log, read into one row per job. Types only: no reading, no I/O here.
// Source: runs/<night>.jsonl, one JSON object per line:
//   { at, job, status: 'ok' | 'retry' | 'fail', owner: string | null, error?: string }

// Status of one line in the log.
export type DigestStatus = 'ok' | 'retry' | 'fail';

// One job's night, folded from all of its lines.
export type DigestRow = {
  // Job name as in the log, e.g. "lane/sync". Unique within a night; the sort key for the page.
  job: string;
  // Owner from the job's last line. null is kept (rendered as "—"), never dropped.
  owner: string | null;
  // Lines for this job, every status counted.
  runs: number;
  // Lines with status 'retry'. The page marks the row at 3 or more.
  retries: number;
  // Lines with status 'fail'. The page marks the row when this is above 0.
  fails: number;
  // Status of the job's last line.
  lastStatus: DigestStatus;
  // Most recent `error` the job logged, even if a later line was ok; null if it never logged one.
  lastError: string | null;
  // `at` of the job's first line, verbatim from the log (offset kept, never converted to UTC).
  firstAt: string;
  // `at` of the job's last line, verbatim from the log (offset kept, never converted to UTC).
  lastAt: string;
};

// Line counts per status across the whole night (parsed lines only). The board shows these.
export type DigestCounts = Record<DigestStatus, number>;

// Reading one night. `found: false` = no runs/<night>.jsonl (the page answers 404);
// `found: true` with no rows = the file exists but nothing ran (or every line was bad).
export type NightResult =
  | {
      found: false;
      // The night asked for, YYYY-MM-DD.
      night: string;
    }
  | {
      found: true;
      // The night read, YYYY-MM-DD.
      night: string;
      // One row per job, sorted by job.
      rows: DigestRow[];
      // Non-empty lines that did not parse into a valid entry. Counted, never thrown.
      badLines: number;
      // ok / retry / fail line counts for the night.
      counts: DigestCounts;
    };

// Reads runsDir/<night>.jsonl. Never throws for a missing file or bad lines.
export type ReadNight = (runsDir: string, night: string) => NightResult;
