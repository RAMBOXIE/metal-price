const js = await fetch('https://mstatic.ccmn.cn/static/js/dataNew.js').then(r => r.text());

// 找所有 AJAX/API 相關路徑
const urlPattern = /['"`](\/[a-zA-Z\/\.\?=&_]{5,100})['"`]/g;
const allUrls = [...js.matchAll(urlPattern)].map(m => m[1]);
const interesting = allUrls.filter(u =>
  u.match(/ajax|api|data|Data|price|Price|list|query|json|metal|hq/i)
);

console.log('Total URL-like strings:', allUrls.length);
console.log('\nInteresting API paths:');
interesting.slice(0, 30).forEach(u => console.log(' ', u));

// 也找 $.ajax 或 $.get 或 fetch 調用
const ajaxCalls = [...js.matchAll(/url\s*:\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
console.log('\nAjax url: calls:');
ajaxCalls.forEach(u => console.log(' ', u));

// 找 getJSON 或 $.get
const getCalls = [...js.matchAll(/\$\.(?:get|post|getJSON)\s*\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
console.log('\n$.get/post/getJSON calls:');
getCalls.forEach(u => console.log(' ', u));
