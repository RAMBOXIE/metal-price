const base = 'https://m.ccmn.cn';
const headers = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  'Referer': 'https://m.ccmn.cn/mhangqing/mcjxh/',
  'Accept': 'application/json, text/javascript, */*',
  'X-Requested-With': 'XMLHttpRequest',
};

// 測試兩個 API 端點
const endpoints = [
  `${base}/mhangqing/getPriceListAndDateTime`,
  `${base}/mhangqing/getCorpStmarketPriceList`,
  // 帶參數版本
  `${base}/mhangqing/getPriceListAndDateTime?type=cjxh`,
  `${base}/mhangqing/getCorpStmarketPriceList?type=cjxh`,
];

for (const url of endpoints) {
  try {
    const r = await fetch(url, { headers });
    const text = await r.text();
    console.log(`\n[${url.split('/').pop()}]`);
    console.log('status:', r.status, '| content-type:', r.headers.get('content-type'));
    console.log(text.slice(0, 400));
  } catch (e) {
    console.log('ERR:', e.message);
  }
  await new Promise(r => setTimeout(r, 600));
}
