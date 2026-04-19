"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CardWithForm } from "@/components/new-campaign";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutGrid, Table as TableIcon } from "lucide-react";
import { useCampaignStore } from "@/store/useCampaignStore";
import { LoadingState, BackgroundRefreshIndicator } from "@/components/ui/loading-state";
import { Loader } from "@/components/ui/loader";
import { Campaign, CampaignContact } from "@/types/campaign.types";
import { useAuth } from "@/contexts/AuthContext";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import { useTeamData } from "@/hooks/useTeamData";

interface CampaignsClientProps {}

const CampaignsClient: React.FC<CampaignsClientProps> = () => {
  const { user } = useAuth();
  const currentTeamId = user?.team_id;
  const router = useRouter();

  // Use unified hook for LinkedIn integrations
  const {
    linkedInIntegrations: integrations,
    loading: teamDataLoading,
    refetch: refetchTeamData
  } = useTeamData({
    includeLinkedIn: true,
    includeCampaigns: false, // Use store for campaigns (has caching)
  });

  // Use campaign store for campaigns (has team-based caching)
  const storeCampaigns = useCampaignStore((state) => state.campaigns);
  const getCampaigns = useCampaignStore((state) => state.getCampaigns);
  const storeLoading = useCampaignStore((state) => state.loading);
  const isInitialLoading = useCampaignStore((state) => state.isInitialLoading);
  const isBackgroundRefreshing = useCampaignStore((state) => state.isBackgroundRefreshing);
  const updateCampaign = useCampaignStore((state) => state.updateCampaign);
  const createCampaign = useCampaignStore((state) => state.createCampaign);
  const setSelectedCampaign = useCampaignStore((state) => state.setSelectedCampaign);
  const storeError = useCampaignStore((state) => state.error);

  // Fetch campaigns when team changes
  useEffect(() => {
    if (currentTeamId) {
      getCampaigns();
    }
  }, [currentTeamId, getCampaigns]);

  // Helper function to calculate contact metrics
  const getContactMetrics = useCallback((campaign: any) => {
    const contacts = campaign.contacts || [];
    const totalContacts = contacts.length;

    const inQueue = contacts.filter(
      (contact: any) =>
        contact.status === "IN_PROGRESS" ||
        contact.status === "PENDING_START_STEP" ||
        contact.status === "PENDING_START_STEP_ERROR" ||
        contact.status === "IN_PROGRESS_ERROR"
    ).length;

    const replied = contacts.filter(
      (contact: any) =>
        contact.status === "REPLIED" ||
        contact.status === "FINISHED" ||
        contact.status === "END_STEP"
    ).length;

    return { totalContacts, inQueue, replied };
  }, []);

  // Helper function to get LinkedIn account name
  const getLinkedInAccountName = useCallback(
    (linkedinIds?: string[]) => {
      if (!linkedinIds || linkedinIds.length === 0) return "None";
      const integration = integrations.find((li) => li.id === linkedinIds[0]);
      return integration ? integration.fullName : "Unknown";
    },
    [integrations]
  );

  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [isTableView, setIsTableView] = useState(true);
  const [togglingCampaign, setTogglingCampaign] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isRefreshing } = useTokenRefresh();

  // Use campaigns from store (has caching)
  const unsortedCampaigns = storeCampaigns;
  const loading = teamDataLoading || storeLoading;

  // Sort campaigns: active first, then alphabetically by name within each group
  const campaigns = useMemo(() => {
    if (!unsortedCampaigns || unsortedCampaigns.length === 0) return [];
    return [...unsortedCampaigns].sort((a, b) => {
      // First, sort by active status (active campaigns first)
      if (a.active && !b.active) return -1;
      if (!a.active && b.active) return 1;
      // Then, sort alphabetically by name within the same active status
      return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
    });
  }, [unsortedCampaigns]);

  // Always use campaigns from the store for reactive updates (provide fallback)
  const campaignData = campaigns || [];

  // Memoize computed values
  const hasError = useMemo(() => Boolean(error || storeError), [error, storeError]);
  const hasCampaigns = useMemo(
    () => campaignData.length > 0,
    [campaignData.length]
  );

  // Optimized callback functions
  const handleRefreshCampaigns = useCallback(async () => {
    if (!currentTeamId) return;

    try {
      await getCampaigns(undefined, true); // Force refresh
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load campaigns. Please try again.");
    }
  }, [getCampaigns, currentTeamId]);

  const handleModalOpen = useCallback(() => setModalIsOpen(true), []);
  const handleModalClose = useCallback(() => setModalIsOpen(false), []);

  const toggleCampaignStatus = useCallback(
    async (campaignId: string, isActive: boolean) => {
      if (!currentTeamId) return;

      setTogglingCampaign(campaignId);
      try {
        // Use the store's updateCampaign which has optimistic updates
        await updateCampaign(campaignId, {
          active: !isActive,
        });
      } catch (error) {
        console.error("Error toggling campaign status:", error);
      } finally {
        setTogglingCampaign(null);
      }
    },
    [currentTeamId, updateCampaign]
  );

  const selectCampaign = useCallback(
    (campaign: any) => {
      setSelectedCampaign(campaign);
      router.push(`/campaigns/${campaign.id}`);
    },
    [setSelectedCampaign, router]
  );

  const handleViewToggle = useCallback((tableView: boolean) => {
    setIsTableView(tableView);
  }, []);

  // No team selected state
  if (!currentTeamId && !isRefreshing) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-muted-foreground">
        <h2 className="text-2xl font-semibold mb-2">No team selected</h2>
        <p className="mb-6">Please select a team to view campaigns</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full m-8 mt-5">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Campaigns</h1>
            <BackgroundRefreshIndicator isRefreshing={isBackgroundRefreshing} />
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex items-center border rounded-md overflow-hidden">
              <Button
                variant={isTableView ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9 rounded-none"
                onClick={() => handleViewToggle(true)}
              >
                <TableIcon className="h-4 w-4" />
              </Button>{" "}
              <Button
                variant={isTableView ? "ghost" : "secondary"}
                size="icon"
                className="h-9 w-9 rounded-none"
                onClick={() => handleViewToggle(false)}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={handleModalOpen}>New Campaign</Button>
          </div>
        </div>

        <LoadingState
          isInitialLoading={isInitialLoading}
          isBackgroundRefreshing={isBackgroundRefreshing}
          isEmpty={!hasCampaigns}
          emptyMessage="No campaigns yet"
          emptyDescription="Create your first campaign to get started"
          emptyAction={{
            label: "Create Campaign",
            onClick: handleModalOpen,
          }}
          error={hasError ? (error || storeError?.message || "Failed to load campaigns") : null}
          onRetry={handleRefreshCampaigns}
        >
          {isTableView ? (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[400px] min-w-[200px]">
                    Name
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>LinkedIn Account</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead>In Queue</TableHead>
                  <TableHead>Replied</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignData.map((campaign) => {
                  const { totalContacts, inQueue, replied } =
                    getContactMetrics(campaign);

                  return (
                    <TableRow
                      key={campaign.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => selectCampaign(campaign)}
                    >
                      <TableCell className="font-medium">
                        {campaign.name}
                      </TableCell>
                      <TableCell>
                        {campaign.active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Inactive
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getLinkedInAccountName(campaign.linkedinIds)}
                      </TableCell>
                      <TableCell>{totalContacts}</TableCell>
                      <TableCell>{inQueue}</TableCell>
                      <TableCell>{replied}</TableCell>

                      <TableCell
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <div className="flex items-center">
                          {togglingCampaign === campaign.id ? (
                            <Loader size={14} />
                          ) : (
                            <Switch
                              checked={campaign.active}
                              onCheckedChange={() =>
                                toggleCampaignStatus(
                                  campaign.id,
                                  campaign.active
                                )
                              }
                              aria-label="Toggle campaign status"
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaignData.map((campaign) => {
              const { totalContacts, inQueue, replied } =
                getContactMetrics(campaign);

              return (
                <Card
                  key={campaign.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => selectCampaign(campaign)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{campaign.name}</CardTitle>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        {togglingCampaign === campaign.id ? (
                          <Loader size={10} />
                        ) : (
                          <Switch
                            checked={!!campaign.active}
                            onCheckedChange={() =>
                              toggleCampaignStatus(campaign.id, campaign.active)
                            }
                            aria-label="Toggle campaign status"
                          />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <p className="text-muted-foreground">Status</p>
                        <p className="font-medium">
                          {campaign.active ? "Active" : "Inactive"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground">
                          LinkedIn Account
                        </p>
                        <p className="font-medium">
                          {getLinkedInAccountName(campaign.linkedinIds)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground">Contacts</p>
                        <p className="font-medium">{0}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground">In Queue</p>
                        <p className="font-medium">{inQueue}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground">Replied</p>
                        <p className="font-medium">{replied}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        </LoadingState>
      </div>

      <CardWithForm
        teamId={currentTeamId ?? ""}
        isOpen={modalIsOpen}
        onClose={handleModalClose}
        setModalIsOpen={setModalIsOpen}
      />
    </>
  );
};

export default CampaignsClient;
