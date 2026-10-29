import type { DigestRow } from '../digest/types.js';

export function DigestPage({
  night,
  rows,
  badLines,
}: {
  night: string;
  rows: DigestRow[];
  badLines: number;
}) {
  return (
    <>
      <h1>Morning digest · {night}</h1>
      {badLines > 0 && (
        <p class="warn">
          {badLines} malformed {badLines === 1 ? 'line' : 'lines'} counted.
        </p>
      )}
      {rows.length === 0 ? (
        <p class="mute">{badLines === 0 ? 'nothing ran' : 'no valid runs'}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first time</th>
              <th>last time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td>
                  <span class={row.retries >= 3 ? 'warn' : undefined}>{row.retries}</span>
                </td>
                <td>
                  <span class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</span>
                </td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
