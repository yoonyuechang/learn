# 인스타그램 뉴스 바이럴 SaaS — 설계 명세

## 개요

뉴스를 크롤링하고, 바이럴 가능성이 높은 뉴스를 AI로 선별하여, 인스타그램용 카피라이팅과 이미지를 자동 생성하고, 1일 1포스팅으로 자동 배포하는 SaaS 서비스.

**기술 스택:** Next.js (App Router) + SQLite (Prisma) + Google Gemini + HuggingFace FLUX.1 + Instagram Graph API

**배포:** Vercel (무료 플랜)

## 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                   Next.js App (App Router)                │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ 뉴스 크롤링    │  │ AI 분석/선별   │  │ 이미지 생성 파이프라인│  │
│  │ • RSS (10+)  │  │ • 바이럴 예측   │  │ • FLUX.1 생성   │  │
│  │ • 웹 크롤링   │  │ • Gemini Pro  │  │ • 텍스트 오버레이 │  │
│  │ • 뉴스 API    │  │ • 경쟁 계정 분석│  │ • 품질 검증     │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                   │            │
│         └────────────────┼───────────────────┘            │
│                          ▼                                │
│              ┌───────────────────────┐                   │
│              │     SQLite + Prisma    │                   │
│              └───────────┬───────────┘                   │
│                          ▼                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │              인스타그램 연동 레이어                    │  │
│  │  • Graph API 포스팅                                  │  │
│  │  • 인사이트 수집 (좋아요, 댓글, 저장, 도달률)          │  │
│  │  • 경쟁 계정 모니터링                                 │  │
│  └───────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │           피드백 루프 / 파인튜닝 엔진                   │  │
│  │  • 게시물 반응 데이터 분석                             │  │
│  │  • 바이럴 예측 모델 개선                               │  │
│  │  • 카피라이팅 패턴 학습                                │  │
│  │  • 이미지 스타일 튜닝                                  │  │
│  └───────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │              대시보드 UI                               │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## 데이터 모델 (Prisma)

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

generator client {
  provider = "prisma-client-js"
}

model News {
  id            String   @id @default(cuid())
  title         String
  content       String
  summary       String   // AI가 생성한 요약
  source        String   // "naver", "daum", "rss:bbc" 등
  sourceUrl     String   @unique
  category      String   // "politics", "entertainment", "tech", "society", "economy", "sports"
  publishedAt   DateTime
  crawledAt     DateTime @default(now())
  viralScore    Float?   // Gemini가 매긴 바이럴 점수 (0-100)
  sentiment     String?  // "positive", "negative", "neutral", "mixed"
  keywords      String?  // JSON 배열: 추출된 핵심 키워드
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
  headline       String   // 이미지용 헤드라인 (궁금증 유발, 15자 이내)
  interpretation String   // 뉴스 해설 (궁금증 해소, 3줄 이내)
  hashtags       String   // JSON 배열: 해시태그 목록
  caption        String   // 인스타 캡션 (전체 본문)
  emotionalHook  String?  // 사용된 감정 훅 ("분노", "놀람", "호기심")
  viralScore     Float?   // 카피 자체의 예상 반응 점수
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
  imageUrl      String   // 생성된 이미지 URL (로컬 저장 또는 외부 URL)
  thumbnailUrl  String?  // 썸네일 URL
  headlineText  String   // 오버레이된 헤드라인 텍스트
  style         String   // 사용된 이미지 스타일 ("news", "dramatic", "clean" 등)
  hfModel       String   // 사용된 HuggingFace 모델명
  prompt        String?  // 이미지 생성에 사용된 프롬프트
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
  instagramMediaId  String?  // 인스타그램 미디어 ID
  status            String   @default("draft") // draft, scheduled, posted, failed, deleted
  scheduledFor      DateTime? // 예약 포스팅 시간
  postedAt          DateTime? // 실제 포스팅 시간
  caption           String
  hashtags          String   // JSON 배열
  errorMessage      String?  // 실패 시 에러 메시지
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
  engagementRate  Float?   // (likes+comments+saves)/reach * 100
  collectedAt     DateTime @default(now())
  period          String   @default("24h") // "24h", "48h", "7d"

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
  topTopics     String?  // JSON 배열: 주요 주제
  contentStyle  String?  // 콘텐츠 스타일 분석
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
  headlinePattern String?  // 분석된 헤드라인 패턴
  viralPattern    String?  // 분석된 바이럴 패턴
  hashtags        String?  // JSON 배열
  postedAt        DateTime
  analyzedAt      DateTime @default(now())

  @@index([accountId])
  @@index([likes(sort: Desc)])
}

model Settings {
  id                String   @id @default(cuid())
  key               String   @unique
  value             String
  description       String?
  updatedAt         DateTime @updatedAt
}
```

## 뉴스 크롤링 시스템

### 크롤링 소스

| 소스 | URL | 카테고리 |
|------|-----|---------|
| 네이버 뉴스 | https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko | 전체 |
| 다음 뉴스 | https://media.daum.net/rss/recent | 전체 |
| Google News KR | https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=ko&gl=KR | 전체 |
| 연합뉴스 | https://www.yna.co.kr/RSS/news.xml | 속보 |
| 헤럴드경제 | RSS | 경제 |
| 매일경제 | RSS | 경제 |
| TechCrunch | https://techcrunch.com/feed/ | IT |
| BBC Korea | https://www.bbc.com/koorean/topics/c83plve6vmzt/rss.xml | 국제 |

### 크롤링 워크플로우

```
1. Vercel Cron (하루 2회: 09:00, 15:00) + 수동 트리거
   └→ /api/cron/crawl 라우트 호출
      ├→ RSS 피드 파싱 (rss-parser)
      ├→ 신규 기사 필터링 (sourceUrl 중복 체크)
      ├→ 본문 추출 (cheerio, HTML 파싱)
      ├→ SQLite 저장
      └→ Gemini로 카테고리 분류 + 바이럴 점수 계산

   참고: Vercel 무료 플랜은 월 100회 cron 제한. 하루 2회 + 수동 트리거로 충분.
```

### 바이럴 예측 알고리즘

Gemini 1.5 Flash가 다음 기준으로 0-100점 매김:

1. **감정 강도** (40%): 분노, 놀람, 호기심, 공포 등 강한 감정 유발 여부
2. **시의성** (25%): 최신 뉴스일수록 가점 (6시간 이내: +20, 24시간 이내: +10)
3. **키워드 트렌딩** (20%): 현재 트렌딩 키워드와 매칭 정도
4. **공유 가능성** (15%): "이건 꼭 봐야 해" 느낌, 구체적 숫자/인용 포함

## AI 분석 및 카피라이팅

### 모델 배분

| 작업 | 모델 | API |
|------|------|-----|
| 바이럴 예측 | Gemini 1.5 Flash | Google AI Studio (무료) |
| 헤드라인 생성 | Gemini 1.5 Flash | Google AI Studio (무료) |
| 해설 작성 | Gemini 1.5 Flash | Google AI Studio (무료) |
| 해시태그 생성 | Gemini 1.5 Flash | Google AI Studio (무료) |
| 이미지 생성 | FLUX.1 | HuggingFace Inference API (무료) |

### 카피라이팅 규칙

**헤드라인 (15자 이내):**
- "?" 또는 "!"로 끝나기
- 분노/놀람/호기심 중 2가지 이상 포함
- 구체적 숫자나 인용 포함
- 예시: "이게 진짜라고? 100만명이 봤다!"

**해설 (3줄 이내):**
- 헤드라인이 제기한 궁금증을 해소
- "그래서 무슨 일이?" 구조
- 감정적 어조 유지
- 핵심 사실 포함

**해시태그:**
- 인기 해시태그 5개 + 니치 해시태그 3개
- 현재 트렌딩 해시태그 자동 매칭
- 총 8개 이내

### 이미지 생성 파이프라인

```
1. 뉴스 키워드 기반 프롬프트 생성 (Gemini)
2. FLUX.1로 1080x1080 배경 이미지 생성
3. Canvas API로 헤드라인 텍스트 오버레이
   - 폰트: Noto Sans KR Bold
   - 색상: 흰색 텍스트 + 검정색 쉐도우
   - 위치: 이미지 중앙 상단
4. 품질 검증 (해상도, 텍스트 가독성)
5. 로컬 저장 → URL 반환
```

## 인스타그램 연동

### Graph API 연동 과정

1. Facebook 로그인 → 페이지 연결
2. 장기 액세스 토큰 발급 (60일, 자동 갱신)
3. 미디어 컨테이너 생성 → 이미지 업로드
4. 캡션 + 해시태그 포함 포스팅
5. 24/48/7일 후 인사이트 수집

### 1일 1포스팅 자동화

| 시간 | 작업 | 상태 |
|------|------|------|
| 09:00 | 뉴스 크롤링 실행 | 자동 |
| 09:30 | 바이럴 예측 + 선별 | 자동 |
| 10:00 | 카피라이팅 + 이미지 생성 | 자동 |
| 10:00-12:00 | 사용자 확인/수정 (대시보드) | 수동 |
| 14:00 | 승인된 게시물 자동 포스팅 | 자동 |
| 16:00 | 인사이트 수집 시작 | 자동 |

## 분석 및 파인튜닝

### 피드백 루프

```
게시물 성과 데이터 (좋아요, 댓글, 저장, 도달률)
        │
        ▼
패턴 분석 엔진
• 어떤 키워드가 반응↑
• 어떤 시간대가 최적
• 어떤 이미지 스타일↑
• 어떤 카피 유형↑
        │
        ▼
예측 모델 업데이트
• 바이럴 점수 가중치 조정
• 카피라이팅 규칙 갱신
• 이미지 프롬프트 갱신
```

### 경쟁 계정 분석

- 인기 뉴스 계정 10-20개 모니터링
- 게시물 패턴 분석 (주제, 시간, 해시태그)
- 성공 콘텐츠 패턴 추출
- 주간 리포트 생성

**모니터링 대상 계정 (초기 설정):**

| 계정 | 팔로워 | 특징 | 카테고리 |
|------|--------|------|---------|
| @yeodam_everything (여담의 모든 것) | 203K | 흥미로운 실시간 이슈 전달, 카드뉴스 형식 | 시사/이슈 |
| @lifehoneyjar (생활꿀통) | 84K | 아침 꿀팁 + 저녁 뉴스, 하루 두 번 업로드 | 뉴스/꿀팁 |
| @_hey.news_ (헤이뉴스) | 237K | JTBC 계열, 속보 위주 | 뉴스/속보 |
| @glowupmag (글로우업 매거진) | 313K | 스타일/라이프/뉴스/엔터, 감성적 카드뉴스 | 라이프스타일 |
| @eyes_mag (아이즈매거진) | large | 패션/문화/라이프스타일 선두주자 | 패션/문화 |
| @dailyfashion_news (데패뉴) | large | 압도적 업로드 속도, 패션/뷰티/엔터 | 패션/뷰티 |
| @fastpapermag (패스트페이퍼) | growing | 감도 높은 소재, 미술/라이프/뷰티 | 라이프스타일 |
| @sbsnews_8news (스브스뉴스) | large | 언론사 중 인스타그램 활용 최우수 | 뉴스/시사 |

**분석 항목:**
- 게시물당 평균 좋아요/댓글/저장 수
- 인기 게시물의 헤드라인 패턴 (감정 유발 방식)
- 사용 해시태그 목록 및 트렌드
- 게시 시간대 분석
- 이미지 스타일 (색상, 폰트, 레이아웃)
- 콘텐츠 주제별 반응 차이

## 대시보드 UI

### 페이지 구조

```
/
├── / (홈 — 오늘의 뉴스 큐)
├── /editor/[id] (카피/이미지 편집기)
├── /schedule (포스팅 스케줄)
├── /analytics (성과 대시보드)
├── /competitors (경쟁 계정 분석)
└── /settings (설정)
```

### 디자인 원칙

- 다크 모드 기본
- 모바일 반응형 (대시보드는 데스크톱 우선)
- 실시간 업데이트
- 드래그 앤 드롭으로 게시물 순서 변경

## 의존성

### 핵심 패키지

- `next` (App Router)
- `@prisma/client` + `prisma` (ORM)
- `rss-parser` (RSS 파싱)
- `cheerio` (HTML 파싱)
- `@google/generative-ai` (Gemini API)
- `@huggingface/inference` (HuggingFace API)
- `next-auth` (인증)
- `sharp` (이미지 처리)
- `node-cron` (스케줄링)
- `zod` (데이터 검증)

### UI

- `tailwindcss`
- `@tanstack/react-query`
- `recharts` (차트)
- `lucide-react` (아이콘)
- `sonner` (토스트 알림)

## API 라우트

| 라우트 | 메서드 | 설명 |
|--------|--------|------|
| `/api/cron/crawl` | GET | 뉴스 크롤링 (Cron) |
| `/api/cron/analyze` | GET | 바이럴 예측 + 선별 (Cron) |
| `/api/cron/generate` | GET | 카피라이팅 + 이미지 생성 (Cron) |
| `/api/cron/post` | GET | 자동 포스팅 (Cron) |
| `/api/cron/analytics` | GET | 인사이트 수집 (Cron) |
| `/api/news` | GET | 뉴스 목록 조회 |
| `/api/news/[id]` | GET | 뉴스 상세 조회 |
| `/api/copy/[id]` | PUT | 카피 수정 |
| `/api/copy/[id]/regenerate` | POST | 카피 재생성 |
| `/api/image/[id]` | GET | 이미지 조회 |
| `/api/image/[id]/regenerate` | POST | 이미지 재생성 |
| `/api/post` | POST | 포스팅 예약 |
| `/api/post/[id]` | DELETE | 포스팅 취소 |
| `/api/post/[id]/publish` | POST | 즉시 포스팅 |
| `/api/analytics` | GET | 성과 데이터 조회 |
| `/api/competitors` | GET | 경쟁 계정 목록 |
| `/api/competitors/[id]` | GET | 경쟁 계정 상세 |
| `/api/settings` | GET/PUT | 설정 관리 |
| `/api/auth/[...nextauth]` | ALL | 인증 |
| `/api/instagram/callback` | GET | 인스타 콜백 |

## 에러 핸들링

- 크롤링 실패: 로그 저장, 다음 사이클에서 재시도
- AI API 실패: 3회 재시도, 실패 시 수동 처리 알림
- 이미지 생성 실패: 기본 템플릿 사용, 로그 저장
- 인스타 포스팅 실패: 에러 메시지 저장, 대시보드에서 재시도 가능
- 토큰 만료: 자동 갱신, 갱신 실패 시 설정 페이지에서 재연결 안내

## 보안

- API 키는 환경변수 관리 (`.env.local`)
- 인스타 토큰은 암호화 저장
- 서버 사이드에서만 API 호출
- Rate limiting 적용
- CORS 설정

## 사전 요구사항 (Setup)

### 필수 API 키 (무료)

| 서비스 | 가입 방법 | 무료 한도 |
|--------|----------|----------|
| Google AI Studio | https://aistudio.google.com | 분당 15회 요청 |
| HuggingFace | https://huggingface.co | Inference API 무료 |
| Facebook Developer | https://developers.facebook.com | Instagram Graph API |

### 인스타그램 연동 사전 설정

1. Facebook 개발자 계정 생성
2. Facebook 앱 생성 (Instagram Graph API 활성화)
3. 인스타그램 비즈니스 또는 크리에이터 계정 필요
4. Facebook 페이지 연결
5. 액세스 토큰 발급 (앱 ID/시크릿 필요)

### 환경변수

```env
# Database
DATABASE_URL="file:./dev.db"

# Google Gemini
GOOGLE_AI_API_KEY=""

# HuggingFace
HUGGINGFACE_API_KEY=""

# Instagram Graph API
INSTAGRAM_APP_ID=""
INSTAGRAM_APP_SECRET=""
INSTAGRAM_ACCESS_TOKEN=""
INSTAGRAM_BUSINESS_ACCOUNT_ID=""

# NextAuth
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://localhost:3000"
```

## 사용자 작업 체크리스트 (진행 전 반드시 완료)

### 1단계: API 키 발급 (약 30분)

- [ ] **Google AI Studio API 키 발급**
  1. https://aistudio.google.com 접속
  2. Google 계정으로 로그인
  3. "API 키 만들기" 클릭
  4. 생성된 키 복사 (`AIza...` 형태)
  5. `.env.local`의 `GOOGLE_AI_API_KEY`에 입력

- [ ] **HuggingFace API 키 발급**
  1. https://huggingface.co 가입
  2. https://huggingface.co/settings/tokens 접속
  3. "New token" 클릭 → 읽기 권한 토큰 생성
  4. 생성된 키 복사 (`hf_...` 형태)
  5. `.env.local`의 `HUGGINGFACE_API_KEY`에 입력

### 2단계: 인스타그램 연동 설정 (약 1시간)

- [ ] **인스타그램 비즈니스/크리에이터 계정 전환**
  1. 인스타그램 앱 → 설정 → 계정 → 전문가 계정으로 전환
  2. "비즈니스" 또는 "크리에이터" 선택
  3. 카테고리 선택 (뉴스/미디어)

- [ ] **Facebook 개발자 계정 생성**
  1. https://developers.facebook.com 접속
  2. Facebook 계정으로 로그인
  3. "시작하기" 클릭

- [ ] **Facebook 앱 생성**
  1. 개발자 대시보드 → "앱 만들기" 클릭
  2. 앱 유형: "비즈니스" 선택
  3. 앱 이름 입력
  4. "Instagram Graph API" 추가
  5. **앱 ID**와 **앱 시크릿** 복사

- [ ] **인스타그램 Graph API 테스트**
  1. Facebook 그래프 API 탐색기: https://developers.facebook.com/tools/explorer/
  2. 앱 선택 → "액세스 토큰 가져오기"
  3. `instagram_basic`, `instagram_content_publish`, `pages_show_list` 권한 요청
  4. 토큰 발급 확인
  5. 토큰을长效 토큰으로 변환 (Graph API 탐색기에서 `/me?fields=id,name` 테스트)

- [ ] **Instagram 비즈니스 계정 ID 확인**
  1. Graph API 탐색기에서 `/me/accounts?fields=instagram_business_account` 호출
  2. `instagram_business_account.id` 값 복사
  3. `.env.local`의 `INSTAGRAM_BUSINESS_ACCOUNT_ID`에 입력

### 3단계: 개발 환경 준비 (약 10분)

- [ ] **Node.js 설치 확인**
  ```bash
  node --version  # v18 이상 필요
  ```

- [ ] **Git 설치 확인**
  ```bash
  git --version
  ```

- [ ] **코드 편집기 준비** (VS Code 추천)

### 4단계: 정보 수집 (선택사항)

- [ ] 경쟁 계정 팔로워 수 직접 확인 및 업데이트
- [ ] 관심 있는 추가 뉴스 크롤링 소스 제안
- [ ] 원하는 이미지 스타일 레퍼런스 수집 (스크린샷 등)

## 사용자 작업 요약

| 단계 | 작업 | 소요 시간 | 난이도 |
|------|------|----------|--------|
| 1 | Google AI Studio API 키 | 5분 | 쉬움 |
| 2 | HuggingFace API 키 | 5분 | 쉬움 |
| 3 | 인스타그램 비즈니스 전환 | 10분 | 쉬움 |
| 4 | Facebook 개발자 계정 | 10분 | 보통 |
| 5 | Facebook 앱 생성 | 15분 | 보통 |
| 6 | Graph API 토큰 발급 | 15분 | 어려움 |
| 7 | 개발 환경 준비 | 10분 | 쉬움 |
| **합계** | | **약 70분** | |
