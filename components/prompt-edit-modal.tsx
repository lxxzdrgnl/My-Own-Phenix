"use client";

import { normalizeContent, PromptVersion } from "@/lib/phoenix";
import { PromptFormModal } from "@/components/prompts-modal";

interface Props {
  promptName: string;
  version: PromptVersion;
  onClose: () => void;
  onSave: () => void;
}

export function PromptEditModal({ promptName, version, onClose, onSave }: Props) {
  const msgs = version.template?.messages ?? [];
  return (
    <PromptFormModal
      mode="edit"
      initial={{
        name: promptName,
        description: "",
        system: normalizeContent(msgs.find((m) => m.role === "system")?.content ?? ""),
        user: normalizeContent(msgs.find((m) => m.role === "user")?.content ?? "{{query}}"),
        model: version.model_name ?? "gpt-4o-mini",
        temperature: version.invocation_parameters?.openai?.temperature ?? 0.7,
      }}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
