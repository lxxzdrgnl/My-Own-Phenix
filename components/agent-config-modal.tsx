"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormLabel, FormError } from "@/components/ui/form-field";

interface AgentConfig {
  endpoint: string;
  assistantId: string;
}

interface AgentConfigModalProps {
  open: boolean;
  onClose: () => void;
  project: string;
  onSaved?: (config: AgentConfig | null) => void;
}

const AGENT_TYPES = [
  { value: "langgraph", label: "LangGraph" },
  { value: "rest", label: "REST SSE" },
] as const;

export function AgentConfigModal({ open, onClose, project, onSaved }: AgentConfigModalProps) {
  const [alias, setAlias] = useState("");
  const [agentType, setAgentType] = useState("langgraph");
  const [endpoint, setEndpoint] = useState("http://localhost:2024");
  const [assistantId, setAssistantId] = useState("agent");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [savedMsg, setSavedMsg] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent-config?project=${encodeURIComponent(project)}`);
      const data = await res.json();
      if (data.config) {
        setAlias(data.config.alias ?? "");
        setAgentType(data.config.agentType ?? "langgraph");
        setEndpoint(data.config.endpoint ?? "http://localhost:2024");
        setAssistantId(data.config.assistantId ?? "agent");
      } else {
        setAlias("");
        setAgentType("langgraph");
        setEndpoint("http://localhost:2024");
        setAssistantId("agent");
      }
    } catch {
      // silently ignore
    }
  }, [project]);

  useEffect(() => {
    if (open) {
      setError(undefined);
      setSavedMsg(false);
      loadConfig();
    }
  }, [open, loadConfig]);

  const handleSave = async () => {
    setError(undefined);
    setSavedMsg(false);
    if (!endpoint.trim()) {
      setError("Endpoint URL is required.");
      return;
    }
    if (!assistantId.trim()) {
      setError("Assistant ID is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/agent-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, alias: alias.trim(), agentType, endpoint: endpoint.trim(), assistantId: assistantId.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save configuration.");
        return;
      }
      setSavedMsg(true);
      onSaved?.({ endpoint: endpoint.trim(), assistantId: assistantId.trim() });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setError(undefined);
    setSavedMsg(false);
    setResetting(true);
    try {
      await fetch(`/api/agent-config?project=${encodeURIComponent(project)}`, { method: "DELETE" });
      setAlias("");
      setAgentType("langgraph");
      setEndpoint("http://localhost:2024");
      setAssistantId("agent");
      onSaved?.(null);
      setSavedMsg(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} className="w-[480px]">
      <ModalHeader onClose={onClose}>Agent Settings</ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <FormLabel>Project (Phoenix)</FormLabel>
            <Input value={project} disabled />
            <p className="mt-1 text-xs text-muted-foreground">
              Phoenix project name. Set by the agent.
            </p>
          </div>

          <div>
            <FormLabel>Display Name</FormLabel>
            <Input
              placeholder={project}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Optional alias shown in the dashboard instead of the Phoenix project name.
            </p>
          </div>

          <div>
            <FormLabel>Agent Type</FormLabel>
            <select
              value={agentType}
              onChange={(e) => setAgentType(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              {AGENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {agentType === "rest" && (
              <p className="mt-1 text-xs text-muted-foreground">
                REST SSE mode is not yet supported. LangGraph will be used as fallback.
              </p>
            )}
          </div>

          <div>
            <FormLabel>Endpoint URL</FormLabel>
            <Input
              type="url"
              placeholder="http://localhost:2024"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The base URL of your LangGraph server.
            </p>
          </div>

          <div>
            <FormLabel>Assistant ID</FormLabel>
            <Input
              placeholder="agent"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The LangGraph assistant or graph ID to use.
            </p>
          </div>

          {error && <FormError message={error} />}

          {savedMsg && (
            <p className="text-xs text-green-600 dark:text-green-400">
              Configuration saved successfully.
            </p>
          )}

          <div className="flex items-center justify-between pt-2 border-t gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={resetting || saving}
            >
              {resetting ? "Resetting..." : "Reset to Defaults"}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={saving || resetting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || resetting}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
