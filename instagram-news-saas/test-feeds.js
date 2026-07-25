const cheerio = require('cheerio');

// 다양한 한국 뉴스 RSS 피드 테스트
const feeds = [
  // 주요 언론사
  { url: 'https://rss.donga.com/list.xml', name: '동아일보' },
  { url: 'https://www.chosun.com/arc/outboundfeeds/rss/', name: '조선일보' },
  { url: 'https://www.kbs.co.kr/rss/', name: 'KBS' },
  { url: 'https://www.mbc.co.kr/rss/sisa.xml', name: 'MBC' },
  { url: 'https://news.sbs.co.kr/rss/section_news_list.xml', name: 'SBS' },
  { url: 'https://www.jtbc.co.kr/rss', name: 'JTBC' },
  { url: 'https://www.khan.co.kr/rss/rss.xml', name: '경향신문' },
  { url: 'https://www.hani.co.kr/rss/', name: '한겨레' },
  { url: 'https://www.seoul.co.kr/rss/section/news.xml', name: '서울신문' },
  { url: 'https://www.fnnews.com/rss', name: '아시아경제' },
  { url: 'https://www.bloter.net/rss', name: '블로터' },
  { url: 'https://www.mk.co.kr/rss', name: '매일경제' },
  { url: 'https://www.ytn.co.kr/rss.xml', name: 'YTN' },
  { url: 'https://www.yna.co.kr/RSS/news.xml', name: '연합뉴스' },
  { url: 'https://www.ohmynews.com/RSS', name: '오마이뉴스' },
];

async function testFeed(url, name) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow'
    });
    if (!r.ok) { console.log(`FAIL ${name}: HTTP ${r.status}`); return; }
    const ct = r.headers.get('content-type') || '';
    const text = await r.text();
    // XML인지 확인
    if (!text.includes('<item') && !text.includes('<entry')) {
      console.log(`FAIL ${name}: Not RSS (${ct.substring(0,30)})`);
      return;
    }
    const Parser = require('rss-parser');
    const parser = new Parser({ timeout: 8000 });
    const feed = await parser.parseString(text);
    const items = feed.items.slice(0, 3);
    console.log(`OK ${name}: ${feed.items.length} items`);
    items.forEach(i => console.log(`  ${i.title?.substring(0,50)}`));
  } catch(e) {
    console.log(`FAIL ${name}: ${e.message.substring(0,50)}`);
  }
}

(async () => {
  for (const f of feeds) {
    await testFeed(f.url, f.name);
  }
})();
