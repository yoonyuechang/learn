async function testNaverSearch() {
  // 네이버 뉴스 검색 - 속보/사건/논란 키워드로 인기 기사 검색
  const queries = ['속보 사건', '논란 파문', '충격 경악', '사건 사고'];
  
  for (const q of queries) {
    try {
      const url = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(q)}&sort=1&sm=tab_opt`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000)
      });
      const html = await r.text();
      
      // 제목만 추출 (뉴스 제목 패턴)
      const titleMatches = html.match(/<a[^>]*class="[^"]*news_tit[^"]*"[^>]*>([^<]+)<\/a>/g) || [];
      const titles = titleMatches.map(m => m.replace(/<[^>]+>/g, '').trim());
      
      // URL도 추출
      const urlMatches = html.match(/<a[^>]*class="[^"]*news_tit[^"]*"[^>]*href="([^"]+)"/g) || [];
      const urls = urlMatches.map(m => {
        const match = m.match(/href="([^"]+)"/);
        return match ? match[1] : '';
      });
      
      console.log(`\n=== "${q}" (${titles.length} results) ===`);
      for (let i = 0; i < Math.min(3, titles.length); i++) {
        console.log(`  ${titles[i].substring(0, 50)}`);
        if (urls[i]) console.log(`    ${urls[i].substring(0, 80)}`);
      }
    } catch(e) {
      console.log(`FAIL "${q}": ${e.message.substring(0, 60)}`);
    }
  }
}
testNaverSearch();
