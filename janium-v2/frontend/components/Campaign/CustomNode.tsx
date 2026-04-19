import React, { useRef } from "react";
import { Handle, Position } from "reactflow";
import { DISPLAY_STEP_TYPES } from "./constants";
import { Mail } from "lucide-react";
import { Switch } from "../ui/switch";
import { getStepTypeName } from "./FlowBoardUtils";
import LinkedinIcon from "@/public/icons/LinkedinIcon";
import PlusIcon from "@/public/icons/PlusIcon";

const CustomNode = ({ id, data, isConnectable, type }: any) => {
  let isEnabled = data.enabled ?? false; // Default to true if not provided
  const isSelected = data.selectedNode === id; // Check if this node is selected

  const handleSwitchChange = (checked: boolean) => {
    isEnabled = data.enabled;
    // Handle switch change logic here
    console.log(`Switch for node ${id} changed to ${checked}`);
  };
  const getIcon = () => {
    // Use label which contains the internal step type (e.g., "SendEmail", "SendLinkedInMessage")
    const label = data?.label || "";

    if (label.includes("Email") || label === "SendEmail") {
      return <Mail className="w-4 h-4 text-white" />;
    } else if (
      label.includes("LinkedIn") ||
      label.includes("Message") ||
      label === "SendLinkedInMessage"
    ) {
      return <LinkedinIcon className="w-4 h-4 text-white" />;
    } else if (
      label.includes("Connection") ||
      label === "process_profile_and_send_conn_req"
    ) {
      return <LinkedinIcon className="w-4 h-4 text-white" />;
    }

    return <></>;
  };
  const nodeRef = useRef<HTMLDivElement>(null);
  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onEdgePlusClick) {
      data.onEdgePlusClick(id);
    }
  };

  return (
    <div
      ref={nodeRef}
      className={`relative w-[140px] min-h-[54px] dark:bg-slate-900 text-foreground dark:text-white border border-black dark:border-slate-900  rounded-md px-2 ${
        isSelected ? " shadow-lg shadow-blue-400/20" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        style={{ opacity: 0 }}
      />
      {/* Switch in top left */}
      {!isEnabled && (
        <div className="absolute top-0.5 right-0.5">
          <Switch
            checked={isEnabled}
            onCheckedChange={handleSwitchChange}
            className="scale-50"
          />
        </div>
      )}

      {/* Main content with padding */}
      <div className="px-2 py-2 pt-2 flex flex-col items-center justify-center space-y-1">
        {/* Icon above label */}
        <div className="flex items-center justify-center">{getIcon()}</div>

        {/* Centered label */}
        <div className="text-xs text-center leading-tight break-words whitespace-normal">
          {getStepTypeName(data.label)}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        style={{ opacity: 0 }}
      />
      {data.isLeaf === true && (
        <>
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[2px] h-[10px] bg-gradient-to-b from-green-950 to-green-600"
            style={{ bottom: "-11px" }}
          ></div>
          <div
            className="absolute left-1/2 -translate-x-1/2 -bottom-10 cursor-pointer hover:scale-110 transition-transform"
            onClick={handleAddClick}
          >
            <div className="flex items-center -my-6 w-[20px] h-[20px] justify-center bg-background/80 hover:bg-background/80 backdrop-blur-sm rounded-full text-primary hover:text-white relative overflow-hidden group">
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-0 h-0 rounded-full bg-green-600 group-hover:w-[16px] group-hover:h-[16px] transition-all duration-200"></span>
              </span>
              <PlusIcon className="h-[10px] w-[10px] relative z-10" />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CustomNode;
