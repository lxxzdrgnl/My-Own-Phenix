/**
 * Format date for display — Korean locale, consistent across app.
 */
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTimeFull(date: string | Date): string {
  return new Date(date).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
