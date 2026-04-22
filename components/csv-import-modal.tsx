"use client";

import { useState, useRef } from "react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, RefreshCw } from "lucide-react";

interface CSVImportModalProps {
  open: boolean;
  onClose: () => void;
  targetDataset: { id: string; name: string } | null;
  onImport: (data: {
    name: string;
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
    queryCol: string;
    contextCol: string;
  }) => void;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // RFC 4180-compliant parser: handles commas, newlines, and double-quotes inside quoted fields
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"'; i += 2; // escaped quote ""
        } else {
          inQuotes = false; i++;
        }
      } else {
        field += ch; i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true; i++;
      } else if (ch === ",") {
        record.push(field); field = ""; i++;
      } else if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
        record.push(field); field = "";
        if (record.some(f => f.length > 0)) records.push(record);
        record = []; i += 2;
      } else if (ch === "\n") {
        record.push(field); field = "";
        if (record.some(f => f.length > 0)) records.push(record);
        record = []; i++;
      } else {
        field += ch; i++;
      }
    }
  }
  // Last field/record
  record.push(field);
  if (record.some(f => f.length > 0)) records.push(record);

  if (records.length === 0) return { headers: [], rows: [] };

  // Deduplicate headers
  const rawHeaders = records[0];
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const trimmed = h.trim();
    const count = seen.get(trimmed) ?? 0;
    seen.set(trimmed, count + 1);
    return count > 0 ? `${trimmed}_${count + 1}` : trimmed;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < records.length; r++) {
    const vals = records[r];
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] ?? "").trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function autoMapColumns(headers: string[]) {
  const lower = headers.map((x) => x.toLowerCase());
  const find = (keywords: string[]) =>
    headers[lower.findIndex((x) => keywords.some((k) => x.includes(k)))] ?? "";
  return {
    queryCol: find(["query", "question", "prompt", "input", "instruction", "user_prompt", "jailbreak_query"]),
    contextCol: find(["context", "document", "reference"]),
  };
}

export function CSVImportModal({ open, onClose, targetDataset, onImport }: CSVImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [queryCol, setQueryCol] = useState("");
  const [contextCol, setContextCol] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);

  function handleFile(f: File) {
    setFile(f);
    if (!targetDataset && !name) setName(f.name.replace(/\.(csv|tsv)$/i, ""));
    setParsing(true);
    f.text().then((text) => {
      const parsed = parseCSV(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const mapping = autoMapColumns(parsed.headers);
      setQueryCol(mapping.queryCol);
      setContextCol(mapping.contextCol);
      setParsing(false);
    });
  }

  const [importing, setImporting] = useState(false);

  async function handleConfirm() {
    const dsName = targetDataset ? targetDataset.name : name.trim();
    if (!dsName || headers.length === 0 || importing) return;
    setImporting(true);
    try {
      await onImport({ name: dsName, fileName: file?.name ?? "", headers, rows, queryCol, contextCol });
    } finally {
      setImporting(false);
    }
    setFile(null);
    setName("");
    setHeaders([]);
    setRows([]);
    setQueryCol("");
    setContextCol("");
    onClose();
  }

  function handleClose() {
    setFile(null);
    setName("");
    setHeaders([]);
    setRows([]);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} className="w-[700px]">
      <ModalHeader onClose={handleClose}>
        {targetDataset ? `Import CSV \u2192 ${targetDataset.name}` : "Import CSV \u2014 New Dataset"}
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          {!targetDataset && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Dataset Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. jailbreak-tests"
                className="text-sm"
                autoFocus
              />
            </div>
          )}

          {!file ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/20 py-10 transition-colors hover:border-muted-foreground/40"
            >
              <Upload className="size-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">Drop a CSV file or click to browse</p>
              <input ref={fileRef} type="file" accept=".csv,.tsv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {parsing ? "Parsing..." : `${rows.length.toLocaleString()} rows, ${headers.length} columns`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Query Column
                  </label>
                  <select value={queryCol} onChange={(e) => setQueryCol(e.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                    <option value="">&mdash; None &mdash;</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Context Column (optional)
                  </label>
                  <select value={contextCol} onChange={(e) => setContextCol(e.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                    <option value="">&mdash; None &mdash;</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Preview (first 5 rows)</p>
                <div className="overflow-hidden rounded-lg border">
                  <div className="max-h-[200px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/30">
                        <tr>
                          {headers.map((h) => (
                            <th key={h} className="whitespace-nowrap px-3 py-1.5 text-left font-semibold text-muted-foreground">
                              {h}
                              {h === queryCol && <span className="ml-1 text-[8px] text-muted-foreground">Q</span>}
                              {h === contextCol && <span className="ml-1 text-[8px] text-muted-foreground">C</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-t">
                            {headers.map((h) => (
                              <td key={h} className="max-w-[180px] truncate px-3 py-1.5" title={row[h]}>{row[h]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleClose} disabled={importing} className="text-xs">Cancel</Button>
            <Button onClick={handleConfirm} disabled={importing || headers.length === 0 || (!targetDataset && !name.trim())} className="text-xs gap-1.5">
              {importing ? (
                <><RefreshCw className="size-3 animate-spin" /> Importing...</>
              ) : (
                targetDataset ? "Import" : "Create & Import"
              )}
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
