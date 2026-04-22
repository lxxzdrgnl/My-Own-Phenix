"use client";

import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";

/**
 * Hook for fetching data from an API endpoint.
 * Handles loading state and auto-fetches on mount.
 */
export function useApiFetch<T>(url: string, extract?: (data: any) => T) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(url);
      const json = await res.json();
      setData(extract ? extract(json) : json);
    } catch {}
    setLoading(false);
  }, [url]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

/**
 * Hook for settings-style forms with load/save/dirty tracking.
 */
export function useSettingsForm<T extends Record<string, string>>(defaults: T) {
  const [settings, setSettings] = useState<T>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      const merged = { ...defaults } as T;
      for (const key of Object.keys(defaults)) {
        if (data[key] !== undefined) (merged as any)[key] = data[key];
      }
      setSettings(merged);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function update(key: keyof T, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setDirty(false);
    } catch {}
    setSaving(false);
  }

  return { settings, loading, saving, saved, dirty, update, save };
}
