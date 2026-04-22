"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useCallback } from "react";
import { ThumbsUp, ThumbsDown, Copy, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface MessageFeedbackProps {
  messageId: string;
  content: string;
  initialValue?: "up" | "down" | null;
}

export function MessageFeedback({ messageId, content, initialValue = null }: MessageFeedbackProps) {
  const { user } = useAuth();
  const [value, setValue] = useState<"up" | "down" | null>(initialValue);
  const [copied, setCopied] = useState(false);

  const handleFeedback = useCallback(
    async (clicked: "up" | "down") => {
      if (!user) return;

      if (value === clicked) {
        // Cancel: optimistic
        setValue(null);
        apiFetch("/api/feedback", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, userId: user.uid }),
        }).catch(() => {});
      } else {
        // Select: optimistic
        setValue(clicked);
        apiFetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, userId: user.uid, value: clicked }),
        }).catch(() => {});
      }
    },
    [user, value, messageId],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [content]);

  if (!user) return null;

  return (
    <div className="mt-1 ml-2 flex items-center gap-0.5 text-muted-foreground">
      {/* Copy */}
      <button
        onClick={handleCopy}
        className="rounded p-1 hover:bg-muted hover:text-foreground transition-colors"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>

      {/* Thumbs up — hidden when thumbs down is selected */}
      {value !== "down" && (
        <button
          onClick={() => handleFeedback("up")}
          className={cn(
            "rounded p-1 transition-colors",
            value === "up"
              ? "text-foreground hover:bg-muted"
              : "hover:bg-muted hover:text-foreground",
          )}
          title="Good response"
        >
          <ThumbsUp
            className={cn("h-3.5 w-3.5", value === "up" && "fill-current")}
          />
        </button>
      )}

      {/* Thumbs down — hidden when thumbs up is selected */}
      {value !== "up" && (
        <button
          onClick={() => handleFeedback("down")}
          className={cn(
            "rounded p-1 transition-colors",
            value === "down"
              ? "text-foreground hover:bg-muted"
              : "hover:bg-muted hover:text-foreground",
          )}
          title="Bad response"
        >
          <ThumbsDown
            className={cn("h-3.5 w-3.5", value === "down" && "fill-current")}
          />
        </button>
      )}
    </div>
  );
}
