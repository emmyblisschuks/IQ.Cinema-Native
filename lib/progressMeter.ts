// lib/progressMeter.ts
//
// Turns raw "bytes sent" updates into a speed and time-remaining that don't
// jitter: speed is averaged over a sliding ~6 second window.

export type MeterSnapshot = { fraction: number; sent: number; total: number; bytesPerSecond: number; secondsLeft: number | null };

export function createProgressMeter(windowMs = 6000) {
  const samples: { t: number; sent: number }[] = [];
  return (sent: number, total: number, now = Date.now()): MeterSnapshot => {
    samples.push({ t: now, sent });
    while (samples.length > 2 && now - samples[0].t > windowMs) samples.shift();
    const first = samples[0];
    const dt = (now - first.t) / 1000;
    const bytesPerSecond = dt > 0.5 ? Math.max(0, (sent - first.sent) / dt) : 0;
    const secondsLeft = bytesPerSecond > 1024 ? Math.max(0, Math.round((total - sent) / bytesPerSecond)) : null;
    return { fraction: total > 0 ? Math.min(1, sent / total) : 0, sent, total, bytesPerSecond, secondsLeft };
  };
}

export function formatBytes(b: number) {
  const mb = b / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

export function formatSpeed(bytesPerSecond: number) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds: number | null) {
  if (seconds === null) return null;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s}s`;
}
