import sharp from 'sharp'
import path from 'path'
import { generateImage } from './huggingface'

interface CardData {
  headline: string
  summary?: string
  content?: string
  category: string
  newsImageUrl?: string | null
  source?: string
  viralScore?: number
}

// Sharp SVG에서 사용할 폰트 경로 (Windows NotoSansKR Bold)
const FONT_PATH = 'C:/Windows/Fonts/NotoSansKR-VF.ttf'
const FONT_FAMILY = 'NotoSansKR'

// 카테고리별 컬러 (하단 패널 + 뱃지)
const CAT_COLOR: Record<string, { panel: string; badge: string; label: string }> = {
  politics: { panel: '#7d1128', badge: '#E63946', label: '정치' },
  economy: { panel: '#1d3557', badge: '#457B9D', label: '경제' },
  society: { panel: '#14463f', badge: '#2A9D8F', label: '사회' },
  culture: { panel: '#5c4a12', badge: '#E9C46A', label: '연예' },
  tech: { panel: '#241f3a', badge: '#9B5DE5', label: '기술' },
  sports: { panel: '#5c3310', badge: '#F4A261', label: '스포츠' },
  world: { panel: '#2e3a14', badge: '#606C38', label: '국제' },
  general: { panel: '#1B2838', badge: '#6C757D', label: '일반' },
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// 한글 기준 줄바꿈 (공백 기준, 최대 chars자)
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let rem = text.trim()
  while (rem.length > 0) {
    if (rem.length <= maxChars) { lines.push(rem); break }
    let bp = maxChars
    const sp = rem.lastIndexOf(' ', maxChars)
    if (sp > maxChars * 0.4) bp = sp
    lines.push(rem.substring(0, bp).trim())
    rem = rem.substring(bp).trim()
  }
  return lines
}

// 헤드라인 전용: 14자/줄, 최대 3줄, 너비 초과 시 끊지 않고 '…'로 자연스럽게 처리
function wrapHeadline(text: string): string[] {
  const MAX = 14
  const raw = text.trim()
  const lines: string[] = []
  let rem = raw
  while (rem.length > 0 && lines.length < 3) {
    if (rem.length <= MAX) { lines.push(rem); break }
    let bp = MAX
    const sp = rem.lastIndexOf(' ', MAX)
    if (sp > MAX * 0.4) bp = sp
    lines.push(rem.substring(0, bp).trim())
    rem = rem.substring(bp).trim()
  }
  // 3줄을 채웠는데 남은 텍스트가 있으면 마지막 줄에 '…' 붙여 잘림 방지
  if (rem.length > 0 && lines.length === 3) {
    let last = lines[2]
    if (last.length > MAX - 1) last = last.substring(0, MAX - 1)
    lines[2] = last + '…'
  }
  return lines.length ? lines : [raw.substring(0, MAX)]
}

async function prepareBackgroundImage(imageUrl: string): Promise<Buffer | null> {
  try {
    const lower = imageUrl.toLowerCase()
    // 네이버/한경 로고·워터마크 차단 (포털 로고가 카드 배경에 까이는 원인)
    if (/logo|icon|favicon|og_image|spnew|gnb_|mskin|phinf|netv|imgsrc|watermark|press_logo|naver_og|sprite|noimg|no_img|blank\.|placeholder|default_?img|profile_/i.test(lower)) return null
    // 네이버/한경 등은 리퍼러 체크로 서버 사이드 직접 fetch를 막음 → Referer 우회
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    }
    if (lower.includes('naver') || lower.includes('pstatic')) {
      headers['Referer'] = 'https://news.naver.com/'
    } else if (lower.includes('hankyung')) {
      headers['Referer'] = 'https://www.hankyung.com/'
    }
    const r = await fetch(imageUrl, { headers, signal: AbortSignal.timeout(15000), redirect: 'follow' })
    if (!r.ok) return null
    const contentType = r.headers.get('content-type') || ''
    if (!contentType.includes('image')) return null
    const arr = await r.arrayBuffer()
    if (arr.byteLength < 2000) return null
    const buf = Buffer.from(arr)
    // 진짜 이미지인지 sharp 메타데이터로 최종 검증 (깨진/아닌 HTML 등 차단)
    const meta = await sharp(buf).metadata().catch(() => null)
    if (!meta || !meta.width || !meta.height) return null
    // 로고/워터마크류는 대부분 소형 이미지 — 배경으로 쓰기엔 작으면 차단
    if (meta.width < 400 || meta.height < 300) return null
    // 극단적 가로 배너(로고 스트립) 차단
    if (meta.width / meta.height > 3.5) return null
    return await sharp(buf)
      .resize(1080, 1080, { fit: 'cover', position: 'center' })
      .modulate({ brightness: 0.5 })
      .toBuffer()
  } catch {
    return null
  }
}

// 하단 컬러 패널 + 헤드라인(만) + 브랜드
function makeBottomPanel(opts: {
  headline: string
  panelColor: string
  source?: string
}): string {
  const { headline, panelColor, source } = opts
  const headLines = wrapHeadline(headline).slice(0, 3)
  const headSvg = headLines.map((line, i) =>
    `<text x="48" y="${726 + i * 78}" fill="#ffffff" font-size="62" font-weight="900" font-family="${FONT_FAMILY}, sans-serif" stroke="#0a0a0f" stroke-width="3" paint-order="stroke" letter-spacing="1">${escapeXml(line)}</text>`
  ).join('\n')

  const srcText = source ? `출처: ${escapeXml(source)}` : ''

  return `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="botFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${panelColor}" stop-opacity="0"/>
        <stop offset="25%" stop-color="${panelColor}" stop-opacity="0.75"/>
        <stop offset="42%" stop-color="${panelColor}" stop-opacity="0.96"/>
        <stop offset="100%" stop-color="${panelColor}" stop-opacity="1"/>
      </linearGradient>
      <linearGradient id="textScrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.45"/>
      </linearGradient>
    </defs>
    <rect x="0" y="540" width="1080" height="540" fill="url(#botFade)"/>
    <rect x="0" y="620" width="1080" height="460" fill="url(#textScrim)"/>
    ${headSvg}
    <text x="48" y="1036" fill="rgba(255,255,255,0.7)" font-size="24" font-weight="700" font-family="${FONT_FAMILY}, sans-serif" letter-spacing="2">정보바다 뉴스</text>
    <text x="1032" y="1036" text-anchor="end" fill="rgba(255,255,255,0.5)" font-size="22" font-weight="500" font-family="${FONT_FAMILY}, sans-serif">@jungbobada_news ${srcText ? '· ' + srcText : ''}</text>
  </svg>`
}

// FLUX 실패/미사용 시 쓸 그라데이션 배경 (컬러 패널 톤과 맞춤)
// 이미지 없는 기사도 본문 훅 텍스트로 임팩트를 주되, 상단 카테고리 라벨은 절대 넣지 않음
function makeGradientBg(panelColor: string, hookText: string): string {
  const hookLines = wrapText(hookText, 18).slice(0, 4)
  const hookSvg = hookLines.map((line, i) =>
    `<text x="60" y="${470 + i * 56}" fill="#ffffff" font-size="40" font-weight="800" font-family="${FONT_FAMILY}, sans-serif" stroke="#0a0a0f" stroke-width="2" paint-order="stroke" letter-spacing="0.5">${escapeXml(line)}</text>`
  ).join('\n')
  return `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${panelColor}"/>
        <stop offset="100%" stop-color="#0a0a0f"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#g)"/>
    ${hookSvg}
  </svg>`
}

export async function generateTextCard(data: CardData): Promise<Buffer> {
  const cat = CAT_COLOR[data.category] || CAT_COLOR.general

  // 하단 패널만 합성 (상단 요소 일절 금지 — 이미지 가리지 않음)
  const compose = async (bgBuffer: Buffer): Promise<Buffer> => {
    const bottom = await sharp(Buffer.from(makeBottomPanel({
      headline: data.headline, panelColor: cat.panel, source: data.source
    }))).resize(1080, 1080).toBuffer()
    return sharp(bgBuffer)
      .composite([{ input: bottom, top: 0, left: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer()
  }

  // 1순위: 기사 원본 사진 (가장 신뢰감 있는 카드뉴스)
  if (data.newsImageUrl) {
    const bg = await prepareBackgroundImage(data.newsImageUrl)
    if (bg) {
      console.log(`[card] composing news photo + headline + panel`)
      return compose(bg)
    }
  }

  // 2순위: 그라데이션 배경 (FLUX 실패/미사용 시 즉시 폴백 — 무한 대기 방지)
  if (!process.env.HUGGINGFACE_API_KEY) {
    console.log(`[card] gradient fallback (no HF key)`)
    const bg = Buffer.from(makeGradientBg(cat.panel, pickHook(data)))
    return compose(bg)
  }

  // 3순위: AI 생성 배경 (FLUX) — 키가 있고 이전 실패가 없을 때만 시도
  try {
    const prompt = makeImagePrompt(data.headline, data.category)
    console.log(`[card] AI image: ${prompt.substring(0, 80)}...`)
    const aiImage = await generateImage(prompt, 1080, 1080)
    const aiBuffer = Buffer.from(await aiImage.arrayBuffer())
    const bg = await sharp(aiBuffer).resize(1080, 1080, { fit: 'cover' }).toBuffer()
    console.log(`[card] compositing AI bg + headline + panel`)
    return compose(bg)
  } catch (e) {
    console.log(`[card] AI image failed, gradient fallback`)
    const bg = Buffer.from(makeGradientBg(cat.panel, pickHook(data)))
    return compose(bg)
  }
}

// 이미지 없는 카드용 본문 훅 — content 첫 문장(숫자/사실 위주) 추출
function pickHook(data: CardData): string {
  const boiler = (s: string) => s
    .replace(/Comprehensive up-to-date news coverage.*$/i, '')          // 구글 뉴스 보일러플레이트
    .replace(/Aggregated from various highly reliable sources.*$/i, '')
    .replace(/\[\d*\s*(MBC|KBS|SBS|YTN|JTBC)?뉴스\]/gi, '')
    .replace(/[◀▶▼▷◁]/g, '')
    .replace(/앵커\s*[◀▶▼▷◁]?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  let src = boiler(data.content || '')
  // content가 보일러플레이트만 있으면 summary로 fallback (이때도 보일러플레이트 제거)
  if (src.length < 10) src = boiler(data.summary || '')
  const firstSentence = src.split(/(?<=[.!?])\s/)[0] || src
  return firstSentence.substring(0, 70)
}

function makeImagePrompt(headline: string, category: string): string {
  const lower = headline.toLowerCase()
  if (lower.includes('음주') || lower.includes('사고') || lower.includes('교통')) {
    return 'night city street with car lights, dramatic lighting, moody atmosphere, cinematic photo'
  }
  if (lower.includes('법원') || lower.includes('재판') || lower.includes('구속') || lower.includes('범죄')) {
    return 'courthouse building exterior, dramatic sky, serious atmosphere, editorial photo'
  }
  if (lower.includes('정치') || lower.includes('대통령') || lower.includes('국회')) {
    return 'government building with dramatic clouds, political atmosphere, editorial photography'
  }
  if (lower.includes('경제') || lower.includes('주식') || lower.includes('부동산')) {
    return 'city skyline with financial district, dramatic lighting, business atmosphere'
  }
  if (lower.includes('기술') || lower.includes('AI') || lower.includes('인공지능')) {
    return 'futuristic technology concept, glowing circuits, blue tones, digital art'
  }
  if (lower.includes('연예') || lower.includes('드라마') || lower.includes('영화')) {
    return 'red carpet event lights, entertainment atmosphere, glamorous bokeh'
  }
  if (lower.includes('스포츠') || lower.includes('축구') || lower.includes('야구')) {
    return 'sports stadium with dramatic lights, action atmosphere, editorial photo'
  }
  if (lower.includes('국제') || lower.includes('미국') || lower.includes('중국')) {
    return 'world map with dramatic lighting, international news atmosphere'
  }
  const catPrompts: Record<string, string> = {
    politics: 'government building, dramatic sky, serious atmosphere',
    economy: 'financial district skyline, dramatic lighting',
    society: 'urban street scene, dramatic documentary style',
    culture: 'entertainment lights, vibrant atmosphere',
    tech: 'futuristic technology, glowing digital elements',
    sports: 'sports stadium, dramatic action lighting',
    world: 'world globe, dramatic lighting'
  }
  return catPrompts[category] || 'dramatic editorial photograph, high contrast, cinematic'
}
