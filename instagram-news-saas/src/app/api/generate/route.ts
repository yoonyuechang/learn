import { NextResponse } from 'next/server'
import { queryOne, queryAll, execute, ensureTables } from '@/lib/db'
import { generateCopy, analyzeViralScore, defaultHashtags } from '@/lib/ai'
import { generateTextCard } from '@/lib/card-generator'

function cleanImageUrl(url: string | null): string | null {
  if (!url) return null
  const blocklist = ['logo-news-sns', 'lh3.googleusercontent.com/J6_coFbogxhR']
  const lower = url.toLowerCase()
  if (blocklist.some(b => lower.includes(b))) return null
  return url
}

// POST: 단건 콘텐츠 생성 (newsId 지정)
// GET: 미생성 뉴스 중 바이럴 상위 자동 선택 후 생성
export async function POST(request: Request) {
  try {
    await ensureTables()
    const body = await request.json().catch(() => ({}))
    let newsId = body.newsId as string | undefined
    const reset = body.reset as boolean

    // newsId 없으면 바이럴 상위 미생성 뉴스 자동 선택
    if (!newsId) {
      const top = await queryOne(
        `SELECT n.id FROM News n
         WHERE n.viralScore >= 35
           AND NOT EXISTS (SELECT 1 FROM Copy c WHERE c.newsId = n.id)
           AND NOT EXISTS (SELECT 1 FROM Image i WHERE i.newsId = n.id)
         ORDER BY n.viralScore DESC LIMIT 1`
      )
      if (top) newsId = String(top.id)
    }

    if (!newsId || typeof newsId !== 'string') {
      return NextResponse.json({ error: '생성 가능한 뉴스가 없습니다.' }, { status: 404 })
    }

    const news = await queryOne('SELECT * FROM News WHERE id = ?', [newsId])
    if (!news) {
      return NextResponse.json({ error: '뉴스를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (reset) {
      await execute('DELETE FROM Copy WHERE newsId = ?', [newsId])
      await execute('DELETE FROM Image WHERE newsId = ?', [newsId])
    }

    const title = String(news.title)
    const content = String(news.content)
    const category = String(news.category)
    const newsImageUrl = cleanImageUrl(news.newsImageUrl ? String(news.newsImageUrl) : null)

    const rawStored = (news as any).viralScore
    const storedScore = rawStored != null && rawStored !== '' ? Number(rawStored) : null
    const viral = await analyzeViralScore(title, content, category)
    const finalScore = storedScore != null ? storedScore : viral.viralScore

    if (finalScore < 35) {
      return NextResponse.json({
        success: false,
        error: `바이럴 점수가 낮습니다 (${finalScore}/100).`,
        viralScore: finalScore,
        reason: viral.sentiment
      }, { status: 422 })
    }

    await execute(
      'UPDATE News SET viralScore = ?, sentiment = ?, keywords = ? WHERE id = ?',
      [finalScore, viral.sentiment, JSON.stringify(viral.keywords), newsId]
    )

    let copyResult
    try {
      copyResult = await generateCopy(title, content, category)
    } catch {
      copyResult = {
        headline: title.substring(0, 25),
        body: `${title}\n\n${content.substring(0, 300).split(/[.!?]\s+/).join('\n\n')}\n\n이 뉴스, 여러분은 어떻게 보셨어요? 댓글로 의견 남겨주세요!`,
        hashtags: defaultHashtags(category, title, content)
      }
    }

    if (!copyResult.body || copyResult.body.trim().length === 0) {
      return NextResponse.json({ success: false, error: '본문이 부족합니다.' }, { status: 422 })
    }

    await execute(
      'INSERT INTO GenerationLog (newsId, category, score, retries, passed, reason, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))',
      [newsId, category, (copyResult as any)._evalScore ?? 0, (copyResult as any)._retries ?? 0, (copyResult as any)._evalScore >= 80 ? 1 : 0, (copyResult as any)._evalReason ?? '']
    )

    const copyId = crypto.randomUUID()
    await execute(
      `INSERT INTO Copy (id, newsId, headline, body, hashtags, tone, isApproved, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [copyId, newsId, copyResult.headline, copyResult.body, copyResult.hashtags, 'informative']
    )

    const source = String(news.source)
    const imageBuffer = await generateTextCard({
      headline: copyResult.headline,
      summary: String(news.summary || '').substring(0, 80),
      content: String(news.content || ''),
      category,
      newsImageUrl,
      source,
      viralScore: viral.viralScore
    })

    const imageBase64 = imageBuffer.toString('base64')
    const imageUrl = `data:image/jpeg;base64,${imageBase64}`

    const imageId = crypto.randomUUID()
    await execute(
      `INSERT INTO Image (id, newsId, copyId, prompt, imageUrl, localPath, isGenerated, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      [imageId, newsId, copyId, 'headline-card', imageUrl, imageUrl]
    )

    await execute('UPDATE News SET isSelected = 1 WHERE id = ?', [newsId])

    return new NextResponse(
      JSON.stringify({
        success: true,
        message: '콘텐츠 생성 완료',
        newsId,
        title,
        viralScore: finalScore,
        copy: { id: copyId, headline: copyResult.headline, body: copyResult.body, hashtags: copyResult.hashtags, _evalScore: (copyResult as any)._evalScore, _retries: (copyResult as any)._retries, _evalReason: (copyResult as any)._evalReason },
        image: { id: imageId, imageUrl, hasNewsImage: !!newsImageUrl },
        engagement: viral.engagement,
        caption: copyResult.body
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[api/generate] Error:', error)
    return NextResponse.json(
      { error: '콘텐츠 생성 실패', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

// GET: 전체 미생성 뉴스 일괄 생성 (바이럴 순)
export async function GET() {
  try {
    await ensureTables()
    const ungenerated = await queryAll(
      `SELECT n.id, n.title, n.viralScore FROM News n
       WHERE n.viralScore >= 35
         AND NOT EXISTS (SELECT 1 FROM Copy c WHERE c.newsId = n.id)
       ORDER BY n.viralScore DESC LIMIT 10`
    )
    return NextResponse.json({
      total: ungenerated.length,
      items: ungenerated.map(r => ({ id: r.id, title: r.title, viralScore: r.viralScore }))
    })
  } catch (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}
