import { NextResponse } from 'next/server'
import { queryOne, execute, ensureTables } from '@/lib/db'
import { crawlRSS, scrapeNaverNews, KOREAN_NEWS_FEEDS } from '@/lib/crawler'
import { preFilterArticles, viralScore } from '@/lib/ai'

// 네이버 뉴스 섹션 — 인스타 반응이 높은 섹션 중심 (102=사회/사건, 106=연예, 107=스포츠)
const NAVER_SECTIONS = [
  { id: '102', source: '네이버-사회' },
  { id: '101', source: '네이버-경제' },
  { id: '103', source: '네이버-생활문화' },
  { id: '104', source: '네이버-세계' },
  { id: '105', source: '네이버-IT과학' },
  { id: '106', source: '네이버-연예' },
  { id: '107', source: '네이버-스포츠' },
]

const VIRAL_THRESHOLD = 50 // 70→50: 50~69점대 기사도 바이럴 가치 있음 — 필터 완화

// 교차확인: 구글 뉴스 RSS의 <source> 태그로 동일 사건을 보도한 매체 수 확인
// 2개 이상 서로 다른 매체가 보도 → 신뢰도 높음(통과), 1개만 → 가짜/조립 의심(reject)
async function crossCheckSources(title: string): Promise<{ sources: string[]; passes: boolean }> {
  try {
    // 검색 품질을 위해 주간지/칼럼 태그, 따옴표, 말줄임, 수식어 제거 → 핵심 사건어만 쿼리
    const clean = title
      .replace(/\[[^\]]*\]/g, '')          // [주간 사건일지] 등 태그
      .replace(/[""'']/g, '')               // 인용부호
      .replace(/[…·]/g, ' ')                // 말줄임/가운뎃점
      .replace(/\s+/g, ' ')
      .trim()
    const q = encodeURIComponent(clean.substring(0, 36))
    const url = `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { sources: [], passes: true } // 확인 불가 시 통과(보수적)
    const xml = await r.text()
    const sources = [...xml.matchAll(/<source[^>]*>(.*?)<\/source>/g)].map(m => m[1].trim()).filter(Boolean)
    const unique = [...new Set(sources)]
    return { sources: unique, passes: unique.length >= 2 }
  } catch {
    return { sources: [], passes: true }
  }
}

async function storeFiltered(
  articles: Array<{ title: string; content: string; summary: string; source: string; sourceUrl: string; category: string; publishedAt: Date; imageUrl: string | null }>,
  results: { crawled: number; withImage: number; filtered: number; errors: string[] }
) {
  if (articles.length === 0) return

  const now = new Date()
  const todayKST = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const todayArticles = articles.filter(a => {
    const pubKST = new Date(a.publishedAt.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return pubKST === todayKST
  })
  if (todayArticles.length === 0) { results.filtered += articles.length; return }

  const candidates = todayArticles.map((a, i) => ({
    article: a,
    index: i,
    heuristicScore: viralScore(a.title, a.content, a.category)
  })).filter(c => c.heuristicScore >= VIRAL_THRESHOLD)

  if (candidates.length === 0) { results.filtered += articles.length; return }

  const aiScores = await preFilterArticles(
    candidates.map(c => ({ title: c.article.title, content: c.article.content }))
  )

  // AI/휴리스틱 스코어 필터링 → 교차확인 통과 기사만 남김
  const toCrossCheck: typeof candidates = []
  for (let i = 0; i < candidates.length; i++) {
    const { article, heuristicScore } = candidates[i]
    const aiScore = aiScores.find(s => s.index === i)
    const score = aiScore ? aiScore.score : heuristicScore
    if (score < VIRAL_THRESHOLD) { results.filtered++; continue }
    toCrossCheck.push({ ...candidates[i] })
  }

  // 교차확인 병렬 배치 (5개씩 동시에)
  const CROSS_BATCH = 5
  const passed: typeof candidates = []
  for (let i = 0; i < toCrossCheck.length; i += CROSS_BATCH) {
    const batch = toCrossCheck.slice(i, i + CROSS_BATCH)
    const crossResults = await Promise.allSettled(
      batch.map(c => crossCheckSources(c.article.title))
    )
    for (let j = 0; j < batch.length; j++) {
      const r = crossResults[j]
      if (r.status === 'fulfilled' && r.value.passes) {
        passed.push(batch[j])
      } else if (r.status === 'fulfilled') {
        console.log(`[crosscheck] 단일 매체 — 배제: ${batch[j].article.title.slice(0, 40)}`)
        results.filtered++
      } else {
        passed.push(batch[j]) // 에러 시 통과
      }
    }
  }

  // DB 저장
  for (const { article, index: idx, heuristicScore } of passed) {
    const existing = await queryOne('SELECT id FROM News WHERE sourceUrl = ?', [article.sourceUrl])
    if (existing) continue

    const aiScore = aiScores.find(s => s.index === idx)
    const score = aiScore ? aiScore.score : heuristicScore

    const id = crypto.randomUUID()
    await execute(
      `INSERT INTO News (id, title, content, summary, source, sourceUrl, category, publishedAt, crawledAt, newsImageUrl, viralScore)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
       [id, article.title, article.content, article.summary, article.source, article.sourceUrl, article.category, article.publishedAt.toISOString(), article.imageUrl || null, score]
    )
    results.crawled++
    if (article.imageUrl) results.withImage++
  }
}

export async function POST() {
  try {
    await ensureTables()
    const results = { crawled: 0, withImage: 0, filtered: 0, errors: [] as string[] }

    // 크롤링 시작 시 기존 콘텐츠 초기화 — 오늘자 뉴스만 유지
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayIso = todayStart.toISOString()
    await execute('DELETE FROM GenerationLog WHERE newsId IN (SELECT id FROM News WHERE crawledAt < ?)', [todayIso])
    await execute('DELETE FROM Image WHERE newsId IN (SELECT id FROM News WHERE crawledAt < ?)', [todayIso])
    await execute('DELETE FROM Copy WHERE newsId IN (SELECT id FROM News WHERE crawledAt < ?)', [todayIso])
    await execute('DELETE FROM News WHERE crawledAt < ?', [todayIso])
    // public/uploads 폴더里的 어제 파일도 정리
    console.log(`[crawl] 초기화 완료 — ${todayIso} 이전 뉴스/콘텐츠 삭제`)

    // 1) RSS 피드
    for (const feed of KOREAN_NEWS_FEEDS) {
      try {
        const articles = await crawlRSS(feed.url, feed.source)
        await storeFiltered(articles, results)
      } catch (error) {
        results.errors.push(`${feed.source}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // 2) 네이버 뉴스 스크래핑
    for (const section of NAVER_SECTIONS) {
      try {
        const articles = await scrapeNaverNews(section.id, section.source)
        await storeFiltered(articles, results)
      } catch (error) {
        results.errors.push(`${section.source}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `${results.crawled}개 뉴스 수집 (${results.withImage}개 이미지, ${results.filtered}개 필터링됨)`,
      results
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const total = await queryOne('SELECT COUNT(*) as c FROM News')
    const withImage = await queryOne('SELECT COUNT(*) as c FROM News WHERE newsImageUrl IS NOT NULL')
    const analyzed = await queryOne('SELECT COUNT(*) as c FROM News WHERE viralScore IS NOT NULL')
    const generated = await queryOne(
      "SELECT COUNT(*) as c FROM News WHERE id IN (SELECT newsId FROM Copy) AND id IN (SELECT newsId FROM Image)"
    )
    const posted = await queryOne('SELECT COUNT(*) as c FROM News WHERE isPosted = 1')
    return NextResponse.json({
      total: Number(total?.c || 0),
      withImage: Number(withImage?.c || 0),
      analyzed: Number(analyzed?.c || 0),
      generated: Number(generated?.c || 0),
      posted: Number(posted?.c || 0)
    })
  } catch (error) {
    return NextResponse.json({ error: '상태 조회 실패' }, { status: 500 })
  }
}
