const base = 'https://m.ccmn.cn';
const headers = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  'Referer': 'https://m.ccmn.cn/mhangqing/mcjxh/',
  'Accept': 'application/json, text/javascript, */*',
  'X-Requested-With': 'XMLHttpRequest',
};

// 長江現貨 marketVmid
const marketVmid = '40288092327140f601327141c0560001';

const r = await fetch(`${base}/mhangqing/getCorpStmarketPriceList?marketVmid=${marketVmid}`, { headers });
const data = await r.json();

console.log('success:', data.success, '| code:', data.code);
if (data.body?.priceList) {
  console.log(`\n找到 ${data.body.priceList.length} 條數據：\n`);
  // 過濾出我們要的金屬
  const targets = ['1#铜', '0#锌', '1#镍', '1#钴', '1#铋', '1#铅', '1#锡'];
  data.body.priceList
    .filter(p => targets.some(t => p.metalName?.includes(t.replace('1#','').replace('0#',''))))
    .forEach(p => console.log(`${p.metalName}: 均價 ¥${p.avgPrice} 涨跌 ${p.upDown} 日期 ${p.publishDate || data.body.publishDate}`));
  
  console.log('\n--- 完整前5條 ---');
  data.body.priceList.slice(0, 5).forEach(p => console.log(JSON.stringify(p)));
} else {
  console.log('返回:', JSON.stringify(data).slice(0, 500));
}
