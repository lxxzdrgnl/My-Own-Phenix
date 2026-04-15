"use client";

import { cn } from "@/lib/utils";

interface RmfFunctionCardsProps {
  measureScore?: number;
  className?: string;
}

interface FunctionDef {
  key: string;
  name: string;
  label: string;
  color: string;
  description: string;
}

const RMF_FUNCTIONS: FunctionDef[] = [
  {
    key: "GOVERN",
    name: "GOVERN",
    label: "거버넌스",
    color: "#3b82f6",
    description: "AI 정책 수립, 역할/책임 정의, 윤리 원칙, 교육·훈련",
  },
  {
    key: "MAP",
    name: "MAP",
    label: "리스크 식별",
    color: "#7c3aed",
    description: "AI 시스템 인벤토리, 리스크 카테고리, 영향 범위 분석",
  },
  {
    key: "MEASURE",
    name: "MEASURE",
    label: "리스크 측정",
    color: "#10b981",
    description: "성능 지표, 편향성 평가, 환각/독성 모니터링",
  },
  {
    key: "MANAGE",
    name: "MANAGE",
    label: "리스크 대응",
    color: "#14b8a6",
    description: "개선 액션, 알림 체계, 인시던트 대응, 감사 이력",
  },
];

export function RmfFunctionCards({ measureScore, className }: RmfFunctionCardsProps) {
  return (
    <div className={cn("grid grid-cols-4 gap-4 p-4", className)}>
      {RMF_FUNCTIONS.map((fn) => {
        const score =
          fn.key === "MEASURE" && measureScore !== undefined
            ? `${measureScore.toFixed(1)}%`
            : "—";

        return (
          <div
            key={fn.key}
            className="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
          >
            {/* Color bar */}
            <div
              className="h-1.5 w-full shrink-0"
              style={{ backgroundColor: fn.color }}
            />

            <div className="flex flex-col gap-2 p-4 flex-1">
              {/* Function name */}
              <span
                className="text-base font-bold tracking-wide"
                style={{ color: fn.color }}
              >
                {fn.name}
              </span>

              {/* Korean label */}
              <span className="text-sm font-medium text-foreground">
                {fn.label}
              </span>

              {/* Score */}
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {score}
              </span>

              {/* Description */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                {fn.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
