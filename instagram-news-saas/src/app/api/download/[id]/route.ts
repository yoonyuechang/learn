import { NextRequest, NextResponse } from 'next/server'
import { queryOne, ensureTables } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureTables()
    const { id } = await params

    const image = await queryOne('SELECT * FROM Image WHERE id = ?', [id])
    if (!image) {
      return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 })
    }

    const imageUrl = String(image.imageUrl)

    // base64 data URL인 경우 직접 디코딩
    if (imageUrl.startsWith('data:image/')) {
      const base64 = imageUrl.split(',')[1]
      const buffer = Buffer.from(base64, 'base64')
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Disposition': `attachment; filename="jungbobada_${Date.now()}.jpg"`
        }
      })
    }

    // 로컬 파일인 경우
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
