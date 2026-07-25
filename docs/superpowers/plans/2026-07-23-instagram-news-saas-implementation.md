# 인스타그램 뉴스 바이럴 SaaS — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 뉴스를 크롤링하고, AI로 바이럴 뉴스를 선별하여, 인스타그램용 카피라이팅과 이미지를 자동 생성하고, 1일 1포스팅으로 자동 배포하는 SaaS 구축

**Architecture:** Next.js App Router 모놀리식 앱. SQLite + Prisma로 데이터 관리. Google Gemini로 바이럴 예측/카피라이팅, HuggingFace FLUX.1로 이미지 생성. Instagram Graph API로 자동 포스팅.

**Tech Stack:** Next.js 14+, TypeScript, Prisma, SQLite, Tailwind CSS, Google Generative AI, HuggingFace Inference, NextAuth.js, Sharp, rss-parser, Cheerio

## Global Constraints

- TypeScript strict 모드
- 다크 모드 UI 기본
- Vercel 무료 플랜 배포
- 모든 API 키는 `.env.local` 관리
- 서버 사이드에서만 외부 API 호출
- 한국어 UI/콘텐츠

## 파일 구조

```
instagram-news-saas/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── editor/[id]/page.tsx
│   │   ├── schedule/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── competitors/page.tsx
│   │   ├── settings/page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── cron/
│   │       │   ├── crawl/route.ts
│   │       │   ├── analyze/route.ts
│   │       │   ├── generate/route.ts
│   │       │   ├── post/route.ts
│   │       │   └── analytics/route.ts
│   │       ├── news/
│   │       │   └── [id]/route.ts
│   │       ├── copy/
│   │       │   └── [id]/route.ts
│   │       ├── image/
│   │       │   └── [id]/route.ts
│   │       ├── post/
│   │       │   └── [id]/route.ts
│   │       ├── analytics/route.ts
│   │       ├── competitors/
│   │       │   └── [id]/route.ts
│   │       ├── settings/route.ts
│   │       └── instagram/
│   │           └── callback/route.ts
│   ├── lib/
│   │   ├── db.ts
│   │   ├── gemini.ts
│   │   ├── huggingface.ts
│   │   ├── crawler.ts
│   │   ├── instagram.ts
│   │   ├── image-processor.ts
│   │   └── analytics.ts
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── toast.tsx
│   │   ├── news/
│   │   │   ├── news-list.tsx
│   │   │   └── news-card.tsx
│   │   ├── editor/
│   │   │   ├── copy-editor.tsx
│   │   │   └── image-preview.tsx
│   │   ├── analytics/
│   │   │   ├── charts.tsx
│   │   │   └── stats-cards.tsx
│   │   └── layout/
│   │       ├── sidebar.tsx
│   │       └── header.tsx
│   └── types/
│       └── index.ts
├── public/
│   └── images/
├── .env.local
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Phase 1: 프로젝트 셋업 + 데이터베이스

### Task 1: Next.js 프로젝트 초기화

**Files:**
- Create: `package.json`, `next.config.js`, `tailwind.config.ts`, `tsconfig.json`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Next.js 프로젝트 생성**

```bash
npx create-next-app@latest instagram-news-saas --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

- [ ] **Step 2: 필수 패키지 설치**

```bash
cd instagram-news-saas
npm install @prisma/client rss-parser cheerio @google/generative-ai @huggingface/inference next-auth sharp node-cron zod @tanstack/react-query recharts lucide-react sonner
npm install -D prisma @types/node
```

- [ ] **Step 3: 환경변수 파일 생성**

```bash
# .env.local
DATABASE_URL="file:./dev.db"
GOOGLE_AI_API_KEY=""
HUGGINGFACE_API_KEY=""
INSTAGRAM_APP_ID=""
INSTAGRAM_APP_SECRET=""
INSTAGRAM_ACCESS_TOKEN=""
INSTAGRAM_BUSINESS_ACCOUNT_ID=""
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 4: 커밋**

```bash
git add .
git commit -m "feat: initialize Next.js project with dependencies"
```

### Task 2: Prisma 스키마 + DB 설정

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`

- [ ] **Step 1: Prisma 스키마 작성**

```prisma
// prisma/schema.prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model News {
  id            String   @id @default(cuid())
  title         String
  content       String
  summary       String
  source        String
  sourceUrl     String   @unique
  category      String
  publishedAt   DateTime
  crawledAt     DateTime @default(now())
  viralScore    Float?
  sentiment     String?
  keywords      String?
  isSelected    Boolean  @default(false)
  isPosted      Boolean  @default(false)
  copies        Copy[]
  images        Image[]
  posts         Post[]
  analytics     Analytics[]

  @@index([viralScore(sort: Desc)])
  @@index([crawledAt(sort: Desc)])
  @@index([category])
  @@index([isSelected])
}

model Copy {
  id             String   @id @default(cuid())
  newsId         String
  news           News     @relation(fields: [newsId], references: [id], onDelete: Cascade)
  headline       String
  interpretation String
  hashtags       String
  caption        String
  emotionalHook  String?
  viralScore     Float?
  isApproved     Boolean  @default(false)
  createdAt      DateTime @default(now())
  images         Image[]
  posts          Post[]

  @@index([viralScore(sort: Desc)])
  @@index([isApproved])
}

model Image {
  id            String   @id @default(cuid())
  newsId        String
  news          News     @relation(fields: [newsId], references: [id], onDelete: Cascade)
  copyId        String?
  copy          Copy?    @relation(fields: [copyId], references: [id], onDelete: SetNull)
  imageUrl      String
  thumbnailUrl  String?
  headlineText  String
  style         String
  hfModel       String
  prompt        String?
  width         Int      @default(1080)
  height        Int      @default(1080)
  createdAt     DateTime @default(now())
  posts         Post[]
}

model Post {
  id                String   @id @default(cuid())
  newsId            String
  news              News     @relation(fields: [newsId], references: [id], onDelete: Cascade)
  copyId            String
  copy              Copy     @relation(fields: [copyId], references: [id], onDelete: Cascade)
  imageId           String
  image             Image    @relation(fields: [imageId], references: [id], onDelete: Cascade)
  instagramMediaId  String?
  status            String   @default("draft")
  scheduledFor      DateTime?
  postedAt          DateTime?
  caption           String
  hashtags          String
  errorMessage      String?
  retryCount        Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  analytics         Analytics[]

  @@index([status])
  @@index([scheduledFor])
  @@index([postedAt(sort: Desc)])
}

model Analytics {
  id              String   @id @default(cuid())
  postId          String
  post            Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  newsId          String
  news            News     @relation(fields: [newsId], references: [id], onDelete: Cascade)
  likes           Int      @default(0)
  comments        Int      @default(0)
  saves           Int      @default(0)
  shares          Int      @default(0)
  reach           Int      @default(0)
  impressions     Int      @default(0)
  engagementRate  Float?
  collectedAt     DateTime @default(now())
  period          String   @default("24h")

  @@index([postId])
  @@index([collectedAt(sort: Desc)])
}

model CompetitorAccount {
  id            String   @id @default(cuid())
  instagramId   String   @unique
  username      String
  displayName   String?
  followers     Int?
  avgLikes      Float?
  avgComments   Float?
  avgSaves      Float?
  engagementRate Float?
  topTopics     String?
  contentStyle  String?
  lastAnalyzed  DateTime?
  createdAt     DateTime @default(now())
  posts         CompetitorPost[]

  @@index([engagementRate(sort: Desc)])
}

model CompetitorPost {
  id              String   @id @default(cuid())
  accountId       String
  account         CompetitorAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  mediaId         String
  caption         String
  likes           Int
  comments        Int
  saves           Int?
  reach           Int?
  topic           String
  headlinePattern String?
  viralPattern    String?
  hashtags        String?
  postedAt        DateTime
  analyzedAt      DateTime @default(now())

  @@index([accountId])
  @@index([likes(sort: Desc)])
}

model Settings {
  id          String   @id @default(cuid())
  key         String   @unique
  value       String
  description String?
  updatedAt   DateTime @updatedAt
}
```

- [ ] **Step 2: DB 클라이언트 래퍼 작성**

```typescript
// src/lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

- [ ] **Step 3: Prisma migrate 실행**

```bash
npx prisma migrate dev --name init
```

- [ ] **Step 4: 커밋**

```bash
git add prisma/ src/lib/db.ts
git commit -m "feat: add Prisma schema and database setup"
```

---

## Phase 2: 뉴스 크롤링 시스템

### Task 3: 크롤러 라이브러리

**Files:**
- Create: `src/lib/crawler.ts`
- Create: `src/types/index.ts`

- [ ] **Step 1: 타입 정의**

```typescript
// src/types/index.ts
export interface CrawledNews {
  title: string
  content: string
  summary: string
  source: string
  sourceUrl: string
  category: string
  publishedAt: Date
}

export interface ViralScore {
  score: number
  sentiment: string
  keywords: string[]
  reasoning: string
}

export interface CopyResult {
  headline: string
  interpretation: string
  hashtags: string[]
  caption: string
  emotionalHook: string
}

export interface ImageResult {
  imageUrl: string
  prompt: string
  headlineText: string
}
```

- [ ] **Step 2: 크롤러 구현**

```typescript
// src/lib/crawler.ts
import Parser from 'rss-parser'
import * as cheerio from 'cheerio'
import { CrawledNews } from '@/types'

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; NewsCrawler/1.0)',
  },
})

const RSS_SOURCES = [
  { url: 'https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&query=속보', source: 'google-news-kr', category: 'society' },
  { url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=ko&gl=KR', source: 'google-news-trending', category: 'society' },
  { url: 'https://www.yna.co.kr/RSS/news.xml', source: 'yonhap', category: 'society' },
  { url: 'https://techcrunch.com/feed/', source: 'techcrunch', category: 'tech' },
  { url: 'https://www.bbc.com/koorean/topics/c83plve6vmzt/rss.xml', source: 'bbc-korea', category: 'international' },
]

function categorizeFromSource(source: string): string {
  const map: Record<string, string> = {
    'techcrunch': 'tech',
    'bbc-korea': 'international',
    'yonhap': 'society',
  }
  return map[source] || 'society'
}

function extractContent(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, iframe, noscript').remove()
  return $.text().trim().slice(0, 2000)
}

export async function crawlAllSources(): Promise<CrawledNews[]> {
  const results: CrawledNews[] = []

  for (const source of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url)
      for (const item of feed.items.slice(0, 20)) {
        if (!item.title || !item.link) continue
        const content = item.content
          ? extractContent(item.content)
          : item.contentSnippet
          ? item.contentSnippet.slice(0, 2000)
          : ''

        results.push({
          title: item.title,
          content,
          summary: item.contentSnippet?.slice(0, 200) || '',
          source: source.source,
          sourceUrl: item.link,
          category: categorizeFromSource(source.source),
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        })
      }
    } catch (error) {
      console.error(`Failed to crawl ${source.source}:`, error)
    }
  }

  return results
}

export async function deduplicateNews(
  news: CrawledNews[],
  existingUrls: string[]
): Promise<CrawledNews[]> {
  const urlSet = new Set(existingUrls)
  return news.filter((item) => !urlSet.has(item.sourceUrl))
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/crawler.ts src/types/index.ts
git commit -m "feat: add news crawler with RSS sources"
```

### Task 4: 크롤링 API 라우트

**Files:**
- Create: `src/app/api/cron/crawl/route.ts`

- [ ] **Step 1: 크롤링 API 구현**

```typescript
// src/app/api/cron/crawl/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { crawlAllSources, deduplicateNews } from '@/lib/crawler'

export async function GET(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Crawl all sources
    const crawledNews = await crawlAllSources()

    // 2. Get existing URLs for deduplication
    const existingNews = await db.news.findMany({
      select: { sourceUrl: true },
    })
    const existingUrls = existingNews.map((n) => n.sourceUrl)

    // 3. Deduplicate
    const newNews = await deduplicateNews(crawledNews, existingUrls)

    // 4. Save to database
    let savedCount = 0
    for (const item of newNews) {
      try {
        await db.news.create({
          data: {
            title: item.title,
            content: item.content,
            summary: item.summary,
            source: item.source,
            sourceUrl: item.sourceUrl,
            category: item.category,
            publishedAt: item.publishedAt,
          },
        })
        savedCount++
      } catch (error) {
        // Skip duplicates (race condition)
        console.error(`Failed to save: ${item.sourceUrl}`, error)
      }
    }

    return NextResponse.json({
      success: true,
      crawled: crawledNews.length,
      new: newNews.length,
      saved: savedCount,
    })
  } catch (error) {
    console.error('Crawl failed:', error)
    return NextResponse.json(
      { error: 'Crawl failed' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/cron/crawl/route.ts
git commit -m "feat: add crawl API route"
```

---

## Phase 3: AI 분석 시스템

### Task 5: Gemini 라이브러리

**Files:**
- Create: `src/lib/gemini.ts`

- [ ] **Step 1: Gemini 클라이언트 구현**

```typescript
// src/lib/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import { ViralScore, CopyResult } from '@/types'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')

const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

export async function analyzeViralScore(
  title: string,
  content: string,
  category: string
): Promise<ViralScore> {
  const prompt = `당신은 뉴스 바이럴 예측 전문가입니다. 다음 뉴스가 인스타그램에서 바이럴 될 가능성을 분석하세요.

제목: ${title}
내용: ${content.slice(0, 1000)}
카테고리: ${category}

다음 기준으로 0-100점 사이로 점수를 매기세요:
1. 감정 강도 (40%): 분노, 놀람, 호기심, 공포 등 강한 감정 유발 여부
2. 시의성 (25%): 최신 뉴스일수록 가점
3. 키워드 트렌딩 (20%): 현재 트렌딩 키워드와 매칭 정도
4. 공유 가능성 (15%): "이건 꼭 봐야 해" 느낌

다음 JSON 형식으로 응답하세요:
{
  "score": 숫자,
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "keywords": ["키워드1", "키워드2"],
  "reasoning": "분석 이유"
}`

  const result = await model.generateContent(prompt)
  const response = result.response.text()

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    return JSON.parse(jsonMatch[0]) as ViralScore
  } catch {
    return {
      score: 50,
      sentiment: 'neutral',
      keywords: [],
      reasoning: '분석 실패',
    }
  }
}

export async function generateCopy(
  title: string,
  content: string,
  category: string,
  viralScore: ViralScore
): Promise<CopyResult> {
  const prompt = `당신은 인스타그램 바이럴 카피라이팅 전문가입니다. 다음 뉴스로 인스타그램 게시물을 만드세요.

제목: ${title}
내용: ${content.slice(0, 1500)}
카테고리: ${category}
감정 키워드: ${viralScore.keywords.join(', ')}

다음 규칙을 따라주세요:

[헤드라인 규칙]
- 15자 이내
- "?" 또는 "!"로 끝나기
- 분노/놀람/호기심 중 2가지 이상 포함
- 구체적 숫자나 인용 포함

[해설 규칙]
- 3줄 이내
- 헤드라인이 제기한 궁금증을 해소
- "그래서 무슨 일이?" 구조
- 감정적 어조 유지

[해시태그 규칙]
- 인기 해시태그 5개 + 니치 해시태그 3개
- 총 8개 이내

[캡션 규칙]
- 해설 + 해시태그 포함
- 이모지 적절히 사용
- 200자 이내

다음 JSON 형식으로 응답하세요:
{
  "headline": "헤드라인",
  "interpretation": "해설",
  "hashtags": ["해시태그1", "해시태그2"],
  "caption": "캡션 전체",
  "emotionalHook": "감정 훅"
}`

  const result = await model.generateContent(prompt)
  const response = result.response.text()

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    return JSON.parse(jsonMatch[0]) as CopyResult
  } catch {
    return {
      headline: title.slice(0, 15),
      interpretation: content.slice(0, 100),
      hashtags: ['#뉴스', '#속보'],
      caption: `${title}\n\n${content.slice(0, 100)}`,
      emotionalHook: '호기심',
    }
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/gemini.ts
git commit -m "feat: add Gemini AI analysis library"
```

### Task 6: 분석 API 라우트

**Files:**
- Create: `src/app/api/cron/analyze/route.ts`

- [ ] **Step 1: 분석 API 구현**

```typescript
// src/app/api/cron/analyze/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyzeViralScore } from '@/lib/gemini'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get unanalyzed news (viralScore IS NULL)
    const unanalyzedNews = await db.news.findMany({
      where: { viralScore: null },
      orderBy: { crawledAt: 'desc' },
      take: 50,
    })

    let analyzedCount = 0
    for (const news of unanalyzedNews) {
      try {
        const analysis = await analyzeViralScore(
          news.title,
          news.content,
          news.category
        )

        await db.news.update({
          where: { id: news.id },
          data: {
            viralScore: analysis.score,
            sentiment: analysis.sentiment,
            keywords: JSON.stringify(analysis.keywords),
          },
        })
        analyzedCount++
      } catch (error) {
        console.error(`Failed to analyze news ${news.id}:`, error)
      }
    }

    // Auto-select top viral news (score >= 70)
    const highViralNews = await db.news.findMany({
      where: {
        viralScore: { gte: 70 },
        isSelected: false,
        isPosted: false,
      },
      orderBy: { viralScore: 'desc' },
      take: 5,
    })

    for (const news of highViralNews) {
      await db.news.update({
        where: { id: news.id },
        data: { isSelected: true },
      })
    }

    return NextResponse.json({
      success: true,
      analyzed: analyzedCount,
      autoSelected: highViralNews.length,
    })
  } catch (error) {
    console.error('Analysis failed:', error)
    return NextResponse.json(
      { error: 'Analysis failed' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/cron/analyze/route.ts
git commit -m "feat: add viral analysis API route"
```

---

## Phase 4: 이미지 생성 파이프라인

### Task 7: HuggingFace 이미지 생성 라이브러리

**Files:**
- Create: `src/lib/huggingface.ts`
- Create: `src/lib/image-processor.ts`

- [ ] **Step 1: HuggingFace 클라이언트**

```typescript
// src/lib/huggingface.ts
import { HfInference } from '@huggingface/inference'
import { ImageResult } from '@/types'

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY || '')

export async function generateImage(
  prompt: string,
  width: number = 1080,
  height: number = 1080
): Promise<ArrayBuffer> {
  const image = await hf.textToImage({
    model: 'black-forest-labs/FLUX.1-schnell',
    inputs: prompt,
    parameters: {
      width,
      height,
      num_inference_steps: 4,
    },
  })

  return image.arrayBuffer()
}

export function buildImagePrompt(
  title: string,
  category: string,
  keywords: string[]
): string {
  const categoryPrompts: Record<string, string> = {
    politics: 'professional news broadcast style, dramatic lighting',
    entertainment: 'vibrant, eye-catching, pop culture aesthetic',
    tech: 'futuristic, digital, technology theme',
    society: 'dramatic, impactful, social commentary style',
    economy: 'financial, business, professional infographic style',
    sports: 'dynamic, energetic, sports action style',
    international: 'global, world map, international news style',
  }

  const style = categoryPrompts[category] || categoryPrompts.society
  const keywordStr = keywords.slice(0, 3).join(', ')

  return `Instagram news post background, ${style}, abstract representation of: ${title}, keywords: ${keywordStr}, high quality, 1:1 aspect ratio, clean composition, no text, professional journalism aesthetic`
}
```

- [ ] **Step 2: 이미지 프로세서 (텍스트 오버레이)**

```typescript
// src/lib/image-processor.ts
import sharp from 'sharp'

export async function overlayHeadline(
  imageBuffer: Buffer,
  headline: string
): Promise<Buffer> {
  const width = 1080
  const height = 1080

  // Create SVG text overlay
  const fontSize = 64
  const padding = 40
  const maxWidth = width - padding * 2

  // Word wrap headline
  const lines = wrapText(headline, fontSize, maxWidth)
  const lineHeight = fontSize * 1.3
  const totalTextHeight = lines.length * lineHeight

  const svgText = lines
    .map(
      (line, i) =>
        `<text x="${width / 2}" y="${padding + fontSize + i * lineHeight}" 
         font-family="Noto Sans KR, sans-serif" font-size="${fontSize}" 
         font-weight="bold" fill="white" text-anchor="middle"
         stroke="black" stroke-width="3" paint-order="stroke">${escapeXml(line)}</text>`
    )
    .join('\n')

  const svg = `<svg width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:rgba(0,0,0,0.7);stop-opacity:1" />
        <stop offset="100%" style="stop-color:rgba(0,0,0,0);stop-opacity:0" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${totalTextHeight + padding * 2}" fill="url(#bg)" />
    ${svgText}
  </svg>`

  const textBuffer = Buffer.from(svg)

  const result = await sharp(imageBuffer)
    .resize(width, height, { fit: 'cover' })
    .composite([{ input: textBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer()

  return result
}

function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.6))
  const lines: string[] = []
  let currentLine = ''

  for (const char of text) {
    currentLine += char
    if (currentLine.length >= charsPerLine) {
      lines.push(currentLine)
      currentLine = ''
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/huggingface.ts src/lib/image-processor.ts
git commit -m "feat: add HuggingFace image generation and text overlay"
```

### Task 8: 이미지 생성 API 라우트

**Files:**
- Create: `src/app/api/cron/generate/route.ts`

- [ ] **Step 1: 이미지 생성 API**

```typescript
// src/app/api/cron/generate/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateCopy } from '@/lib/gemini'
import { generateImage, buildImagePrompt } from '@/lib/huggingface'
import { overlayHeadline } from '@/lib/image-processor'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get selected news without copies
    const newsNeedingCopies = await db.news.findMany({
      where: {
        isSelected: true,
        copies: { none: {} },
      },
      orderBy: { viralScore: 'desc' },
      take: 3,
    })

    let generatedCount = 0

    for (const news of newsNeedingCopies) {
      try {
        // 1. Generate copy
        const keywords = news.keywords ? JSON.parse(news.keywords) : []
        const viralScore = {
          score: news.viralScore || 50,
          sentiment: news.sentiment || 'neutral',
          keywords,
          reasoning: '',
        }

        const copy = await generateCopy(
          news.title,
          news.content,
          news.category,
          viralScore
        )

        // 2. Save copy
        const savedCopy = await db.copy.create({
          data: {
            newsId: news.id,
            headline: copy.headline,
            interpretation: copy.interpretation,
            hashtags: JSON.stringify(copy.hashtags),
            caption: copy.caption,
            emotionalHook: copy.emotionalHook,
            viralScore: news.viralScore,
          },
        })

        // 3. Generate image
        const imagePrompt = buildImagePrompt(
          news.title,
          news.category,
          keywords
        )
        const rawImage = await generateImage(imagePrompt)
        const imageBuffer = Buffer.from(rawImage)

        // 4. Overlay headline text
        const finalImage = await overlayHeadline(imageBuffer, copy.headline)

        // 5. Save image
        const imageDir = join(process.cwd(), 'public', 'images')
        await mkdir(imageDir, { recursive: true })
        const imageName = `${news.id}-${Date.now()}.jpg`
        const imagePath = join(imageDir, imageName)
        await writeFile(imagePath, finalImage)

        // 6. Save to database
        await db.image.create({
          data: {
            newsId: news.id,
            copyId: savedCopy.id,
            imageUrl: `/images/${imageName}`,
            headlineText: copy.headline,
            style: 'news',
            hfModel: 'FLUX.1-schnell',
            prompt: imagePrompt,
          },
        })

        generatedCount++
      } catch (error) {
        console.error(`Failed to generate for news ${news.id}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      generated: generatedCount,
    })
  } catch (error) {
    console.error('Generation failed:', error)
    return NextResponse.json(
      { error: 'Generation failed' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/cron/generate/route.ts
git commit -m "feat: add image generation API route"
```

---

## Phase 5: 인스타그램 연동

### Task 9: Instagram 라이브러리

**Files:**
- Create: `src/lib/instagram.ts`

- [ ] **Step 1: Instagram Graph API 클라이언트**

```typescript
// src/lib/instagram.ts
const INSTAGRAM_API_BASE = 'https://graph.facebook.com/v18.0'

interface InstagramPostResult {
  id: string
  success: boolean
  error?: string
}

interface InstagramInsights {
  likes: number
  comments: number
  saves: number
  shares: number
  reach: number
  impressions: number
}

export async function publishToInstagram(
  imageUrl: string,
  caption: string
): Promise<InstagramPostResult> {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN

  if (!accountId || !accessToken) {
    return { id: '', success: false, error: 'Instagram not configured' }
  }

  try {
    // 1. Create media container
    const fullImageUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${imageUrl}`

    const containerResponse = await fetch(
      `${INSTAGRAM_API_BASE}/${accountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: fullImageUrl,
          caption: caption,
          access_token: accessToken,
        }),
      }
    )

    const containerData = await containerResponse.json()
    if (containerData.error) {
      return { id: '', success: false, error: containerData.error.message }
    }

    // 2. Publish container
    const publishResponse = await fetch(
      `${INSTAGRAM_API_BASE}/${accountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerData.id,
          access_token: accessToken,
        }),
      }
    )

    const publishData = await publishResponse.json()
    if (publishData.error) {
      return { id: '', success: false, error: publishData.error.message }
    }

    return { id: publishData.id, success: true }
  } catch (error) {
    return {
      id: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getPostInsights(
  mediaId: string
): Promise<InstagramInsights | null> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!accessToken) return null

  try {
    const metrics = 'likes,comments,saves,shares,reach,impressions'
    const response = await fetch(
      `${INSTAGRAM_API_BASE}/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`
    )

    const data = await response.json()
    if (data.error) return null

    const insights: InstagramInsights = {
      likes: 0,
      comments: 0,
      saves: 0,
      shares: 0,
      reach: 0,
      impressions: 0,
    }

    for (const item of data.data || []) {
      const value = item.values?.[0]?.value || 0
      switch (item.name) {
        case 'likes':
          insights.likes = value
          break
        case 'comments':
          insights.comments = value
          break
        case 'saves':
          insights.saves = value
          break
        case 'shares':
          insights.shares = value
          break
        case 'reach':
          insights.reach = value
          break
        case 'impressions':
          insights.impressions = value
          break
      }
    }

    return insights
  } catch {
    return null
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/instagram.ts
git commit -m "feat: add Instagram Graph API client"
```

### Task 10: 포스팅 API 라우트

**Files:**
- Create: `src/app/api/cron/post/route.ts`
- Create: `src/app/api/post/[id]/route.ts`

- [ ] **Step 1: 자동 포스팅 Cron**

```typescript
// src/app/api/cron/post/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { publishToInstagram } from '@/lib/instagram'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get scheduled posts for today
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    const scheduledPosts = await db.post.findMany({
      where: {
        status: 'scheduled',
        scheduledFor: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
      include: { image: true },
      take: 1, // 1일 1포스팅
    })

    let postedCount = 0

    for (const post of scheduledPosts) {
      try {
        const result = await publishToInstagram(
          post.image.imageUrl,
          `${post.caption}\n\n${post.hashtags}`
        )

        if (result.success) {
          await db.post.update({
            where: { id: post.id },
            data: {
              status: 'posted',
              instagramMediaId: result.id,
              postedAt: new Date(),
            },
          })
          await db.news.update({
            where: { id: post.newsId },
            data: { isPosted: true },
          })
          postedCount++
        } else {
          await db.post.update({
            where: { id: post.id },
            data: {
              status: 'failed',
              errorMessage: result.error,
              retryCount: { increment: 1 },
            },
          })
        }
      } catch (error) {
        console.error(`Failed to post ${post.id}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      posted: postedCount,
    })
  } catch (error) {
    console.error('Post cron failed:', error)
    return NextResponse.json(
      { error: 'Post cron failed' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: 수동 포스팅 API**

```typescript
// src/app/api/post/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { publishToInstagram } from '@/lib/instagram'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const post = await db.post.findUnique({
      where: { id: params.id },
      include: { image: true, copy: true },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    if (post.status === 'posted') {
      return NextResponse.json({ error: 'Already posted' }, { status: 400 })
    }

    const result = await publishToInstagram(
      post.image.imageUrl,
      `${post.caption}\n\n${post.hashtags}`
    )

    if (result.success) {
      await db.post.update({
        where: { id: params.id },
        data: {
          status: 'posted',
          instagramMediaId: result.id,
          postedAt: new Date(),
        },
      })
      return NextResponse.json({ success: true, mediaId: result.id })
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Post failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await db.post.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Delete failed' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/cron/post/route.ts src/app/api/post/[id]/route.ts
git commit -m "feat: add posting API routes (auto + manual)"
```

---

## Phase 6: 인사이트 수집

### Task 11: 분석 수집 API

**Files:**
- Create: `src/lib/analytics.ts`
- Create: `src/app/api/cron/analytics/route.ts`
- Create: `src/app/api/analytics/route.ts`

- [ ] **Step 1: 분석 라이브러리**

```typescript
// src/lib/analytics.ts
import { db } from '@/lib/db'
import { getPostInsights } from '@/lib/instagram'

export async function collectInsights(): Promise<number> {
  const postedWithoutAnalytics = await db.post.findMany({
    where: {
      status: 'posted',
      analytics: { none: {} },
      postedAt: { not: null },
    },
    take: 10,
  })

  let collected = 0

  for (const post of postedWithoutAnalytics) {
    if (!post.instagramMediaId || !post.postedAt) continue

    const insights = await getPostInsights(post.instagramMediaId)
    if (!insights) continue

    const hoursPosted = Math.floor(
      (Date.now() - post.postedAt.getTime()) / (1000 * 60 * 60)
    )

    let period = '24h'
    if (hoursPosted > 48) period = '7d'
    else if (hoursPosted > 24) period = '48h'

    const engagementRate =
      insights.reach > 0
        ? ((insights.likes + insights.comments + insights.saves) / insights.reach) * 100
        : 0

    await db.analytics.create({
      data: {
        postId: post.id,
        newsId: post.newsId,
        likes: insights.likes,
        comments: insights.comments,
        saves: insights.saves,
        shares: insights.shares,
        reach: insights.reach,
        impressions: insights.impressions,
        engagementRate,
        period,
      },
    })

    collected++
  }

  return collected
}
```

- [ ] **Step 2: 분석 Cron API**

```typescript
// src/app/api/cron/analytics/route.ts
import { NextResponse } from 'next/server'
import { collectInsights } from '@/lib/analytics'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const collected = await collectInsights()
    return NextResponse.json({ success: true, collected })
  } catch (error) {
    console.error('Analytics collection failed:', error)
    return NextResponse.json(
      { error: 'Analytics collection failed' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: 분석 조회 API**

```typescript
// src/app/api/analytics/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '7d'

    const dateThreshold = new Date()
    switch (period) {
      case '24h':
        dateThreshold.setHours(dateThreshold.getHours() - 24)
        break
      case '7d':
        dateThreshold.setDate(dateThreshold.getDate() - 7)
        break
      case '30d':
        dateThreshold.setDate(dateThreshold.getDate() - 30)
        break
    }

    const analytics = await db.analytics.findMany({
      where: { collectedAt: { gte: dateThreshold } },
      include: {
        post: {
          include: { copy: true, image: true },
        },
      },
      orderBy: { collectedAt: 'desc' },
    })

    // Calculate summary
    const summary = {
      totalPosts: analytics.length,
      totalLikes: analytics.reduce((sum, a) => sum + a.likes, 0),
      totalComments: analytics.reduce((sum, a) => sum + a.comments, 0),
      totalSaves: analytics.reduce((sum, a) => sum + a.saves, 0),
      totalReach: analytics.reduce((sum, a) => sum + a.reach, 0),
      avgEngagementRate:
        analytics.length > 0
          ? analytics.reduce((sum, a) => sum + (a.engagementRate || 0), 0) /
            analytics.length
          : 0,
    }

    return NextResponse.json({ summary, details: analytics })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: 커밋**

```bash
git add src/lib/analytics.ts src/app/api/cron/analytics/route.ts src/app/api/analytics/route.ts
git commit -m "feat: add analytics collection and reporting"
```

---

## Phase 7: 대시보드 UI

### Task 12: 레이아웃 + 공통 컴포넌트

**Files:**
- Create: `src/components/layout/sidebar.tsx`
- Create: `src/components/layout/header.tsx`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/badge.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: 사이드바 컴포넌트**

```tsx
// src/components/layout/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Calendar, BarChart3, Users, Settings } from 'lucide-react'

const navItems = [
  { href: '/', label: '뉴스 큐', icon: LayoutDashboard },
  { href: '/schedule', label: '포스팅 스케줄', icon: Calendar },
  { href: '/analytics', label: '성과 대시보드', icon: BarChart3 },
  { href: '/competitors', label: '경쟁 계정', icon: Users },
  { href: '/settings', label: '설정', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold">NewsViral</h1>
        <p className="text-sm text-gray-400">인스타 뉴스 자동화</p>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: 헤더 컴포넌트**

```tsx
// src/components/layout/header.tsx
'use client'

import { RefreshCw, Zap } from 'lucide-react'
import { useState } from 'react'

export function Header() {
  const [loading, setLoading] = useState(false)

  const triggerCrawl = async () => {
    setLoading(true)
    try {
      await fetch('/api/cron/crawl', {
        headers: { authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}` },
      })
      alert('크롤링 완료!')
    } catch {
      alert('크롤링 실패')
    }
    setLoading(false)
  }

  return (
    <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-white">대시보드</h2>
      <div className="flex items-center gap-3">
        <button
          onClick={triggerCrawl}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          <span>지금 크롤링</span>
        </button>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: 공통 UI 컴포넌트**

```tsx
// src/components/ui/button.tsx
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50'
    const variants = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700',
      secondary: 'bg-gray-700 text-gray-200 hover:bg-gray-600',
      danger: 'bg-red-600 text-white hover:bg-red-700',
    }
    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    }

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
```

```tsx
// src/components/ui/card.tsx
import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`bg-gray-800 rounded-xl border border-gray-700 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className = '', children, ...props }: CardProps) {
  return (
    <div className={`p-4 border-b border-gray-700 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardContent({ className = '', children, ...props }: CardProps) {
  return (
    <div className={`p-4 ${className}`} {...props}>
      {children}
    </div>
  )
}
```

```tsx
// src/components/ui/badge.tsx
interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger'
  children: React.ReactNode
}

export function Badge({ variant = 'default', children }: BadgeProps) {
  const variants = {
    default: 'bg-gray-700 text-gray-300',
    success: 'bg-green-900 text-green-300',
    warning: 'bg-yellow-900 text-yellow-300',
    danger: 'bg-red-900 text-red-300',
  }

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${variants[variant]}`}>
      {children}
    </span>
  )
}
```

- [ ] **Step 4: 레이아웃 업데이트**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'NewsViral - 인스타 뉴스 자동화',
  description: '뉴스를 크롤링하고, 바이럴 뉴스를 선별하여, 인스타그램에 자동 포스팅하는 SaaS',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className="dark">
      <body className={`${inter.className} bg-gray-950 text-white`}>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/ src/app/layout.tsx
git commit -m "feat: add dashboard layout and UI components"
```

### Task 13: 뉴스 큐 페이지

**Files:**
- Create: `src/components/news/news-list.tsx`
- Create: `src/components/news/news-card.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 뉴스 카드 컴포넌트**

```tsx
// src/components/news/news-card.tsx
'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, Sparkles, Check } from 'lucide-react'

interface NewsItem {
  id: string
  title: string
  summary: string
  source: string
  sourceUrl: string
  category: string
  viralScore: number | null
  isSelected: boolean
  publishedAt: string
}

interface NewsCardProps {
  news: NewsItem
  onSelect: (id: string) => void
}

export function NewsCard({ news, onSelect }: NewsCardProps) {
  const scoreColor =
    (news.viralScore || 0) >= 70
      ? 'text-green-400'
      : (news.viralScore || 0) >= 50
      ? 'text-yellow-400'
      : 'text-red-400'

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge>{news.category}</Badge>
            <span className="text-xs text-gray-500">{news.source}</span>
            {news.viralScore !== null && (
              <span className={`text-sm font-bold ${scoreColor}`}>
                <Sparkles className="w-3 h-3 inline mr-1" />
                {news.viralScore}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-white mb-1 line-clamp-2">
            {news.title}
          </h3>
          <p className="text-sm text-gray-400 line-clamp-2">{news.summary}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant={news.isSelected ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => onSelect(news.id)}
          >
            {news.isSelected ? (
              <Check className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </Button>
          <a href={news.sourceUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              <ExternalLink className="w-4 h-4" />
            </Button>
          </a>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 뉴스 목록 컴포넌트**

```tsx
// src/components/news/news-list.tsx
'use client'

import { useState, useEffect } from 'react'
import { NewsCard } from './news-card'

interface NewsItem {
  id: string
  title: string
  summary: string
  source: string
  sourceUrl: string
  category: string
  viralScore: number | null
  isSelected: boolean
  publishedAt: string
}

export function NewsList() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'selected'>('all')

  useEffect(() => {
    fetchNews()
  }, [])

  const fetchNews = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/news')
      const data = await res.json()
      setNews(data)
    } catch (error) {
      console.error('Failed to fetch news:', error)
    }
    setLoading(false)
  }

  const handleSelect = async (id: string) => {
    const item = news.find((n) => n.id === id)
    if (!item) return

    try {
      await fetch(`/api/news/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSelected: !item.isSelected }),
      })
      setNews(
        news.map((n) =>
          n.id === id ? { ...n, isSelected: !n.isSelected } : n
        )
      )
    } catch (error) {
      console.error('Failed to select news:', error)
    }
  }

  const filteredNews =
    filter === 'selected' ? news.filter((n) => n.isSelected) : news

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 text-sm rounded-lg ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          전체 ({news.length})
        </button>
        <button
          onClick={() => setFilter('selected')}
          className={`px-3 py-1.5 text-sm rounded-lg ${
            filter === 'selected'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          선별됨 ({news.filter((n) => n.isSelected).length})
        </button>
      </div>
      <div className="space-y-3">
        {filteredNews.map((item) => (
          <NewsCard key={item.id} news={item} onSelect={handleSelect} />
        ))}
        {filteredNews.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            뉴스가 없습니다. 크롤링을 실행해주세요.
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 메인 페이지**

```tsx
// src/app/page.tsx
import { NewsList } from '@/components/news/news-list'

export default function HomePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">오늘의 뉴스 큐</h1>
        <p className="text-gray-400 mt-1">
          바이럴 가능성이 높은 뉴스를 선별하세요
        </p>
      </div>
      <NewsList />
    </div>
  )
}
```

- [ ] **Step 4: 뉴스 API 라우트**

```typescript
// src/app/api/news/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const news = await db.news.findUnique({
      where: { id: params.id },
      include: { copies: true, images: true, posts: true },
    })
    if (!news) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(news)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const news = await db.news.update({
      where: { id: params.id },
      data: body,
    })
    return NextResponse.json(news)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
```

- [ ] **Step 5: 뉴스 목록 API**

```typescript
// src/app/api/news/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const selected = searchParams.get('selected')

    const where = selected === 'true' ? { isSelected: true } : {}

    const news = await db.news.findMany({
      where,
      orderBy: [
        { viralScore: 'desc' },
        { crawledAt: 'desc' },
      ],
      take: 100,
    })

    return NextResponse.json(news)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
```

- [ ] **Step 6: 커밋**

```bash
git add src/components/news/ src/app/page.tsx src/app/api/news/
git commit -m "feat: add news queue page with selection UI"
```

### Task 14: 카피/이미지 편집기 페이지

**Files:**
- Create: `src/components/editor/copy-editor.tsx`
- Create: `src/components/editor/image-preview.tsx`
- Modify: `src/app/editor/[id]/page.tsx`

- [ ] **Step 1: 카피 에디터**

```tsx
// src/components/editor/copy-editor.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Save, RefreshCw, Send } from 'lucide-react'

interface CopyData {
  id: string
  headline: string
  interpretation: string
  hashtags: string
  caption: string
  emotionalHook: string | null
  isApproved: boolean
}

interface CopyEditorProps {
  copy: CopyData
  newsId: string
  onSave: (copy: CopyData) => void
  onPost: () => void
}

export function CopyEditor({ copy, newsId, onSave, onPost }: CopyEditorProps) {
  const [data, setData] = useState(copy)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/copy/${copy.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const updated = await res.json()
        onSave(updated)
      }
    } catch (error) {
      console.error('Save failed:', error)
    }
    setSaving(false)
  }

  const handleRegenerate = async () => {
    try {
      const res = await fetch(`/api/copy/${copy.id}/regenerate`, {
        method: 'POST',
      })
      if (res.ok) {
        const updated = await res.json()
        setData(updated)
        onSave(updated)
      }
    } catch (error) {
      console.error('Regenerate failed:', error)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          헤드라인 (이미지용)
        </label>
        <input
          type="text"
          value={data.headline}
          onChange={(e) => setData({ ...data, headline: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
          maxLength={15}
        />
        <p className="text-xs text-gray-500 mt-1">{data.headline.length}/15자</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          해설 (궁금증 해소)
        </label>
        <textarea
          value={data.interpretation}
          onChange={(e) => setData({ ...data, interpretation: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          해시태그
        </label>
        <input
          type="text"
          value={data.hashtags}
          onChange={(e) => setData({ ...data, hashtags: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          캡션 (전체 본문)
        </label>
        <textarea
          value={data.caption}
          onChange={(e) => setData({ ...data, caption: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
          rows={5}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? '저장 중...' : '저장'}
        </Button>
        <Button variant="secondary" onClick={handleRegenerate}>
          <RefreshCw className="w-4 h-4 mr-2" />
          재생성
        </Button>
        <Button onClick={onPost}>
          <Send className="w-4 h-4 mr-2" />
          포스팅 예약
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 이미지 프리뷰**

```tsx
// src/components/editor/image-preview.tsx
'use client'

import { Button } from '@/components/ui/button'
import { RefreshCw, Download } from 'lucide-react'

interface ImagePreviewProps {
  imageUrl: string
  headline: string
  onRegenerate: () => void
}

export function ImagePreview({ imageUrl, headline, onRegenerate }: ImagePreviewProps) {
  return (
    <div className="space-y-4">
      <div className="relative aspect-square bg-gray-700 rounded-xl overflow-hidden">
        <img
          src={imageUrl}
          alt={headline}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-transparent" />
        <div className="absolute top-0 left-0 right-0 p-6">
          <h2 className="text-2xl font-bold text-white text-center drop-shadow-lg">
            {headline}
          </h2>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onRegenerate}>
          <RefreshCw className="w-4 h-4 mr-2" />
          이미지 재생성
        </Button>
        <a href={imageUrl} download>
          <Button variant="secondary">
            <Download className="w-4 h-4 mr-2" />
            다운로드
          </Button>
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 편집기 페이지**

```tsx
// src/app/editor/[id]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CopyEditor } from '@/components/editor/copy-editor'
import { ImagePreview } from '@/components/editor/image-preview'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface NewsDetail {
  id: string
  title: string
  content: string
  category: string
  viralScore: number | null
  copies: Array<{
    id: string
    headline: string
    interpretation: string
    hashtags: string
    caption: string
    emotionalHook: string | null
    isApproved: boolean
  }>
  images: Array<{
    id: string
    imageUrl: string
    headlineText: string
  }>
}

export default function EditorPage() {
  const params = useParams()
  const router = useRouter()
  const [news, setNews] = useState<NewsDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchNews()
  }, [params.id])

  const fetchNews = async () => {
    try {
      const res = await fetch(`/api/news/${params.id}`)
      const data = await res.json()
      setNews(data)
    } catch (error) {
      console.error('Failed to fetch news:', error)
    }
    setLoading(false)
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-8">로딩 중...</div>
  }

  if (!news) {
    return <div className="text-center text-gray-400 py-8">뉴스를 찾을 수 없습니다.</div>
  }

  const copy = news.copies[0]
  const image = news.images[0]

  return (
    <div>
      <Button
        variant="secondary"
        onClick={() => router.back()}
        className="mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        뒤로
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{news.title}</h1>
        <p className="text-gray-400 mt-1">
          카테고리: {news.category} | 바이럴 점수: {news.viralScore}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">카피라이팅</h2>
          {copy ? (
            <CopyEditor
              copy={copy}
              newsId={news.id}
              onSave={(updated) => {
                setNews({
                  ...news,
                  copies: [{ ...copy, ...updated }],
                })
              }}
              onPost={() => {
                alert('포스팅이 예약되었습니다!')
                router.push('/schedule')
              }}
            />
          ) : (
            <div className="text-center text-gray-500 py-8">
              카피가 아직 생성되지 않았습니다.
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-4">이미지</h2>
          {image ? (
            <ImagePreview
              imageUrl={image.imageUrl}
              headline={copy?.headline || news.title}
              onRegenerate={() => {
                alert('이미지 재생성 요청이 전송되었습니다.')
              }}
            />
          ) : (
            <div className="text-center text-gray-500 py-8">
              이미지가 아직 생성되지 않았습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 카피 API 라우트**

```typescript
// src/app/api/copy/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const copy = await db.copy.update({
      where: { id: params.id },
      data: body,
    })
    return NextResponse.json(copy)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const copy = await db.copy.findUnique({
      where: { id: params.id },
      include: { news: true },
    })
    if (!copy) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Regenerate copy with Gemini
    const { generateCopy } = await import('@/lib/gemini')
    const { viralScore } = copy.news

    const newCopy = await generateCopy(
      copy.news.title,
      copy.news.content,
      copy.news.category,
      {
        score: viralScore || 50,
        sentiment: copy.news.sentiment || 'neutral',
        keywords: copy.news.keywords ? JSON.parse(copy.news.keywords) : [],
        reasoning: '',
      }
    )

    const updated = await db.copy.update({
      where: { id: params.id },
      data: {
        headline: newCopy.headline,
        interpretation: newCopy.interpretation,
        hashtags: JSON.stringify(newCopy.hashtags),
        caption: newCopy.caption,
        emotionalHook: newCopy.emotionalHook,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/editor/ src/app/editor/ src/app/api/copy/
git commit -m "feat: add copy/image editor page"
```

### Task 15: 포스팅 스케줄 페이지

**Files:**
- Create: `src/app/schedule/page.tsx`

- [ ] **Step 1: 스케줄 페이지**

```tsx
// src/app/schedule/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, Clock, Trash2, Send } from 'lucide-react'

interface ScheduledPost {
  id: string
  status: string
  scheduledFor: string | null
  postedAt: string | null
  caption: string
  hashtags: string
  errorMessage: string | null
  news: { title: string; category: string }
  image: { imageUrl: string; headlineText: string }
  copy: { headline: string }
}

export default function SchedulePage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPosts()
  }, [])

  const fetchPosts = async () => {
    try {
      const res = await fetch('/api/post?status=all')
      const data = await res.json()
      setPosts(data)
    } catch (error) {
      console.error('Failed to fetch posts:', error)
    }
    setLoading(false)
  }

  const handlePublish = async (id: string) => {
    try {
      const res = await fetch(`/api/post/${id}`, { method: 'POST' })
      if (res.ok) {
        alert('포스팅 완료!')
        fetchPosts()
      } else {
        const data = await res.json()
        alert(`포스팅 실패: ${data.error}`)
      }
    } catch (error) {
      alert('포스팅 실패')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 게시물을 삭제하시겠습니까?')) return
    try {
      await fetch(`/api/post/${id}`, { method: 'DELETE' })
      fetchPosts()
    } catch (error) {
      alert('삭제 실패')
    }
  }

  const statusColors: Record<string, string> = {
    draft: 'default',
    scheduled: 'warning',
    posted: 'success',
    failed: 'danger',
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-8">로딩 중...</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">포스팅 스케줄</h1>
      <div className="space-y-4">
        {posts.map((post) => (
          <Card key={post.id}>
            <CardContent className="flex items-center gap-4">
              <img
                src={post.image.imageUrl}
                alt={post.copy.headline}
                className="w-20 h-20 object-cover rounded-lg"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={statusColors[post.status] as any}>
                    {post.status}
                  </Badge>
                  <span className="text-xs text-gray-500">
                    {post.news.category}
                  </span>
                </div>
                <h3 className="font-semibold text-white truncate">
                  {post.copy.headline}
                </h3>
                <p className="text-sm text-gray-400 truncate">
                  {post.news.title}
                </p>
                {post.scheduledFor && (
                  <p className="text-xs text-gray-500 mt-1">
                    <Clock className="w-3 h-3 inline mr-1" />
                    예약: {new Date(post.scheduledFor).toLocaleString('ko-KR')}
                  </p>
                )}
                {post.postedAt && (
                  <p className="text-xs text-green-400 mt-1">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    포스팅: {new Date(post.postedAt).toLocaleString('ko-KR')}
                  </p>
                )}
                {post.errorMessage && (
                  <p className="text-xs text-red-400 mt-1">
                    에러: {post.errorMessage}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {post.status !== 'posted' && (
                  <Button
                    size="sm"
                    onClick={() => handlePublish(post.id)}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(post.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {posts.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            예약된 게시물이 없습니다.
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 포스팅 목록 API**

```typescript
// src/app/api/post/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where = status && status !== 'all' ? { status } : {}

    const posts = await db.post.findMany({
      where,
      include: {
        news: { select: { title: true, category: true } },
        image: { select: { imageUrl: true, headlineText: true } },
        copy: { select: { headline: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(posts)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const post = await db.post.create({
      data: {
        newsId: body.newsId,
        copyId: body.copyId,
        imageId: body.imageId,
        caption: body.caption,
        hashtags: body.hashtags,
        scheduledFor: body.scheduledFor
          ? new Date(body.scheduledFor)
          : new Date(),
        status: 'scheduled',
      },
    })
    return NextResponse.json(post)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/schedule/ src/app/api/post/route.ts
git commit -m "feat: add posting schedule page"
```

### Task 16: 성과 대시보드 페이지

**Files:**
- Create: `src/components/analytics/charts.tsx`
- Create: `src/components/analytics/stats-cards.tsx`
- Modify: `src/app/analytics/page.tsx`

- [ ] **Step 1: 통계 카드**

```tsx
// src/components/analytics/stats-cards.tsx
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Heart, MessageCircle, Bookmark, Eye } from 'lucide-react'

interface Stats {
  totalPosts: number
  totalLikes: number
  totalComments: number
  totalSaves: number
  totalReach: number
  avgEngagementRate: number
}

interface StatsCardsProps {
  stats: Stats
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    { label: '총 게시물', value: stats.totalPosts, icon: Eye },
    { label: '총 좋아요', value: stats.totalLikes, icon: Heart },
    { label: '총 댓글', value: stats.totalComments, icon: MessageCircle },
    { label: '총 저장', value: stats.totalSaves, icon: Bookmark },
    { label: '총 도달', value: stats.totalReach.toLocaleString(), icon: Eye },
    {
      label: '평균 참여율',
      value: `${stats.avgEngagementRate.toFixed(1)}%`,
      icon: Heart,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-400 mb-2">
              <card.icon className="w-4 h-4" />
              <span className="text-sm">{card.label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 차트 컴포넌트**

```tsx
// src/components/analytics/charts.tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

interface ChartData {
  date: string
  likes: number
  comments: number
  saves: number
  engagementRate: number
}

interface ChartsProps {
  data: ChartData[]
}

export function EngagementChart({ data }: ChartsProps) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
      <h3 className="text-lg font-semibold text-white mb-4">참여율 추이</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" stroke="#9CA3AF" />
          <YAxis stroke="#9CA3AF" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
            labelStyle={{ color: '#F3F4F6' }}
          />
          <Line type="monotone" dataKey="engagementRate" stroke="#3B82F6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function InteractionsChart({ data }: ChartsProps) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
      <h3 className="text-lg font-semibold text-white mb-4">상호작용 분석</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" stroke="#9CA3AF" />
          <YAxis stroke="#9CA3AF" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
            labelStyle={{ color: '#F3F4F6' }}
          />
          <Bar dataKey="likes" fill="#EF4444" />
          <Bar dataKey="comments" fill="#3B82F6" />
          <Bar dataKey="saves" fill="#10B981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: 분석 페이지**

```tsx
// src/app/analytics/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { StatsCards } from '@/components/analytics/stats-cards'
import { EngagementChart, InteractionsChart } from '@/components/analytics/charts'

interface AnalyticsData {
  summary: {
    totalPosts: number
    totalLikes: number
    totalComments: number
    totalSaves: number
    totalReach: number
    avgEngagementRate: number
  }
  details: Array<{
    likes: number
    comments: number
    saves: number
    engagementRate: number | null
    collectedAt: string
    post: {
      copy: { headline: string }
      image: { imageUrl: string }
    }
  }>
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [period, setPeriod] = useState('7d')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [period])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics?period=${period}`)
      const result = await res.json()
      setData(result)
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    }
    setLoading(false)
  }

  if (loading || !data) {
    return <div className="text-center text-gray-400 py-8">로딩 중...</div>
  }

  const chartData = data.details.map((d) => ({
    date: new Date(d.collectedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
    likes: d.likes,
    comments: d.comments,
    saves: d.saves,
    engagementRate: d.engagementRate || 0,
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">성과 대시보드</h1>
        <div className="flex gap-2">
          {['24h', '7d', '30d'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded-lg ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <StatsCards stats={data.summary} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <EngagementChart data={chartData} />
        <InteractionsChart data={chartData} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 커밋**

```bash
git add src/components/analytics/ src/app/analytics/
git commit -m "feat: add analytics dashboard with charts"
```

### Task 17: 설정 페이지

**Files:**
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: 설정 페이지**

```tsx
// src/app/settings/page.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Save, RefreshCw } from 'lucide-react'

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    autoPost: true,
    postTime: '14:00',
    crawlFrequency: '2',
    selectedCategories: ['society', 'politics', 'entertainment', 'tech'],
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      alert('설정이 저장되었습니다!')
    } catch (error) {
      alert('저장 실패')
    }
    setSaving(false)
  }

  const categories = [
    { id: 'society', label: '사회' },
    { id: 'politics', label: '정치' },
    { id: 'entertainment', label: '연예' },
    { id: 'tech', label: 'IT/테크' },
    { id: 'economy', label: '경제' },
    { id: 'sports', label: '스포츠' },
    { id: 'international', label: '국제' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">설정</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">자동화 설정</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white">자동 포스팅</p>
                <p className="text-sm text-gray-400">
                  매일 자동으로 인스타그램에 포스팅합니다
                </p>
              </div>
              <button
                onClick={() =>
                  setSettings({ ...settings, autoPost: !settings.autoPost })
                }
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.autoPost ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transform transition-transform ${
                    settings.autoPost ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                포스팅 시간
              </label>
              <input
                type="time"
                value={settings.postTime}
                onChange={(e) =>
                  setSettings({ ...settings, postTime: e.target.value })
                }
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                크롤링 주기 (시간)
              </label>
              <select
                value={settings.crawlFrequency}
                onChange={(e) =>
                  setSettings({ ...settings, crawlFrequency: e.target.value })
                }
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              >
                <option value="1">1시간</option>
                <option value="2">2시간</option>
                <option value="4">4시간</option>
                <option value="6">6시간</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">카테고리 선택</h2>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    const selected = settings.selectedCategories.includes(cat.id)
                      ? settings.selectedCategories.filter((c) => c !== cat.id)
                      : [...settings.selectedCategories, cat.id]
                    setSettings({ ...settings, selectedCategories: selected })
                  }}
                  className={`px-3 py-1.5 text-sm rounded-lg ${
                    settings.selectedCategories.includes(cat.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">API 설정</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Google AI API Key
              </label>
              <input
                type="password"
                placeholder="AIza..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                HuggingFace API Key
              </label>
              <input
                type="password"
                placeholder="hf_..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Instagram Access Token
              </label>
              <input
                type="password"
                placeholder="IGQV..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? '저장 중...' : '설정 저장'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 설정 API**

```typescript
// src/app/api/settings/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const settings = await db.settings.findMany()
    const settingsMap = settings.reduce((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {} as Record<string, string>)
    return NextResponse.json(settingsMap)
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()

    for (const [key, value] of Object.entries(body)) {
      await db.settings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/settings/ src/app/api/settings/
git commit -m "feat: add settings page"
```

---

## Phase 8: Vercel 배포 설정

### Task 18: Vercel 설정

**Files:**
- Create: `vercel.json`
- Modify: `next.config.js`

- [ ] **Step 1: Vercel 설정**

```json
{
  "crons": [
    {
      "path": "/api/cron/crawl",
      "schedule": "0 9,15 * * *"
    },
    {
      "path": "/api/cron/analyze",
      "schedule": "30 9,15 * * *"
    },
    {
      "path": "/api/cron/generate",
      "schedule": "0 10,16 * * *"
    },
    {
      "path": "/api/cron/post",
      "schedule": "0 14 * * *"
    },
    {
      "path": "/api/cron/analytics",
      "schedule": "0 16 * * *"
    }
  ]
}
```

- [ ] **Step 2: Next.js 설정 업데이트**

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  experimental: {
    serverActions: true,
  },
}

module.exports = nextConfig
```

- [ ] **Step 3: 커밋**

```bash
git add vercel.json next.config.js
git commit -m "feat: add Vercel deployment config with cron jobs"
```

---

## 최종 검증

### Task 19: 빌드 테스트 + 최종 커밋

- [ ] **Step 1: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: 빌드 테스트**

```bash
npm run build
```

- [ ] **Step 3: 로컬 실행 테스트**

```bash
npm run dev
```

- [ ] **Step 4: Prisma DB 생성 확인**

```bash
npx prisma db push
```

- [ ] **Step 5: 최종 커밋**

```bash
git add .
git commit -m "feat: complete Instagram News Viral SaaS MVP"
```

---

## 구현 순서 요약

| Phase | Task | 설명 | 예상 시간 |
|-------|------|------|----------|
| 1 | 1-2 | 프로젝트 셋업 + DB | 15분 |
| 2 | 3-4 | 크롤링 시스템 | 20분 |
| 3 | 5-6 | AI 분석 시스템 | 20분 |
| 4 | 7-8 | 이미지 생성 파이프라인 | 25분 |
| 5 | 9-10 | 인스타그램 연동 | 20분 |
| 6 | 11 | 인사이트 수집 | 15분 |
| 7 | 12-17 | 대시보드 UI | 60분 |
| 8 | 18 | Vercel 배포 | 10분 |
| 9 | 19 | 최종 검증 | 15분 |
| **합계** | | | **약 3시간** |
