import { createClient } from '@libsql/client'
import path from 'path'

const isVercel = !!process.env.VERCEL

const dbUrl = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

const client = dbUrl
  ? createClient({ url: dbUrl, authToken })
  : createClient({ url: `file:${path.resolve(process.cwd(), 'dev.db')}` })

export const db = client

export async function queryOne(sql: string, args: (string | number | null)[] = []) {
  // libsql는 undefined 바인딩을 거부하므로 null로 정규화
  const safeArgs = (args || []).map(a => (a === undefined ? null : a))
  const result = await client.execute({ sql, args: safeArgs as any })
  return result.rows[0] || null
}

export async function queryAll(sql: string, args: (string | number | null)[] = []) {
  const safeArgs = (args || []).map(a => (a === undefined ? null : a))
  const result = await client.execute({ sql, args: safeArgs as any })
  return result.rows
}

export async function execute(sql: string, args: (string | number | null)[] = []) {
  // libsql는 undefined 바인딩을 거부하므로 null로 정규화
  const safeArgs = args.map(a => (a === undefined ? null : a))
  return client.execute({ sql, args: safeArgs as any })
}

// 자기 고도화 루프용 생성 로그 (매 생성의 룰 기반 verify 점수/실패이유 기록 → 크롤 선별 기준 자동 조정 근거)
export async function migrateGenerationLog() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS GenerationLog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      newsId TEXT,
      category TEXT,
      score INTEGER,
      retries INTEGER,
      passed INTEGER,
      reason TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `)
}

// Turso/서버리스 환경에서 테이블 자동 생성
export async function ensureTables() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS News (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      summary TEXT,
      source TEXT,
      sourceUrl TEXT UNIQUE,
      category TEXT,
      publishedAt TEXT,
      crawledAt TEXT DEFAULT (datetime('now')),
      newsImageUrl TEXT,
      viralScore INTEGER,
      sentiment TEXT,
      keywords TEXT,
      isSelected INTEGER DEFAULT 0,
      isPosted INTEGER DEFAULT 0
    )
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS Copy (
      id TEXT PRIMARY KEY,
      newsId TEXT,
      headline TEXT,
      body TEXT,
      hashtags TEXT,
      tone TEXT,
      isApproved INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS Image (
      id TEXT PRIMARY KEY,
      newsId TEXT,
      copyId TEXT,
      prompt TEXT,
      imageUrl TEXT,
      localPath TEXT,
      isGenerated INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `)
  await migrateGenerationLog()
}
