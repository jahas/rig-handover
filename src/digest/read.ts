import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, NightDigest } from './types.js';

type LogLine = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isStatus(value: unknown): value is DigestStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

// One row per job. A line that does not parse is counted, never thrown. A job that
// appears with owner null keeps its row; the view shows the owner as an em dash.
export function readNight(runsDir: string, night: string): NightDigest | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const byJob = new Map<string, DigestRow>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      badLines += 1;
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      badLines += 1;
      continue;
    }

    const line = parsed as Partial<LogLine>;
    if (typeof line.job !== 'string' || typeof line.at !== 'string' || !isStatus(line.status)) {
      badLines += 1;
      continue;
    }

    counts[line.status] += 1;
    const owner = typeof line.owner === 'string' ? line.owner : null;
    const error = typeof line.error === 'string' ? line.error : null;
    const prev = byJob.get(line.job);

    if (prev === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: error,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }

    prev.runs += 1;
    if (line.status === 'retry') prev.retries += 1;
    prev.owner = owner;
    prev.lastStatus = line.status;
    prev.lastError = error;
    if (Date.parse(line.at) < Date.parse(prev.firstAt)) prev.firstAt = line.at;
    if (Date.parse(line.at) > Date.parse(prev.lastAt)) prev.lastAt = line.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts };
}
