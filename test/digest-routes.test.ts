import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest routes', () => {
  it('renders the digest page', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('digest · 2026-10-28');
    expect(html).toContain('digest/render');
    expect(html).toContain('—');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request('/digest/1999-01-01');
    expect(res.status).toBe(404);
  });

  it('returns the same jobs in the same order as the page', async () => {
    const app = createApp(config);
    const page = await (await app.request('/digest/2026-10-28')).text();
    const json = (await (await app.request('/api/digest/2026-10-28')).json()) as {
      rows: { job: string }[];
    };
    const jobs = json.rows.map((r) => r.job);
    expect(jobs).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    for (const job of jobs) expect(page).toContain(job);
  });

  it('renders an empty night and a night with only a bad line', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    try {
      writeFileSync(join(dir, '2026-01-01.jsonl'), '');
      writeFileSync(join(dir, '2026-01-02.jsonl'), '{"at":"x"\n');
      const app = createApp({ ...config, runsDir: dir });
      const empty = await app.request('/digest/2026-01-01');
      expect(empty.status).toBe(200);
      expect(await empty.text()).toContain('nothing ran');
      const bad = await app.request('/digest/2026-01-02');
      expect(bad.status).toBe(200);
      expect(await bad.text()).toContain('nothing ran');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
