// Reproducible public-domain transcription import. Only mechanical markup
// removal is performed; modern translations are maintained separately.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const revision = '8284adbf9e3435d713180e24f05bf75f8b7d1d96';
const rows = [];
for (let number = 1; number <= 64; number++) {
  const file = `KR1a0001_${String(number).padStart(3, '0')}.txt`;
  const url = `https://raw.githubusercontent.com/kanripo/KR1a0001/${revision}/${file}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  const raw = await response.text();
  const blocks = raw.split(/<pb:[^>]+>/).slice(1).map(s => s.replace(/[¶\s]/g, ''));
  const judgment = blocks.find(b => /^《[^》]+》(?!曰)/.test(b));
  const lines = blocks.filter(b => /^(初[九六]|[九六][二三四五]|上[九六])[：、]/.test(b));
  if (!judgment || lines.length !== 6) throw new Error(`${file}: judgment=${!!judgment}, lines=${lines.length}`);
  const extras = blocks.filter(b => /^用[九六][：、]/.test(b));
  rows.push({ number, title: judgment.match(/^《([^》]+)》/)[1], judgment, lines, extras,
    sourceUrl: `https://github.com/kanripo/KR1a0001/blob/${revision}/${file}`,
    sourceSha256: createHash('sha256').update(raw).digest('hex') });
  console.log(`Imported ${number}/64`);
}
await writeFile(new URL('../content/zhouyi-canonical.json', import.meta.url), JSON.stringify({
  edition: 'Kanripo KR1a0001 / TLS transcription', revision, retrievedAt: '2026-09-05', rows,
}, null, 2) + '\n');
