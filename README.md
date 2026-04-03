# My Own Phenix

법률 RAG 챗봇 + Phoenix 프롬프트 비교 도구입니다. LangGraph 백엔드와 연동하여 법률 질의응답을 제공하고, Phoenix 트레이스 기반으로 프롬프트를 비교/관리할 수 있습니다.

## Origin

이 프로젝트는 [seanlee10/legal-rag-ui](https://github.com/seanlee10/legal-rag-ui)를 기반으로 만들었습니다. 원본 프로젝트의 Chat UI와 LangGraph 연동 구조를 그대로 사용하고, Phoenix 연동 (Prompt Playground, Prompt 관리) 기능을 추가했습니다.

## 페이지 구조

| 경로 | 기능 |
|------|------|
| `/` | Chat — LangGraph 연동 법률 RAG 챗봇 |
| `/playground` | Playground — 트레이스 선택 후 프롬프트 A/B 비교 |
| `/prompts` | Prompts — 프롬프트 CRUD (생성/조회/수정/삭제) |

## 기술 스택

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript**
- **@assistant-ui/react** — 대화형 UI 프레임워크
- **LangGraph SDK** — 백엔드 API 연동
- **Tailwind CSS 4** + **shadcn/ui** — 스타일링 및 UI 컴포넌트
- **Phoenix API** — 트레이스 조회, 프롬프트 관리

## 시작하기

### 1. 환경 변수 설정

`.env.local` 파일을 생성하고 다음 변수를 설정하세요:

```
LANGCHAIN_API_KEY=local
LANGGRAPH_API_URL=http://localhost:2024
NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID=agent
OPENAI_API_KEY=your_openai_api_key
PHOENIX_URL=http://localhost:6006
```

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `LANGCHAIN_API_KEY` | LangGraph 인증 키 | `local` (로컬 개발 시) |
| `LANGGRAPH_API_URL` | LangGraph 서버 주소 | `http://localhost:2024` |
| `NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID` | LangGraph 에이전트 ID | `agent` |
| `OPENAI_API_KEY` | OpenAI API 키 (Playground에서 프롬프트 비교 시 사용) | - |
| `PHOENIX_URL` | Phoenix 서버 주소 | `http://localhost:6006` |

### 2. 의존성 설치

```bash
npm install
```

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 사전 조건

- **LangGraph 서버** (`localhost:2024`) — Chat 페이지 사용 시 필요
- **Phoenix 서버** (`localhost:6006`) — Playground, Prompts 페이지 사용 시 필요

## 프로젝트 구조

```
app/
├── assistant.tsx              # 메인 챗봇 컴포넌트 (LangGraph 런타임 연동)
├── api/
│   ├── [..._path]/route.ts    # LangGraph API 프록시
│   ├── phoenix/route.ts       # Phoenix API 프록시 (CORS 우회)
│   └── llm/route.ts           # OpenAI LLM 호출 (서버사이드)
├── playground/                # 프롬프트 A/B 비교 페이지
├── prompts/                   # 프롬프트 CRUD 관리 페이지
├── globals.css
└── layout.tsx

components/
├── assistant-ui/              # 채팅 UI 컴포넌트
└── ui/                        # shadcn/ui 기본 컴포넌트

lib/
├── chatApi.ts                 # LangGraph SDK 클라이언트
├── phoenix.ts                 # Phoenix API 클라이언트 (트레이스, 프롬프트, LLM)
└── utils.ts                   # 유틸리티 함수
```
