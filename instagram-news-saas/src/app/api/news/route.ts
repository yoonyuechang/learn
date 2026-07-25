import { NextRequest, NextResponse } from 'next/server'
import { queryAll, execute, ensureTables } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const sortBy = searchParams.get('sortBy') || 'crawledAt'

    let sql = 'SELECT * FROM News'
    const args: (string | number)[] = []
    const wheres: string[] = []

    if (category) { wheres.push('category = ?'); args.push(category) }
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ')

    const allowedSort: Record<string, string> = { viralScore: 'viralScore', publishedAt: 'publishedAt', crawledAt: 'crawledAt' }
    const orderCol = allowedSort[sortBy] || 'crawledAt'
    sql += ` ORDER BY ${orderCol} DESC LIMIT ? OFFSET ?`
    args.push(limit, (page - 1) * limit)

    const news = await queryAll(sql, args)

    const countArgs = category ? [category] : []
    const countResult = await queryAll(
      `SELECT COUNT(*) as count FROM News${category ? ' WHERE category = ?' : ''}`,
      countArgs
    )

    return NextResponse.json({
      news,
      pagination: { page, limit, total: Number(countResult[0]?.count || 0) }
    })
  } catch (error) {
    return NextResponse.json(
      { error: '뉴스 조회 실패', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, isSelected } = await request.json()
    await execute('UPDATE News SET isSelected = ? WHERE id = ?', [isSelected ? 1 : 0, id])
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: '뉴스 업데이트 실패' }, { status: 500 })
  }
}
