import { NextRequest, NextResponse } from 'next/server'
import { queryAll, execute, ensureTables } from '@/lib/db'

export async function GET() {
  try {
    await ensureTables()
    const items = await queryAll(`
      SELECT n.*,
        (SELECT json_object('id', c.id, 'headline', c.headline, 'body', c.body, 'hashtags', c.hashtags)
         FROM Copy c WHERE c.newsId = n.id ORDER BY c.createdAt DESC LIMIT 1) as copyData,
        (SELECT json_object('id', i.id, 'imageUrl', i.imageUrl)
         FROM Image i WHERE i.newsId = n.id ORDER BY i.createdAt DESC LIMIT 1) as imageData
      FROM News n
      WHERE EXISTS (SELECT 1 FROM Copy c WHERE c.newsId = n.id)
        AND EXISTS (SELECT 1 FROM Image i WHERE i.newsId = n.id)
      ORDER BY n.viralScore DESC NULLS LAST, n.crawledAt DESC
    `)

    const result = items.map(row => {
      let copy = null
      let image = null
      try { copy = row.copyData ? JSON.parse(String(row.copyData)) : null } catch { /* skip */ }
      try { image = row.imageData ? JSON.parse(String(row.imageData)) : null } catch { /* skip */ }
      return {
        id: row.id,
        title: row.title,
        summary: row.summary,
        category: row.category,
        viralScore: row.viralScore,
        source: row.source,
        isPosted: row.isPosted,
        copy,
        image
      }
    })

    return NextResponse.json({ items: result })
  } catch (error) {
    return NextResponse.json({ error: '큐 조회 실패', detail: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { newsId } = await request.json()
    await execute('UPDATE News SET isPosted = 1 WHERE id = ?', [newsId])
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
  }
}
