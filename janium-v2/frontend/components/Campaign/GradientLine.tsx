import React from "react";

interface GradientLineProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color?: string;
}

const GradientLine = ({
  startX,
  startY,
  endX,
  endY,
  color = "hsl(142.1 76.2% 36.3%)",
}: GradientLineProps) => {
  const gradientId = `gradient-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <svg
      style={{
        position: "absolute",
        top: "-40px", // Position SVG higher to show the full line
        left: "-75px", // Center the SVG
        width: "150px", // Make SVG wide enough
        height: "80px", // Make SVG tall enough to contain the line
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={75} // Center X
          y1={0} // Start Y
          x2={75} // Center X
          y2={40} // End Y
        >
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="50%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path
        d={`M 75,0 L 75,40`} // Draw line from top center to bottom center
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
};

export default GradientLine;
