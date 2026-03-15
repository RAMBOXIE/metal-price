// 深挖 ccmn 和東方財富的真實數據 API
const tests = [
  // ccmn.cn 可能的 JSON 接口
  ['ccmn listPrice JSON', 'https://www.ccmn.cn/hadDatas/listPrice.do', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://www.ccmn.cn/', 'User-Agent': 'Mozilla/5.0' },
    body: 'type=1'
  }],
  ['ccmn api ni', 'https://www.ccmn.cn/api/metal/ni/price', {}],
  ['ccmn ajax', 'https://www.ccmn.cn/ajax/price/ni.json', {}],

  // 東方財富 有色金屬 LME 數據
  ['eastmoney LME NI', 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_BULL_LIST_NEW&columns=SECURITY_CODE,SECURITY_NAME,CLOSE_PRICE,CHANGE_RATE&filter=(MARKET_CODE%3D%2290%22)(SECURITY_CODE%3D%22NI%22)&pageSize=5', {}],
  // 東方財富期貨行情接口
  ['eastmoney futures', 'https://futsseapi.eastmoney.com/list/NI?pageSize=5&pageIndex=1&sortColumns=&sortTypes=&token=300000', {}],
  // SMM 公開數據
  ['smm price', 'https://price.smm.cn/api/metals?metals=nickel,cobalt', {}],
  ['smm list', 'https://www.smm.cn/marketdata/pricelistdata?name=copper', {}],
];

for (const [name, url, opts] of tests) {
  try {
    const r = await fetch(url, {
      ...opts,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', ...(opts.headers || {}) }
    });
    const text = await r.text();
    console.log(`\n[${name}] status:${r.status} len:${text.length}`);
    // 只顯示前 300 字，如果是 HTML 就說是 HTML
    if (text.trimStart().startsWith('<')) {
      console.log('[HTML page - JS rendered]');
    } else {
      console.log(text.slice(0, 300));
    }
  } catch (e) {
    console.log(`[${name}] ERR: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 600));
}
