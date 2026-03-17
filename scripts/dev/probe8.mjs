// 讀完整 dataNew.js，找調用參數
const js = await fetch('https://mstatic.ccmn.cn/static/js/dataNew.js').then(r => r.text());

// 找包含這兩個 API 的函數上下文
const idx1 = js.indexOf('getPriceListAndDateTime');
const idx2 = js.indexOf('getCorpStmarketPriceList');

console.log('=== getPriceListAndDateTime 上下文 ===');
console.log(js.slice(Math.max(0, idx1 - 200), idx1 + 500));

console.log('\n=== getCorpStmarketPriceList 上下文 ===');
console.log(js.slice(Math.max(0, idx2 - 200), idx2 + 500));
