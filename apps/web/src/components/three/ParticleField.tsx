"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Lime-colored particle field rendered with three.js.
 * - ~200 particles
 * - Slow orbital drift
 * - Reacts to mouse position (gentle parallax)
 * - Pure black background, pure lime particles, NO gradients
 */
export function ParticleField({
  className,
  particleCount = 200,
}: {
  className?: string;
  particleCount?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      const r = 2 + Math.random() * 4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi) - 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );

    const material = new THREE.PointsMaterial({
      color: 0xcdf078,
      size: 0.04,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    points = new THREE.Points(geometry, material);
    scene.add(points);

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      target.x = nx * 0.6;
      target.y = ny * 0.6;
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

    const start = performance.now();
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const t = (performance.now() - start) / 1000;
      if (!points || !renderer || !scene || !camera) return;

      // Gentle interpolation toward mouse position
      mouse.x += (target.x - mouse.x) * 0.04;
      mouse.y += (target.y - mouse.y) * 0.04;

      points.rotation.y = t * 0.04 + mouse.x * 0.4;
      points.rotation.x = Math.sin(t * 0.025) * 0.1 + mouse.y * 0.2;

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
      className={className ?? "pointer-events-none absolute inset-0"}
    />
  );
}
