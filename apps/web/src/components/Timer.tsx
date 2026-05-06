"use client";

import { useEffect, useState } from "react";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function getHms(expiresAt: Date): { h: number; m: number; s: number; totalMs: number } {
  const totalMs = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return { h: 0, m: 0, s: 0, totalMs: 0 };
  }
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { h, m, s, totalMs };
}

export function Timer({ expiresAt }: { expiresAt: Date }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const { h, m, s, totalMs } = getHms(expiresAt);
  const urgent = totalMs > 0 && totalMs < 5 * 60 * 1000;
  const label = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;

  return (
    <span
      className={
        urgent
          ? "font-mono text-sm font-semibold tabular-nums text-rug"
          : "font-mono text-sm font-medium tabular-nums text-accent-bright"
      }
    >
      {label}
    </span>
  );
}
