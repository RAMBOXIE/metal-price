import { readFileSync } from 'fs';
const d = readFileSync('C:/Users/Administrator/.openclaw/cron/jobs.json', 'utf8');
const data = JSON.parse(d);
const job = data.jobs.find(j => j.id === '5d729b27-7b2c-4ae5-84bc-9fe5d8e62116');
console.log('包含 行業指數:', job.payload.message.includes('行業指數'));
console.log('包含 四維交叉推理:', job.payload.message.includes('四維交叉推理'));
console.log('包含 indices:', job.payload.message.includes('indices'));
console.log('消息長度:', job.payload.message.length);
