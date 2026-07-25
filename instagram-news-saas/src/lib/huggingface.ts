import { HfInference } from '@huggingface/inference'
import fs from 'fs'
import path from 'path'

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY || '')

// 이 계정/프로바이더 조합에서 FLUX 생성이 한 번이라도 실패하면
// 세션 내내 재시도하지 않고 즉시 폴백(뉴스 사진/그라데이션)으로 넘어간다.
let fluxDisabled = false

export async function generateImage(prompt: string, width = 1080, height = 1080): Promise<Blob> {
  if (fluxDisabled) throw new Error('FLUX disabled (previous failure)')
  try {
    const image = await hf.textToImage({
      model: 'black-forest-labs/FLUX.1-schnell',
      inputs: prompt,
      parameters: { width, height, num_inference_steps: 4 }
    })
    if (typeof image === 'string') {
      const base64 = image.replace(/^data:image\/\w+;base64,/, '')
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new Blob([bytes], { type: 'image/jpeg' })
    }
    return image as Blob
  } catch (e) {
    fluxDisabled = true
    console.log('[huggingface] FLUX generation failed, disabled for session:', String(e).slice(0, 120))
    throw e
  }
}

export async function saveImage(image: Blob | string, filename: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

  let buffer: Buffer
  if (typeof image === 'string') {
    const base64 = image.replace(/^data:image\/\w+;base64,/, '')
    buffer = Buffer.from(base64, 'base64')
  } else {
    buffer = Buffer.from(await image.arrayBuffer())
  }

  const filePath = path.join(uploadDir, filename)
  fs.writeFileSync(filePath, buffer)
  return `/uploads/${filename}`
}
