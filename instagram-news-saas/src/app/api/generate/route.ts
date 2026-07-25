import { NextRequest, NextResponse } from 'next/server'
import { queryOne, execute, migrateGenerationLog } from '@/lib/db'
import { generateCopy, analyzeViralScore, defaultHashtags } from '@/lib/ai'
import { generateTextCard } from '@/lib/card-generator'
import fs from 'fs'
import path from 'path'

function cleanImageUrl(url: string | null): string | null {
  if (!url) return null
  const blocklist = ['logo-news-sns', 'lh3.googleusercontent.com/J6_coFbogxhR']
  const lower = url.toLowerCase()
  if (blocklist.some(b => lower.includes(b))) return null
  return url
}

export async function POST(request: NextRequest) {
  try {
    await migrateGenerationLog()
    const { newsId, reset } = await request.json()
    if (!newsId || typeof newsId !== 'string') {
      return NextResponse.json({ error: 'newsId가 필요합니다.' }, { status: 400 })
    }

    const news = await queryOne('SELECT * FROM News WHERE id = ?', [newsId])
    if (!news) {
      return NextResponse.json({ error: '뉴스를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 초기화(reset=true)면 기존 Copy/Image 삭제 후 재생성
    if (reset) {
      await execute('DELETE FROM Copy WHERE newsId = ?', [newsId])
      await execute('DELETE FROM Image WHERE newsId = ?', [newsId])
    }
    const title = String(news.title)
    const content = String(news.content)
    const category = String(news.category)
    const newsImageUrl = cleanImageUrl(news.newsImageUrl ? String(news.newsImageUrl) : null)

    // libsql 행 객체 키 확인 (디버그)
    console.log('[generate] news row keys:', Object.keys(news).join(','), '| viralScore raw:', (news as any).viralScore, '| VS2:', (news as any)['viralScore'])

    // Step 1: Viral score — 크롤 단계에서 Mistral이 매긴 점수를 권위로 사용
    // (생성 단계의 별도 키워드 heuristic은 0을 남발해 충돌하므로 신뢰하지 않음)
    const rawStored = (news as any).viralScore
    const storedScore = rawStored != null && rawStored !== '' ? Number(rawStored) : null
    const viral = await analyzeViralScore(title, content, category)
    const finalScore = storedScore != null ? storedScore : viral.viralScore

    // 바이럴 스코어 35 미만이면 거부 — 진짜 바이럴만 통과
    if (finalScore < 35) {
      return NextResponse.json({
        success: false,
        error: `바이럴 점수가 낮습니다 (${finalScore}/100). 사건사고/분노 유발 뉴스를 선택해주세요.`,
        viralScore: finalScore,
        reason: viral.sentiment
      })
    }

    await execute(
      'UPDATE News SET viralScore = ?, sentiment = ?, keywords = ? WHERE id = ?',
      [finalScore, viral.sentiment, JSON.stringify(viral.keywords), newsId]
    )

    // Step 2: Generate copy
    let copyResult
    try {
      copyResult = await generateCopy(title, content, category)
    } catch (error) {
      copyResult = {
        headline: title.substring(0, 25),
        body: `${title}\n\n${content.substring(0, 300).split(/[.!?]\s+/).join('\n\n')}\n\n이 뉴스, 여러분은 어떻게 보셨어요? 댓글로 의견 남겨주세요!`,
        hashtags: defaultHashtags(category)
      }
    }

    // 본문이 비었으면(빈 본문 기사) 발행 안 함 — 부실 캡션 노출 방지
    if (!copyResult.body || copyResult.body.trim().length === 0) {
      return NextResponse.json({ success: false, error: '본문이 부족해 캡션을 생성하지 않았습니다. (크롤 소스 변경 필요)' }, { status: 422 })
    }

    // 자기 고도화 루프: 룰 기반 verify 점수/재시도/사유 기록 (크롤 선별 기준 자동 조정 근거)
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

    // Step 3: Card image
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

    const filename = `${newsId}_${Date.now()}.jpg`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
    fs.writeFileSync(path.join(uploadDir, filename), imageBuffer)
    const imageUrl = `/uploads/${filename}`

    const imageId = crypto.randomUUID()
    await execute(
      `INSERT INTO Image (id, newsId, copyId, prompt, imageUrl, localPath, isGenerated, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      [imageId, newsId, copyId, 'headline-card', imageUrl, imageUrl]
    )

    await execute('UPDATE News SET isSelected = 1 WHERE id = ?', [newsId])

    // 캡션은 본문만 — 해시태그는 별도 필드로 전달해 '첫 댓글'에 게시 (가독성/알고리즘 최적화)
    const caption = copyResult.body

    const imageUrlCached = `${imageUrl}?t=${Date.now()}`  // 브라우저 캐시 방지
    return new NextResponse(
      JSON.stringify({
        success: true,
        message: '콘텐츠 생성 완료',
        copy: { id: copyId, headline: copyResult.headline, body: copyResult.body, hashtags: copyResult.hashtags, _evalScore: (copyResult as any)._evalScore, _retries: (copyResult as any)._retries, _evalReason: (copyResult as any)._evalReason },
        image: { id: imageId, imageUrl: imageUrlCached, hasNewsImage: !!newsImageUrl },
        engagement: viral.engagement,
        viralScore: viral.viralScore,
        caption
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
