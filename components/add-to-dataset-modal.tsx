"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Plus, Database } from "lucide-react";

interface DatasetOption {
  id: string;
  name: string;
  rowCount: number;
  headers: string;
}

interface AddToDatasetModalProps {
  open: boolean;
  onClose: () => void;
  query?: string;
  context?: string;
}

export function AddToDatasetModal({ open, onClose, query = "", context = "" }: AddToDatasetModalProps) {
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editQuery, setEditQuery] = useState(query);
  const [editContext, setEditContext] = useState(context);

  useEffect(() => {
    if (!open) return;
    setEditQuery(query);
    setEditContext(context);
    apiFetch("/api/datasets").then((r) => r.json()).then((data) => {
      const ds = data.datasets ?? [];
      setDatasets(ds);
      if (ds.length > 0 && !selectedId) setSelectedId(ds[0].id);
    }).catch(() => {});
  }, [open, query, context]);

  async function handleCreateAndAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const headers = ["query", "context"];
      const row = { query: editQuery, context: editContext };
      const res = await apiFetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          headers,
          queryCol: "query",
          contextCol: "context",
          rows: [row],
        }),
      });
      if (res.ok) {
        setNewName("");
        setCreating(false);
        onClose();
      }
    } catch {}
    setSaving(false);
  }

  async function handleAddToExisting() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const ds = datasets.find((d) => d.id === selectedId);
      const dsHeaders = ds ? JSON.parse(ds.headers) : [];

      if (dsHeaders.length === 0) {
        await apiFetch("/api/datasets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedId,
            headers: ["query", "context"],
            queryCol: "query",
            contextCol: "context",
            rows: [{ query: editQuery, context: editContext }],
          }),
        });
      } else {
        const row: Record<string, string> = {};
        for (const h of dsHeaders) {
          const lower = h.toLowerCase();
          if (lower.includes("query") || lower.includes("question") || lower.includes("prompt") || lower.includes("input")) row[h] = editQuery;
          else if (lower.includes("context") || lower.includes("document") || lower.includes("reference")) row[h] = editContext;
          else row[h] = "";
        }
        await apiFetch("/api/datasets/rows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selectedId, rows: [row] }),
        });
      }
      onClose();
    } catch {}
    setSaving(false);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <Database className="size-4" />
          Add to Dataset
        </div>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Query</label>
              <Textarea value={editQuery} onChange={(e) => setEditQuery(e.target.value)} rows={2} className="text-xs" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Context</label>
              <Textarea value={editContext} onChange={(e) => setEditContext(e.target.value)} rows={8} className="text-xs max-h-[300px]" />
            </div>
          </div>

          <div className="border-t pt-4">
            {!creating ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Add to</label>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.rowCount} rows)</option>
                    ))}
                    {datasets.length === 0 && <option value="">No datasets yet</option>}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddToExisting} disabled={saving || !selectedId} className="flex-1 text-xs">
                    {saving ? "Saving..." : "Add to Dataset"}
                  </Button>
                  <Button variant="outline" onClick={() => setCreating(true)} className="gap-1 text-xs">
                    <Plus className="size-3" /> New
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">New Dataset Name</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. jailbreak-tests, quality-samples"
                    className="text-sm"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateAndAdd} disabled={saving || !newName.trim()} className="flex-1 text-xs">
                    {saving ? "Creating..." : "Create & Add"}
                  </Button>
                  <Button variant="ghost" onClick={() => setCreating(false)} className="text-xs">Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
