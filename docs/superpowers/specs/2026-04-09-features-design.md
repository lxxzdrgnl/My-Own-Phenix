# My Own Phenix - 기능 확장 설계

## 개요

법률 RAG 챗봇 UI에 4가지 기능을 추가한다.
- Firebase Auth Google 로그인
- 채팅 기록 사이드바
- Phoenix 메트릭스/평가 대시보드 (위젯 기반)

## 1. Firebase Auth + Google 로그인

### 동작
- 채팅 페이지(`/`)는 공개. 누구나 접근 가능.
- 채팅 input 포커스 시 미로그인이면 모달 표시: "로그인이 필요한 서비스입니다" + [확인] [취소]
  - [확인] → `/login`으로 이동
  - [취소] → 모달 닫힘, input 비활성 유지
  - 모달 dismiss 후 재포커스 시 무한 모달 방지 (세션 단위 dismissed 상태)
- 다른 탭 클릭 시(playground, prompts, projects, dashboard) 미로그인이면 같은 모달 → `/login`
- 로그인 성공 → 이전 페이지로 복귀

### 파일 구조
- `lib/firebase.ts` — Firebase 초기화 (Auth only)
- `lib/auth-context.tsx` — AuthContext + useAuth() 훅
- `components/auth-modal.tsx` — 로그인 필요 모달
- `app/login/page.tsx` — Google 로그인 페이지

### Firebase 설정
- projectId: my-own-phenix
- authDomain: my-own-phenix.firebaseapp.com

## 2. SQLite + Prisma

### 스키마
```prisma
model User {
  id        String   @id  // Firebase uid
  email     String
  name      String?
  createdAt DateTime @default(now())
  threads   Thread[]
  layout    DashboardLayout?
}

model Thread {
  id                String   @id @default(cuid())
  userId            String
  langGraphThreadId String
  title             String   @default("새 대화")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  user              User     @relation(fields: [userId], references: [id])
}

model DashboardLayout {
  id        String   @id @default(cuid())
  userId    String   @unique
  layout    String   // JSON string (위젯 배치/크기)
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id])
}
```

### API Routes
- `POST /api/auth/sync` — 로그인 시 User upsert
- `GET/POST /api/threads` — 사용자별 thread CRUD
- `GET/PUT /api/dashboard/layout` — 위젯 레이아웃 저장/조회

## 3. 채팅 사이드바

### 레이아웃
- 왼쪽 사이드바: 접기/펼치기 토글
- [+ 새 대화] 버튼
- 대화 목록: 최신순, 날짜 그룹핑 없음
- 상단 Nav 탭은 기존 유지 (Chat, Playground, Prompts, Projects) + Dashboard 추가

### 동작
- 새 대화 → LangGraph thread 생성 + SQLite에 기록
- 목록 조회 → SQLite (WHERE userId)
- 대화 클릭 → LangGraph threads.getState()로 메시지 로드
- 제목 → 첫 메시지 기반 자동 생성 (30자 truncate)
- 삭제 → SQLite에서 제거

### 기존 컴포넌트 활용
- `components/assistant-ui/thread-list.tsx` 확장

## 4. 대시보드 (위젯)

### 라우트
- `/dashboard` 페이지 추가

### 위젯 시스템
- `react-grid-layout`으로 드래그 & 리사이즈
- 위젯 배치는 SQLite DashboardLayout에 JSON으로 저장

### 위젯 목록
| 위젯 | 차트 | 데이터 |
|------|------|--------|
| Hallucination Rate | Highcharts line | Phoenix annotation |
| QA Correctness | Highcharts line | Phoenix annotation |
| RAG Relevance | Highcharts gauge/bar | Phoenix annotation |
| Banned Word 감지 | Highcharts bar | Phoenix annotation |
| 총 질의 수 | 숫자 카드 | Phoenix spans |
| 평균 응답 시간 | 숫자 카드 | Phoenix spans |
| 에러율 | 숫자 카드 | Phoenix spans |

### 위젯 관리
- [+ 위젯 추가] 버튼 → 드롭다운 선택
- X 버튼으로 제거
- 드래그로 위치 이동, 모서리로 크기 조절

### 데이터 흐름
- Next.js API `/api/phoenix` → Phoenix REST API → spans/annotations 조회 → Highcharts 렌더링

## 기술 스택 추가분

| 패키지 | 용도 |
|--------|------|
| firebase | Auth (Google 로그인) |
| prisma + @prisma/client | SQLite ORM |
| react-grid-layout | 위젯 드래그/리사이즈 |
| highcharts + highcharts-react-official | 차트 |

## 아키텍처

```
사용자 ← Next.js → LangGraph (대화)
                  → Phoenix (메트릭스/평가)
                  → SQLite/Prisma (유저/레이아웃/thread 매핑)
                  → Firebase Auth (로그인만)
```
