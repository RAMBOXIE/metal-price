const urls = [
  'https://www.reddit.com/r/mining/top.json?t=week&limit=10',
  'https://www.reddit.com/r/metallurgy/top.json?t=week&limit=10',
  'https://www.reddit.com/r/investing/search.json?q=copper+nickel+zinc&sort=top&t=week&limit=10',
  'https://www.reddit.com/r/Economics/search.json?q=copper+metals&sort=top&t=week&limit=10',
  'https://www.reddit.com/search.json?q=copper+OR+nickel+OR+zinc&sort=top&t=week&limit=10',
];
const metalKw = ['copper','zinc','nickel','cobalt','base metal','base metals','industrial metal'];

async function testUrl(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MetalPriceBot/4.0 (research)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    console.log('STATUS', url.slice(22,80), res.status);
    if (!res.ok) return { url, status: res.status, valid: false, count: 0, titles: [] };
    const data = await res.json();
    const posts = data?.data?.children ?? [];
    const titles = posts.map(p => p?.data?.title).filter(Boolean);
    const validTitles = titles.filter(t => metalKw.some(k => t.toLowerCase().includes(k)));
    console.log('  ALL TITLES:', JSON.stringify(titles.slice(0,5)));
    console.log('  VALID TITLES:', JSON.stringify(validTitles.slice(0,5)));
    return { url, status: res.status, valid: validTitles.length > 2, count: validTitles.length, titles, validTitles };
  } catch(e) {
    console.log('ERR', url.slice(22,80), e.message);
    return { url, status: 0, valid: false, count: 0, error: e.message };
  }
}

const results = await Promise.all(urls.map(testUrl));
console.log('\n=== SUMMARY ===');
results.forEach(r => console.log(r.url.slice(22,80), 'status='+r.status, 'valid='+r.valid, 'count='+r.count));
