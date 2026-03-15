const urls = [
  // 東方財富 API
  'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_INDUSTRY_INDEX&columns=REPORT_DATE,INDEX_CODE,INDEX_NAME,CLOSE_PRICE,CHANGE_RATE&filter=(INDEX_CODE%3D%22EMI00135904%22)&pageSize=3',
  // 東方財富鎳 LME
  'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_FUTSESE_INDEX&columns=REPORT_DATE,CLOSE_PRICE,CHANGE_RATE&filter=(SYMBOL%3D%22NI%22)&pageSize=3',
  // 長江有色現貨
  'https://www.ccmn.cn/hadDatas/listPrice.do?type=1',
  // ccmn mobile API
  'https://m.ccmn.cn/ni/',
];

for (const url of urls) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)', 'Referer': 'https://m.ccmn.cn/' }
    });
    const text = await r.text();
    console.log('\n---', url.slice(0, 70));
    console.log('status:', r.status, '| len:', text.length);
    console.log(text.slice(0, 400));
  } catch (e) {
    console.log('ERR:', url.slice(0, 60), e.message);
  }
  await new Promise(r => setTimeout(r, 800));
}
