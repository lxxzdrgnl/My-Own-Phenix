import * as React from "react";
import { cn } from "@/lib/utils";

function FormLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </label>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-400">
      {message}
    </p>
  );
}

export { FormLabel, FormError };
