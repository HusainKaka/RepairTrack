import { useEffect, useRef } from "react";

interface UnicornRuntime { init(): Promise<unknown>; destroy(): void }
const runtimeUrl = "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.29/dist/unicornStudio.umd.js";
let runtimePromise: Promise<UnicornRuntime> | undefined;
function loadRuntime() {
  runtimePromise ??= new Promise<UnicornRuntime>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = runtimeUrl;
    script.async = true;
    script.onload = () => {
      const runtime = (window as Window & { UnicornStudio?: UnicornRuntime }).UnicornStudio;
      if (runtime) resolve(runtime); else reject(new Error("AURA background runtime unavailable"));
    };
    script.onerror = () => reject(new Error("AURA background could not load"));
    document.head.appendChild(script);
  });
  return runtimePromise;
}

/** Same published scene and SDK version as the supplied AURA HTML. */
export function BrandBackdrop() {
  const scene = useRef<HTMLDivElement>(null);
  const ripples = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let runtime: UnicornRuntime | undefined;
    let initialized = false;
    let lastPointer = 0;
    let index = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const transparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const stop = () => {
      if (initialized) runtime?.destroy();
      initialized = false;
      scene.current?.setAttribute("data-scene-status", "static");
      ripples.current?.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    };
    const start = async () => {
      if (motion.matches || transparency.matches) { stop(); return; }
      try {
        runtime = await loadRuntime();
        if (disposed || motion.matches || transparency.matches) return;
        await runtime.init();
        if (disposed || motion.matches || transparency.matches) { runtime.destroy(); return; }
        initialized = true;
        scene.current?.setAttribute("data-scene-status", "ready");
      } catch {
        // Keep a usable light background and pointer ripples if the embed is offline.
        scene.current?.setAttribute("data-scene-status", "fallback");
      }
    };
    const pointer = (event: PointerEvent) => {
      if (motion.matches || transparency.matches || event.pointerType === "touch" || initialized) return;
      const now = performance.now();
      if (now - lastPointer < 90) return;
      lastPointer = now;
      const ring = ripples.current?.children[index++ % 12] as HTMLElement | undefined;
      if (!ring) return;
      ring.getAnimations().forEach(animation => animation.cancel());
      ring.style.left = `${event.clientX}px`;
      ring.style.top = `${event.clientY}px`;
      ring.animate([{ transform: "translate(-50%, -50%) scale(.12)", opacity: .42 }, { transform: "translate(-50%, -50%) scale(1.8)", opacity: 0 }], { duration: 1700, easing: "ease-out" });
    };
    const preference = () => { stop(); void start(); };
    window.addEventListener("pointermove", pointer, { passive: true });
    motion.addEventListener("change", preference);
    transparency.addEventListener("change", preference);
    void start();
    return () => { disposed = true; stop(); window.removeEventListener("pointermove", pointer); motion.removeEventListener("change", preference); transparency.removeEventListener("change", preference); };
  }, []);
  return <div className="brand-backdrop" aria-hidden="true">
    <div ref={scene} className="aura-scene" data-us-project="ty3N7ZPaIU7KlWixQFIc" data-us-fixed="true" data-scene-status="loading" />
    <div className="aura-ambient aura-ambient--blue" /><div className="aura-ambient aura-ambient--sky" /><div className="aura-ambient aura-ambient--white" /><div className="aura-dot-texture" />
    <div ref={ripples} className="mouse-ripples">{Array.from({ length: 12 }, (_, i) => <span key={i} />)}</div>
  </div>;
}
