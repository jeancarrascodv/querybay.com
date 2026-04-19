import React, { useRef } from "react";
import { Handle, Position } from "reactflow";
import { DISPLAY_STEP_TYPES } from "./constants";
import { Mail } from "lucide-react";
import { Switch } from "../ui/switch";
import { getStepTypeName } from "./FlowBoardUtils";
import LinkedinIcon from "@/public/icons/LinkedinIcon";

const DefaultNode = ({ id, data, isConnectable, type }: any) => {
  let isEnabled = data.enabled ?? false; // Default to true if not provided
  const isSelected = data.selectedNode === id; // Check if this node is selected
  const handleSwitchChange = (checked: boolean) => {
    // Handle switch change logic here
    isEnabled = data.enabled;
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
        <div className="flex items-center justify-center text-white">
          {getIcon()}
        </div>

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
    </div>
  );
};

export default DefaultNode;
