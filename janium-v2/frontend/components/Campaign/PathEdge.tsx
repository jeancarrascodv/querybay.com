import React from "react";
import { getBezierPath, EdgeProps, Position } from "reactflow";
import { useCampaignStore } from "@/store/useCampaignStore";

interface CustomEdgeProps extends EdgeProps {
  onPlusClick?: (
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string
  ) => void;
  onDelayClick?: (sourceNodeId: string, data: any) => void;
}

const PathEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  source,
  target,
  onPlusClick,
  onDelayClick,
  id,
}: CustomEdgeProps) => {
  const setSelectedNode = useCampaignStore((state) => state.setSelectedNode);
  const setEditingStep = useCampaignStore((state) => state.setEditingStep);
  const setFocusedField = useCampaignStore((state) => state.setFocusedField);

  // Adjust curvature based on horizontal displacement
  const isDirectlyBelow = Math.abs(sourceX - targetX) < 10;
  const curvature = isDirectlyBelow ? 0 : 0.5;

  // Get the bezier path for the edge
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: sourcePosition || Position.Bottom,
    targetX,
    targetY,
    targetPosition: targetPosition || Position.Top,
    curvature,
  });

  const handlePlusClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onPlusClick?.(id, source, target);
  };

  const handleDelayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelayClick?.(source, data);
  };

  // Calculate points along the bezier curve
  const getBezierPoint = (t: number) => {
    // Minimum vertical distance between nodes
    const minVerticalDistance = 100;

    // Calculate actual vertical distance
    const verticalDistance = targetY - sourceY;

    // Adjust target position if needed to maintain minimum distance
    const adjustedTargetY =
      sourceY + Math.max(minVerticalDistance, verticalDistance);

    // Default control points if sourcePosition/targetPosition aren't available
    const sourceOffsetX =
      sourcePosition === Position.Left
        ? -50
        : sourcePosition === Position.Right
          ? 50
          : 0;
    const sourceOffsetY = Math.max(50, minVerticalDistance / 2);
    const targetOffsetX =
      targetPosition === Position.Left
        ? -50
        : targetPosition === Position.Right
          ? 50
          : 0;
    const targetOffsetY = -Math.max(50, minVerticalDistance / 2);

    // Control points for the bezier curve
    const p0x = sourceX;
    const p0y = sourceY;
    const p1x = sourceX + sourceOffsetX;
    const p1y = sourceY + sourceOffsetY;
    const p2x = targetX + targetOffsetX;
    const p2y = adjustedTargetY + targetOffsetY;
    const p3x = targetX;
    const p3y = adjustedTargetY;

    // Cubic bezier formula
    const x =
      Math.pow(1 - t, 3) * p0x +
      3 * Math.pow(1 - t, 2) * t * p1x +
      3 * (1 - t) * Math.pow(t, 2) * p2x +
      Math.pow(t, 3) * p3x;

    const y =
      Math.pow(1 - t, 3) * p0y +
      3 * Math.pow(1 - t, 2) * t * p1y +
      3 * (1 - t) * Math.pow(t, 2) * p2y +
      Math.pow(t, 3) * p3y;

    return { x, y };
  };

  // Create points at 1/3 and 2/3 of the way along the curve
  const points = [getBezierPoint(0.33), getBezierPoint(0.67)];

  // Determine edge color based on status
  const edgeColor =
    data?.status === "accepted" ? "hsl(0, 84%, 60%)" : "hsl(142.1 76.2% 36.3%)";

  // Create a unique ID for this edge's gradient
  // const gradientId = `edge-gradient-${source}`;
  const gradientId = `edge-gradient-${source}-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={edgeColor} stopOpacity="0.2" />
          <stop offset="50%" stopColor={edgeColor} stopOpacity="1" />
          <stop offset="100%" stopColor={edgeColor} stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          stroke: data?.isPlus ? edgeColor : `url(#${gradientId})`,
          strokeWidth: 2,
          opacity: data?.isPlus ? 0.3 : 1,
        }}
      />
    </>
  );
};

export default PathEdge;
