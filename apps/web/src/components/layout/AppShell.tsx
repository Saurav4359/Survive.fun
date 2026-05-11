"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";

import { HotMarketsStrip } from "@/components/HotMarketsStrip";

import { SidebarNav } from "./SidebarNav";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen w-full min-w-0">
      <motion.aside
        initial={{ x: -32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-y-0 left-0 z-40 hidden w-[240px] shrink-0 border-r border-border bg-bg lg:flex lg:flex-col"
      >
        <div className="flex h-full min-h-0 flex-col px-4 py-5">
          <SidebarNav />
        </div>
      </motion.aside>

      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-border bg-bg lg:hidden"
            >
              <div className="flex h-full min-h-0 flex-col px-4 py-5">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:pl-[240px]">
        {/* min-w-0 + w-full: clamp flex descendants so max-content marquee tracks overflow an inner viewport instead of widening the whole shell. */}
        <div className="sticky top-0 z-30 flex w-full min-w-0 max-w-full flex-col bg-bg">
          <HotMarketsStrip />
          <TopBar onMenuClick={() => setMobileOpen(true)} />
        </div>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
