import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useMemo, useRef } from "react";
import { useCampaign } from "@/hooks/useCampaign";
import { Loader } from "@/components/ui/loader";
import { useCampaignStore } from "@/store/useCampaignStore";
import { CampaignSchedulePicker } from "../Campaign/CampaignSchedulePicker";
import { useTeamStore } from "@/store/useTeamStore";
import { useMutation } from "@apollo/client";
import { Mutations } from "@/graphql/campaign";
import { useLinkedInIntegrations } from "@/hooks/useLinkedInIntegrations";
import { useTeamData } from "@/hooks/useTeamData";
import type {
  AllowedMessagingDayTimesInput,
  AllowedMessagingDayTimes,
  DayTime, // For reading selectedCampaign
} from "@/types/campaign.types"; // Adjusted path assuming types are in @/types
import { useParams } from "next/navigation";
import { LogsViewerTrigger } from "@/components/logs-viewer";

// Helper type for settings state for selected days
interface SelectedDays {
  sun: boolean;
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
}

// Mapping from settings state short day keys to API type lowercase full day keys
const stateDayKeyToApiDayKey: Record<
  keyof SelectedDays,
  keyof AllowedMessagingDayTimesInput
> = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
};

// Mapping from API type lowercase full day keys to settings state short day keys
const apiDayKeyToStateDayKey: Record<
  keyof AllowedMessagingDayTimes,
  keyof SelectedDays
> = {
  sunday: "sun",
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
};

export function SettingsTab() {
  const params = useParams();
  const campaignId = params.campaignId as string;
  const { campaigns, updateCampaign, getCampaigns } = useCampaign();
  const { selectedCampaign, setSelectedCampaign } = useCampaignStore();
  const currentTeamId = useTeamStore((state) => state.currentTeamId);
  const { integrations: linkedInIntegrations, loading: linkedInLoading } =
    useLinkedInIntegrations();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useTeamSettings, setUseTeamSettings] = useState(false);

  // Auto-save state tracking
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [lastSavedText, setLastSavedText] = useState("");
  const [isSavingInternal, setIsSavingInternal] = useState(false);
  const isInitialLoadRef = useRef(true);
  const performSaveRef = useRef<() => Promise<void>>();
  const hasInitializedRef = useRef(false);
  const skipChangeTrackingRef = useRef(false);
  const hasPopulatedTeamDisplayRef = useRef(false);

  // Fetch team data to get team's allowedMessagingDayTimes
  const { allTeams, loading: teamsLoading } = useTeamData({
    includeAllTeams: true,
  });

  // Get the current team's allowedMessagingDayTimes
  const teamWeeklyRestrictions = useMemo(() => {
    const currentTeam = allTeams.find((team) => team.id === currentTeamId);
    return currentTeam?.allowedMessagingDayTimes || null;
  }, [allTeams, currentTeamId]);
  const currentTeamData = useMemo(() => {
    const currentTeam = allTeams.find((team) => team.id === currentTeamId);
    return currentTeam || null;
  }, [allTeams, currentTeamId]);

  // Reset change tracking when component mounts or campaignId changes
  useEffect(() => {
    isInitialLoadRef.current = true;
    hasInitializedRef.current = false;
    hasPopulatedTeamDisplayRef.current = false;
    setHasChanges(false);
    // Allow state to settle before enabling change tracking
    const timer = setTimeout(() => {
      isInitialLoadRef.current = false;
    }, 1000);
    return () => clearTimeout(timer);
  }, [campaignId]);

  // Update last saved text every second
  useEffect(() => {
    if (!lastSaved) {
      setLastSavedText("");
      return;
    }
    const update = () => {
      const secs = Math.floor((Date.now() - lastSaved.getTime()) / 1000);
      setLastSavedText(secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  // Helper to build settings from team restrictions
  const buildTeamSettingsForDisplay = (restrictions: typeof teamWeeklyRestrictions) => {
    if (!restrictions) return null;
    const newSelectedDays: SelectedDays = {
      sun: false, mon: false, tue: false, wed: false, thu: false, fri: false, sat: false,
    };
    const newAllowedTimes: Record<string, { startTime: string; endTime: string }> = {};
    let firstTimeWindow: [number, number] = [9, 17];
    let firstDayProcessed = false;

    Object.entries(restrictions).forEach(([dayKey, dayData]) => {
      if (dayData && dayData.startTime && dayData.endTime) {
        const shortDay = apiDayKeyToStateDayKey[dayKey as keyof AllowedMessagingDayTimes];
        if (shortDay) {
          newSelectedDays[shortDay] = true;
          newAllowedTimes[dayKey] = { startTime: dayData.startTime, endTime: dayData.endTime };
          if (!firstDayProcessed) {
            const startHour = parseInt(dayData.startTime.split(":")[0], 10);
            let endHour = parseInt(dayData.endTime.split(":")[0], 10);
            if (endHour === 0) endHour = 24;
            firstTimeWindow = [startHour, endHour];
            firstDayProcessed = true;
          }
        }
      }
    });
    return { timeWindow: firstTimeWindow, selectedDays: newSelectedDays, allowedMessagingDayTimes: newAllowedTimes };
  };

  // Populate display from team data on initial load when using team settings
  useEffect(() => {
    // Only run during initial load when using team settings and team data is available
    if (
      isInitialLoadRef.current &&
      useTeamSettings &&
      teamWeeklyRestrictions &&
      !hasPopulatedTeamDisplayRef.current
    ) {
      const teamSettings = buildTeamSettingsForDisplay(teamWeeklyRestrictions);
      if (teamSettings) {
        skipChangeTrackingRef.current = true;
        setSettings((prev) => ({ ...prev, ...teamSettings }));
        hasPopulatedTeamDisplayRef.current = true;
      }
    }
  }, [useTeamSettings, teamWeeklyRestrictions]);

  const [updateCampaignMutation] = useMutation(Mutations.UPDATE_CAMPAIGN);

  const [settings, setSettings] = useState({
    campaignName: "",
    isActive: false,
    selectedLinkedInId: "" as string,
    timeWindow: [9, 17] as [number, number], // For SchedulePicker & default for new days
    selectedDays: {
      sun: false,
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
    } as SelectedDays,

    allowedMessagingDayTimes: {} as Record<
      string,
      { startTime: string; endTime: string }
    >,
  });

  // Track changes after initial load is complete
  useEffect(() => {
    if (isInitialLoadRef.current || !selectedCampaign) return;
    if (skipChangeTrackingRef.current) {
      skipChangeTrackingRef.current = false;
      return;
    }
    setHasChanges(true);
  }, [
    settings.campaignName,
    settings.isActive,
    settings.selectedLinkedInId,
    settings.timeWindow,
    settings.selectedDays,
    settings.allowedMessagingDayTimes,
    useTeamSettings,
  ]);

  // Auto-save effect - save when there are changes
  useEffect(() => {
    if (!hasChanges || isSavingInternal) return;

    const timer = setTimeout(async () => {
      if (!selectedCampaign) return;
      try {
        setIsSavingInternal(true);
        await performSaveRef.current?.();
        setLastSaved(new Date());
        setSaveSuccess(true);
        setHasChanges(false);
        setTimeout(() => setSaveSuccess(false), 2000);
      } catch (error) {
        console.error("Auto-save failed:", error);
      } finally {
        setIsSavingInternal(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [hasChanges, isSavingInternal]);

  // Save on unmount if there are pending changes
  useEffect(() => {
    return () => {
      // Check if there are unsaved changes when component unmounts
      if (hasChanges && selectedCampaign && !isSavingInternal) {
        // Save in background without awaiting (component is unmounting)
        performSaveRef.current?.().catch((error) => {
          console.error("Background save on unmount failed:", error);
        });
      }
    };
  }, [hasChanges, selectedCampaign, isSavingInternal]);

  // First, ensure we have the selected campaign
  useEffect(() => {
    const fetchCampaignIfNeeded = async () => {
      setLoading(true);

      // // CRITICAL: Validate that selected campaign matches the URL campaignId
      // // If wrong campaign is selected, clear it to prevent mutations on wrong campaign
      // if (selectedCampaign && selectedCampaign.id !== campaignId) {
      //   console.error(
      //     `[SettingsTab] Campaign ID mismatch! URL: ${campaignId}, Selected: ${selectedCampaign.id}. Clearing selected campaign.`,
      //   );
      //   setSelectedCampaign(null);
      //   setLoading(false);
      //   return;
      // }

      // If we don't have a selected campaign, try to find it in the campaigns array
      if (!selectedCampaign && campaignId) {
        const foundCampaign = campaigns.find((c) => c.id === campaignId);

        // If found in current campaigns array, set it
        if (foundCampaign) {
          setSelectedCampaign(foundCampaign);
        }
        // If not found and we have a teamId, try to fetch campaigns
        else if (currentTeamId) {
          try {
            const fetchedCampaigns = await getCampaigns();
            const foundCampaign = fetchedCampaigns.find(
              (c) => c.id === campaignId,
            );
            if (foundCampaign) {
              setSelectedCampaign(foundCampaign);
            }
          } catch (error) {
            console.error("Failed to fetch campaigns:", error);
          }
        }
      }

      setLoading(false);
    };

    fetchCampaignIfNeeded();
  }, [
    campaignId,
    campaigns,
    currentTeamId,
    getCampaigns,
    selectedCampaign,
    setSelectedCampaign,
  ]);

  // Then, populate the settings from the selected campaign (only on initial load)
  useEffect(() => {
    // Only populate on initial load, not after saves
    if (!selectedCampaign || hasInitializedRef.current) return;

    const campaignAmtd = selectedCampaign.allowedMessagingDayTimes;

    // Check if campaign has its own settings or is using team settings (null/empty)
    const hasOwnSettings =
      campaignAmtd &&
      Object.keys(campaignAmtd).some((key) => {
        const dayData = campaignAmtd[key as keyof AllowedMessagingDayTimes];
        return dayData && dayData.startTime !== undefined;
      });
    setUseTeamSettings(!hasOwnSettings);

    const newSettings = {
      campaignName: selectedCampaign.name || "",
      isActive: selectedCampaign.active || false,
      selectedLinkedInId:
        selectedCampaign.linkedinIds &&
        selectedCampaign.linkedinIds.length > 0
          ? selectedCampaign.linkedinIds[0]
          : "",
      timeWindow: [9, 17] as [number, number],
      selectedDays: {
        sun: false, mon: false, tue: false, wed: false, thu: false, fri: false, sat: false,
      } as SelectedDays,
      allowedMessagingDayTimes: {} as Record<string, { startTime: string; endTime: string }>,
    };

    if (campaignAmtd) {
      let firstDayProcessed = false;
      const parseTimeValue = (value: any): number => {
        if (typeof value === "number") return value;
        if (typeof value === "string") return parseInt(value.split(":")[0], 10);
        return 9;
      };

      for (const apiDayKey of Object.keys(campaignAmtd) as Array<keyof AllowedMessagingDayTimes>) {
        const dayData = campaignAmtd[apiDayKey] as DayTime | undefined;
        if (dayData) {
          const stateDayKey = apiDayKeyToStateDayKey[apiDayKey];
          const startTime = parseTimeValue(dayData.startTime);
          const endTime = parseTimeValue(dayData.endTime);
          const displayEndTime = endTime === 0 ? 24 : endTime;

          if (stateDayKey) {
            newSettings.selectedDays[stateDayKey] = true;
            newSettings.allowedMessagingDayTimes[apiDayKey] = {
              startTime: `${startTime.toString().padStart(2, "0")}:00:00`,
              endTime: `${displayEndTime.toString().padStart(2, "0")}:00:00`,
            };
          }
          if (!firstDayProcessed) {
            newSettings.timeWindow = [startTime, displayEndTime];
            firstDayProcessed = true;
          }
        }
      }
    }

    setSettings(newSettings);
    hasInitializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampaign]);

  const performSave = async () => {
    if (!selectedCampaign || !currentTeamId) return;

    // If using team settings, set allowedMessagingDayTimes to null
    let allowedMessagingDayTimes: AllowedMessagingDayTimesInput | null = null;

    if (!useTeamSettings) {
      // Build the allowedMessagingDayTimes input
      allowedMessagingDayTimes = {};

      // Convert settings.allowedMessagingDayTimes to the required format
      Object.entries(settings.allowedMessagingDayTimes).forEach(
        ([dayKey, dayData]) => {
          if (
            dayData &&
            settings.selectedDays[
              apiDayKeyToStateDayKey[dayKey as keyof AllowedMessagingDayTimes]
            ]
          ) {
            // Ensure proper time format (HH:MM:SS) without extra characters
            let startTime = dayData.startTime;
            let endTime = dayData.endTime;

            // If the time doesn't already have the correct format, convert it
            if (!startTime.match(/^\d{2}:\d{2}:\d{2}$/)) {
              // Extract hour and create proper format
              const startHour = parseInt(startTime.split(":")[0], 10);
              startTime = `${String(startHour).padStart(2, "0")}:00:00`;
            }

            if (!endTime.match(/^\d{2}:\d{2}:\d{2}$/)) {
              // Extract hour and create proper format
              const endHour = parseInt(endTime.split(":")[0], 10);
              endTime = `${String(endHour).padStart(2, "0")}:00:00`;
            }

            // Convert 24:00:00 to 00:00:00 for backend API
            if (endTime === "24:00:00") {
              endTime = "00:00:00";
            }

            allowedMessagingDayTimes![
              dayKey as keyof AllowedMessagingDayTimesInput
            ] = {
              startTime,
              endTime,
            };
          }
        },
      );
    }

    const updatePayload = {
      name: settings.campaignName,
      active: settings.isActive,
      allowedMessagingDayTimes,
      linkedinIds: settings.selectedLinkedInId
        ? [settings.selectedLinkedInId]
        : [],
    };

    const response = await updateCampaignMutation({
      variables: {
        teamId: currentTeamId,
        campaignId: selectedCampaign.id,
        changes: updatePayload,
      },
    });

    if (response.data) {
      console.log("Campaign updated successfully:", response.data);

      // Update the selected campaign with the new data
      const updatedCampaign = response.data.team.campaign.modify;
      setSelectedCampaign(updatedCampaign);

      // Update the campaign in the store without refetching
      const updatedCampaigns = campaigns.map((c) =>
        c.id === updatedCampaign.id ? updatedCampaign : c,
      );
      useCampaignStore.setState({ campaigns: updatedCampaigns });

      // Show success message
      console.log("Campaign settings saved successfully!");
    }
  };

  // Keep ref updated with latest performSave
  performSaveRef.current = performSave;

  const handleSave = async () => {
    setSaving(true);
    try {
      await performSave();
      setLastSaved(new Date());
      setSaveSuccess(true);
      setHasChanges(false);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error("Failed to update campaign settings:", error);
      console.log("Failed to save campaign settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !selectedCampaign) {
    return (
      <div className="h-full flex items-center justify-center min-h-[200px]">
        <Loader />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full">
      <Card className="mt-5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Campaign Settings</h2>
              <LogsViewerTrigger
                buttonText="Show Logs"
                buttonVariant="outline"
                initialFilters={{ campaignId }}
                title="Campaign Logs"
              />
            </div>
            <p className="text-xs text-gray-400">
              {isSavingInternal ? (
                <span className="text-yellow-400">Saving...</span>
              ) : saveSuccess ? (
                <span className="text-green-400">✓ Changes saved</span>
              ) : lastSavedText ? (
                `Last saved: ${lastSavedText}`
              ) : (
                "Changes save automatically"
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent className="">
          <form
            className="space-y-0"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="campaignName mb-1">Campaign Name</Label>
                <Input
                  id="campaignName"
                  value={settings.campaignName}
                  onChange={(e) =>
                    setSettings({ ...settings, campaignName: e.target.value })
                  }
                />
              </div>

              <div className="flex items-center space-x-2">
                <Label htmlFor="isActive" className="flex-shrink-0">
                  Active
                </Label>
                <Switch
                  id="isActive"
                  checked={settings.isActive}
                  onCheckedChange={async (checked) => {
                    // Skip change tracking - we save immediately
                    skipChangeTrackingRef.current = true;
                    setSettings((prev) => ({ ...prev, isActive: checked }));

                    if (selectedCampaign && currentTeamId) {
                      setSaving(true);
                      try {
                        const response = await updateCampaignMutation({
                          variables: {
                            teamId: currentTeamId,
                            campaignId: selectedCampaign.id,
                            changes: { active: checked },
                          },
                        });

                        if (response.data) {
                          const updatedCampaign = response.data.team.campaign.modify;
                          setSelectedCampaign(updatedCampaign);
                          useCampaignStore.setState({
                            campaigns: campaigns.map((c) =>
                              c.id === updatedCampaign.id ? updatedCampaign : c
                            ),
                          });
                          setLastSaved(new Date());
                        }
                      } catch (error) {
                        console.error("Failed to update campaign status:", error);
                        skipChangeTrackingRef.current = true;
                        setSettings((prev) => ({ ...prev, isActive: !checked }));
                      } finally {
                        setSaving(false);
                      }
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedinAccount">LinkedIn Account</Label>
                <Select
                  value={settings.selectedLinkedInId}
                  onValueChange={async (value) => {
                    // Skip change tracking - we save immediately
                    skipChangeTrackingRef.current = true;
                    setSettings((prev) => ({ ...prev, selectedLinkedInId: value }));

                    if (selectedCampaign && currentTeamId) {
                      setSaving(true);
                      try {
                        const response = await updateCampaignMutation({
                          variables: {
                            teamId: currentTeamId,
                            campaignId: selectedCampaign.id,
                            changes: { linkedinIds: value ? [value] : [] },
                          },
                        });

                        if (response.data) {
                          const updatedCampaign = response.data.team.campaign.modify;
                          setSelectedCampaign(updatedCampaign);
                          useCampaignStore.setState({
                            campaigns: campaigns.map((c) =>
                              c.id === updatedCampaign.id ? updatedCampaign : c
                            ),
                          });
                          setLastSaved(new Date());
                        }
                      } catch (error) {
                        console.error("Failed to update LinkedIn account:", error);
                      } finally {
                        setSaving(false);
                      }
                    }
                  }}
                >
                  <SelectTrigger id="linkedinAccount">
                    <SelectValue placeholder="Select LinkedIn account" />
                  </SelectTrigger>
                  <SelectContent>
                    {linkedInLoading ? (
                      <SelectItem value="loading" disabled>
                        Loading...
                      </SelectItem>
                    ) : linkedInIntegrations.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No LinkedIn accounts available
                      </SelectItem>
                    ) : (
                      linkedInIntegrations.map((integration) => (
                        <SelectItem key={integration.id} value={integration.id}>
                          {integration.fullName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2 py-2">
                  <Checkbox
                    id="useTeamSettings"
                    checked={useTeamSettings}
                    onCheckedChange={(checked) => {
                      const isChecked = checked === true;
                      setUseTeamSettings(isChecked);

                      if (isChecked) {
                        // Apply team settings to display
                        const teamSettings = buildTeamSettingsForDisplay(teamWeeklyRestrictions);
                        if (teamSettings) {
                          setSettings((prev) => ({ ...prev, ...teamSettings }));
                        }
                      } else {
                        // Reset to Mon-Fri 9-5 defaults
                        setSettings((prev) => ({
                          ...prev,
                          timeWindow: [9, 17] as [number, number],
                          selectedDays: {
                            sun: false, mon: true, tue: true, wed: true, thu: true, fri: true, sat: false,
                          },
                          allowedMessagingDayTimes: {
                            monday: { startTime: "09:00:00", endTime: "17:00:00" },
                            tuesday: { startTime: "09:00:00", endTime: "17:00:00" },
                            wednesday: { startTime: "09:00:00", endTime: "17:00:00" },
                            thursday: { startTime: "09:00:00", endTime: "17:00:00" },
                            friday: { startTime: "09:00:00", endTime: "17:00:00" },
                          },
                        }));
                      }
                    }}
                  />
                  <Label htmlFor="useTeamSettings" className="cursor-pointer">
                    Use Team Settings
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Timezone : {currentTeamData?.timeZone}
                </p>

                <div
                  className={
                    useTeamSettings ? "opacity-50 pointer-events-none" : ""
                  }
                >
                  <CampaignSchedulePicker
                    timeWindow={settings.timeWindow || [9, 17]}
                    selectedDays={settings.selectedDays}
                    weeklyRestrictions={
                      useTeamSettings
                        ? (teamWeeklyRestrictions ?? undefined)
                        : settings.allowedMessagingDayTimes
                    }
                    onTimeWindowChange={(
                      value: [number, number],
                      day: string,
                    ) => {
                      if (
                        day &&
                        typeof day === "string" &&
                        day in stateDayKeyToApiDayKey
                      ) {
                        const dayKey = day as keyof SelectedDays;
                        const apiDayKey = stateDayKeyToApiDayKey[dayKey];
                        // Convert 24 to 00 for end-of-day when sending to backend API
                        const endTimeHour = value[1] === 24 ? 0 : value[1];
                        setSettings({
                          ...settings,
                          timeWindow: value,
                          allowedMessagingDayTimes: {
                            ...settings.allowedMessagingDayTimes,
                            [apiDayKey]: {
                              startTime: `${value[0].toString().padStart(2, "0")}:00:00`,
                              endTime: `${endTimeHour.toString().padStart(2, "0")}:00:00`,
                            },
                          },
                        });
                      } else {
                        setSettings({
                          ...settings,
                          timeWindow: value,
                        });
                      }
                    }}
                    onDaySelectionChange={(days: SelectedDays) =>
                      setSettings({
                        ...settings,
                        selectedDays: days,
                      })
                    }
                    onWeeklyRestrictionsChange={(restrictions) => {
                      // Update the allowedMessagingDayTimes from the restrictions format
                      const newAllowedTimes: Record<
                        string,
                        { startTime: string; endTime: string }
                      > = {};

                      // Update selectedDays based on which restrictions exist
                      const newSelectedDays = { ...settings.selectedDays };

                      // Reset all days to false first
                      Object.keys(newSelectedDays).forEach((day) => {
                        newSelectedDays[day as keyof SelectedDays] = false;
                      });

                      Object.entries(restrictions).forEach(
                        ([dayKey, restriction]) => {
                          if (restriction) {
                            // Convert time string back to hour number
                            const startHour = parseInt(
                              restriction.startTime.split(":")[0],
                              10,
                            );
                            let endHour = parseInt(
                              restriction.endTime.split(":")[0],
                              10,
                            );
                            // If endHour is 0 (00:00), convert to 24 for display as 12 AM (end of day)
                            if (endHour === 0) {
                              endHour = 24;
                            }

                            // Convert 24 back to 00 for backend API storage
                            const endTimeForApi = endHour === 24 ? 0 : endHour;

                            newAllowedTimes[dayKey] = {
                              startTime: `${startHour.toString().padStart(2, "0")}:00:00`,
                              endTime: `${endTimeForApi.toString().padStart(2, "0")}:00:00`,
                            };

                            // Mark this day as selected
                            const stateDayKey =
                              apiDayKeyToStateDayKey[
                                dayKey as keyof AllowedMessagingDayTimes
                              ];
                            if (stateDayKey) {
                              newSelectedDays[stateDayKey] = true;
                            }
                          }
                        },
                      );

                      setSettings({
                        ...settings,
                        selectedDays: newSelectedDays,
                        allowedMessagingDayTimes: newAllowedTimes,
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
