"use client";

import { useEffect, useRef } from "react";

type FadeInProps = {
  children: React.ReactNode;
  /// Delay before the fade starts, in ms. Used to stagger sibling
  /// FadeIn wrappers (e.g. cards in a grid) without choreographing
  /// each card by hand.
  delay?: number;
  /// Tag to render. Defaults to <div> so most call sites stay terse;
  /// pass `as="section"` when wrapping a top-level page section so
  /// the DOM stays semantic.
  as?: "div" | "section" | "article" | "li";
  className?: string;
};

/// Wrapper that fades children up into view when they enter the
/// viewport. Pure CSS keyframes (defined in styles/index.css) plus
/// a single IntersectionObserver — no animation libs.
///
/// Respects `prefers-reduced-motion` automatically (the CSS rule
/// short-circuits the keyframe).
export function FadeIn({
  children,
  delay = 0,
  as = "div",
  className = "",
}: FadeInProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // If the user has reduced motion, skip the observer entirely —
    // the CSS rule already pins opacity to 1, but observing wastes
    // cycles for no benefit.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      node.classList.add("is-visible");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            if (delay > 0) {
              target.style.animationDelay = `${delay}ms`;
            }
            target.classList.add("is-visible");
            observer.unobserve(target);
          }
        }
      },
      // 12% threshold = the section needs to be at least 12% in view
      // before the fade starts. Avoids triggering for slivers at the
      // very edge of the viewport.
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [delay]);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      data-animate="fade-up"
      className={className}
    >
      {children}
    </Tag>
  );
}
