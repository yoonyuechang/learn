const MISTRAL_KEY = process.env.MISTRAL_API_KEY || ''
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions'
const MODEL = 'mistral-small-latest'

async function mistralChat(systemPrompt: string, userPrompt: string, maxTokens = 800, temperature = 0.8): Promise<string> {
  let lastErr: unknown
  // 429(한도초과)/타임아웃 시 백오프 재시도 (무료 tier 안정성)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(MISTRAL_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: maxTokens,
          temperature
        }),
        signal: AbortSignal.timeout(60000)
      })
      if (r.status === 429) {
        await new Promise(res => setTimeout(res, 3000 * (attempt + 1)))  // 백오프
        lastErr = new Error(`Mistral 429: rate limited`)
        continue
      }
      if (!r.ok) throw new Error(`Mistral ${r.status}: ${await r.text()}`)
      const data = await r.json()
      return data.choices?.[0]?.message?.content || ''
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') {
        lastErr = e
        await new Promise(res => setTimeout(res, 2000 * (attempt + 1)))
        continue
      }
      throw e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Mistral 호출 실패')
}

async function generateJSON(systemPrompt: string, userPrompt: string, maxTokens = 800): Promise<any> {
  try {
    const text = await mistralChat(systemPrompt, userPrompt, maxTokens, 0.7)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]) } catch { /* fall through */ }
    }
    return null
  } catch (error) {
    console.error('[ai] generateJSON error:', error)
    return null
  }
}

async function generateText(systemPrompt: string, userPrompt: string, maxTokens = 800, temperature = 0.8): Promise<string> {
  try {
    return await mistralChat(systemPrompt, userPrompt, maxTokens, temperature)
  } catch (error) {
    console.error('[ai] generateText error:', error)
    return ''
  }
}

// ─── 바이럴 스코어 ───
// "이 기사를 보고 댓글을 달거나 공유하고 싶은가?" 기반
export function viralScore(title: string, content: string, category: string): number {
  let score = 0
  const t = title + ' ' + content

  // 1. 갈등/논란 (댓글싸움 유발) — 최대 40점
  const conflict = [
    '논란', '반발', '비판', '갈등', '공방', '논쟁', '반대', '찬성',
    '처벌', '금지', '규제', '위법', '위헌', '기소', '구속', '항소',
    '유죄', '무죄', '벌금', '징역', '사형', '구형', '영장',
    '시위', '항의', '파업', '보이콧', '규탄', '탄핵', '사퇴',
    '찬반', '양론', '다툼', '충돌', '대립', '공방'
  ]
  conflict.forEach(k => { if (t.includes(k)) score += 8 })

  // 2. 감정 자극 (분노/충격/안타까움) — 최대 35점
  const emotion = [
    '충격', '경악', '폭로', '파문', '발칵', '날벼락', '쇼킹',
    '황당', '어이없', '기가 막', '분노', '공분', '격분',
    '참담', '비극', '안타까', '애도', '오열', '눈물',
    '사건', '사고', '사망', '살인', '성범죄', '성추행', '아동',
    '폭행', '협박', '갈취', '사기', '도둑', '절도',
    '음주', '무면허', '난동', '폭발', '화재', '침수',
    '실종', '납치', '인질', '연쇄',
    '몰카', '리벤지', '성착취', '딥페이크', 'AI딥페이크',
    '보이스피싱', '로맨스스캠', '투자사기', '다단계'
  ]
  emotion.forEach(k => { if (t.includes(k)) score += 6 })

  // 3. 개인 영향력 (내 일처럼 느껴지는) — 최대 30점
  const personal = [
    '가격', '인상', '인하', '할인', '세금', '보험', '연금',
    '대출', '이자', '금리', '월세', '전세', '부동산', '아파트',
    '최저임금', '임금', '수당', '휴가', '퇴사', '해고', '실업',
    '수능', '합격', '불합격', '학교', '대학교', '의대',
    '의료', '건강', '보험', '병원', '약값', '치료',
    '교통', '지하철', '버스', '도로', '통행료', '주차',
    '식품', '안전', '기준', '검출', '오염', '부적격',
    '유류세', '휘발유', '가스', '전기', '수도',
    '미프진', '임신', '낙태', '출산', '육아', '보육',
    '배달', '플랫폼', '택배', '대리운전', '타다',
    'SNS', '인터넷', '통신', '요금', '약정'
  ]
  personal.forEach(k => { if (t.includes(k)) score += 5 })

  // 4. 도덕적 딜레마 (양쪽 의견이 갈리는) — 최대 25점
  const moral = [
    '부르카', '히잡', '종교', '표현의 자유', '인권',
    '성소수자', '동성애', '차별', '혐오', '평등',
    '안전', '사생활', '감시', '카메라', '몰래',
    '대마', '마약', '도박', '성매매',
    '자살', '생명', '존엄', '안락사',
    '징병', '군대', '복무', '면제',
    '불법체류', '외국인', '이주노동자', '난민',
    '환경', '오염', '개발', '훼손',
    'AI', '로봇', '자동화', '일자리', '실업'
  ]
  moral.forEach(k => { if (t.includes(k)) score += 7 })

  // 5. 유명인/스포츠 (국민 관심) — 최대 15점
  const famous = [
    '트럼프', '이재명', '한동훈', '윤석열', '탄핵',
    '아이돌', '연예인', '배우', '가수', '유튜버',
    '축구', '야구', '월드컵', '올림픽', '금메달',
    '타자', '투수', '감독', '선수',
    'BTS', '블랙핑크', '방탄', '뉴진즈'
  ]
  famous.forEach(k => { if (title.includes(k)) score += 5 })

  // 6. 속보/긴급 — 최대 10점
  if (title.includes('속보') || title.includes('긴급') || title.includes('Breaking')) score += 10

  // ─── 페널티 ───
  // 재미없는 뉴스 (대폭 감점)
  const boring = [
    '개최', '참여', '선정', '위촉', '임명', '인사',
    '착공', '기공', '준공', '개원', '개장', '이전', '설립',
    '협약', 'MOU', '앵커', '기자', '특파원',
    '수상', '수상자', '시상식', '표창', '감사패',
    '기념식', '캠페인', '챌린지', '행사', '축제',
    '박람회', '전시회', '포럼', '세미나', '컨퍼런스',
    '인사말', '축사', '환영사', '기념사',
    '기자간담회', '언론브리핑', '국정보고', '업무보고'
  ]
  boring.forEach(k => { if (title.includes(k)) score -= 30 })

  // 카테고리 보정
  const catBoost: Record<string, number> = {
    society: 15,    // 사회 = 사건사고 가장 많음
    politics: 10,   // 정치 = 탄핵/논란
    culture: 8,     // 문화 = 연예인 스캔들
    economy: 5,     // 경제 = 내돈내산
    sports: 8,      // 스포츠 = 국뽕/분노
    world: 5,       // 국제 = 트럼프
    tech: 3,        // 기술
    general: 0
  }
  score += catBoost[category] || 0

  return Math.max(0, Math.min(100, score))
}

function estimateEngagement(score: number) {
  const base = score / 100
  return {
    predictedLikes: Math.round(500 + base * 5000 + Math.random() * 500),
    predictedComments: Math.round(50 + base * 800 + Math.random() * 100),
    predictedShares: Math.round(100 + base * 1000 + Math.random() * 100)
  }
}

export async function selectViralContent(
  articles: Array<{ title: string; content: string; category: string; source: string }>
): Promise<Array<{ title: string; content: string; category: string; source: string; viralScore: number; reason: string }>> {
  const results = []

  for (const article of articles) {
    const score = viralScore(article.title, article.content, article.category)
    results.push({
      ...article,
      viralScore: score,
      reason: score >= 50 ? '높은 갈등/감정 자극' : score >= 30 ? '보통 관심도' : '관심도 낮음'
    })
  }

  return results.sort((a, b) => b.viralScore - a.viralScore)
}

export async function analyzeViralScore(
  title: string, content: string, category: string
): Promise<{ viralScore: number; sentiment: string; keywords: string[]; engagement: { predictedLikes: number; predictedComments: number; predictedShares: number } }> {
  const score = viralScore(title, content, category)
  return {
    viralScore: score,
    sentiment: score >= 50 ? 'negative' : score >= 30 ? 'neutral' : 'positive',
    keywords: [category, '뉴스'],
    engagement: estimateEngagement(score)
  }
}

// ─── 크롤 사전 필터 — 기사가 사람 반응을 일으키는지 판별 ───
// batch로 여러 기사를 한 번에 판단 → API 호출 절약
export async function preFilterArticles(
  articles: Array<{ title: string; content: string }>
): Promise<Array<{ index: number; score: number; reason: string }>> {
  if (articles.length === 0) return []

  const articleList = articles.map((a, i) => {
    // 구글 뉴스 보일러플레이트 제거
    const realContent = a.content.replace(/Comprehensive up-to-date news coverage.*$/i, '').trim()
    const contentPreview = realContent.length > 50 ? realContent.substring(0, 150) : '(본문 없음 — 제목만으로 판단)'
    return `[${i}] 제목: ${a.title.substring(0, 80)} | 본문: ${contentPreview}`
  }).join('\n')

  const result = await generateJSON(
    '당신은 인스타그램 뉴스 계정(@jungbobada_news)의 콘텐츠 디렉터입니다. 매일 수십 개 기사 중 "사람들이 카톡방에 돌리고, 저장하고, 댓글로 싸우고 싶은" 하나만 고릅니다. 반드시 한국어로 답변하세요.',
    `다음 기사들이 인스타그램에서 실제 반응(저장/공유/댓글)을 만들어낼지 판단하세요. 단순 조회수가 아니라 '상호작용'이 핵심입니다.

[선별 기준 — 이 4가지 중 하나라도 강하면 고득점]
1. 공분/분노: "이게 세상이야?" 하고 화가 나는 사건 (비리, 부당, 억울, 배신)
2. 카톡방 돌림: "야 이거 봐" 하고 친구한테 보여주고 싶은 충격/황당/반전
3. 찬반 논쟁: 내 삶/가치관과 직결돼 의견이 갈리는 주제 (부동산, 교육, 세금, 안전)
4. 공감/궁금증: "나도 그랬어" "진짜?" 하고 내 이야기처럼 느껴지는 일상 밀착 이슈

 자극성 가중 (같은 점수대면 아래일수록 우선)
- 구체적 수치가 클수록 강함: 억 단위 금액, 사망/중상/다수 피해, 징역 10년+
- 직접적 피해일수록 강함: 사기·로맨스스캠·보이스피싱 > 단순 비판/논란
- 충격·황당·반전 요소가 명확할수록 강함

[저득점 — 인스타에서는 반응이 거의 없음]
- 정책/전망/분석 기사, 기업 실적, 단순 인사·행사·수상, 날씨, 순수 기술 뉴스
- "이건 뉴스인데 별로 안 궁금해" 수준의 지엽적 사안

[사실성/신뢰도 필수 — 이에 해당하면 무조건 저득점(0~20)]
- 조합형 기사: 제목에 여러 사건이 '…'나 '·'로 묶인 주간지/칼럼/이슈 편집 형태 (예: "청계천 동전 싹쓸이…박지성 발언에 입 연 캡틴[주간 사건일지]")
- 출처 불분명: 개인블로그, 트위터/X 편집, 매체명이 안 붙은 구글 리다이렉트, 단일 매체만 보도된 단독성 의심 사안
- 사실 검증 불가: 본문이 없거나, 한 문장 요약만 있어 진위 확인이 안 되는 경우
- 가짜뉴스 의심: 과장·자극적 과장, 출처 없는 "○○관계자 말" 남발

 중요: 단일 명확한 사건이어야 합니다. 한 꼭지에 여러 사건을 마음대로 조합한 기사는 절대 고르지 마세요. 다른 매체에서도 같은 사건이 보도됐는지 확인할 수 없는 기사는 배제하세요.

 점수 분산: 0~100을 골고루 쓰세요. 90점 이상(최고 자극)은 정말 강한 기사 몇 개만, 나머지는 60~85 사이에서 변별되게 배분하세요. 모두 95점이면 안 됩니다.

기사 목록:
${articleList}

반드시 다음 JSON 형식으로만 출력하세요:
{"results":[{"i":0,"s":85,"r":"이유 한 줄"}]}

i는 기사 번호, s는 점수(0~100, 인스타 상호작용 유발력), r은 한 줄 이유.`,
    600
  )

  if (!result?.results) return []
  return result.results.map((r: any) => ({
    index: r.i,
    score: r.s,
    reason: r.r || ''
  }))
}

// ─── 카드 헤드라인 ───
export async function generateCardHeadline(title: string, content: string, category: string): Promise<string> {
  const system = '당신은 정보바다 뉴스의 카드 디자이너입니다. 반드시 한국어로만 작성하세요.'
  const user = [
    '이 뉴스 카드의 메인 헤드라인을 지어주세요. 인스타에서 스크롤 멈추게 하는 임팩트가 핵심입니다.',
    '',
    '원본 제목: ' + title,
    '기사 핵심: ' + content.substring(0, 300),
    '',
    '규칙:',
    '- 구체적 숫자/사실 하나 필수 (예: "3억 세탁한 전직 기자", "징역 15년 선고")',
    '- 감탄사/반말/이모지 금지 ("야", "ㅋㅋ", "!!" 안 됨)',
    '- "파헤치나" "충격적" "논란" 같은 기자 말투 금지',
    '- 앞에 따옴표나 괄호나 마크다운 절대 금지. 문장을 통째로, 맨 앞 글자부터 내용이 시작되게',
    '- 최대 40자, 명사형/평서문, 임팩트 우선 (너무 짧으면 임팩트가 죽으니 15자 이상 권장)',
    '- 헤드라인만 출력 (다른 설명/따옴표/번호 붙이지 마세요)'
  ].join('\n')
  const result = await generateText(system, user, 150)
  const cleaned = result
    .replace(/^[\s"「「」」『』()\[\]【】*_]+/g, '').replace(/['"]/g, '')
    .replace(/[\s"「「」」『』()\[\]【】*_]+$/g, '').replace(/['"]/g, '')
    .replace(/[#*]/g, '')
    .replace(/\n/g, ' ')
    .trim()
  const noEnglish = cleaned.replace(/[a-zA-Z]+/g, '').replace(/[!?.]+$/g, '').replace(/\s+/g, ' ').trim()
  const safe = (s: string): string => {
const t = s.replace(/^[\s"「「」」『』()\[\]【】*_]+/g, '').replace(/['"]/g, '').trim()
    if (t.length <= 36) return t
    const sp = t.lastIndexOf(' ', 36)
    return (sp > 8 ? t.substring(0, sp) : t.substring(0, 36)).trim()
  }
  if (noEnglish.length >= 6) return safe(noEnglish)
  const fallback = title.replace(/['"\\[\]\(\)『』「」]/g, '').replace(/\s+/g, ' ').trim()
  return safe(fallback)
}

// ─── 룰 기반 캡션 검증 (Harness 제어 계층) ───
// AI 평가자 대신 결정른 룰로 검증 → 429 위험 없고 빠름
function verifyCaption(caption: string, sourceFacts: string): { ok: boolean; reason: string; score: number } {
  const body = caption.trim()
  // 1) 길이: 카드뉴스 캡션은 '알찬 본문'이 핵심 → 하한 상향(200자)·상한 완화(1200자)
  //    권고: 300자 이상(4~8문장). 단 원문 추출이 짧으면 상한만 높여봐야 의미 없으므로
  //    300자 미만은 '통과하되 충실도 감점'으로 재생성 유도, 200자 미만은 하드 불합격.
  const lines = body.split(/\n+/).filter(l => l.trim().length > 0)
  const len = body.length
  if (lines.length < 3 || len < 200 || len > 1200) {
    return { ok: false, reason: `길이 부적정(${lines.length}문장/${len}자, 권고 300자+)`, score: 30 }
  }
  // 2) 금지 패턴: 이모지/볼드/리스트/외국어/한경노이즈/구독유도/욕설
  const hasEmoji = /\p{Extended_Pictographic}/u.test(body)
  const hasForeign = /[a-zA-Z]{3,}/.test(body)  // 잔여 영어 단어(원문 오염/Penguin 등)
  const bad = /[*]{2,}|^[\s]*\d+\.\s|구글 검색 선호|한[경경] 프리미|PREMIUM|ADVERTISEMENT|좋아요 싫어요|한국경제 신청|더 재밌는 뉴스가 궁금하면|팔로우|@jungbobada_news|시발[련놈년개들]?|씨[발밸]|개[새끼새끼들]|병신[년들]?|미친[놈년]?|지랄[하깨]?|염[병병]?|뻐[꾸큐]|좆[되까]?|섹[스스]?|fuck|shit|damn|bastard|asshole|bullshit|이따위|이딴/i
  if (hasEmoji || hasForeign || bad.test(body)) {
    return { ok: false, reason: '금지패턴(이모지/볼드/리스트/외국어/노이즈/욕설) 검출', score: 40 }
  }
  // 3) 해시태그가 본문에 섞임 금지
  if (/#[가-힣A-Za-z0-9_]+/.test(body)) {
    return { ok: false, reason: '본문에 해시태그 혼입', score: 50 }
  }
  // 4) 원문 수치 보존 체크: 원문에 숫자가 있으면 캡션에도 최소 1개
  const srcNums = (sourceFacts.match(/\d+/g) || []).length
  const capNums = (body.match(/\d+/g) || []).length
  if (srcNums >= 2 && capNums === 0) {
    return { ok: false, reason: '원문 수치 미반영', score: 55 }
  }
  // 5) 마지막 문장이 질문인가 (댓글 유도)
  const lastLine = lines[lines.length - 1]
  if (!/[?？]$/.test(lastLine) && !/어떻게|생각하|의견/.test(lastLine)) {
    return { ok: false, reason: '마지막 질문/CTA 부재', score: 60 }
  }
  // 6) 알찬 본문 권고: 300자 미만은 '얇은 캡션' → 통과 보류(재생성 유도).
  //    단 원문 자체가 짧아 재생성해도 못 늘리는 경우가 있으므로 하드 불합격은 아님(감점).
  if (len < 300) {
    return { ok: false, reason: `본문 빈약(${len}자, 권고 300자+)`, score: 70 }
  }
  return { ok: true, reason: '통과', score: 85 }
}

// ─── 캡션 생성 (의견형) ───
export async function generateCopy(
  title: string, content: string, category: string
): Promise<{ headline: string; body: string; hashtags: string; _evalScore?: number; _retries?: number; _evalReason?: string }> {
  // 본문 방어: 구글 플레이스홀더/빈 본문이면 AI가 엉뚱한 글을 지어내므로 즉시 fallback
  const rawClean = (content || '').replace(/Comprehensive up-to-date news coverage.*$/i, '').trim()
  if (rawClean.length < 100) {
    const intro = title
    return {
      headline: title.substring(0, 25),
      body: `${title}\n\n이 뉴스, 여러분은 어떻게 보셨어요? 댓글로 의견 남겨주세요!`,
      hashtags: defaultHashtags(category)
    }
  }

  const clean = content
    .replace(/Comprehensive up-to-date news coverage.*$/i, '')
    .replace(/Aggregated from various highly reliable sources.*$/i, '')
    .replace(/©\s*\d{4}.*$/i, '')
    .replace(/\[\d*\s*(MBC|KBS|SBS|YTN|JTBC)?뉴스\]/gi, '')
    .replace(/[◀▶▼▷◁]/g, '')
    .replace(/앵커\s*[◀▶▼▷▷]?/g, '')
    .replace(/에디터\s*[\w.\-]+@[\w.\-]+/gi, '')
    .replace(/[A-Za-z0-9._%+-]+@[\w.\-]+\.[A-Za-z]{2,}/g, '')
    .replace(/(프리미엄|성공|수익|투자|AI|코인|환불|무료|이벤트|체험)\s*[가-힣]*?(신청|상담|추천|확정|보장|혜택)/g, '')
    .replace(/본문[가-힣]{1,6}보기/g, '')
    .replace(/기자\s*(수정|입력)\s*[\d\-.:\s]+/g, '')
    .replace(/펼침[\d:]+/g, '')
    .replace(/Your browser does not support theaudio element/g, '')
    .replace(/구글 선호 매체 등록/g, '')
    .replace(/광고/g, '')
    .replace(/네이버\s*뉴스/g, '')
    .replace(/카카오\s*뉴스/g, '')
    .replace(/기사 공유/g, '')
    .replace(/글자크기\s*(조절|확대|축소)/g, '')
    .replace(/프린트/g, '')
    .replace(/기사 스크랩/g, '')
    .replace(/댓글\s*\d*/g, '')
    .replace(/(구독하기|팝업 닫기|추천 뉴스|관련 뉴스|오늘의 뉴스|속보 모음|성공투자|구독 신청|뉴스레터|를 넘어서는|구독)/g, '')
    .replace(/(\s)+/g, ' ')
    .trim()

  // 본문 방어: 150자 미만이면 사실정합성 보장 안 됨 → 발행 안 함
  // (300자는 과도 — 카드뉴스 캡션은 원문 150자면 충분히 사실적 작성 가능)
  if (clean.length < 150) {
    return {
      headline: title.substring(0, 25),
      body: '',  // 빈 본문 → route에서 발행 스킵
      hashtags: defaultHashtags(category)
    }
  }

  const keywords = title.replace(/[\[\]]+/g, '').replace(/\s+/g, ' ').trim()

  // 원문 첫 문장 — 도입부는 AI가 임의 조합하지 못하도록 원문에서 직접 추출 (hard constraint)
  const sourceClean = clean.replace(/Comprehensive up-to-date news coverage.*$/i, '').replace(/\[\d*\s*(MBC|KBS|SBS|YTN|JTBC)?뉴스\]/gi, '').replace(/[◀▶▼▷◁]/g, '').replace(/앵커\s*[◀▶▼▷◁]?/g, '').trim()
  const firstSentence = (sourceClean.split(/(?<=[.!?])\s/)[0] || sourceClean).substring(0, 120).trim()

  // ───────────────────────────────────────────────
  // 순차 4단 생성 (기→승→전→결) — spec 기준
  // 각 단이 이전 단락을 이어받아 내러티브 연결
  // ───────────────────────────────────────────────

  // [1단: 기/도입] — 원문 내용 기반 자연스러운 1문장 요약 + 질문
  // (원문 그대로 박으면 "대 기업인..." 같은 어색한 맨 앞 문장이 들어가므로, 원문 단어만 써서 AI가 문장 구성)
  const introRaw = await generateText(
    '당신은 정보바다 뉴스(@jungbobada_news)의 소통 전문가입니다. 반드시 한국어로만 작성하세요.',
    `아래 [기사 원문]을 바탕으로, 독자가 궁금해할 만한 핵심을 2~3문장으로 요약하고 그 뒤에 질문 1개를 덧붙이세요.
 원문에 없는 새로운 사실·수치·인물·사건명을 절대 만들지 마세요(임의 조합 금지). 원문에 나온 사실·수치·인용만 사용하세요.

[기사 원문]
${clean.substring(0, 700)}

규칙:
- 원문에 나오는 구체적 수치(금액/날짜/인원/기간)와 핵심 인물/기관을 반드시 1개 이상 그대로 살릴 것
- 앞 2~3문장: 원문 기반 핵심 요약 (원문에 있는 사실만 사용, 새로운 정보 금지)
- 마지막 줄: 질문 1개 (독자 참여 유도)
- 존댓말, 이모지/#/마크다운 금지
- 총 3~4문장, 카드뉴스로 읽기 좋게 문장을 짧고 명확하게
- 가독성: 문장은 최대 2줄 이내로, 한 문단에 2~3문장만. 주제가 바뀔 때 빈 줄 하나 넣기`,
    450
  )
  const intro = cleanAiText(introRaw) || firstSentence

  // [2단: 승/전개] — 1단 이어서 배경·맥락·영향
  const develop = cleanAiText(await generateText(
    '당신은 정보바다 뉴스(@jungbobada_news)의 소통 전문가입니다. 반드시 한국어로만 작성하세요.',
    `아래 [기사 원문]과 [1단]을 이어서, 이 사건의 배경과 맥락, 왜 중요한지 4~6문장으로 설명하세요.

[기사 원문]
${clean.substring(0, 900)}

[1단]
${intro}

규칙:
- 반드시 [기사 원문]에 실제로 있는 구체적 사실·수치·날짜·인물·발언(인용)을 근거로 풀어쓸 것. 원문에 없는 내용은 절대 지어내지 마세요(임의 조합 금지).
- "왜 이런 일이 생겼는지 / 누구에게 어떤 영향인지"를 원문 근거로 설명
- "~합니다" "~입니다" 존댓말
- 원문 수치/고유명사 2개 이상 그대로 반영할 것
- 이모지, "#" 금지
- 가독성: 문장은 최대 2줄 이내로, 한 문단에 2~3문장만. 주제가 바뀔 때 빈 줄 하나 넣기
- 총 4~6문장`,
    550
  )) || ''

  // [3단: 전/위기] — 논란·갈등·반대 의견·우려
  const conflict = cleanAiText(await generateText(
    '당신은 정보바다 뉴스(@jungbobada_news)의 소통 전문가입니다. 반드시 한국어로만 작성하세요.',
    `아래 [기사 원문]과 이전 내용을 이어서, 이 사건을 두고 벌어지는 논란·갈등·반대 의견·사람들의 우려를 4~6문장으로 쓰세요.

[기사 원문]
${clean.substring(0, 900)}

[이전 내용 요약]
${intro}
${develop}

규칙:
- 원문에 실제로 언급된 논점·반응·발언(인용)을 우선 사용하고, 원문에 없는 사실·수치·인물은 지어내지 마세요(임의 조합 금지).
- "어떤 사람들은 ~라고 비판한다" "~라는 우려가 나온다" 식으로 찬반/갈등 구조 보여주기
- 감정에 호소하지 말고, 실제 나오는 반응과 논점을 균형 있게
- "~합니다" "~입니다" 존댓말
- 이모지, "#" 금지
- 가독성: 문장은 최대 2줄 이내로, 한 문단에 2~3문장만. 주제가 바뀔 때 빈 줄 하나 넣기
- 총 4~6문장`,
    550
  )) || ''

  // [4단: 결/결론] — 전망만 생성 (CTA는 코드에서 강제 조립)
  const closing = cleanAiText(await generateText(
    '당신은 정보바다 뉴스의 소통 전문가입니다. 반드시 한국어로만 작성하세요.',
    `아래 내용을 마무리하며, 앞으로의 전망과 의미를 2~3문장으로 쓰세요.

[이전 내용 요약]
${intro}
${develop}
${conflict}

규칙:
- 전망/의미 2~3문장만 (질문·CTA는 쓰지 마세요 — 코드가 자동 붙임)
- "~합니다" "~입니다" 존댓말
- 이모지, "#" 금지
- 가독성: 문장은 최대 2줄 이내
- 2~3문장`,
    350
  )) || ''

  // CTA는 코드에서 강제 조립 (이모지/볼드 없이 깔끔하게)
  const cta =
    '이 사건, 여러분은 어떻게 생각하시나요?\n' +
    '정보바다 뉴스 @jungbobada_news'
  const closingFinal = (closing || '').replace(/@jungbobada_news/g, '').trim()
  const body = [intro, develop, conflict, closingFinal, cta].filter(l => l.trim().length > 0).join('\n\n')

  // 해시태그 — AI 임의 생성 제거(스팸 방지), 카테고리별 엄선 태그만 사용
  const hashtags = defaultHashtags(category)

  // 카드용 헤드라인 (훅) — 별도 호출
  const headline = await generateCardHeadline(title, content, category)

  // 평가 루프 제거 (역효과: AI evaluator가 오히려 점수 깎아 재생성 유발 → 품질 하락)
  // 대신 룰 기반 verifyCaption + 불합격 시 1회 재생성 (룰은 429 위험 없음)
  let finalBody = cleanAiText(body)
  let vfy = verifyCaption(finalBody, clean)
  let retries = 0
  if (!vfy.ok) {
    retries = 1
    const retryRaw = await generateText(
      '당신은 정보바다 뉴스 소통 전문가입니다. 반드시 한국어로만 작성하세요.',
      `아래 [기사 원문]을 충실히 활용해, 원문의 구체적 사실을 최대한 살린 알찬 캡션을 다시 쓰세요.
[기사 원문] ${clean.substring(0, 1000)}
규칙:
- 원문에 실제로 있는 수치(금액/날짜/인원/기간)·인물·기관·발언(인용)을 최대한 많이 반영. 원문에 없는 사실·수치·인물은 절대 지어내지 마세요(임의 조합 금지).
- 원문을 충실히 요약하되 최소 8줄 이상, 300자 이상의 알찬 본문으로 작성
- 가독성: 문장은 최대 2줄 이내, 한 문단에 2~3문장만. 주제 전환 시 빈 줄 넣기. 총 8~12문장
- 이모지/# 금지, 리스트(1. 2. 3.) 금지, 볼드마커(**) 금지, 한경/구독유도 문구 금지
- 마지막에 질문 1개`,
      700, 0.7
    )
    const retryBody = cleanAiText(retryRaw)
    const vfy2 = verifyCaption(retryBody, clean)
    if (vfy2.ok || vfy2.score > vfy.score) { finalBody = retryBody; vfy = vfy2 }
  }

  const bodyLines = finalBody.split('\n').filter((l: string) => l.trim().length > 0)
  console.log(`[ai] caption: ${bodyLines.length} lines, headline: ${headline}, verify: ${vfy.score} (${vfy.reason}), retries: ${retries}`)

  return { headline, body: finalBody, hashtags, _evalScore: vfy.score, _retries: retries, _evalReason: vfy.reason }
}

function cleanAiText(text: string): string {
  if (!text) return ''
  // 1) @계정명 핸들은 나중 영어 제거에서 깨지지 않게 임시 토큰으로 보호
  const handles: string[] = []
  let t = text.replace(/@[a-zA-Z0-9_.]+/g, (m: string) => {
    handles.push(m)
    return ` H${handles.length - 1} `
  })
  t = t
    .replace(/#[가-힣A-Za-z0-9_]+/g, '')   // 본문 내 해시태그 제거 (캡션엔 별도 hashtags 필드로만)
    .replace(/[Ѐ-ӿ]+/g, '')               // 키릴문자(러시아어 등) 제거
    .replace(/[぀-ヿ]+/g, '')              // 일본어 가나 제거
    .replace(/[㐀-鿿]+/g, '')             // 한자(중국어/일본어 한자) 제거 — 한국어(가-힣)는 보존
    .replace(/\p{Extended_Pictographic}/gu, '') // 이모지 제거
    .replace(/^\s*\d+\.\s/gm, '')         // 리스트 형태(1. 2. 3.) 제거
    .replace(/[*]{2,}/g, '')             // 볼드 마커 제거
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[#\-*]\s*/gm, '')
    // AI 요약/딜리버러블 톤 불필요 문구 제거
    .replace(/^(위 기사의 요약입니다\.?|이상입니다\.?|요약하자면,?|정리하자면,?|결론적으로,?|뉴스 정보 제공\.?|기사 요약\.?|요약 본문\.?)/gm, '')
    .replace(/(위 기사의 요약입니다\.?|이상입니다\.?|뉴스 정보 제공입니다\.?|기사 요약입니다\.?|요약드린 내용입니다\.?)/g, '')
    // 욕설/비속어 제거 (AI가 지어낸 경우 차단)
    .replace(/(시발[련놈년개들]?|씨[발밸]|개[새끼새끼들]|병신[년들]?|미친[놈년]?|지랄[하깨]?|염[병병]?|뻐[꾸큐]|좆[되까]?|섹[스스]?|이따위|이딴|fuck|shit|damn|bastard|asshole|bullshit)/gi, '')
    // 외국어 단어 제거 — 앞뒤 공백 무관(괄호/구두점 결합형 Penguin(펭균) 등도 처리)
    .replace(/[a-zA-Z]{2,}(?=[^a-zA-Z가-힣]|$)/g, ' ')
    .replace(/[a-zA-Z]{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // 2) 보호했던 @계정명 복원
  t = t.replace(/\u0000H(\d+)\u0000/g, (_: string, i: string) => handles[Number(i)])
  return t
}

function sentencesFromContent(content: string, start: number, end: number): string {
  if (!content) return ''
  return content
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s: string) => s.length > 8)
    .slice(start, end)
    .join(' ')
}

export function defaultHashtags(category: string): string {
  // 인스타 SEO 전략: 대형(도달) 2~3개 + 중형(카테고리) 3~4개 + 니체/브랜드(랭킹 가능) 3~4개 혼합
  // - #뉴스/#속보 같은 초대형 태그만 쓰면 수 초 만에 피드에서 밀려나므로 니체 태그로 '인기 게시물' 랭킹을 노림
  // - 총 9~11개 유지 (30개 꽉 채우기는 스팸 신호), 카테고리 무관 태그 조합 금지
  // - 브랜드 태그 #정보바다뉴스 는 모든 게시물 공통 → 계정 아카이브/재방문 유도
  const base = '#뉴스 #시사 #정보바다뉴스'
  const cat: Record<string, string> = {
    politics: '#정치뉴스 #국회 #정치이슈 #시사상식 #오늘의정치 #국정감사',
    economy: '#경제뉴스 #재테크 #부동산뉴스 #금리인상 #경제공부 #주식뉴스',
    society: '#사회뉴스 #사건사고 #사회이슈 #오늘의이슈 #실시간이슈 #생활정보',
    culture: '#연예뉴스 #연예이슈 #방송이슈 #케이팝뉴스 #문화뉴스 #셀럽소식',
    tech: '#IT뉴스 #테크뉴스 #인공지능뉴스 #스타트업 #IT트렌드 #신기술',
    sports: '#스포츠뉴스 #축구뉴스 #야구뉴스 #국가대표 #스포츠이슈 #K리그',
    world: '#국제뉴스 #해외뉴스 #국제이슈 #세계정세 #글로벌뉴스 #외신',
    general: '#뉴스큐레이션 #오늘의이슈 #시사정보 #이슈정리 #상식뉴스'
  }
  return `${base} ${cat[category] || cat.general}`
}

function generateFallbackCopy(title: string, content: string, category: string): { headline: string; body: string; hashtags: string } {
  const intro = sentencesFromContent(content, 0, 3) || title

  const body = `${intro}`

  return {
    headline: title.substring(0, 25),
    body,
    hashtags: defaultHashtags(category)
  }
}

export async function generateImagePrompt(title: string, content: string, category: string): Promise<{ prompt: string; description: string }> {
  return {
    prompt: `text card ${category} news`,
    description: '텍스트 카드'
  }
}
