import Parser from 'rss-parser'
import * as cheerio from 'cheerio'

const parser = new Parser({ timeout: 10000 })

async function fetchWithUA(url: string, timeout = 10000) {
  return fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow'
  })
}

function isValidImageUrl(url: string | null): boolean {
  if (!url || !url.startsWith('http')) return false
  const blocklist = [
    'logo-news-sns', 'logo', 'default', 'og-default', 'noimage',
    'placeholder', 'blank', '1x1', 'spacer', 'pixel',
    // 구글 뉴스 리다이렉트 기사의 og:image는 구글 호스트라 403/플레이스홀더라 무쓸모
    'googleusercontent.com', 'google.com', 'gstatic.com', 'ggpht.com',
    // 네이버 로고/워터마크/og_image — 네이버 포털 로고가 카드 배경에 까이는 원인
    'naver.com/img/logo', 'pstatic.net/img/logo', 'og_image', 'naver_og',
    'spnew', 'main_logo', 'top_logo', 'gnb_', 'news_logo', 'watermark',
    'press_logo', 'psnews', 'mskin', 'ncc', 'phinf', 'netv', 'imgsrc'
  ]
  const lower = url.toLowerCase()
  if (blocklist.some(b => lower.includes(b))) return false
  if (lower.endsWith('.svg') || lower.endsWith('.gif')) return false
  return true
}

function isToday(date: Date): boolean {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const target = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10) === target.toISOString().slice(0, 10)
}

function cleanContent(text: string): string {
  return text
    // 한경 헤더: "law&biz 한경 PREMIUM9 AI 뉴스 뉴스 [속보]" 형태 제거 (실제 본문 보존)
    .replace(/law&biz\s*한경[^\n]*?속보\]?\s*/gi, '')
    // 한경 헤더 잔여: "한경 PREMIUM9 AI 뉴스 뉴스 [속보]" 단독
    .replace(/한경\s*PREMIUM\d*\s*(?:AI\s*뉴스\s*)?(?:뉴스\s*)*(?:\[속보\])?\s*/gi, '')
    // 구글 뉴스 보일러플레이트 (RSS 리다이렉트 기사 본문에 섞임)
    .replace(/Comprehensive up-to-date news coverage.*$/i, '')
    .replace(/Aggregated from various highly reliable sources.*$/i, '')
    .replace(/©\s*\d{4}.*$/i, '')
    // ── 통신사/저작권 byline 제거 (뉴스1/연합/로이터/AFP 오염 차단) ──
    // "ⓒ 로이터=뉴스1", "ⓒ AFP=연합뉴스", 앞에 날짜(2026.7.17)가 붙는 경우까지
    .replace(/(?:\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?\s*)?[ⓒ©Ⓒ]\s*[가-힣A-Za-z0-9]+(?:\s*=\s*[가-힣A-Za-z0-9]+)?/g, '')
    // "(서울·베이징=뉴스1) 장용석 기자 정은지 특파원 =" 형태 byline
    .replace(/\([가-힣A-Za-z·\s,]{2,20}=[가-힣A-Za-z0-9]{2,12}\)\s*(?:[가-힣]{2,4}\s*(?:기자|특파원|앵커|리포터|통신원)\s*)+=?/g, '')
    // "장용석 기자 =", "정은지 특파원 =" 처럼 괄호 없이 끝에 = 붙는 잔여 byline
    .replace(/[가-힣]{2,4}\s*(?:기자|특파원|앵커|리포터|통신원)\s*=/g, '')
    // "[사진=연합뉴스]", "[사진제공=로이터]" 캡션 크레딧
    .replace(/\[\s*사진(?:제공)?\s*=[^\]]*\]/g, '')
    // 통신사 크레딧 단독 "AFP=연합뉴스", "로이터=연합뉴스"
    .replace(/(?:AFP|EPA|AP|로이터|신화|교도)\s*=\s*(?:연합뉴스|뉴스1)/g, '')
    // 저작권 고지
    .replace(/무단\s*전재\s*(?:및|과|,)?\s*재배포\s*금지/g, '')
    .replace(/저작권자\s*[ⓒ©].*$/gm, '')
    // 뉴스 사이트 UI/앵커/에디터/스폰서 텍스트 제거
    .replace(/\[\d*\s*(MBC|KBS|SBS|YTN|JTBC)?뉴스\]/gi, '')
    .replace(/[◀▶▼▷◁]/g, '')
    .replace(/앵커\s*[◀▶▼▷◁]?/g, '')
    .replace(/에디터\s*[\w.\-]+@[\w.\-]+/gi, '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '') // 이메일
    .replace(/(프리미엄|성공|수익|투자|AI|코인|환불|무료|이벤트|체험)\s*[가-힣]*?(신청|상담|추천|확정|보장|혜택)/g, '') // 광고성
    // 뉴스 사이트 네비게이션 텍스트 제거
    .replace(/본문[가-힣]{1,6}보기/g, '')
    .replace(/기자\s*(수정|입력)\s*[\d\-.:\s]+/g, '')
    .replace(/펼침[\d:]+/g, '')
    .replace(/Your browser does not support theaudio element/g, '')
    .replace(/구글 선호 매체 등록/g, '')
    // 한경 푸터 노이즈: "입력2026.07.24 14:13 수정2026..." / "구글 검색 선호 출처로 추가..."
    .replace(/입력\d{4}[.\-]\d{2}[.\-]\d{2}.*$/gm, '')
    .replace(/수정\d{4}[.\-]\d{2}[.\-]\d{2}.*$/gm, '')
    .replace(/구글 검색 선호 출처로 추가.*$/gm, '')
    .replace(/광고/g, '')
    .replace(/네이버\s*뉴스/g, '')
    .replace(/카카오\s*뉴스/g, '')
    .replace(/기사 공유/g, '')
    .replace(/글자크기\s*(조절|확대|축소)/g, '')
    .replace(/프린트/g, '')
    .replace(/기사 스크랩/g, '')
    .replace(/댓글\s*\d*/g, '')
    // 매체 구독/팝업/추천 UI 노이즈 제거 (한경 등)
    .replace(/(구독하기|팝업 닫기|추천 뉴스|관련 뉴스|오늘의 뉴스|속보 모음|성공투자|구독 신청|뉴스레터|를 넘어서는|구독)/g, '')
    .replace(/(\s)+/g, ' ')
    .trim()
}

async function extractArticleData(url: string): Promise<{ imageUrl: string | null; content: string }> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow'
    })
    if (!r.ok) return { imageUrl: null, content: '' }
    const contentType = r.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return { imageUrl: null, content: '' }
    const html = await r.text()
    const $ = cheerio.load(html)

    let imageUrl: string | null = null
    const og = $('meta[property="og:image"]').attr('content')
    if (isValidImageUrl(og)) imageUrl = og!
    if (!imageUrl) {
      const tw = $('meta[name="twitter:image"]').attr('content')
      if (isValidImageUrl(tw)) imageUrl = tw!
    }
    if (!imageUrl) {
      const img = $('article img, .article-body img, .news-body img, .content img').first().attr('src')
      if (isValidImageUrl(img)) imageUrl = img!
    }

    // 본문 추출 — 셀렉터 여러 개 시도
    let content = ''
    const bodySelectors = [
      '#articeBody', '.articleConts', '.article_view',
      'article', '.article-body', '.news-body', '.content_view',
      '.article_cont', '.art_txt', '.news_ct', '.view_cont',
      '[class*="article"]', '[class*="content"]', 'main'
    ]
    for (const sel of bodySelectors) {
      const el = $(sel).first()
      if (el.length) {
        el.find('script, style, .ad, .ad-area, .related, .comment, .share, nav, header, footer, .info, .reporter, .copyright, .date, .author, .press_logo, .article_end, .article_btn, .btn_group, .social_area, .tag_area, .article_keyword, .recommend, .outlink, .article_footer').remove()
        let text = el.text().replace(/\s+/g, ' ').trim()
        text = cleanContent(text)
        if (text.length > 100) {
          content = text
          break
        }
      }
    }
    // fallback: meta description
    if (!content) {
      const ogDesc = $('meta[property="og:description"]').attr('content') || ''
      const metaDesc = $('meta[name="description"]').attr('content') || ''
      content = ogDesc || metaDesc
    }

    return { imageUrl, content: content.substring(0, 2000) }
  } catch {
    return { imageUrl: null, content: '' }
  }
}

export async function crawlRSS(feedUrl: string, source: string) {
  try {
    const feed = await parser.parseURL(feedUrl)
    const articles = []

    for (const item of feed.items.slice(0, 70)) {
      if (!item.title || !item.link) continue

      const pubDate = item.pubDate ? new Date(item.pubDate) : null
      if (!pubDate || !isToday(pubDate)) continue

      let content = item.content || item.contentSnippet || ''
      let $c = cheerio.load(content)
      content = $c.text().trim()
      content = cleanContent(content)  // 구글 뉴스 보일러플레이트/UI 텍스트 제거

      const isGoogleNews = item.link.includes('news.google.com')

      // Google News 리다이렉트 → 실제 기사 URL 추출
      let realUrl = item.link
      let imageUrl: string | null = null
      if (isGoogleNews) {
        try {
          // redirect: follow로 최종 URL 추출
          const r = await fetch(item.link, {
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(8000)
          })
          const finalUrl = r.url
          if (finalUrl && finalUrl.startsWith('http') && !finalUrl.includes('news.google.com')) {
            realUrl = finalUrl
          }
          // 실제 기사에서 본문/이미지 추출
          const articleData = await extractArticleData(realUrl)
          imageUrl = articleData.imageUrl
          if (articleData.content.length > content.length) {
            content = articleData.content
          }
        } catch { /* redirect 실패 시 원본 유지 */ }
      } else {
        const fixedUrl = item.link.replace(/&amp;/g, '&')
        const articleData = await extractArticleData(fixedUrl)
        imageUrl = articleData.imageUrl
        if (articleData.content.length > content.length) {
          content = articleData.content
        }
      }

      // 제목 정제: 구글 뉴스가 끝에 붙인 " - 매체명" 제거
      let title = (item.title || '').trim()
      title = title.replace(/\s*-\s*[가-힣A-Za-z0-9.]+(뉴스|일보|신문|데일리|타임즈|저널|com|co\.kr)?\s*$/i, '').trim()
      title = title.replace(/\s*·\s*[가-힣A-Za-z0-9.]+(뉴스|일보|신문|데일리|타임즈|저널)?\s*$/i, '').trim()

      // 조합형/주간지/칼럼 기사 제외 (여러 사건 묶음 or 불분명 출처)
      if (!isValidNewsTitle(title)) continue

      // 이미지 없는 기사 제외 (구글 리다이렉트는 이미지를 못 가져와 그라데이션만 나가므로 발행 품질 저하)
      if (!imageUrl) continue

      // 본문이 없거나 구글 플레이스홀더면 제외 (AI가 엉뚱한 글 지어내는 원인 차단)
      // 150자 미만만 제외 — 300자는 과도해서 양질 기사까지 버림
      const cleanBody = cleanContent(content).trim()
      if (cleanBody.length < 100) continue

      articles.push({
        title,
        content: cleanBody.substring(0, 2000),
        summary: cleanBody.substring(0, 300),
        source,
        sourceUrl: realUrl,
        imageUrl,
        publishedAt: pubDate || new Date(),
        category: detectCategory(title + ' ' + cleanBody)
      })
    }
    return articles
  } catch (error) {
    console.error(`[crawler] RSS 실패 (${source}):`, error)
    return []
  }
}

// 단일 명확 사건 기사인지 검증 — 조합형/주간지/칼럼/비기사 형태 제외
function isValidNewsTitle(title: string): boolean {
  if (title.length < 8) return false
  // 주간지/칼럼/이슈 편집 태그
  if (/\[(주간|위클리|리멤버|이슈|기획|르포|칼럼|시론|사설|데스크|특집|월간)/.test(title)) return false
  // RSS 부록/사이드바/저작권 고지 등 비기사 항목 (제목으로 오염되는 경우 차단)
  if (/(무단 전재|재배포|AI 학습|활용 금지|저작권|브리핑|모닝|메뉴|메뉴판|헤드라인 뉴스|주요 뉴스|속보 모음|뉴스 브리핑|오늘의 뉴스)/.test(title)) return false
  // 말줄임/생략 기호가 2개 이상 → 별개 사건 여러 개 묶인 형태
  const ellipsis = (title.match(/…/g) || []).length + (title.match(/\.\./g) || []).length
  if (ellipsis >= 2) return false
  // 단어 수 과다(22개 초과) → 여러 문장/사건 조합 의심
  const wordCount = title.split(/\s+/).filter(w => w.length > 0).length
  if (wordCount > 22) return false
  return true
}

function detectCategory(text: string): string {
  const categories: Record<string, string[]> = {
    politics: ['정치', '국회', '의원', '대통령', '정부', '여당', '야당', '계엄', '헌법', '선거', '민주당', '국힘', '특검'],
    economy: ['경제', '주식', '부동산', '금융', '기업', '성장', 'GDP', '금리', '물가', '무역', '코스피', '코스닥', '매출', '실적'],
    society: ['사회', '사건', '사고', '범죄', '교육', '의료', '근로', '공무원', '경찰', '법원', '아동', '성범죄', '스캠', '사기', '로맨스', '징역', '구속', '피싱', '횡령', '배임', '폭행', '성폭행', '살인', '횡령'],
    culture: ['연예', '드라마', '영화', '음악', '스타', '배우', 'OTT', '웹툰', '아이돌', 'BTS', '방탄', '콘서트', '스캔들', '이혼', '결혼', '연인', '가수', '유튜버'],
    sports: ['스포츠', '축구', '야구', '농구', '올림픽', 'K League', '프로야구', 'EPL', '월드컵'],
    world: ['국제', '미국', '중국', '일본', '유럽', '세계', '우크라', '트럼프', '캄보디아', '베트남', '태국', '필리핀']
  }
  const lowerText = text.toLowerCase()
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(k => lowerText.includes(k))) return category
  }
  return 'general'
}

// 사건사고/바이럴 후보 기사 필터 — 제목에 이게 있으면 무조건 가져옴
function isViralCandidate(title: string, content: string): boolean {
  const t = (title + ' ' + content).toLowerCase()

  // 무조건 통과: 사건사고/범죄/스캔들
  const mustHave = [
    '사건', '사고', '범죄', '살인', '피살', '사망', '흉기', '날인', 'stabbing',
    '성범죄', '성추행', '성폭행', '성희롱', '성매매', '미성년자', '아동학대',
    '사기', '금융사기', '보이스피싱', '다단계', '불법', '위법', '무죄', '유죄',
    '구속', '기소', '영장', '징역', '벌금', '사형', '구형',
    '폭행', '협박', '갈취', '강도', '절도', '도둑', '도둑질',
    '음주운전', '무면허', '뺑소니', '난동', '폭발', '화재', '붕괴', '침수',
    '실종', '납치', '인질', '연쇄',
    '충격', '경악', '폭로', '파문', '발칵', '황당', '어이없',
    '분노', '공분', '격분', '비난', '반발',
    '과태료', '벌금', '과징금', '세금', '환수',
    '가짜', '짝퉁', '위조', '불량', '오염', '부적격', '리콜',
    '사망자', '부상자', '피해자', '피해', '손해', '피해액',
    'stat', '위고비', '다이어트', '건강기능식품', '의약품',
    '성관계', '성욕', '성매매', '매춘', '전과', '재범',
    '제압', '시민', '영웅', '용기', '목격자',
    '징병', '군대', '복무', '전역', '부사관', '장교', '불침번', '생활관'
  ]

  return mustHave.some(k => t.includes(k))
}

// 네이버 뉴스 섹션 스크래퍼 — RSS 대체, 기사 본문도 직접 추출
export async function scrapeNaverNews(sectionId: string, source: string) {
  try {
    const url = `https://news.naver.com/section/${sectionId}`
    const r = await fetchWithUA(url)
    if (!r.ok) return []
    const html = await r.text()
    const $ = cheerio.load(html)
    const articles: { title: string; content: string; summary: string; source: string; sourceUrl: string; imageUrl: string | null; publishedAt: Date; category: string }[] = []
    const seen = new Set<string>()

    $('a[href*="/article/"], a[href*="news.naver"]').each((_, el) => {
      const $a = $(el)
      const title = $a.text().trim()
      const href = $a.attr('href')
      if (!title || title.length < 10 || !href || seen.has(href)) return
      seen.add(href)

      const fullUrl = href.startsWith('http') ? href : `https://news.naver.com${href}`

      const $parent = $a.closest('div, li, article')
      const snippet = $parent.find('span, p, div').text().trim().substring(0, 300)

      // 시간 정보 추출 — "1일 전", "2일 전" 등 어제 기사 필터링
      const timeText = $parent.find('time, .time, [class*="time"], [class*="date"]').text().trim()
      const fullText = $parent.text()
      const dayMatch = fullText.match(/(\d+)\s*일\s*전/)
      if (dayMatch && parseInt(dayMatch[1]) >= 1) return  // 1일 전 이상이면 스킵

      let imageUrl: string | null = null
      const img = $parent.find('img').first().attr('src')
      // 네이버 로고/워터마크/아이콘 차단 — 포털 로고가 카드 배경에 까이는 원인
      if (img && img.startsWith('http') && !/logo|icon|og_image|spnew|gnb_|mskin|phinf|netv|imgsrc|watermark/i.test(img)) {
        imageUrl = img
      }

      if (title.length > 10) {
        articles.push({
          title: title.substring(0, 200),
          content: snippet || title,
          summary: snippet.substring(0, 300) || title,
          source,
          sourceUrl: fullUrl,
          imageUrl,
          publishedAt: new Date(),
          category: detectCategory(title)
        })
      }
    })

    // 기사 본문 직접 수집 (병렬 5개씩)
    const batch = articles.slice(0, 30)
    for (let i = 0; i < batch.length; i += 5) {
      const chunk = batch.slice(i, i + 5)
      const results = await Promise.allSettled(
        chunk.map(a => extractArticleData(a.sourceUrl))
      )
      for (let j = 0; j < chunk.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled' && r.value.content.length > 100) {
          chunk[j].content = r.value.content
          chunk[j].summary = r.value.content.substring(0, 300)
          if (r.value.imageUrl && !chunk[j].imageUrl) {
            chunk[j].imageUrl = r.value.imageUrl
          }
        }
      }
    }

    // cleanContent 적용 후 150자 미만이면 버림 (빈약 기사가 generate에서 422 나는 원인 차단)
    // 저장 본문도 cleanContent 결과로 교체 — byline/저작권 오염 제거
    const filtered = []
    for (const a of batch) {
      const body = cleanContent(a.content || '').trim()
      if (body.length < 100) continue
      a.content = body.substring(0, 2000)
      a.summary = body.substring(0, 300)
      filtered.push(a)
    }

    return filtered
  } catch (error) {
    console.error(`[crawler] 네이버 스크래핑 실패 (${source}):`, error)
    return []
  }
}

// 인스타그램 반응(공유·저장·댓글)을 유발하는 주제 중심
// 이미지 수급 안정성을 위해 네이버 섹션(이미지 O) + 구글 RSS(타겟팅) 조합.
// 매체 직접 RSS는 이미지 수급이 불안정(연합/경향 등 og:image 미제공)해 한겨레만 유지.
export const KOREAN_NEWS_FEEDS = [
  // ── 사건·사고·범죄 (분노/공분/안타까움 → 댓글 폭발) ──
  { url: 'https://news.google.com/rss/search?q=%EC%82%AC%EA%B1%B4+%EC%82%AC%EA%B3%A0+%EA%B5%AD%EB%82%B4+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '사건사고' },
  { url: 'https://news.google.com/rss/search?q=%EB%B2%94%EC%A2%8C+%EA%B5%AC%EC%86%8D+%ED%94%BC%ED%95%B4%EC%9E%90+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '범죄피해' },
  { url: 'https://news.google.com/rss/search?q=%EC%82%AC%EA%B8%B0+%ED%94%BC%ED%95%B4+%EB%B3%B4%EC%9D%B4%EC%8A%A4%ED%94%BC%EC%8B%B1+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '사기피해' },
  { url: 'https://news.google.com/rss/search?q=%EC%9D%80%ED%9D%90%EC%9A%B4%EC%A0%84+%EB%8A%94%ED%9D%90+%EC%9D%B8%EC%82%AC%EA%B1%B4+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '교통사고' },

  // ── 논란·갈등·반발 (찬반 논쟁 → 공유/댓글) ──
  { url: 'https://news.google.com/rss/search?q=%EB%85%BC%EB%9E%80+%EB%B0%98%EB%B0%9C+%EC%B2%AD%EC%9B%90+%ED%95%AD%EC%9D%98+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '논란갈등' },
  { url: 'https://news.google.com/rss/search?q=%EB%AF%BC%EC%83%9D%EC%9B%90+%ED%86%B5%ED%99%94+%EA%B3%B5%EB%B6%84+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '민생논란' },
  { url: 'https://news.google.com/rss/search?q=%EC%A0%9C%EB%8F%84+%EA%B7%BC%EB%A1%9C+%EB%B0%98%EB%B0%9C+%EC%9A%B4%EB%8F%99+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '제도논란' },

  // ── 내 삶 직결 (공감·궁금증 → 저장) ──
  { url: 'https://news.google.com/rss/search?q=%EC%A0%84%EC%84%B8+%EB%8C%80%EC%B6%9C+%EC%9D%B4%EC%9E%90+%EA%B8%89%EB%93%B1+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '부동산금융' },
  { url: 'https://news.google.com/rss/search?q=%EC%8B%9D%ED%92%88+%ED%95%B4%ED%82%B9+%EC%9C%84%ED%95%9C+%EC%98%A4%EC%97%BC+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '식품안전' },
  { url: 'https://news.google.com/rss/search?q=%EA%B3%B5%EA%B3%B5%EC%9D%BC%EB%8B%B9+%EC%9C%84%EB%B0%98+%EC%9D%B8%EC%83%9D+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '일상불편' },

  // ── 속보 (긴급/브레이킹 → 높은 반응) ──
  { url: 'https://news.google.com/rss/search?q=%EC%86%8D%EB%B3%B4+%EA%B5%AD%EB%82%B4+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '속보' },

  // ── 연예·스포츠 (국뽕/스캔들 → 폭발적 호응) ──
  { url: 'https://news.google.com/rss/search?q=%EC%97%B0%EC%98%88+%EC%8A%A4%EC%BA%94%EB%93%A4+%EC%9D%B4%ED%98%BC+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '연예스캔들' },
  { url: 'https://news.google.com/rss/search?q=K%ED%8E%98%EC%9D%B4+%EC%9B%94%EB%93%9C%EC%BB%B5+%EC%95%BC%EA%B5%AC+when:1d&hl=ko&gl=KR&ceid=KR:ko', source: '스포츠이슈' },

  // ── 매체 직접 RSS (이미지 O인 한겨레만 — 나머지는 og:image 미제공으로 불안정) ──
  { url: 'https://www.hani.co.kr/rss/', source: '한겨레' },
]
