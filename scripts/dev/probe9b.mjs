// 確認鎳/鈷都在數據裡
const r = await fetch('https://m.ccmn.cn/mhangqing/getCorpStmarketPriceList?marketVmid=40288092327140f601327141c0560001', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.ccmn.cn/mhangqing/mcjxh/', 'X-Requested-With': 'XMLHttpRequest' }
});
const data = await r.json();
const list = data.body?.priceList || [];
console.log('總條數:', list.length);
list.forEach(p => console.log(`${p.productSortName}: ¥${p.avgPrice}/t  ${p.highsLowsAmount >= 0 ? '+' : ''}${p.highsLowsAmount}  (${p.publishDate})`));
