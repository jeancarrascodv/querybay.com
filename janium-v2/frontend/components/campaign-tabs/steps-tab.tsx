import { useEffect } from "react";
import { Loader } from "@/components/ui/loader";
import FlowBoard from "@/components/Campaign/FlowBoard";
import { useTeam } from "@/hooks/useTeam";
import { useTeamStore } from "@/store/useTeamStore";
import { useCampaignSteps } from "@/hooks/useCampaignSteps";
import { useCampaignStore } from "@/store/useCampaignStore";

interface StepsTabProps {
  campaignId: string;
}

export const StepsTab = ({ campaignId }: StepsTabProps) => {
  const { loading, error } = useCampaignSteps();
  const { setIsSidePanelOpen, isSidePanelOpen } = useCampaignStore();
  const teamStore = useTeamStore();
  const teamId = teamStore.currentTeamId;
  useEffect(() => {
    return () => {
      if (setIsSidePanelOpen) {
        setIsSidePanelOpen(false);
      }
    };
  }, [setIsSidePanelOpen]);

  if (loading && !teamId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader size={32} />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  // The FlowBoard component now handles its own data loading
  return <FlowBoard />;
};
