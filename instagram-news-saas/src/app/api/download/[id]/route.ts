import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const image = await queryOne('SELECT * FROM Image WHERE id = ?', [id])
    if (!image) {
      return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 })
    }

    const imageUrl = String(image.imageUrl)
    const filePath = path.join(process.cwd(), 'public', imageUrl)

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })
    }

    const fileBuffer = fs.readFileSync(filePath)

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="jungbobada_${Date.now()}.jpg"`
      }
    })
  } catch (error) {
    return NextResponse.json({ error: '다운로드 실패' }, { status: 500 })
  }
}
