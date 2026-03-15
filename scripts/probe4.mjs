// 測試 ccmn.cn 長江現貨頁面能否用 Node.js fetch 直接拿到數據
const url = 'https://m.ccmn.cn/mhangqing/mcjxh/';
const r = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    'Accept': 'text/html',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  }
});
const html = await r.text();
console.log('status:', r.status, '| length:', html.length);

// 解析各金屬均價
const lines = html.replace(/<[^>]+>/g, '\t').replace(/\t+/g, '\t').split('\n');
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// 用 regex 找各品名後面的均價
const metals = [
  ['铜',  /1#铜[\s\S]{0,100}?均价[\s\S]{0,50}?(\d{5,6})/],
  ['铜2', /1#铜\s+(\d{5,6})\s+(\d{5,6})\s+(\d{5,6})/],
];

// 更簡單：直接找 innerText 格式的數據行
const dataMatch = text.match(/1#铜\s+([\d]+)\s+([\d]+)\s+([\d]+)\s+(-?\d+)/);
const niMatch   = text.match(/1#镍\s+([\d]+)\s+([\d]+)\s+([\d]+)\s+(-?\d+)/);
const znMatch   = text.match(/0#锌\s+([\d]+)\s+([\d]+)\s+([\d]+)\s+(-?\d+)/);
const coMatch   = text.match(/1#钴\s+([\d]+)\s+([\d]+)\s+([\d]+)\s+(-?\d+)/);

console.log('銅 Cu:', dataMatch ? `¥${dataMatch[3]}/t (${dataMatch[4]})` : '未找到');
console.log('鎳 Ni:', niMatch   ? `¥${niMatch[3]}/t (${niMatch[4]})` : '未找到');
console.log('鋅 Zn:', znMatch   ? `¥${znMatch[3]}/t (${znMatch[4]})` : '未找到');
console.log('鈷 Co:', coMatch   ? `¥${coMatch[3]}/t (${coMatch[4]})` : '未找到');

// 看前 500 chars 確認數據在不在
const idx = text.indexOf('1#铜');
console.log('\n--- 銅附近的文本 ---');
console.log(text.slice(idx > 0 ? idx : 0, idx + 200));
