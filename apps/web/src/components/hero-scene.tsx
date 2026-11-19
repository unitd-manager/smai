"use client";

import { useCallback, useEffect, useRef, type PointerEvent, type ReactNode } from "react";

export function HeroScene({ children }: { children: ReactNode }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);

  const updateScene = useCallback(() => {
    frameRef.current = null;
    const scene = sceneRef.current;
    const content = contentRef.current;
    const pointer = pointerRef.current;
    if (!scene || !content || !pointer) return;

    const bounds = scene.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (pointer.x - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (pointer.y - bounds.top) / bounds.height * 2 - 1));
    content.style.setProperty("--scene-tilt-x", `${-y * 8}deg`);
    content.style.setProperty("--scene-tilt-y", `${x * 10}deg`);
    content.style.setProperty("--layer-back-x", `${x * 4}px`);
    content.style.setProperty("--layer-back-y", `${y * 4}px`);
    content.style.setProperty("--layer-middle-x", `${x * 8}px`);
    content.style.setProperty("--layer-middle-y", `${y * 8}px`);
    content.style.setProperty("--layer-front-x", `${x * 12}px`);
    content.style.setProperty("--layer-front-y", `${y * 12}px`);
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (
      event.pointerType !== "mouse" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(updateScene);
  }

  function handlePointerLeave() {
    pointerRef.current = null;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const content = contentRef.current;
    if (!content) return;
    for (const property of [
      "--scene-tilt-x",
      "--scene-tilt-y",
      "--layer-back-x",
      "--layer-back-y",
      "--layer-middle-x",
      "--layer-middle-y",
      "--layer-front-x",
      "--layer-front-y",
    ]) content.style.removeProperty(property);
  }

  return (
    <div
      ref={sceneRef}
      className="hero-scene"
      aria-hidden="true"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div ref={contentRef} className="hero-scene-inner">
        {children}
      </div>
    </div>
  );
}
