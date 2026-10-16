import { useLayoutEffect, useState } from "react";
import { useMediaQuery, useTheme } from "@mui/material";

/** The sidebar and split panels matter more than a device preset's viewport. */
export function useRecordLayout(minTableWidth: number) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!container) return;
    const measure = () => {
      const next = Math.round(container.getBoundingClientRect().width);
      if (next > 0) setWidth((current) => current === next ? current : next);
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(container);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [container]);
  return { containerRef: setContainer, compact: phone || (width !== null && width < minTableWidth) };
}
