"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function rnd01(i: number, salt: number): number {
  const x = Math.sin(i * 78.233 + salt * 11.17) * 43758.5453;
  return x - Math.floor(x);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Softer settle than smoothstep for motion ramps. */
function easeOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

/** Frame-rate independent damping (approx. legacy “multiply by (1 - k·dt)” each frame). */
function dampExp(ratePerSec: number, dt: number): number {
  return Math.exp(-ratePerSec * dt);
}

function len3(ax: number, ay: number, az: number): number {
  return Math.sqrt(ax * ax + ay * ay + az * az);
}

/** Block-letter “SOL” (6×17 grid). Gaps between letters use “.” (skipped). */
const SOL_BITMAP: string[] = [
  /* O = symmetric hollow (01110 caps); avoid 11110 tops which read like “D”. */
  "11110.01110.10000",
  "10000.10001.10000",
  "11110.10001.10000",
  "00001.10001.10000",
  "00001.10001.10000",
  "11110.01110.11110",
];

type GlyphCell = { cx: number; cy: number };

function buildSolGlyphCells(cellSize: number): GlyphCell[] {
  const rows = SOL_BITMAP.length;
  const cols = SOL_BITMAP[0]?.length ?? 0;
  const cells: GlyphCell[] = [];
  const halfW = (cols * cellSize) / 2;
  const halfH = (rows * cellSize) / 2;
  for (let r = 0; r < rows; r += 1) {
    const line = SOL_BITMAP[r];
    for (let c = 0; c < line.length; c += 1) {
      if (line[c] !== "1") continue;
      const x = c * cellSize - halfW + cellSize / 2;
      const y = halfH - r * cellSize - cellSize / 2;
      cells.push({ cx: x, cy: y });
    }
  }
  return cells;
}

/**
 * Target positions: Solana-style thick coin — rim, front bezel rings, back,
 * and centered block-letter SOL on the front face (readable at ~350+ points).
 */
function fillSolanaCoinTargets(
  out: Float32Array,
  n: number,
  radius: number,
  thickness: number,
  reduced: boolean,
): void {
  const halfT = thickness * 0.5;
  const zFront = halfT * 0.97;
  const zBack = -halfT * 0.97;
  const R = radius;

  const cellSize = reduced ? 0.046 : 0.052;
  const glyphCells = buildSolGlyphCells(cellSize);

  const pctRim = reduced ? 0.11 : 0.13;
  const pctBezel = reduced ? 0.12 : 0.15;
  const pctMidRing = reduced ? 0.07 : 0.09;
  const pctInnerBand = reduced ? 0.06 : 0.08;
  const pctBack = reduced ? 0.07 : 0.08;

  let slot = 0;

  const nRim = Math.round(n * pctRim);
  const nBezel = Math.round(n * pctBezel);
  const nMidRing = Math.round(n * pctMidRing);
  const nInnerBand = Math.round(n * pctInnerBand);
  const nBack = Math.round(n * pctBack);

  const write = (i: number, x: number, y: number, z: number) => {
    const ti = i * 3;
    out[ti + 0] = x;
    out[ti + 1] = y;
    out[ti + 2] = z;
  };

  // Cylindrical rim (readable coin edge)
  for (let k = 0; k < nRim && slot < n; k += 1, slot += 1) {
    const i = slot;
    const ang = rnd01(i, 60) * Math.PI * 2;
    const z = (rnd01(i, 61) - 0.5) * thickness * 0.94;
    write(i, R * 0.99 * Math.cos(ang), R * 0.99 * Math.sin(ang), z);
  }

  // Front outer bezel (annulus — crisp coin outline)
  for (let k = 0; k < nBezel && slot < n; k += 1, slot += 1) {
    const i = slot;
    const ang = rnd01(i, 62) * Math.PI * 2;
    const t = rnd01(i, 63);
    const rr = R * (0.78 + t * 0.2);
    write(i, rr * Math.cos(ang), rr * Math.sin(ang), zFront);
  }

  // Inner ridge ring (mints often show a raised inner circle)
  for (let k = 0; k < nMidRing && slot < n; k += 1, slot += 1) {
    const i = slot;
    const ang = rnd01(i, 64) * Math.PI * 2;
    const rr = R * 0.72;
    const j = (rnd01(i, 65) - 0.5) * 0.028 * R;
    write(
      i,
      (rr + j) * Math.cos(ang),
      (rr + j) * Math.sin(ang),
      zFront * 0.92,
    );
  }

  // Front metal band between ridge and glyph area
  for (let k = 0; k < nInnerBand && slot < n; k += 1, slot += 1) {
    const i = slot;
    const ang = rnd01(i, 66) * Math.PI * 2;
    const t = rnd01(i, 67);
    const rr = R * (0.58 + t * 0.12);
    write(i, rr * Math.cos(ang), rr * Math.sin(ang), zFront * 0.88);
  }

  // Back face (depth — coin reads 3D when rotating)
  for (let k = 0; k < nBack && slot < n; k += 1, slot += 1) {
    const i = slot;
    const ang = rnd01(i, 68) * Math.PI * 2;
    const rr = Math.sqrt(rnd01(i, 69)) * R * 0.92;
    write(i, rr * Math.cos(ang), rr * Math.sin(ang), zBack);
  }

  // Remaining particles = dense SOL + slight front fill inside glyph bbox
  const nSol = n - slot;
  if (glyphCells.length === 0) {
    for (let k = 0; k < nSol && slot < n; k += 1, slot += 1) {
      const i = slot;
      const ang = rnd01(i, 70) * Math.PI * 2;
      const rr = Math.sqrt(rnd01(i, 71)) * R * 0.35;
      write(i, rr * Math.cos(ang), rr * Math.sin(ang), zFront);
    }
    return;
  }

  for (let k = 0; k < nSol && slot < n; k += 1, slot += 1) {
    const i = slot;
    const cell = glyphCells[k % glyphCells.length];
    const jx = (rnd01(i, 72) - 0.5) * cellSize * 0.9;
    const jy = (rnd01(i, 73) - 0.5) * cellSize * 0.9;
    write(i, cell.cx + jx, cell.cy + jy, zFront);
  }
}

/**
 * Particle storm → assembles a Solana-style coin with “SOL” on the face → hold → burst.
 */
export function ParticleField({
  className,
  particleCount = 640,
}: {
  className?: string;
  particleCount?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let points: THREE.Points | null = null;
    let rafId = 0;
    const mouse = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    const { clientWidth: w, clientHeight: h } = container;
    const width = Math.max(w, 1);
    const height = Math.max(h, 1);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const n = reduced
      ? Math.min(Math.max(particleCount, 320), 440)
      : Math.max(particleCount, 480);
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    const coinTargets = new Float32Array(n * 3);

    const coinR = reduced ? 1.0 : 1.14;
    const coinT = reduced ? 0.065 : 0.11;
    fillSolanaCoinTargets(coinTargets, n, coinR, coinT, reduced);

    for (let i = 0; i < n; i += 1) {
      const r = 1.8 + rnd01(i, 9) * 3.2;
      const theta = rnd01(i, 10) * Math.PI * 2;
      const phi = Math.acos(2 * rnd01(i, 11) - 1);
      const ti = i * 3;
      positions[ti + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[ti + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[ti + 2] = r * Math.cos(phi) - 1.2;

      const sp = reduced ? 0.35 : 1;
      velocities[ti + 0] = (rnd01(i, 12) - 0.5) * 3.5 * sp;
      velocities[ti + 1] = (rnd01(i, 13) - 0.5) * 3.5 * sp;
      velocities[ti + 2] = (rnd01(i, 14) - 0.5) * 2.5 * sp;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );

    const ptSize = reduced
      ? 0.048
      : n >= 600
        ? 0.03
        : n >= 480
          ? 0.034
          : 0.038;

    const material = new THREE.PointsMaterial({
      color: 0x8aff8e,
      size: ptSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: reduced ? 0.78 : 0.9,
      depthWrite: false,
    });

    points = new THREE.Points(geometry, material);
    scene.add(points);

    const STORM_END = reduced ? 6 : 4.2;
    const GATHER_END = reduced ? 14 : 9;
    /** Still coin — keep short (~1s) so the loop doesn’t linger before burst. */
    const HOLD_END = reduced ? 15 : 10;
    const CYCLE = reduced ? 20 : 14;

    const stormAmp = reduced ? 1.6 : 5.2;
    const gatherPull = reduced ? 2.8 : 5.5;
    /* Strong outward pop — scatter was muted when burst damping was mis-scaled. */
    const burstBase = reduced ? 5.5 : 24;
    const burstSwirl = reduced ? 2.2 : 11;

    let prevPhase = -1;

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      target.x = nx * 0.55;
      target.y = ny * 0.55;
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const onResize = () => {
      if (!renderer || !camera || !container) return;
      const { clientWidth: cw, clientHeight: ch } = container;
      const nw = Math.max(cw, 1);
      const nh = Math.max(ch, 1);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;

    let last = performance.now();
    const start = performance.now();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.066);
      last = now;

      if (!points || !renderer || !scene || !camera) return;

      const mouseLambda = 1 - Math.exp(-11 * dt);
      mouse.x += (target.x - mouse.x) * mouseLambda;
      mouse.y += (target.y - mouse.y) * mouseLambda;

      const rotLambda = 1 - Math.exp(-14 * dt);
      const ty = points.rotation.y + (mouse.x * 0.42 - points.rotation.y) * rotLambda;
      const tx = points.rotation.x + (mouse.y * 0.22 - points.rotation.x) * rotLambda;
      points.rotation.y = ty;
      points.rotation.x = tx;

      const t = (now - start) / 1000;
      const ct = t % CYCLE;

      let phase: 0 | 1 | 2 | 3;
      let phaseU: number;
      if (ct < STORM_END) {
        phase = 0;
        phaseU = ct / STORM_END;
      } else if (ct < GATHER_END) {
        phase = 1;
        phaseU = (ct - STORM_END) / (GATHER_END - STORM_END);
      } else if (ct < HOLD_END) {
        phase = 2;
        phaseU = (ct - GATHER_END) / (HOLD_END - GATHER_END);
      } else {
        phase = 3;
        phaseU = (ct - HOLD_END) / (CYCLE - HOLD_END);
      }

      const gatherEase = easeOutCubic(smoothstep(0.05, 1, phaseU));

      if (phase !== prevPhase) {
        if (phase === 3 && prevPhase === 2) {
          for (let i = 0; i < n; i += 1) {
            const ti = i * 3;
            let px = posArr[ti + 0];
            let py = posArr[ti + 1];
            let pz = posArr[ti + 2];
            const dist = len3(px, py, pz) || 0.001;
            const ux = px / dist;
            const uy = py / dist;
            const uz = pz / dist;
            let tx = -uz;
            let ty = 0;
            let tz = ux;
            const tl = len3(tx, ty, tz) || 0.001;
            tx /= tl;
            ty /= tl;
            tz /= tl;
            const sign = i % 2 === 0 ? 1 : -1;
            const swirl = sign * burstSwirl * (0.65 + rnd01(i, 21));
            const jitter =
              burstBase * 0.45 * ((rnd01(i, 22) - 0.5) * 2 * (i % 7) * 0.08);
            const spread = burstBase * 0.72;

            velocities[ti + 0] =
              ux * burstBase +
              tx * swirl +
              (rnd01(i, 23) - 0.5) * jitter +
              (rnd01(i, 26) - 0.5) * spread;
            velocities[ti + 1] =
              uy * burstBase +
              ty * swirl +
              (rnd01(i, 24) - 0.5) * jitter +
              (rnd01(i, 27) - 0.5) * spread;
            velocities[ti + 2] =
              uz * burstBase +
              tz * swirl * 0.85 +
              (rnd01(i, 25) - 0.5) * jitter +
              (rnd01(i, 28) - 0.5) * spread * 0.95;
          }
        }
        prevPhase = phase;
      }

      const stormRamp =
        phase === 0 ? 0.55 + 0.45 * Math.sin(phaseU * Math.PI) : 0;

      for (let i = 0; i < n; i += 1) {
        const ti = i * 3;
        let px = posArr[ti + 0];
        let py = posArr[ti + 1];
        let pz = posArr[ti + 2];

        let vx = velocities[ti + 0];
        let vy = velocities[ti + 1];
        let vz = velocities[ti + 2];

        const cx = coinTargets[ti + 0];
        const cy = coinTargets[ti + 1];
        const cz = coinTargets[ti + 2];

        if (phase === 0) {
          const amp = stormAmp * (reduced ? 1 : 1 + stormRamp * 0.5);
          vx +=
            Math.sin(t * 5.5 + i * 0.17 + py * 0.4) * amp * dt * 5.5;
          vy +=
            Math.cos(t * 4.8 + i * 0.13 + px * 0.35) * amp * dt * 5.5;
          vz +=
            Math.sin(t * 6.2 + i * 0.11 + px * 0.2) * amp * dt * 4;
          vx += (rnd01(i + Math.floor(t * 12), 40) - 0.5) * amp * dt * 3;
          vy += (rnd01(i + Math.floor(t * 12), 41) - 0.5) * amp * dt * 3;

          const spin = (reduced ? 0.35 : 1.15) * dt;
          const nx = px * Math.cos(spin) - py * Math.sin(spin);
          const ny = px * Math.sin(spin) + py * Math.cos(spin);
          px = nx;
          py = ny;

          const softBound = len3(px, py, pz);
          if (softBound > 13.5) {
            const pull = (softBound - 13.5) * 0.14 * dt;
            vx -= (px / softBound) * pull;
            vy -= (py / softBound) * pull;
            vz -= (pz / softBound) * pull;
          }

          /* Match legacy ~vx *= (1 - 0.65*dt) at 60fps → ~exp(-0.66)/s */
          const stormDrag = dampExp(0.66, dt);
          vx *= stormDrag;
          vy *= stormDrag;
          vz *= stormDrag;
        } else if (phase === 1) {
          const dx = cx - px;
          const dy = cy - py;
          const dz = cz - pz;
          const pull = gatherPull * gatherEase;
          const spring = 10 + 6 * gatherEase;
          vx += dx * pull * dt * spring;
          vy += dy * pull * dt * spring;
          vz += dz * pull * dt * spring;
          const gatherDrag = dampExp(3.1, dt);
          vx *= gatherDrag;
          vy *= gatherDrag;
          vz *= gatherDrag;
          const snap = gatherEase * (1 - Math.exp(-10 * dt));
          vx += dx * snap * 0.55;
          vy += dy * snap * 0.55;
          vz += dz * snap * 0.55;
        } else if (phase === 2) {
          const settle = 1 - Math.exp(-13 * dt);
          px += (cx - px) * settle;
          py += (cy - py) * settle;
          pz += (cz - pz) * settle;
          const wobble = reduced ? 0.0018 : 0.005;
          const wb = wobble * (0.85 + 0.15 * Math.sin(t * 2.1));
          vx = Math.sin(t * 9 + i * 0.37) * wb;
          vy = Math.cos(t * 7.8 + i * 0.33) * wb;
          vz = Math.sin(t * 8.6 + i * 0.29) * wb * 0.55;
        } else {
          const burstIn = smoothstep(0, 0.08, phaseU);
          const decay = smoothstep(0, 1, 1 - phaseU);
          const turb = stormAmp * decay * burstIn;
          vx += Math.sin(t * 13 + i * 0.19) * turb * dt * 9;
          vy += Math.cos(t * 11 + i * 0.15) * turb * dt * 9;
          vz += Math.sin(t * 14 + i * 0.12) * turb * dt * 7;

          /* Match legacy ~vx *= (1 - 0.22*dt) — light coast so particles cross the hero. */
          const burstDrag = dampExp(0.22, dt);
          vx *= burstDrag;
          vy *= burstDrag;
          vz *= burstDrag;
        }

        /* Sustained radial drift during scatter — fills width/height like the original. */
        if (phase === 3) {
          const ramp = smoothstep(0.05, 0.95, phaseU);
          const push = (reduced ? 0.55 : 2.15) * ramp * dt;
          const dist = len3(px, py, pz) || 0.001;
          vx += (px / dist) * push;
          vy += (py / dist) * push;
          vz += (pz / dist) * push * 0.55;
        }

        let vmax = reduced ? 12 : 28;
        if (phase === 0) vmax = reduced ? 14 : 36;
        if (phase === 3) vmax = reduced ? 19 : 78;
        const vlen = len3(vx, vy, vz);
        if (vlen > vmax) {
          const s = vmax / vlen;
          vx *= s;
          vy *= s;
          vz *= s;
        }

        px += vx * dt;
        py += vy * dt;
        pz += vz * dt;

        posArr[ti + 0] = px;
        posArr[ti + 1] = py;
        posArr[ti + 2] = pz;
        velocities[ti + 0] = vx;
        velocities[ti + 1] = vy;
        velocities[ti + 2] = vz;
      }

      posAttr.needsUpdate = true;

      if (phase === 2 && !reduced) {
        const targetZ = Math.sin(t * 2.85) * 0.045;
        points.rotation.z += (targetZ - points.rotation.z) * (1 - Math.exp(-10 * dt));
      } else {
        points.rotation.z *= Math.pow(0.88, dt * 60);
      }

      renderer.render(scene, camera);
    };
    animate();

    (container as HTMLDivElement & { __cleanup?: () => void }).__cleanup =
      () => {
        ro.disconnect();
        window.removeEventListener("mousemove", onMouseMove);
        cancelAnimationFrame(rafId);
        if (renderer) {
          renderer.dispose();
          if (renderer.domElement.parentElement === container) {
            container.removeChild(renderer.domElement);
          }
        }
        geometry.dispose();
        material.dispose();
      };

    return () => {
      const c = container as HTMLDivElement & { __cleanup?: () => void };
      c.__cleanup?.();
    };
  }, [particleCount]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={
        className ?? "pointer-events-none absolute inset-0 overflow-hidden"
      }
    />
  );
}
