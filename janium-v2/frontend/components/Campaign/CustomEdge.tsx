import React from "react";
import { EdgeProps, Position } from "reactflow";
import { Clock, Info, Plus } from "lucide-react";
import { useCampaignStore } from "@/store/useCampaignStore";
import { Switch } from "../ui/switch";
import { info } from "console";
import { delay } from "lodash";
import PlusIcon from "@/public/icons/PlusIcon";

interface CustomEdgeProps extends EdgeProps {
  onPlusClick?: (
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string
  ) => void;
  onDelayClick?: (sourceNodeId: string, data: any, id: string) => void;
  isSelected?: boolean;
  onEdgeClick?: (edgeId: string) => void;
}

const CustomEdge = ({
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
  isSelected,
  onEdgeClick,
  id,
}: CustomEdgeProps) => {
  const setSelectedNode = useCampaignStore((state) => state.setSelectedNode);
  const setEditingStep = useCampaignStore((state) => state.setEditingStep);
  const setFocusedField = useCampaignStore((state) => state.setFocusedField);

  // Calculate path segments
  const hasXDifference = Math.abs(sourceX - targetX) > 10;
  const hasYDifference = Math.abs(sourceY - targetY) > 10;

  // Define spacing for the path
  const firstVerticalSegment = 20; // Initial downward movement
  const secondVerticalSegment = 20; // Additional downward movement after plus button
  const cornerRadius = 8; // Reduced radius for less curved corners

  let edgePath = "";
  let plusButtonPosition = { x: sourceX, y: sourceY + firstVerticalSegment };
  let delayButtonPosition = {
    x: sourceX,
    y: sourceY + firstVerticalSegment + secondVerticalSegment,
  };

  if (hasXDifference && hasYDifference) {
    // Start at source
    edgePath = `M ${sourceX} ${sourceY}`;

    // Go down first segment
    edgePath += ` L ${sourceX} ${sourceY + firstVerticalSegment}`;

    // Continue down second segment (after plus button position)
    edgePath += ` L ${sourceX} ${sourceY + firstVerticalSegment + secondVerticalSegment}`;

    // Calculate positions for the 90-degree turn
    const turnStartY = sourceY + firstVerticalSegment + secondVerticalSegment;
    const isGoingRight = targetX > sourceX;

    if (isGoingRight) {
      // Correct 90-degree turn to the right - curve outward from the corner
      edgePath += ` Q ${sourceX} ${turnStartY + cornerRadius} ${sourceX + cornerRadius} ${turnStartY + cornerRadius}`;
      // Move horizontally
      edgePath += ` L ${targetX - cornerRadius} ${turnStartY + cornerRadius}`;
      // Correct turn down - curve outward from the corner
      edgePath += ` Q ${targetX} ${turnStartY + cornerRadius} ${targetX} ${turnStartY + cornerRadius * 2}`;
    } else {
      // Correct 90-degree turn to the left - curve outward from the corner
      edgePath += ` Q ${sourceX} ${turnStartY + cornerRadius} ${sourceX - cornerRadius} ${turnStartY + cornerRadius}`;
      // Move horizontally
      edgePath += ` L ${targetX + cornerRadius} ${turnStartY + cornerRadius}`;
      // Correct turn down - curve outward from the corner
      edgePath += ` Q ${targetX} ${turnStartY + cornerRadius} ${targetX} ${turnStartY + cornerRadius * 2}`;
    }

    // Final vertical segment to target
    edgePath += ` L ${targetX} ${targetY}`;

    // Update delay button position to be on the vertical side after horizontal movement
    const verticalAfterHorizontal = turnStartY + cornerRadius * 2;
    const verticalMidpoint =
      verticalAfterHorizontal + (targetY - verticalAfterHorizontal) / 2;
    delayButtonPosition = {
      x: targetX,
      y: verticalMidpoint,
    };
  } else if (hasYDifference) {
    // Simple vertical line
    edgePath = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    delayButtonPosition = { x: sourceX, y: (sourceY + targetY) / 2 + 20 };
  } else {
    // No significant difference, draw a simple line
    edgePath = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  }

  const handlePlusClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // e.stopPropagation();
    console.log("Plus button clicked", id, source, target);
    onPlusClick?.(id, source, target);
  };

  const handleDelayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelayClick?.(source, data, id);
  };

  const handleEdgeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEdgeClick?.(id);
  };

  // The edge color
  const edgeColor = "	hsl(144, 42%, 62%)";

  // Create a unique ID for this edge's gradient
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

        {/* Filter for green glow effect when selected */}
        <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Invisible wider path for easier selection */}
      <path
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          stroke: "transparent",
          strokeWidth: 12,
          cursor: "pointer",
        }}
        onClick={handleEdgeClick}
      />

      {/* Visible edge path */}
      <path
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          stroke: data?.isPlus ? edgeColor : `url(#${gradientId})`,
          strokeWidth: 2,
          opacity: data?.isPlus ? 0.3 : 1,
          filter: isSelected ? ` drop-shadow(0 0 6px ${edgeColor})` : "none",
          cursor: "pointer",
        }}
        onClick={handleEdgeClick}
      />
      {!data?.isPlus && (
        <>
          {/* Plus button */}
          <foreignObject
            key={`${source}-plus`}
            width={20}
            height={20}
            x={plusButtonPosition.x - 10}
            y={plusButtonPosition.y - 10}
            className="edgebutton-foreignobject"
            requiredExtensions="http://www.w3.org/1999/xhtml"
          >
            <button
              onClick={handlePlusClick}
              className="flex items-center justify-center w-[20px] h-[20px] bg-background/80 hover:bg-background/80 backdrop-blur-sm rounded-full text-primary hover:text-white relative overflow-hidden group"
            >
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-0 h-0 rounded-full bg-green-600 group-hover:w-[16px] group-hover:h-[16px] transition-all duration-200"></span>
              </span>
              <PlusIcon className="h-[10px] w-[10px] relative z-10" />
            </button>
          </foreignObject>

          {/* Delay button */}
          <foreignObject
            key={`${source}-delay`}
            width={
              data?.info && data?.enabled === false
                ? 60
                : data?.info
                  ? 35
                  : data?.enabled === false
                    ? 45
                    : 25
            }
            height={20}
            x={
              delayButtonPosition.x -
              (data?.info && data?.enabled === false
                ? 30 // 60 / 2
                : data?.info
                  ? 17.5 // 35 / 2
                  : data?.enabled === false
                    ? 22.5 // 45 / 2
                    : 12.5) // 25 / 2
            }
            y={delayButtonPosition.y - 10}
            requiredExtensions="http://www.w3.org/1999/xhtml"
            className="overflow-visible"
          >
            <div
              onClick={handleDelayClick}
              className="w-full h-full p-1 bg-slate-950 rounded-2xl outline outline-[0.50px] outline-offset-[-0.50px] outline-slate-800 flex justify-center items-center gap-0.5 cursor-pointer hover:outline-green-600/40 transition-all"
            >
              {data?.enabled === false && (
                <div className="w-3.5 h-2 relative bg-slate-700 rounded-full shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-hidden flex items-center">
                  <div className="w-1.5 h-1.5 left-[0.67px] absolute bg-slate-200 rounded-full" />
                </div>
              )}
              <div className="flex items-center justify-center text-white text-[8px] font-normal leading-[8px]">
                {data?.delay || 0}d
              </div>
              {data?.info && (
                <div className="relative group">
                  <div className="w-1.5 h-1.5 px-[3.37px] py-0.5 rounded-md outline outline-[0.42px] outline-offset-[-0.42px] outline-slate-50 flex justify-center items-center">
                    <div className="flex items-center justify-center text-slate-50 text-[4px] font-normal leading-[1px]">
                      i
                    </div>
                  </div>
                  <div className="absolute bottom-full mb-3 p-2 text-foreground left-1/2 -translate-x-1/2 invisible group-hover:visible bg-background/95 backdrop-blur-md rounded text-[10px] shadow-md border w-max max-w-[200px] z-10">
                    <div className="font-semibold mb-1">Link Filter:</div>
                    <div className="text-muted-foreground">{data.info}</div>
                  </div>
                </div>
              )}
            </div>
          </foreignObject>
        </>
      )}
    </>
  );
};

export default CustomEdge;
