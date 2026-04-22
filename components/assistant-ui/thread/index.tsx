"use client";

import { AssistantIf, ThreadPrimitive } from "@assistant-ui/react";
import type { FC } from "react";
import {
  AssistantMessage,
  EditComposer,
  HistoryAssistantMessage,
  HistoryUserMessage,
  UserMessage,
} from "./messages";
import { Composer } from "./composer";
import { ThreadScrollToBottom, ThreadWelcome } from "./welcome";

export interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  feedbackValue?: "up" | "down" | null;
}

export const Thread: FC<{
  showWelcome?: boolean;
  historyMessages?: HistoryMessage[];
  isFadingOut?: boolean;
  project?: string;
}> = ({ showWelcome = true, historyMessages = [], isFadingOut = false, project = "default" }) => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-background"
      style={{ ["--thread-max-width" as string]: "44rem" }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="aui-thread-viewport relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4"
      >
        <div
          className={`flex flex-1 flex-col transition-opacity duration-150 ${
            isFadingOut
              ? "opacity-0"
              : "opacity-100 animate-in fade-in duration-200"
          }`}
        >
          {showWelcome && historyMessages.length === 0 && (
            <AssistantIf condition={({ thread }) => thread.isEmpty}>
              <ThreadWelcome project={project} />
            </AssistantIf>
          )}

          {historyMessages.length > 0 && (
            <div className="mx-auto w-full max-w-(--thread-max-width) flex flex-col">
              {historyMessages.map((msg) =>
                msg.role === "user" ? (
                  <HistoryUserMessage key={msg.id} content={msg.content} />
                ) : (
                  <HistoryAssistantMessage key={msg.id} messageId={msg.id} content={msg.content} feedbackValue={msg.feedbackValue} />
                ),
              )}
            </div>
          )}

          <ThreadPrimitive.Messages
            components={{ UserMessage, EditComposer, AssistantMessage }}
          />
        </div>

        <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) flex-col gap-4 overflow-visible rounded-t-3xl bg-background pb-4 md:pb-6">
          <ThreadScrollToBottom />
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};
