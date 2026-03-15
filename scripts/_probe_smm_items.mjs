// Probe each working SMM page for all items
const pages = [
  { slug: 'cu-price', name: '銅' },
  { slug: 'zn-price', name: '鋅' },
  { slug: 'nickel-price', name: '鎳' },
  { slug: 'bismuth-price', name: '鉍' },
  { slug: 'pb-price', name: '鉛' },
  { slug: 'sn-price', name: '錫' },
];

async function getAllItems(slug) {
  const r = await fetch('https://hq.smm.cn/h5/' + slug, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.smm.cn/', 'Accept-Language': 'zh-CN,zh;q=0.9' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nd) throw new Error('No __NEXT_DATA__');
  const json = JSON.parse(nd[1]);
  const datas = json?.props?.pageProps?.datas;
  if (!datas) throw new Error('No datas');

  const allItems = [];
  for (const [sk, sv] of Object.entries(datas)) {
    const arr = sv?.data;
    if (Array.isArray(arr)) {
      for (const sub of arr) {
        if (Array.isArray(sub?.data)) {
          for (const item of sub.data) allItems.push({ section: sk, ...item });
        } else if (sub?.product_name) {
          allItems.push({ section: sk, ...sub });
        }
      }
    }
  }
  return allItems;
}

for (const { slug, name } of pages) {
  console.log('\n' + '='.repeat(60));
  console.log(`${name} (${slug})`);
  console.log('='.repeat(60));
  try {
    const items = await getAllItems(slug);
    for (const it of items) {
      const hasUsd = (it.unit || '').includes('美元') || (it.unit || '').includes('USD') || (it.unit || '').toLowerCase().includes('$');
      const isLme = (it.product_name || '').toLowerCase().includes('lme');
      const flag = hasUsd || isLme ? ' 💲' : '';
      console.log(`  [${it.section}] ${it.product_name} | ${it.average} ${it.unit} | 變動:${it.vchange}(${it.vchange_rate}%) | ${it.renew_date}${flag}`);
    }
  } catch (e) {
    console.log('  ERROR:', e.message);
  }
  await new Promise(r => setTimeout(r, 300));
}
