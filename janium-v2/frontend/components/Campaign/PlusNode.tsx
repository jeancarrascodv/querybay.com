import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Plus } from "lucide-react";
import { useCampaignStore } from "@/store/useCampaignStore";

const PlusNode = ({ data, id }: NodeProps) => {
  const setSelectedNode = useCampaignStore((state) => state.setSelectedNode);

  const handleClick = () => {
    if (data.parentId) {
      setSelectedNode(data.parentId);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="w-8 h-8  rounded-full flex items-center justify-center bg-background/80 cursor-pointer hover:bg-green-600 group backdrop-blur-sm"
    >
      {/* <Handle type="target" position={Position.Top} /> */}
      <Plus className="h-4 w-4 text-green-600 group-hover:text-white" />
    </div>
  );
};

export default memo(PlusNode);
