"use client";

import { animate, useInView, useMotionValue, useTransform } from "framer-motion";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

type Props = {
  to: number;
  duration?: number;
  /** Decimals to keep when displaying. */
  decimals?: number;
  /** Optional formatter, overrides decimals. */
  format?: (n: number) => string;
  className?: string;
  /** Prefix shown before the number (e.g. "$"). */
  prefix?: string;
  /** Suffix shown after the number (e.g. "%"). */
  suffix?: string;
  delay?: number;
};

export function CountUp({
  to,
  duration = 1.1,
  decimals = 0,
  format,
  className,
  prefix = "",
  suffix = "",
  delay = 0,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const motionVal = useMotionValue(0);
  const display = useTransform(motionVal, (v) => {
    const out = format ? format(v) : v.toFixed(decimals);
    return `${prefix}${out}${suffix}`;
  });

  useEffect(() => {
    if (!inView) return;
    const controls = animate(motionVal, to, {
      duration,
      delay,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [inView, to, duration, delay, motionVal]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}
