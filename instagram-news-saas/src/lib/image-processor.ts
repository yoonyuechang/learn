import Sharp from 'sharp'
import path from 'path'
import fs from 'fs'

// 이미지 리사이즈
export async function resizeImage(inputPath: string, width: number = 1080, height: number = 1080) {
  const outputPath = inputPath.replace(/\.[^/.]+$/, '_resized.jpg')

  await Sharp(inputPath)
    .resize(width, height, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: 90 })
    .toFile(outputPath)

  return outputPath
}

// 워터마크 추가
export async function addWatermark(inputPath: string, watermarkText: string = '정보바다 뉴스') {
  const outputPath = inputPath.replace(/\.[^/.]+$/, '_watermarked.jpg')

  const image = Sharp(inputPath)
  const metadata = await image.metadata()

  const svgBuffer = Buffer.from(`
    <svg width="${metadata.width}" height="${metadata.height}">
      <style>
        .watermark {
          font-size: 24px;
          font-family: Arial, sans-serif;
          fill: rgba(255, 255, 255, 0.7);
          font-weight: bold;
        }
      </style>
      <text x="${(metadata.width || 1080) - 200}" y="${(metadata.height || 1080) - 30}" class="watermark">${watermarkText}</text>
    </svg>
  `)

  await image
    .composite([{
      input: svgBuffer,
      gravity: 'southeast'
    }])
    .jpeg({ quality: 90 })
    .toFile(outputPath)

  return outputPath
}

// 뉴스 카드 이미지 생성
export async function createNewsCard(title: string, category: string, outputPath: string) {
  const categoryColors: Record<string, string> = {
    politics: '#E63946',
    economy: '#457B9D',
    society: '#2A9D8F',
    culture: '#E9C46A',
    tech: '#264653',
    sports: '#F4A261',
    world: '#606C38',
    general: '#1B2838'
  }

  const color = categoryColors[category] || categoryColors.general

  const svgBuffer = Buffer.from(`
    <svg width="1080" height="1080">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1B2838;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1080" fill="url(#grad)"/>
      <text x="540" y="400" text-anchor="middle" font-size="60" font-family="Arial, sans-serif" fill="white" font-weight="bold">
        ${category.toUpperCase()}
      </text>
      <text x="540" y="540" text-anchor="middle" font-size="48" font-family="Arial, sans-serif" fill="white">
        ${title.substring(0, 20)}
      </text>
      <text x="540" y="950" text-anchor="middle" font-size="32" font-family="Arial, sans-serif" fill="rgba(255,255,255,0.7)">
        정보바다 뉴스
      </text>
    </svg>
  `)

  await Sharp(svgBuffer)
    .resize(1080, 1080)
    .jpeg({ quality: 90 })
    .toFile(outputPath)

  return outputPath
}
