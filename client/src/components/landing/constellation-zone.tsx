"use client";

import { Component, useRef, type ReactNode, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";

function subscribeFinePointer(callback: () => void) {
  const mq = window.matchMedia("(pointer: fine)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/** SSR-safe pointer gate: false on server, live-updated on client. */
function useFinePointer() {
  return useSyncExternalStore(
    subscribeFinePointer,
    () => window.matchMedia("(pointer: fine)").matches,
    () => false
  );
}

/** three.js stays out of the main bundle — this zone is the only importer. */
const Scene = dynamic(() => import("./constellation"), {
  ssr: false,
  loading: () => null,
});

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Hero canvas zone. Renders only for fine pointers with motion allowed
 * (progressive enhancement — SSR output is empty, so no hydration gap),
 * and parallaxes away as the hero scrolls off.
 */
export function ConstellationZone({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  const allow = fine && !reduce;
  if (!allow) return null;

  return (
    <div ref={ref} className={className} aria-hidden>
      <motion.div style={{ y, opacity }} className="size-full">
        <Boundary>
          <Scene />
        </Boundary>
      </motion.div>
    </div>
  );
}
