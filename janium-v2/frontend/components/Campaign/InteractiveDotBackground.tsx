import React, { useRef, useEffect, useCallback } from "react";
import { useViewport } from "reactflow";

interface InteractiveDotBackgroundProps {
  theme?: string;
}

const TRAIL_MAX_LENGTH = 80;
const TRAIL_DECAY = 0.06;

const InteractiveDotBackground: React.FC<InteractiveDotBackgroundProps> = ({
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const trailRef = useRef<{ x: number; y: number; opacity: number }[]>([]);
  const animFrameRef = useRef<number>(0);
  const viewport = useViewport();

  const isDark = theme === "dark";
  const GAP = 20;
  const BASE_RADIUS = 1;
  const EFFECT_RADIUS = 150;
  const WARP_STRENGTH = 8;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    const { x: vx, y: vy, zoom } = viewport;
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    // Update trail — decay all points each frame, add new point
    const trail = trailRef.current;
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].opacity -= TRAIL_DECAY;
      if (trail[i].opacity <= 0) {
        trail.splice(i, 1);
      }
    }
    if (mx > -500 && my > -500) {
      const last = trail[trail.length - 1];
      if (!last || Math.abs(last.x - mx) > 2 || Math.abs(last.y - my) > 2) {
        trail.push({ x: mx, y: my, opacity: 1 });
        if (trail.length > TRAIL_MAX_LENGTH) {
          trail.shift();
        }
      }
    }

    // Draw cursor trail
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const alpha = trail[i].opacity * (isDark ? 0.25 : 0.2);
        const lineWidth = trail[i].opacity * 4;

        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.strokeStyle = isDark
          ? `rgba(230, 245, 230, ${alpha})`
          : `rgba(200, 220, 200, ${alpha})`;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }

    const scaledGap = GAP * zoom;

    const offsetX = vx * zoom;
    const offsetY = vy * zoom;

    const startCol = Math.floor(-offsetX / scaledGap) - 1;
    const endCol = Math.ceil((width - offsetX) / scaledGap) + 1;
    const startRow = Math.floor(-offsetY / scaledGap) - 1;
    const endRow = Math.ceil((height - offsetY) / scaledGap) + 1;

    // Precompute warped positions for all dots
    const cols = endCol - startCol + 1;
    const rows = endRow - startRow + 1;
    const dotData: { x: number; y: number; alpha: number; radius: number }[][] = [];

    for (let ci = 0; ci < cols; ci++) {
      dotData[ci] = [];
      const col = startCol + ci;
      for (let ri = 0; ri < rows; ri++) {
        const row = startRow + ri;
        let dotX = col * scaledGap + offsetX;
        let dotY = row * scaledGap + offsetY;

        const dx = dotX - mx;
        const dy = dotY - my;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let drawX = dotX;
        let drawY = dotY;
        let radius = BASE_RADIUS * zoom;
        let alpha = isDark ? 0.1 : 0.12;

        if (dist < EFFECT_RADIUS) {
          const t = 1 - dist / EFFECT_RADIUS;
          const eased = t * t;
          const zoomFactor = Math.min(zoom, 1.5) / 1.5;

          // Shrink: pull dots toward cursor
          if (dist > 0) {
            const warp = eased * WARP_STRENGTH * zoomFactor;
            drawX -= (dx / dist) * warp;
            drawY -= (dy / dist) * warp;
          }

          radius += eased * 2.5 * zoom * zoomFactor;
          const intensityScale = zoomFactor;
          alpha = isDark
            ? 0.1 + eased * 0.4 * intensityScale
            : 0.12 + eased * 0.33 * intensityScale;
        }

        // Also illuminate dots near the trail
        for (let ti = 0; ti < trail.length; ti++) {
          const trailPt = trail[ti];
          const tdx = dotX - trailPt.x;
          const tdy = dotY - trailPt.y;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          const trailRadius = EFFECT_RADIUS * 0.5;

          if (tdist < trailRadius) {
            const tt = 1 - tdist / trailRadius;
            const trailEased = tt * tt * trailPt.opacity * 0.4;
            alpha = Math.min(0.5, alpha + trailEased * (isDark ? 0.25 : 0.18));
            radius = Math.max(radius, (BASE_RADIUS + trailEased * 1.5) * zoom);
          }
        }

        dotData[ci][ri] = { x: drawX, y: drawY, alpha, radius };
      }
    }

    // Draw grid lines (dimmer than dots)
    const LINE_DIM = 0.35;
    ctx.lineWidth = 0.5;
    ctx.lineCap = "butt";

    for (let ci = 0; ci < cols; ci++) {
      for (let ri = 0; ri < rows; ri++) {
        const dot = dotData[ci][ri];

        if (ci + 1 < cols) {
          const right = dotData[ci + 1][ri];
          const lineAlpha = Math.min(dot.alpha, right.alpha) * LINE_DIM;
          ctx.beginPath();
          ctx.moveTo(dot.x, dot.y);
          ctx.lineTo(right.x, right.y);
          ctx.strokeStyle = isDark
            ? `rgba(230, 245, 230, ${lineAlpha})`
            : `rgba(200, 220, 200, ${lineAlpha})`;
          ctx.stroke();
        }

        if (ri + 1 < rows) {
          const bottom = dotData[ci][ri + 1];
          const lineAlpha = Math.min(dot.alpha, bottom.alpha) * LINE_DIM;
          ctx.beginPath();
          ctx.moveTo(dot.x, dot.y);
          ctx.lineTo(bottom.x, bottom.y);
          ctx.strokeStyle = isDark
            ? `rgba(230, 245, 230, ${lineAlpha})`
            : `rgba(200, 220, 200, ${lineAlpha})`;
          ctx.stroke();
        }
      }
    }

    // Draw dots on top
    for (let ci = 0; ci < cols; ci++) {
      for (let ri = 0; ri < rows; ri++) {
        const dot = dotData[ci][ri];
        const color = isDark
          ? `rgba(230, 245, 230, ${dot.alpha})`
          : `rgba(200, 220, 200, ${dot.alpha})`;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [viewport, isDark]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // Listen on window for pointer events to track mouse even during ReactFlow panning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if cursor is within the canvas bounds
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        mouseRef.current = { x, y };
      } else {
        mouseRef.current = { x: -1000, y: -1000 };
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    />
  );
};

export default InteractiveDotBackground;
