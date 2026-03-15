// 找 ccmn.cn 各金屬的 SSR 頁面 URL
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';

async function check(name, url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const html = await r.text();
    // 找 6 位以上數字（金屬價格）
    const prices = [...html.matchAll(/(\d{2,3},\d{3})/g)].map(m => m[1]).slice(0, 2);
    const title = html.match(/<title>([^<]{0,30})/)?.[1] || '';
    console.log(`[${name}] ${r.status} | ${title.trim()} | prices: ${prices.join(', ') || '無'}`);
  } catch (e) {
    console.log(`[${name}] ERR: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 500));
}

// 鈷 cobalt 拼音 gǔ，試各種 URL
await check('co/', 'https://m.ccmn.cn/co/');
await check('gu/', 'https://m.ccmn.cn/gu/');
await check('gut/', 'https://m.ccmn.cn/gut/');
await check('mgut/', 'https://m.ccmn.cn/mgut/');
await check('cobalt/', 'https://m.ccmn.cn/cobalt/');
await check('mco/', 'https://m.ccmn.cn/mco/');
// 鉍 bismuth 拼音 bì
await check('bi/', 'https://m.ccmn.cn/bi/');
await check('bis/', 'https://m.ccmn.cn/bis/');
await check('bismuth/', 'https://m.ccmn.cn/bismuth/');
// 確認 /ni/ 和 /cu/ 是否真的 SSR
await check('cu/', 'https://m.ccmn.cn/cu/');
await check('zn/', 'https://m.ccmn.cn/zn/');
