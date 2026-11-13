import type { DigestRow, NightResult } from '../digest/types.js';

// Missing data is "—", never an empty cell (styleguide).
const dash = (v: string | null) => v ?? '—';

// A row is marked when it retried 3 or more times, or failed at all.
const isWarn = (r: DigestRow) => r.retries >= 3 || r.fails > 0;

export function DigestPage({ result }: { result: NightResult }) {
  if (!result.found) {
    return (
      <>
        <h1>digest · {result.night}</h1>
        <p class="mute">no run log for {result.night}</p>
      </>
    );
  }

  return (
    <>
      <h1>digest · {result.night}</h1>
      <p class="mute">
        ok {result.counts.ok} · retry {result.counts.retry} · fail {result.counts.fail}
      </p>
      {result.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>fails</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr class={isWarn(r) ? 'warn' : undefined}>
                <td>{r.job}</td>
                <td>{dash(r.owner)}</td>
                <td>{r.runs}</td>
                <td>{r.retries}</td>
                <td>{r.fails}</td>
                <td>{r.lastStatus}</td>
                <td>{dash(r.lastError)}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result.badLines > 0 && (
        <p class="warn">
          {result.badLines} {result.badLines === 1 ? 'line' : 'lines'} did not parse
        </p>
      )}
    </>
  );
}
