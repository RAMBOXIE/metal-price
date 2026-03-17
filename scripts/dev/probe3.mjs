// 測試帶瀏覽器 UA 的 fetch 是否能拿到 SSR 數據
const headers = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20A362',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Referer': 'https://m.ccmn.cn/',
};

const metals = [
  ['鎳 Ni', 'https://m.ccmn.cn/ni/'],
  ['鈷 Co', 'https://m.ccmn.cn/co/'],
  ['鉍 Bi', 'https://m.ccmn.cn/bi/'],
  ['銅 Cu', 'https://m.ccmn.cn/cu/'],
  ['鋅 Zn', 'https://m.ccmn.cn/zn/'],
];

for (const [name, url] of metals) {
  try {
    const r = await fetch(url, { headers });
    const html = await r.text();
    // 找價格數字 - ccmn 頁面格式：品名 均價 漲跌
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const priceMatches = html.match(/均价.*?(\d[\d,]+)/s);
    // 找所有 6 位以上數字（金屬價格通常是萬元級）
    const prices = [...html.matchAll(/(\d{2,3},\d{3})/g)].map(m => m[1]).slice(0, 3);
    console.log(`\n[${name}] status:${r.status}`);
    console.log('title:', titleMatch?.[1]?.slice(0, 40));
    console.log('prices found:', prices.join(' | ') || '無');
  } catch (e) {
    console.log(`[${name}] ERR:`, e.message);
  }
  await new Promise(r => setTimeout(r, 800));
}
