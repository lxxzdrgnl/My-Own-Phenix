# IQHub — AI RMF 대시보드

AI 에이전트 관측성 대시보드. NIST AI RMF 지표, 실시간 평가, 멀티 에이전트 지원. [Phoenix (Arize)](https://github.com/Arize-ai/phoenix) 기반 LLM 트레이싱.

## 빠른 시작 (Docker)

```bash
docker compose up --build
```

다음이 실행됩니다:
- **대시보드** [http://localhost:3000](http://localhost:3000) — 개발 모드 (소스 수정 시 실시간 반영)
- **Phoenix** [http://localhost:6006](http://localhost:6006) — 트레이스 수집 + UI

### 환경 변수 설정

`.env.example`을 `.env.local`로 복사 후 키를 입력하세요:

```bash
cp .env.example .env.local
```

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `LANGGRAPH_API_URL` | LangGraph 에이전트 엔드포인트 | `http://localhost:2024` |
| `NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID` | LangGraph 에이전트 ID | `agent` |
| `OPENAI_API_KEY` | OpenAI API 키 (Playground 사용 시) | — |
| `PHOENIX_URL` | Phoenix 서버 주소 | `http://phoenix:6006` (Docker) |

### Docker 없이 실행

```bash
# 1. Phoenix 별도 실행
docker run -p 6006:6006 -p 4317:4317 -p 4318:4318 arizephoenix/phoenix:latest

# 2. 의존성 설치
npm install
npx prisma migrate dev

# 3. 개발 서버 실행
npm run dev
```

## 주요 기능

### 대시보드 (`/dashboard`)
- 드래그 가능한 위젯 그리드 (20종 이상)
- 날짜 범위 필터링 (프리셋 + 캘린더)
- 프로젝트별 레이아웃 저장

### NIST AI RMF MEASURE — 12개 지표
| 지표 | 소스 | 설명 |
|------|------|------|
| 환각률 | LLM eval | 컨텍스트에 근거하지 않은 정보 생성 비율 |
| 독성률 | CODE eval | 금지어 탐지 비율 |
| 답변 정확도 | LLM eval | 답변 정확성 점수 |
| 검색 관련성 | LLM eval | 검색된 문서 관련성 |
| 응답 지연시간 | Span 데이터 | P95 응답 시간 |
| 에러율 | Span 데이터 | API 실패 비율 |
| 토큰 효율성 | Span 데이터 | 호출당 평균 토큰 수 |
| 비용 추적 | Span 데이터 | 일일 LLM API 비용 |
| 사용자 불만도 | Prisma + Phoenix | 부정적 피드백 비율 |
| 도구 호출 정확도 | LLM eval | 검색 호출 적절성 |
| 가드레일 트리거 | 파생 지표 | 안전 가드레일 작동 비율 |
| 인용 정확도 | LLM eval | 컨텍스트 충실도 점수 |

### 프로젝트 뷰 (`/projects`)
- **트레이스 탭**: 트레이스 목록, 차트, 어노테이션 배지
- **MEASURE 탭**: RMF Function 카드 + 12개 지표 그리드 + Gap 분석
- **리스크 관리 탭**: 리스크 CRUD, 인시던트, 상태 도넛 차트

### 채팅 (`/`)
- LangGraph 연동 채팅 (프로젝트 선택 가능)
- 메시지별 좋아요/싫어요 → Phoenix 어노테이션으로 등록
- 대화 이력 저장 및 불러오기

### Eval 프롬프트
- `/api/eval-prompts`로 평가 프롬프트 커스텀 가능
- 도메인 비종속적 기본값 (모든 RAG 시스템에 적용 가능)
- eval worker가 런타임에 커스텀 프롬프트 읽어서 사용

## AI 에이전트 연결 가이드

어떤 AI 에이전트든 Phoenix에 트레이스를 보내면 대시보드에서 자동으로 평가 및 모니터링됩니다.

### 구조 개요

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────────┐
│  에이전트 A      │     │  에이전트 B      │     │  에이전트 C             │
│  (legal-rag)    │     │  (dexter)       │     │  (custom)              │
│  Python/LangGraph│    │  TS/LangChain   │     │  아무 프레임워크        │
└───────┬─────────┘     └───────┬─────────┘     └───────┬─────────────────┘
        │ OTLP                  │ OTLP                  │ OTLP
        ▼                       ▼                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          Phoenix (트레이스 수집)                          │
│                     http://localhost:6006                                │
│                     OTLP: localhost:4317 (gRPC) / 4318 (HTTP)           │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │ 읽기
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    IQHub 대시보드 (http://localhost:3000)                 │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │ Eval     │  │ MEASURE  │  │ 위젯     │  │ Chat UI  │                │
│  │ Worker   │  │ 12 지표  │  │ 대시보드  │  │ (선택)   │                │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                │
└──────────────────────────────────────────────────────────────────────────┘
```

### 역할 분담

| 역할 | 담당 | 필수 여부 |
|------|------|----------|
| 트레이스 전송 | 각 에이전트 | **필수** — instrumentor 설정 |
| 자동 평가 (eval) | 대시보드 | 자동 — 설정 불필요 |
| 모니터링/지표 | 대시보드 | 자동 — 설정 불필요 |
| Chat UI 연결 | 각 에이전트 | **선택** — 자체 UI 있으면 불필요 |

---

### Phoenix 트레이스 연동 가이드

Phoenix는 OpenTelemetry 표준을 사용합니다. 에이전트에 instrumentor만 추가하면 모든 LLM 호출이 자동으로 트레이스됩니다.

#### Python + LangChain

```bash
pip install openinference-instrumentation-langchain opentelemetry-exporter-otlp-proto-http opentelemetry-sdk
```

```python
# instrumentation.py — 에이전트 시작 시 1번만 실행
import os
from openinference.instrumentation.langchain import LangChainInstrumentor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

# Phoenix 엔드포인트 (Docker Compose 내부: http://phoenix:4318)
PHOENIX_OTLP = os.getenv("PHOENIX_OTLP_ENDPOINT", "http://localhost:4318/v1/traces")

# 프로젝트 이름 — 대시보드에서 이 이름으로 표시됨
os.environ["PHOENIX_PROJECT_NAME"] = "my-agent"

tracer_provider = TracerProvider()
tracer_provider.add_span_processor(
    SimpleSpanProcessor(OTLPSpanExporter(endpoint=PHOENIX_OTLP))
)

LangChainInstrumentor().instrument(tracer_provider=tracer_provider)
```

```python
# main.py
import instrumentation  # 맨 위에 import — 이것만으로 자동 트레이싱 시작
from langchain_openai import ChatOpenAI
# ... 이후 모든 LangChain 호출이 자동으로 Phoenix에 기록됨
```

#### Python + OpenAI 직접 사용

```bash
pip install openinference-instrumentation-openai opentelemetry-exporter-otlp-proto-http opentelemetry-sdk
```

```python
from openinference.instrumentation.openai import OpenAIInstrumentor
# tracer_provider 설정은 위와 동일
OpenAIInstrumentor().instrument(tracer_provider=tracer_provider)
```

#### TypeScript/Bun + LangChain.js

```bash
bun add @arizeai/openinference-instrumentation-langchain \
       @opentelemetry/sdk-trace-node \
       @opentelemetry/exporter-trace-otlp-http \
       @opentelemetry/sdk-trace-base
```

```typescript
// src/instrumentation.ts
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { LangChainInstrumentor } from "@arizeai/openinference-instrumentation-langchain";

const PHOENIX_OTLP = process.env.PHOENIX_OTLP_ENDPOINT || "http://localhost:4318/v1/traces";

const provider = new NodeTracerProvider();
provider.addSpanProcessor(
  new SimpleSpanProcessor(new OTLPTraceExporter({ url: PHOENIX_OTLP }))
);
provider.register();

new LangChainInstrumentor().manuallyInstrument();

console.log("Phoenix instrumentation initialized");
```

```typescript
// src/index.ts — 맨 위에 추가
import "./instrumentation";
// ... 기존 코드
```

#### TypeScript + OpenAI 직접 사용

```bash
bun add @arizeai/openinference-instrumentation-openai \
       @opentelemetry/sdk-trace-node \
       @opentelemetry/exporter-trace-otlp-http
```

```typescript
import { OpenAIInstrumentor } from "@arizeai/openinference-instrumentation-openai";
// provider 설정은 위와 동일
new OpenAIInstrumentor().manuallyInstrument();
```

#### 지원되는 프레임워크 instrumentor 목록

| 프레임워크 | Python 패키지 | TypeScript 패키지 |
|-----------|--------------|-------------------|
| LangChain | `openinference-instrumentation-langchain` | `@arizeai/openinference-instrumentation-langchain` |
| OpenAI | `openinference-instrumentation-openai` | `@arizeai/openinference-instrumentation-openai` |
| LlamaIndex | `openinference-instrumentation-llama-index` | — |
| CrewAI | `openinference-instrumentation-crewai` | — |
| Anthropic | `openinference-instrumentation-anthropic` | — |
| Google Gemini | `openinference-instrumentation-vertexai` | — |

전체 목록: [OpenInference GitHub](https://github.com/Arize-ai/openinference)

#### 환경 변수

```bash
# .env에 추가
PHOENIX_OTLP_ENDPOINT=http://localhost:4318/v1/traces  # Docker 내부: http://phoenix:4318/v1/traces
PHOENIX_PROJECT_NAME=my-agent                           # 대시보드에 표시될 프로젝트 이름
```

#### 확인 방법

1. 에이전트 실행
2. LLM 호출 발생 (채팅, 질의 등)
3. Phoenix UI (`http://localhost:6006`) 접속 → 프로젝트에서 트레이스 확인
4. IQHub 대시보드 (`http://localhost:3000`) → 프로젝트 목록에 자동 표시

---

### Chat UI 연결 가이드 (선택사항)

에이전트가 자체 UI를 가지고 있다면 (CLI, WhatsApp, 웹 등) Chat UI 연결은 불필요합니다. 트레이스만 Phoenix에 보내면 모니터링과 평가가 동작합니다.

대시보드의 Chat UI에 에이전트를 연결하려면 아래 중 하나의 방식으로 HTTP API를 노출하세요.

#### 방식 1: LangGraph (권장 — 현재 legal-rag가 사용 중)

LangGraph 서버가 자동으로 HTTP API를 제공합니다:

```bash
# LangGraph 서버 실행
langgraph dev  # 또는 langgraph up
```

대시보드 `.env.local`:
```bash
LANGGRAPH_API_URL=http://localhost:2024
NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID=agent
```

별도 작업 없이 Chat UI가 바로 연결됩니다.

#### 방식 2: REST + SSE 스트리밍 (범용)

LangGraph를 사용하지 않는 에이전트는 아래 형식의 HTTP API를 노출하면 됩니다:

**엔드포인트:**
```
POST /chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "안녕하세요" }
  ],
  "thread_id": "optional-session-id",
  "project": "optional-project-name"
}
```

**응답:** Server-Sent Events (SSE) 스트림
```
data: {"event": "messages/partial", "data": [{"role": "assistant", "content": "안녕"}]}

data: {"event": "messages/partial", "data": [{"role": "assistant", "content": "안녕하세요! 무엇을"}]}

data: {"event": "messages/complete", "data": [{"role": "assistant", "content": "안녕하세요! 무엇을 도와드릴까요?"}]}
```

**Python (FastAPI) 예시:**
```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import json, asyncio

app = FastAPI()

@app.post("/chat")
async def chat(request: dict):
    messages = request.get("messages", [])
    user_msg = messages[-1]["content"] if messages else ""

    async def stream():
        # 에이전트 실행 (여기에 본인의 에이전트 로직)
        response = ""
        async for chunk in your_agent.run(user_msg):
            response += chunk
            data = json.dumps({
                "event": "messages/partial",
                "data": [{"role": "assistant", "content": response}]
            })
            yield f"data: {data}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
```

**TypeScript (Express) 예시:**
```typescript
import express from "express";

const app = express();
app.use(express.json());

app.post("/chat", async (req, res) => {
  const { messages } = req.body;
  const userMsg = messages[messages.length - 1]?.content || "";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");

  // 에이전트 실행 (여기에 본인의 에이전트 로직)
  for await (const chunk of yourAgent.run(userMsg)) {
    const data = JSON.stringify({
      event: "messages/partial",
      data: [{ role: "assistant", content: chunk }]
    });
    res.write(`data: ${data}\n\n`);
  }
  res.end();
});
```

#### 자체 UI가 있는 에이전트 (예: Dexter)

Dexter처럼 CLI나 WhatsApp 등 자체 UI가 있는 에이전트는:

1. **Phoenix instrumentor만 추가** → 트레이스 자동 수집
2. **Chat UI 연결 불필요** → 자체 UI에서 대화
3. **대시보드에서 모니터링** → 트레이스 기반 eval + 지표 확인

```
[사용자] → [Dexter CLI/WhatsApp] → [Dexter Agent] → [LLM 호출]
                                                          ↓ (자동)
                                                     [Phoenix trace]
                                                          ↓
                                                [대시보드 모니터링 + eval]
```

## 기술 스택

- **Next.js 16** (App Router) + **TypeScript** + **React 19**
- **Tailwind CSS 4** + **Radix UI** + **class-variance-authority**
- **Prisma** + **SQLite** (레이아웃, 피드백, 리스크)
- **Firebase Auth** (사용자 인증)
- **Phoenix (Arize)** (LLM 관측성)
- **Highcharts** (데이터 시각화)
- **react-grid-layout** (드래그 가능한 대시보드)
- **react-day-picker** (날짜 필터링)

## 프로젝트 구조

```
app/
├── page.tsx                    # 채팅 UI
├── dashboard/page.tsx          # 위젯 대시보드
├── projects/                   # 프로젝트 브라우저 + MEASURE + 리스크
├── playground/                 # 프롬프트 A/B 비교
├── prompts/                    # 프롬프트 CRUD
├── api/
│   ├── phoenix/route.ts        # Phoenix API 프록시
│   ├── feedback/               # 피드백 CRUD + 통계
│   ├── eval-prompts/route.ts   # Eval 프롬프트 설정
│   ├── risks/route.ts          # 리스크 CRUD
│   ├── incidents/route.ts      # 인시던트 CRUD
│   └── dashboard/layout/       # 레이아웃 저장

components/
├── dashboard/widgets/          # 20종 이상 위젯 렌더러
├── assistant-ui/               # 채팅 컴포넌트
├── chat/                       # 메시지 피드백
└── ui/                         # 공통 UI 컴포넌트

lib/
├── phoenix.ts                  # Phoenix API 클라이언트
├── rmf-utils.ts                # RMF 지표, 임계값, 계산 로직
├── dashboard-utils.ts          # 차트 헬퍼, 어노테이션 유틸
└── prisma.ts                   # 데이터베이스 클라이언트
```

## 원본

[seanlee10/legal-rag-ui](https://github.com/seanlee10/legal-rag-ui) 기반. Phoenix 연동, RMF 대시보드, eval 시스템, 멀티 에이전트 지원을 추가했습니다.
