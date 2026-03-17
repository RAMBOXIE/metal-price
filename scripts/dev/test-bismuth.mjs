const url = 'https://stooq.com/q/l/?s=BI.F&f=sd2t2ohlcv&h&e=csv';
const res = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0' },
  signal: AbortSignal.timeout(10000),
});
console.log('STATUS:', res.status);
const text = await res.text();
console.log('RAW CSV:');
console.log(text);

const lines = text.trim().split('\n');
const headers = lines[0].split(',').map(h => h.trim());
const vals = lines[1]?.split(',').map(v => v.trim()) ?? [];
const obj = {};
headers.forEach((h, i) => { obj[h] = vals[i]; });
console.log('PARSED:', JSON.stringify(obj));

const today = new Date('2026-03-15');
const dataDate = obj['Date'] ? new Date(obj['Date']) : null;
if (dataDate) {
  const daysDiff = (today - dataDate) / 86400000;
  console.log('Days since data:', daysDiff.toFixed(1));
  console.log('STALE (>30d):', daysDiff > 30);
}
const price = parseFloat(obj['Close']);
console.log('Price:', price);
