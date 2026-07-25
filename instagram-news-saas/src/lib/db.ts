import { createClient } from '@libsql/client'
import path from 'path'

const dbPath = path.resolve(process.cwd(), 'dev.db')
const client = createClient({ url: `file:${dbPath}` })

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
