export function formatElapsed(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const total = Math.abs(ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = ((total % 60_000) / 1000).toFixed(1);
  if (minutes === 0) return `${sign}${seconds}s`;
  return `${sign}${minutes}:${seconds.padStart(4, "0")}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatChannel(channel: number): string {
  return channel ? String(channel) : "—";
}

export function formatCoord(latitude: number | null, longitude: number | null): string {
  if (latitude === null || longitude === null) return "—";
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function confidenceLabel(confidence: string): string {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  if (confidence === "low") return "Low";
  return confidence;
}
