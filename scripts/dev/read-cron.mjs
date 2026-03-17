import { readFileSync } from 'fs';
const d = readFileSync('C:/Users/Administrator/.openclaw/cron/jobs.json', 'utf8');
const jobs = JSON.parse(d);
const job = jobs.find(j => j.id === '5d729b27-7b2c-4ae5-84bc-9fe5d8e62116');
console.log(JSON.stringify(job, null, 2));
