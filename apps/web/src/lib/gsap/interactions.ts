"use client";

import gsap from "gsap";

/** Primary button / control press feedback (gsap-core). */
export function gsapButtonPress(el: HTMLElement | null, down: boolean) {
  if (!el) return;
  gsap.to(el, {
    scale: down ? 0.97 : 1,
    duration: down ? 0.09 : 0.24,
    ease: down ? "power2.in" : "power2.out",
  });
}

/** Card hover scale (gsap-core; avoids overflow clip vs translateY). */
export function gsapCardHover(
  el: HTMLElement | null,
  hover: boolean,
  opts?: { scale?: number },
) {
  if (!el) return;
  const s = hover ? (opts?.scale ?? 1.012) : 1;
  gsap.to(el, {
    scale: s,
    duration: hover ? 0.28 : 0.32,
    ease: "power2.out",
    transformOrigin: "50% 50%",
  });
}
