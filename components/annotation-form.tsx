"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel, FormError } from "@/components/ui/form-field";
import { Loader2 } from "lucide-react";
import type { Annotation } from "@/lib/phoenix";

interface EvalOption {
  name: string;
  outputMode: string;
  badgeLabel: string;
}

interface AnnotationFormProps {
  open: boolean;
  onClose: () => void;
  spanId: string;
  existingAnnotations?: Annotation[];
  onSaved?: () => void;
}

export function AnnotationForm({ open, onClose, spanId, existingAnnotations = [], onSaved }: AnnotationFormProps) {
  const [evalOptions, setEvalOptions] = useState<EvalOption[]>([]);
  const [selectedEval, setSelectedEval] = useState("");
  const [customName, setCustomName] = useState("");
  const [mode, setMode] = useState<"binary" | "score">("binary");
  const [label, setLabel] = useState<"pass" | "fail" | "">("");
  const [score, setScore] = useState("1.0");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const loadEvals = useCallback(async () => {
    try {
      const res = await fetch("/api/eval-prompts");
      const data = await res.json();
      setEvalOptions(
        (data.prompts ?? []).map((p: any) => ({
          name: p.name,
          outputMode: p.outputMode ?? "binary",
          badgeLabel: p.badgeLabel ?? "",
        })),
      );
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      loadEvals();
      setSelectedEval("");
      setCustomName("");
      setLabel("");
      setScore("1.0");
      setComment("");
      setError(undefined);
    }
  }, [open, loadEvals]);

  useEffect(() => {
    if (selectedEval === "__custom__") {
      setMode("binary");
    } else {
      const ev = evalOptions.find((e) => e.name === selectedEval);
      setMode(ev?.outputMode === "score" ? "score" : "binary");
    }
    setLabel("");
    setScore("1.0");
  }, [selectedEval, evalOptions]);

  const evalName = selectedEval === "__custom__" ? customName.trim() : selectedEval;

  async function handleSave() {
    if (!evalName) { setError("Select or enter an eval name."); return; }
    if (mode === "binary" && !label) { setError("Select Pass or Fail."); return; }
    setError(undefined);
    setSaving(true);

    const finalLabel = mode === "binary" ? label : (Number(score) >= 0.5 ? "pass" : "fail");
    const finalScore = mode === "binary" ? (label === "pass" ? 1.0 : 0.0) : Number(score);

    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spanId,
          name: evalName,
          label: finalLabel,
          score: finalScore,
          explanation: comment.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save annotation.");
        return;
      }

      onSaved?.();
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const existingNames = new Set(existingAnnotations.map((a) => a.name));
  const availableEvals = evalOptions.filter((e) => !existingNames.has(e.name));

  return (
    <Modal open={open} onClose={onClose} className="w-[440px]">
      <ModalHeader onClose={onClose}>Add Annotation</ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <FormLabel>Evaluation</FormLabel>
            <select
              value={selectedEval}
              onChange={(e) => setSelectedEval(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select evaluation...</option>
              {availableEvals.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.badgeLabel ? `${e.name} (${e.badgeLabel})` : e.name}
                </option>
              ))}
              <option value="__custom__">Custom name...</option>
            </select>
            {selectedEval === "__custom__" && (
              <Input
                className="mt-2"
                placeholder="Enter annotation name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            )}
          </div>

          {evalName && (
            <div>
              <FormLabel>Result</FormLabel>
              {mode === "binary" ? (
                <div className="flex gap-2">
                  <Button
                    variant={label === "pass" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setLabel("pass")}
                  >
                    Pass
                  </Button>
                  <Button
                    variant={label === "fail" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setLabel("fail")}
                  >
                    Fail
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="w-24 text-center tabular-nums"
                  />
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-foreground/40 transition-all"
                      style={{ width: `${Math.max(0, Math.min(1, Number(score))) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {evalName && (
            <div>
              <FormLabel>Comment (optional)</FormLabel>
              <Textarea
                rows={2}
                placeholder="Explain your assessment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          )}

          {error && <FormError message={error} />}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !evalName}>
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
