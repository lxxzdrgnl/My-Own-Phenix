"use client";

interface StatCardProps {
  value: string | number;
  label: string;
  trend?: string;
}

export function StatCard({ value, label, trend }: StatCardProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <span className="text-3xl font-bold">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
      {trend && (
        <span className="text-xs text-muted-foreground">{trend}</span>
      )}
    </div>
  );
}
