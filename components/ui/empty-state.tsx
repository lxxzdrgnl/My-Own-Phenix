import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function LoadingState({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center py-16 text-sm text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading...
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-muted-foreground",
        className,
      )}
    >
      <Icon className="mb-3 h-10 w-10 opacity-15" />
      <p className="text-sm">{title}</p>
      {description && (
        <p className="text-sm opacity-60">{description}</p>
      )}
    </div>
  );
}

export { LoadingState, EmptyState };
