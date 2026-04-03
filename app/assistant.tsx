"use client";

import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  CompositeAttachmentAdapter,
} from "@assistant-ui/react";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import { useRef } from "react";

import { createThread, sendMessage } from "@/lib/chatApi";
import { Thread } from "@/components/assistant-ui/thread";
import { Nav } from "@/components/nav";

const attachmentAdapter = new CompositeAttachmentAdapter([
  new SimpleImageAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

export function Assistant() {
  const threadIdRef = useRef<string | null>(null);

  const runtime = useLangGraphRuntime({
    adapters: {
      attachments: attachmentAdapter,
    },
    stream: async function* (messages, { command }) {
      if (!threadIdRef.current) {
        const { thread_id } = await createThread();
        threadIdRef.current = thread_id;
      }
      const generator = await sendMessage({
        threadId: threadIdRef.current,
        messages: messages.slice(-1),
        command,
      });

      for await (const event of generator) {
        const e = event.event as string;
        if (e !== "messages/partial") continue;
        yield event;
      }
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-dvh flex-col">
        <Nav />
        <div className="flex-1 min-h-0">
          <Thread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
