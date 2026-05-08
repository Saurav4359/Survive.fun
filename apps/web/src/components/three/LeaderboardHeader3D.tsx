"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * 3D rotating "LEADERBOARD" wireframe text rendered with three.js.
 * - Lime colored stroke
 * - Pure black background, no gradient
 * - Rotates slowly on Y axis
 */
export function LeaderboardHeader3D({
  text = "LEADERBOARD",
  height = 240,
}: {
  text?: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let mesh: THREE.Group | null = null;
    let rafId = 0;

    const { clientWidth, clientHeight } = container;
    const w = Math.max(clientWidth, 1);
    const h = Math.max(clientHeight, height);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.z = 12;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Build "text" out of small lime cubes arranged in a 5x7 grid per char
    const PIXEL_FONT: Record<string, string[]> = {
      L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
      E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
      A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
      D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
      R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
      B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
      O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
      " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    };

    const group = new THREE.Group();
    const cubeSize = 0.3;
    const charWidth = 5 * cubeSize + cubeSize;
    const totalWidth = text.length * charWidth;
    const xStart = -totalWidth / 2;

    const material = new THREE.MeshBasicMaterial({
      color: 0xcdf078,
    });
    const wireMaterial = new THREE.LineBasicMaterial({
      color: 0xcdf078,
      transparent: true,
      opacity: 0.55,
    });

    for (let ci = 0; ci < text.length; ci += 1) {
      const ch = text[ci]!.toUpperCase();
      const rows = PIXEL_FONT[ch] ?? PIXEL_FONT[" "]!;
      for (let ry = 0; ry < rows.length; ry += 1) {
        const row = rows[ry]!;
        for (let cx = 0; cx < row.length; cx += 1) {
          if (row[cx] !== "1") continue;
          const x = xStart + ci * charWidth + cx * cubeSize;
          const y = (rows.length / 2 - ry) * cubeSize - cubeSize / 2;
          const geom = new THREE.BoxGeometry(
            cubeSize * 0.9,
            cubeSize * 0.9,
            cubeSize * 0.9,
          );
          const cube = new THREE.Mesh(geom, material);
          cube.position.set(x, y, 0);
          group.add(cube);

          const edges = new THREE.EdgesGeometry(geom);
          const line = new THREE.LineSegments(edges, wireMaterial);
          line.position.copy(cube.position);
          group.add(line);
        }
      }
    }

    mesh = group;
    scene.add(group);

    const onResize = () => {
      if (!renderer || !camera || !container) return;
      const cw = Math.max(container.clientWidth, 1);
      const ch = Math.max(container.clientHeight, height);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    const start = performance.now();
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const t = (performance.now() - start) / 1000;
      if (mesh) {
        mesh.rotation.y = Math.sin(t * 0.4) * 0.4;
        mesh.rotation.x = Math.sin(t * 0.3) * 0.1;
      }
      if (renderer && scene && camera) renderer.render(scene, camera);
    };
    tick();

    (container as HTMLDivElement & { __cleanup?: () => void }).__cleanup =
      () => {
        ro.disconnect();
        cancelAnimationFrame(rafId);
        if (renderer) {
          renderer.dispose();
          if (renderer.domElement.parentElement === container) {
            container.removeChild(renderer.domElement);
          }
        }
        group.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
        });
        material.dispose();
        wireMaterial.dispose();
      };

    return () => {
      const c = container as HTMLDivElement & { __cleanup?: () => void };
      c.__cleanup?.();
    };
  }, [text, height]);

  return (
    <div
      ref={containerRef}
      aria-label={text}
      style={{ height }}
      className="relative w-full"
    />
  );
}
