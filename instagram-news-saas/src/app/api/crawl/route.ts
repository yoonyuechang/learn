import { NextResponse } from 'next/server'
import { queryOne, execute, ensureTables } from '@/lib/db'
import { crawlRSS, scrapeNaverNews, KOREAN_NEWS_FEEDS } from '@/lib/crawler'
import { preFilterArticles, viralScore } from '@/lib/ai'

const NAVER_SECTIONS = [
  { id: '102', source: '네이버-사회' },
  { id: '101', source: '네이버-경제' },
  { id: '103', source: '네이버-생활문화' },
  { id: '104', source: '네이버-세계' },
  { id: '105', source: '네이버-IT과학' },
  { id: '106', source: '네이버-연예' },
  { id: '107', source: '네이버-스포츠' },
  { id: '100', source: '네이버-정치' },
]

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

  const ranked = todayArticles
    .map((a, i) => ({ article: a, index: i, heuristicScore: viralScore(a.title, a.content, a.category) }))
    .sort((a, b) => b.heuristicScore - a.heuristicScore)
    .slice(0, 30)

  const aiScores = await preFilterArticles(
    ranked.map(c => ({ title: c.article.title, content: c.article.content }))
  )

  const scored = ranked.map((c, i) => {
    const aiScore = aiScores.find(s => s.index === i)
    const score = Math.max(c.heuristicScore, aiScore?.score || 0)
    return { ...c, score }
  }).sort((a, b) => b.score - a.score)

  for (const { article, score } of scored) {
    const existing = await queryOne('SELECT id FROM News WHERE sourceUrl = ?', [article.sourceUrl])
    if (existing) continue

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

// 병렬 배치 크롤러 — N개씩 동시 처리
async function crawlBatch(
  tasks: Array<() => Promise<Array<any>>>,
  batchSize: number
): Promise<Array<{ articles: Array<any>; source: string; error?: string }>> {
  const out: Array<{ articles: Array<any>; source: string; error?: string }> = []
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize)
    const results = await Promise.allSettled(batch.map(t => t()))
    for (let j = 0; j < batch.length; j++) {
      const r = results[j]
      if (r.status === 'fulfilled') {
        out.push({ articles: r.value, source: '' })
      } else {
        out.push({ articles: [], source: '', error: r.reason?.message || 'fail' })
      }
    }
  }
  return out
}

export async function POST(request: Request) {
  try {
    await ensureTables()
    const results = { crawled: 0, withImage: 0, filtered: 0, errors: [] as string[] }

    // URL 파라미터로 배치 제어: ?type=rss | naver | all
    const url = new URL(request.url)
    const type = url.searchParams.get('type') || 'all'

    // 기존 콘텐츠 초기화
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayIso = todayStart.toISOString()
    await execute('DELETE FROM GenerationLog WHERE newsId IN (SELECT id FROM News WHERE crawledAt < ?)', [todayIso])
    await execute('DELETE FROM Image WHERE newsId IN (SELECT id FROM News WHERE crawledAt < ?)', [todayIso])
    await execute('DELETE FROM Copy WHERE newsId IN (SELECT id FROM News WHERE crawledAt < ?)', [todayIso])
    await execute('DELETE FROM News WHERE crawledAt < ?', [todayIso])
    console.log(`[crawl] 초기화 완료`)

    // RSS + 네이버 병렬 처리 (각 5개씩 동시)
    const allFeedArticles: Array<{ title: string; content: string; summary: string; source: string; sourceUrl: string; category: string; publishedAt: Date; imageUrl: string | null }> = []

    if (type === 'all' || type === 'rss') {
      const rssTasks = KOREAN_NEWS_FEEDS.map(feed => async () => {
        try {
          return await crawlRSS(feed.url, feed.source)
        } catch (error) {
          results.errors.push(`${feed.source}: ${error instanceof Error ? error.message : String(error)}`)
          return []
        }
      })
      const rssResults = await crawlBatch(rssTasks, 5)
      for (const r of rssResults) {
        allFeedArticles.push(...r.articles)
      }
    }

    if (type === 'all' || type === 'naver') {
      const naverTasks = NAVER_SECTIONS.map(section => async () => {
        try {
          return await scrapeNaverNews(section.id, section.source)
        } catch (error) {
          results.errors.push(`${section.source}: ${error instanceof Error ? error.message : String(error)}`)
          return []
        }
      })
      const naverResults = await crawlBatch(naverTasks, 5)
      for (const r of naverResults) {
        allFeedArticles.push(...r.articles)
      }
    }

    // 전체 기사를 한 번에 AI 평가 후 DB 저장
    await storeFiltered(allFeedArticles, results)

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
