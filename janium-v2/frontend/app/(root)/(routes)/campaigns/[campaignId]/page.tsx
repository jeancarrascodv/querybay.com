"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SourceTab } from "@/components/campaign-tabs/source-tab";
import { StepsTab } from "@/components/campaign-tabs/steps-tab";
import { SettingsTab } from "@/components/campaign-tabs/settings-tab";
import { useCampaign } from "@/hooks/useCampaign";
import { useCampaignStore } from "@/store/useCampaignStore";
import { Loader } from "@/components/ui/loader";
import { useTeam } from "@/hooks/useTeam";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLinkedInIntegrations } from "@/hooks/useLinkedInIntegrations";

export default function CampaignPage() {
  const params = useParams();
  const campaignId = params.campaignId as string;
  const selectedCampaign = useCampaignStore((state) => state.selectedCampaign);
  const setSelectedCampaign = useCampaignStore(
    (state) => state.setSelectedCampaign,
  );

  const { campaigns, getCampaigns } = useCampaign();
  const { teams, teamsLoading } = useTeam();
  const { user } = useAuth();
  const currentTeamId = user?.team_id;
  const { integrations } = useLinkedInIntegrations();
  const isSidePanelOpen = useCampaignStore((state) => state.isSidePanelOpen);

  const linkedinAccount = useMemo(() => {
    const ids = selectedCampaign?.linkedinIds;
    if (!ids || ids.length === 0) return null;

    return integrations.find((a) => {
      return a.id === ids[0];
    });
  }, [selectedCampaign, integrations]);
  const [campaignsTeamId, setCampaignsTeamId] = useState<string | null>(
    currentTeamId || null,
  );
  const [activeTab, setActiveTab] = useState("source");
  const router = useRouter();
  useEffect(() => {
    const fetchCampaign = async () => {
      // CRITICAL: Always check if the selected campaign matches the URL campaignId
      // If not, we need to clear it and fetch the correct one
      const isWrongCampaign = selectedCampaign && selectedCampaign.id !== campaignId;
      
      if (!selectedCampaign || isWrongCampaign) {
        // Clear wrong campaign immediately to prevent sending wrong ID in mutations
        if (isWrongCampaign) {
          console.error(`[CampaignPage] Campaign ID mismatch! URL: ${campaignId}, Selected: ${selectedCampaign.id}. Clearing selected campaign.`);
          setSelectedCampaign(null);
        }
        
        // If we have campaigns already, find the one we need
        if (campaigns && campaigns?.length > 0) {
          const campaign = campaigns.find((c) => c.id === campaignId);
          if (campaign) {
            setSelectedCampaign(campaign);
          }
        } else {
          // If no campaigns are loaded yet but we have a teamId, load them
          // Fetch campaigns for the current team
          const campaigns = await getCampaigns();
          setCampaignsTeamId(currentTeamId || null);
          // After loading campaigns, find our target campaign
          if (campaigns && campaigns.length > 0) {
            const campaign = campaigns.find((c) => c.id === campaignId);
            if (campaign) {
              setSelectedCampaign(campaign);
            }
          }
        }
      }
    };

    fetchCampaign();
  }, [
    campaignId,
    campaigns,
    selectedCampaign,
    setSelectedCampaign,
    setCampaignsTeamId,
    getCampaigns,
    teams,
  ]);

  useEffect(() => {
    if (campaignsTeamId && currentTeamId && campaignsTeamId !== currentTeamId) {
      // Team has changed, redirect to campaigns list
      router.push("/campaigns");
    }
  }, [currentTeamId, campaignsTeamId, router]);
  if (!selectedCampaign) {
    return (
      <div className="h-full flex items-center justify-center min-h-[400px]">
        <Loader size={32} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-80px)] px-8 pt-6 overflow-hidden">
      {/* Sticky Header - Campaign Name */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {selectedCampaign && (
              <h2 className="text-2xl font-bold tracking-tight">
                {selectedCampaign.name}
              </h2>
            )}
          </div>
        </div>
      </div>

      {/* Tabs - with sticky TabsList and scrollable content */}
      <Tabs
        defaultValue="source"
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="flex-shrink-0 flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="source">Contacts</TabsTrigger>
            <TabsTrigger value="steps">Steps</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {linkedinAccount && (
            <div
              className={`transition-all duration-300 ${
                activeTab === "steps" && isSidePanelOpen ? "mr-[510px]" : ""
              }`}
            >
              <Badge variant="secondary" className="gap-1.5 py-1.5">
                <User className="h-3.5 w-3.5 text-[#0077b5]" />
                {linkedinAccount.fullName}
              </Badge>
            </div>
          )}
        </div>

        {/* Tab Content - scrollable with hidden scrollbar */}
        <TabsContent
          value="source"
          className="flex-1 overflow-hidden mt-0 data-[state=active]:flex data-[state=active]:flex-col"
        >
          <SourceTab campaignId={campaignId} />
        </TabsContent>
        <TabsContent
          value="steps"
          className="flex-1 overflow-auto scrollbar-hide mt-0"
        >
          <StepsTab campaignId={campaignId} />
        </TabsContent>
        {selectedCampaign && (
          <TabsContent
            value="settings"
            className="flex-1 overflow-auto scrollbar-hide mt-0"
          >
            <SettingsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
