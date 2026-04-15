# NIST AI RMF Dashboard + Date Filter + Feedback Design

## Overview

대시보드와 프로젝트 뷰에 날짜 필터, NIST AI RMF MEASURE 12개 지표, 사용자 피드백(좋아요/싫어요), RMF 4 Function 카드를 추가한다.

## 1. 날짜 필터 (Date Range Picker)

### 컴포넌트
- **파일**: `components/ui/date-range-picker.tsx`
- 프리셋 버튼: 오늘 / 7일 / 30일
- 캘린더 팝업: 커스텀 날짜 범위 직접 선택
- 반환값: `{ from: Date, to: Date }`
- 라이브러리: `react-day-picker` + Radix Popover

### 사용 위치
- `app/dashboard/page.tsx` — ProjectSelector 옆에 배치
- `app/projects/projects-manager.tsx` — 필터 영역에 배치

### 데이터 필터링
- Phoenix API 호출 시 `start_time`, `end_time` 파라미터 전달
- `lib/phoenix.ts`의 `fetchTraces()`에 날짜 파라미터 추가
- 위젯/지표 모두 필터된 span 데이터 기준으로 렌더링

---

## 2. MEASURE 12개 지표

### 지표 목록 및 데이터 소스

| # | 지표명 | annotation name | 소스 | 계산 방식 |
|---|--------|----------------|------|----------|
| 1 | 환각률 | `hallucination` | LLM eval (기존) | hallucinated label 비율 |
| 2 | 독성률 | `banned_word` | CODE eval (기존) | detected 비율 |
| 3 | 답변 정확도 | `qa_correctness` | LLM eval (기존) | score 평균 |
| 4 | 검색 관련성 | `rag_relevance` | LLM eval (기존) | score 평균 |
| 5 | 응답 지연시간 | — | span duration | P95 값 |
| 6 | 에러율 | — | span status_code | ERROR 비율 |
| 7 | 토큰 효율성 | — | span token_count | 평균 토큰 수 |
| 8 | 비용 추적 | — | calcCost() | 일일 합계 |
| 9 | 사용자 불만도 | `user_feedback` | Prisma + Phoenix | 싫어요 비율 |
| 10 | 도구 호출 정확도 | `tool_calling` | CODE eval (신규) | TOOL span 성공 비율 |
| 11 | 가드레일 트리거 | `guardrail` | CODE eval (신규) | banned_word detected + hallucination 높은 span 비율 |
| 12 | 인용 정확도 | `citation` | LLM eval (신규) | score 평균 |

### 상태 도트 (Status Indicator) — 핵심 지표 해석 가이드

각 지표 카드에 초록/노랑/빨강 도트 표시. 임계값:

| 지표 | 초록 (정상) | 노랑 (주의) | 빨강 (위험) |
|------|-----------|-----------|-----------|
| 환각률 | < 5% | 5~10% | > 10% |
| 독성률 | < 3% | 3~5% | > 5% |
| 답변 정확도 | > 90% | 80~90% | < 80% |
| 검색 관련성 | > 85% | 70~85% | < 70% |
| 응답 지연시간 (P95) | < 2s | 2~5s | > 5s |
| 에러율 | < 3% | 3~5% | > 5% |
| 토큰 효율성 | < 1500 avg | 1500~3000 | > 3000 |
| 비용 추적 | < $100/day | $100~200 | > $200/day |
| 사용자 불만도 | < 5% | 5~15% | > 15% |
| 도구 호출 정확도 | > 90% | 80~90% | < 80% |
| 가드레일 트리거 | < 3% | 3~5% | > 5% |
| 인용 정확도 | > 85% | 70~85% | < 70% |

각 지표 카드에 설명 텍스트도 표시 (예: "LLM이 사실과 다른 정보를 생성하는 비율")

### 프로젝트 뷰 UI — 탭 구조
프로젝트 상세 영역을 3개 탭으로 분리:

```
[트레이스] [MEASURE 지표] [리스크 관리]
```

**트레이스 탭** (기존 그대로):
- traces 목록 + 차트 + stat cards + 필터

**MEASURE 지표 탭**:
- 상단: RMF 4 Function 카드 (GOVERN / MAP / MEASURE / MANAGE) 가로 배치
- 중단: 12개 MEASURE 지표 4x3 그리드 (Image 3 디자인)
  - 카드 = 상태 도트(초록/노랑/빨강) + 지표명 + 값 + 라벨 + 설명 텍스트
- 하단: Gov Score vs Eval Score Gap 분석 차트 + 리스크 테이블

**리스크 관리 탭** (MANAGE):
- 상단: stat cards 5개 (커버리지, 미처리 리스크, 활성 인시던트, 기한 초과, 평균 MTTR)
- 중단 좌: 처리 상태 분포 도넛 차트
- 중단 우: 처리 계획 목록 테이블 (필터 가능)

컴포넌트: `components/dashboard/widgets/measure-grid.tsx`

### 대시보드 위젯
- 위젯 레지스트리에 12개 MEASURE 위젯 타입 추가
- 카테고리: "RMF" 카테고리로 `AddWidgetMenu`에 추가
- 각 위젯은 기존 StatCard/HighchartWidget 활용 (summary/trend/detail 뷰)

---

## 3. 신규 Eval 구현 (legal-rag-self-improve-demo)

### 3-1. Tool Calling Eval (`tool_calling`)
- **타입**: CODE eval
- **위치**: `evaluator.py`에 `_tool_calling_check()` 추가, `_backfill_evals()`에 통합
- **로직**: TOOL span의 status_code 확인 → OK면 score 1.0, ERROR면 0.0
- **annotation**: `tool_calling`, annotator_kind="CODE"

### 3-2. Guardrail Eval (`guardrail`)
- **타입**: CODE eval
- **위치**: `evaluator.py`에 `_guardrail_check()` 추가, `_backfill_evals()`에 통합
- **로직**: 해당 trace의 banned_word=detected OR hallucination score > 0.5면 guardrail triggered (score 1.0)
- **annotation**: `guardrail`, annotator_kind="CODE"

### 3-3. Citation Eval (`citation`)
- **타입**: LLM eval
- **위치**: `evaluator.py`에 커스텀 CitationEvaluator 추가, `_backfill_evals()`에 통합
- **로직**: 응답에서 인용/참조한 내용이 context 문서와 실제 일치하는지 LLM이 판단
- **annotation**: `citation`, annotator_kind="LLM"
- **구현**: Phoenix `llm_classify` 또는 커스텀 prompt template 사용

### 변경 파일
- `legal-rag-self-improve-demo/src/agent/evaluator.py` — 3개 eval 함수 추가, `evaluate_response()`에 통합
- `legal-rag-self-improve-demo/src/agent/__init__.py` — `ALL_ANNOTATIONS`에 3개 추가, `_backfill_evals()`에 통합

---

## 4. 좋아요/싫어요 피드백

### UI
- `app/assistant.tsx` (또는 메시지 컴포넌트)에서 AI 응답 하단에 아이콘 버튼 3개:
  - 복사 (클립보드 복사)
  - 좋아요 (thumbs up)
  - 싫어요 (thumbs down)
- 필수 아님 — 누르지 않아도 됨

### 토글 동작
- **초기 상태**: 좋아요(outline) + 싫어요(outline) 둘 다 보임
- **좋아요 클릭**: 좋아요 아이콘 검정(filled)으로 변경, 싫어요 버튼 숨김
- **좋아요 다시 클릭**: 좋아요 취소 → 초기 상태로 복귀 (좋아요/싫어요 둘 다 다시 보임)
- **싫어요 클릭**: 싫어요 아이콘 검정(filled)으로 변경, 좋아요 버튼 숨김
- **싫어요 다시 클릭**: 싫어요 취소 → 초기 상태로 복귀
- 즉, 선택하면 반대쪽 버튼이 사라지고, 같은 버튼 다시 누르면 취소

### 데이터 저장
- **Prisma**: `MessageFeedback` 모델 추가
  ```prisma
  model MessageFeedback {
    id        String   @id @default(cuid())
    messageId String
    userId    String
    value     String   // "up" | "down"
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    message   Message  @relation(fields: [messageId], references: [id])
    user      User     @relation(fields: [userId], references: [id])
    @@unique([messageId, userId])
  }
  ```
- **Phoenix**: `user_feedback` annotation (score: 1.0=좋아요, 0.0=싫어요)

### API
- **`app/api/feedback/route.ts`**
  - `POST`: 피드백 생성/업데이트 (Prisma upsert + Phoenix annotation 업로드)
  - `GET`: messageId 기준 피드백 조회

### 대화 불러오기
- 기존 thread 메시지 로드 시 각 메시지의 feedback 상태도 함께 조회
- `app/api/user-threads/[id]/messages/route.ts`에서 feedback include

---

## 5. RMF 4 Function 카드

### UI
- 프로젝트 뷰 상세 영역 상단에 4개 카드 가로 배치
- 카드: GOVERN / MAP / MEASURE / MANAGE
- 각 카드: Function명 + 한글 설명 + 점수(%) + 색상 바 (파랑/보라/초록/민트)
- 컴포넌트: `components/dashboard/widgets/rmf-function-card.tsx`

### 점수 계산
- **1차 구현**: MEASURE만 자동 계산 (12개 지표 기반)
- **GOVERN, MAP, MANAGE**: 추후 구현 (체크리스트 or 자동화 방식 결정 후)
- MEASURE 점수 계산 로직은 12개 지표 구현 후 결정

### 대시보드 위젯
- `rmf_overview` 위젯 타입 추가 — 4 Function 카드를 한 위젯에 표시
- AddWidgetMenu의 "RMF" 카테고리에 포함

---

## 5-1. Gov Score vs Eval Score Gap 분석

### 차트
- Highcharts grouped bar chart: 시스템별 Gov Score(파랑) vs Eval Score(초록) 비교
- X축: AI 시스템명, Y축: 점수 (0~100)
- worst first 정렬 (Gap이 큰 순)

### Gap 상태 분류
| 상태 | 조건 | 색상 |
|------|------|------|
| NORMAL | Gap >= -5 | 초록 |
| WARNING | -15 <= Gap < -5 | 노랑 |
| CRITICAL | Gap < -15 | 빨강 |

### 리스크 테이블
- 컬럼: RISK level, GOV SCORE, EVAL SCORE, GAP, STATUS, RECOMMENDED ACTION
- STATUS 배지: CRITICAL(빨강), WARNING(노랑), NORMAL(초록)
- RECOMMENDED ACTION: Gap 크기에 따라 자동 생성
  - CRITICAL: "IMMEDIATE ACTION: Escalate to CISO and AI Ethics Board."
  - WARNING: "Review and update governance policies."
  - NORMAL: "Continue monitoring."

### 데이터 소스
- Gov Score: GOVERN function 점수 (추후 구현 시 연동)
- Eval Score: MEASURE 12개 지표 기반 종합 점수
- 1차 구현에서는 Eval Score만 자동, Gov Score는 placeholder

---

## 5-2. MANAGE 리스크 관리 뷰

### Stat Cards (상단 5개)
| 카드 | 값 | 설명 |
|------|---|------|
| MANAGE 커버리지 | % | 이행 커버리지 (처리된 리스크 / 전체 리스크) |
| 미처리 리스크 | 건수 | 진행 중 + 미처리 |
| 활성 인시던트 | 건수 | 마처리 또는 조사 중 |
| 기한 초과 조치 | 건수 | 기한 초과 시정 조치 |
| 평균 MTTR | 시간(h) | 평균 해결 시간 |

각 카드에 전분기/전주 대비 트렌드 표시 (% 변화 + 화살표)

### 처리 상태 분포 (도넛 차트)
- Highcharts donut chart
- 카테고리: MITIGATED, ACCEPTED, TRANSFERRED, IN PROGRESS, OPEN
- 각각 다른 색상

### 처리 계획 목록 (테이블)
- 컬럼: 리스크명, 시스템, 고유 위험(CRITICAL/HIGH/MEDIUM/LOW), 처리 방안, 상태, 담당자
- 상태 배지: In Progress, Mitigated, Open 등
- 고유 위험 배지: CRITICAL(빨강), HIGH(주황)
- 필터: 전체 상태 드롭다운

### 데이터 저장
- Prisma 모델 추가: `RiskItem`, `Incident`
  ```prisma
  model RiskItem {
    id             String   @id @default(cuid())
    projectId      String
    name           String
    system         String
    riskLevel      String   // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
    mitigation     String
    status         String   // "OPEN" | "IN_PROGRESS" | "MITIGATED" | "ACCEPTED" | "TRANSFERRED"
    assignee       String?
    dueDate        DateTime?
    resolvedAt     DateTime?
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt
  }

  model Incident {
    id          String   @id @default(cuid())
    projectId   String
    title       String
    severity    String   // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
    status      String   // "OPEN" | "INVESTIGATING" | "RESOLVED"
    createdAt   DateTime @default(now())
    resolvedAt  DateTime?
  }
  ```

### API
- `app/api/risks/route.ts` — CRUD for RiskItem
- `app/api/incidents/route.ts` — CRUD for Incident

---

## 6. 구현 순서

1. **날짜 필터 컴포넌트** + Phoenix API 날짜 파라미터 연동
2. **12개 MEASURE 지표** — 프로젝트 뷰 그리드 + 대시보드 위젯 (임계값 + 상태 도트)
3. **3개 신규 eval** (tool_calling, guardrail, citation) — eval 파이프라인에 추가
4. **좋아요/싫어요 피드백** — Prisma 모델 + API + 채팅 UI + Phoenix 연동
5. **RMF 4 Function 카드** — 프로젝트 뷰 + 대시보드 위젯 (MEASURE 자동 계산)
6. **Gov vs Eval Gap 분석** — 비교 차트 + 리스크 테이블 + 상태 분류
7. **MANAGE 리스크 관리** — Prisma 모델 + CRUD API + stat cards + 도넛 차트 + 리스크 테이블

---

## 7. 파일 변경 목록

### 신규 파일
| 파일 | 용도 |
|------|------|
| `components/ui/date-range-picker.tsx` | 날짜 필터 공통 컴포넌트 |
| `components/dashboard/widgets/measure-grid.tsx` | MEASURE 12개 지표 그리드 |
| `components/dashboard/widgets/rmf-function-card.tsx` | RMF Function 카드 |
| `components/dashboard/widgets/gap-analysis.tsx` | Gov vs Eval Gap 차트 + 테이블 |
| `components/dashboard/widgets/manage-view.tsx` | MANAGE 리스크 관리 뷰 |
| `components/chat/message-feedback.tsx` | 좋아요/싫어요 버튼 |
| `app/api/feedback/route.ts` | 피드백 API |
| `app/api/risks/route.ts` | 리스크 CRUD API |
| `app/api/incidents/route.ts` | 인시던트 CRUD API |
| `lib/rmf-utils.ts` | RMF 점수 계산, 지표 임계값, 상태 도트 로직 |

### 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `lib/phoenix.ts` | fetchTraces에 날짜 파라미터 추가 |
| `app/dashboard/page.tsx` | 날짜 필터 추가, RMF 위젯 지원 |
| `app/projects/projects-manager.tsx` | 날짜 필터 + MEASURE 그리드 + RMF 카드 추가 |
| `components/dashboard/widgets/registry.tsx` | RMF/MEASURE 위젯 타입 등록 |
| `components/dashboard/add-widget-menu.tsx` | RMF 카테고리 추가 |
| `app/assistant.tsx` | 메시지 피드백 버튼 추가 |
| `app/api/user-threads/[id]/messages/route.ts` | feedback include |
| `prisma/schema.prisma` | MessageFeedback 모델 추가 |
| `lib/dashboard-utils.ts` | MEASURE 집계 함수 추가 |

### 외부 프로젝트 (legal-rag-self-improve-demo)
| 파일 | 변경 내용 |
|------|----------|
| `src/agent/evaluator.py` | tool_calling, guardrail, citation eval 추가 |
| `src/agent/__init__.py` | ALL_ANNOTATIONS 확장, backfill 통합 |
