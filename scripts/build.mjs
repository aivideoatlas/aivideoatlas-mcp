// Builds dist/worker.mjs by inlining the public Atlas data export into src/worker.src.mjs.
// Data source (first that exists): --data=<path>, ./data/agent-data.json, else downloads https://aivideoatlas.com/agent-data.json
import fs from 'node:fs';
const arg = (process.argv.find(a => a.startsWith('--data=')) || '').slice(7);
let data;
if (arg) data = fs.readFileSync(arg, 'utf8');
else if (fs.existsSync('data/agent-data.json')) data = fs.readFileSync('data/agent-data.json', 'utf8');
else { const r = await fetch('https://aivideoatlas.com/agent-data.json'); if (!r.ok) throw new Error('agent-data.json HTTP ' + r.status); data = await r.text(); }
JSON.parse(data); // validate
const src = fs.readFileSync(new URL('../src/worker.src.mjs', import.meta.url), 'utf8').replace('__DATA__', () => data);
fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/worker.mjs', src);
console.log('dist/worker.mjs', src.length, 'bytes');
