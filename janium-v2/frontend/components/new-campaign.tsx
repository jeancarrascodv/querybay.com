import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { X } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import Modal from "react-modal";
import { toast } from "@/components/ui/use-toast";
import { CampaignSchedulePicker } from "./Campaign/CampaignSchedulePicker";
import { useMutation } from "@apollo/client";
import { Mutations } from "@/graphql/campaign";
import { useRouter } from "next/navigation";
import { useCampaignStore } from "@/store/useCampaignStore";
import { useLinkedInIntegrations } from "@/hooks/useLinkedInIntegrations";
import { useTeamData } from "@/hooks/useTeamData";
import { useTeamStore } from "@/store/useTeamStore";

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
const stateDayKeyToApiDayKey: Record<keyof SelectedDays, string> = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
};

export interface CardWithFormProps {
  isOpen: boolean;
  onClose: () => void;
  setModalIsOpen: (data: any) => void;
  teamId: string;
}

export function CardWithForm({
  isOpen,
  onClose,
  setModalIsOpen,
  teamId,
}: CardWithFormProps) {
  const [timeWindow, setTimeWindow] = useState<[number, number]>([9, 17]);
  const [selectedDays, setSelectedDays] = useState<SelectedDays>({
    sun: false,
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
  });

  // Initialize with default 9-5 time for weekdays
  const [allowedMessagingDayTimes, setAllowedMessagingDayTimes] = useState<
    Record<string, { startTime: string; endTime: string }>
  >({
    monday: { startTime: "09:00:00", endTime: "17:00:00" },
    tuesday: { startTime: "09:00:00", endTime: "17:00:00" },
    wednesday: { startTime: "09:00:00", endTime: "17:00:00" },
    thursday: { startTime: "09:00:00", endTime: "17:00:00" },
    friday: { startTime: "09:00:00", endTime: "17:00:00" },
  });

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    email: "",
    replyInThread: false,
  });
  const [selectedLinkedInId, setSelectedLinkedInId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [useTeamSettings, setUseTeamSettings] = useState(true);

  // Use store directly for adding campaigns
  const campaigns = useCampaignStore((state) => state.campaigns);
  const router = useRouter();
  const { setSelectedCampaign } = useCampaignStore();
  const { integrations: linkedInIntegrations, loading: linkedInLoading } =
    useLinkedInIntegrations();

  // Fetch team data to get team's allowedMessagingDayTimes
  const { allTeams, loading: teamsLoading } = useTeamData({
    includeAllTeams: true,
  });
  const { currentTeamId } = useTeamStore();
  const currentTeamData = useMemo(() => {
    const currentTeam = allTeams.find((team) => team.id === currentTeamId);
    return currentTeam || null;
  }, [allTeams, currentTeamId]);

  // Get the current team's allowedMessagingDayTimes
  const teamWeeklyRestrictions = useMemo(() => {
    const currentTeam = allTeams.find((team) => team.id === teamId);
    return currentTeam?.allowedMessagingDayTimes || null;
  }, [allTeams, teamId]);

  // Load team settings when they become available and useTeamSettings is true
  useEffect(() => {
    if (useTeamSettings && teamWeeklyRestrictions && isOpen) {
      const newSelectedDays: SelectedDays = {
        sun: false,
        mon: false,
        tue: false,
        wed: false,
        thu: false,
        fri: false,
        sat: false,
      };
      const newAllowedTimes: Record<
        string,
        { startTime: string; endTime: string }
      > = {};
      let firstTimeWindow: [number, number] = [9, 17];
      let firstDayProcessed = false;

      Object.entries(teamWeeklyRestrictions).forEach(([dayKey, dayData]) => {
        if (dayData && dayData.startTime && dayData.endTime) {
          const reverseMapping: Record<string, keyof SelectedDays> = {
            sunday: "sun",
            monday: "mon",
            tuesday: "tue",
            wednesday: "wed",
            thursday: "thu",
            friday: "fri",
            saturday: "sat",
          };
          const shortDay = reverseMapping[dayKey];
          if (shortDay) {
            newSelectedDays[shortDay] = true;
            newAllowedTimes[dayKey] = {
              startTime: dayData.startTime,
              endTime: dayData.endTime,
            };
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

      setTimeWindow(firstTimeWindow);
      setSelectedDays(newSelectedDays);
      setAllowedMessagingDayTimes(newAllowedTimes);
    }
  }, [teamWeeklyRestrictions, useTeamSettings, isOpen]);

  // Create ref for the campaign name input
  const campaignNameInputRef = useRef<HTMLInputElement>(null);

  // Focus the input when modal opens
  useEffect(() => {
    if (isOpen && campaignNameInputRef.current) {
      // Use setTimeout to ensure the modal is fully rendered
      setTimeout(() => {
        campaignNameInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const [createCampaignMutation] = useMutation(Mutations.CREATE_CAMPAIGN);
  const [updateCampaignMutation] = useMutation(Mutations.UPDATE_CAMPAIGN);

  const handleCreateCampaign = async (data: any) => {
    setIsCreating(true);
    try {
      // If using team settings, don't set allowedMessagingDayTimes (null means inherit from team)
      let dailyRestrictions: { [key: string]: any } | null = null;

      if (!useTeamSettings) {
        // Convert allowedMessagingDayTimes to the format expected by the API
        dailyRestrictions = {};

        Object.entries(allowedMessagingDayTimes).forEach(
          ([dayKey, dayData]) => {
            if (
              dayData &&
              selectedDays[
                Object.keys(stateDayKeyToApiDayKey).find(
                  (k) =>
                    stateDayKeyToApiDayKey[k as keyof SelectedDays] === dayKey,
                ) as keyof SelectedDays
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

              dailyRestrictions![dayKey] = {
                startTime,
                endTime,
              };
            }
          },
        );
      }

      const campaignData = {
        name: data.name,
      };

      const response = await createCampaignMutation({
        variables: {
          teamId,
          campaign: campaignData,
        },
      });

      if (response.data) {
        const createdCampaign = response.data.team.createCampaign;

        // Update the campaign with messaging day times if any are set (or null to use team settings)
        let finalCampaign = createdCampaign;
        const shouldUpdate = !useTeamSettings || selectedLinkedInId;
        if (shouldUpdate) {
          const updateResponse = await updateCampaignMutation({
            variables: {
              teamId,
              campaignId: createdCampaign.id,
              changes: {
                allowedMessagingDayTimes: dailyRestrictions,
                active: true,
                linkedinIds: selectedLinkedInId ? [selectedLinkedInId] : [],
              },
            },
          });
          // Use the updated campaign from the mutation response
          finalCampaign =
            updateResponse.data?.team?.campaign?.modify || createdCampaign;
        }

        // Add the new campaign to the store
        useCampaignStore.setState({
          campaigns: [...(campaigns || []), finalCampaign],
        });

        // Show success message
        toast({
          title: "Success",
          description: "Campaign created successfully!",
        });

        // Reset form
        setFormData({
          name: "",
          description: "",
          email: "",
          replyInThread: false,
        });
        setSelectedLinkedInId("");
        setTimeWindow([9, 17]);
        setSelectedDays({
          sun: false,
          mon: true,
          tue: true,
          wed: true,
          thu: true,
          fri: true,
          sat: false,
        });
        // Reset to default 9-5 weekdays
        setAllowedMessagingDayTimes({
          monday: { startTime: "09:00:00", endTime: "17:00:00" },
          tuesday: { startTime: "09:00:00", endTime: "17:00:00" },
          wednesday: { startTime: "09:00:00", endTime: "17:00:00" },
          thursday: { startTime: "09:00:00", endTime: "17:00:00" },
          friday: { startTime: "09:00:00", endTime: "17:00:00" },
        });
        setUseTeamSettings(true);

        // Close modal
        setModalIsOpen(false);
        setSelectedCampaign(finalCampaign);
        // Refresh the page to update the UI
        router.push("/campaigns/" + finalCampaign.id);
      } else {
        console.error("Failed to create campaign:", response.errors);
        toast({
          title: "Error",
          description: "Failed to create campaign. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to create campaign:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleFormChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCreateCampaign({
      name: formData.name,
      description: formData.description,
      email: formData.email,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      shouldCloseOnOverlayClick={false}
      className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background border rounded-lg shadow-lg w-full max-w-lg max-h-[85vh] outline-none flex flex-col"
      overlayClassName="fixed inset-0 bg-black/50 backdrop-blur-sm"
    >
      <Card className="border-none shadow-none flex flex-col h-full overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4 relative flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2 h-8 w-8 p-0 hover:bg-muted"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
          <CardTitle className="text-lg pr-8">New Campaign</CardTitle>
          <CardDescription className="text-xs">
            Configure your campaign settings
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-2 flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <div className="grid w-full items-center gap-4">
              {/* Basic Information */}
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Basic Information
                </h3>
                <div className="space-y-3">
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="name" className="text-xs">
                      Campaign Name
                    </Label>
                    <Input
                      id="name"
                      ref={campaignNameInputRef}
                      required
                      placeholder="Enter campaign name"
                      value={formData.name}
                      onChange={(e) => handleFormChange("name", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="description" className="text-xs">
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      placeholder="Campaign description"
                      value={formData.description}
                      onChange={(e) =>
                        handleFormChange("description", e.target.value)
                      }
                      className="min-h-[60px] text-xs py-1.5"
                    />
                  </div>
                </div>
              </div>

              {/* Email Settings */}
              <div className="space-y-3">
                {/* 
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="email" className="text-xs">
                    Email Sender(s)
                  </Label>
                  <Select
                    onValueChange={(value) => handleFormChange("email", value)}
                  >
                    <SelectTrigger id="email" className="h-8 text-xs">
                      <SelectValue placeholder="Select email" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="jason">Jason@Janium.io</SelectItem>
                      <SelectItem value="tyler">Tyler@Janium.io</SelectItem>
                      <SelectItem value="taylor">Taylor@Janium.io</SelectItem>
                      <SelectItem value="ryan">Ryan@Janium.io</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                */}

                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="linkedinAccount" className="text-xs">
                    LinkedIn Account
                  </Label>
                  <Select
                    value={selectedLinkedInId}
                    onValueChange={(value) => setSelectedLinkedInId(value)}
                  >
                    <SelectTrigger id="linkedinAccount" className="h-8 text-xs">
                      <SelectValue placeholder="Select LinkedIn account" />
                    </SelectTrigger>
                    <SelectContent position="popper">
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
                          <SelectItem
                            key={integration.id}
                            value={integration.id}
                          >
                            {integration.fullName}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Schedule Settings */}
              <div className="space-y-3">
                <Label className="text-xs">Campaign Schedule</Label>
                <div className="flex items-center gap-2 py-2">
                  <Checkbox
                    id="useTeamSettings"
                    checked={useTeamSettings}
                    onCheckedChange={(checked) => {
                      setUseTeamSettings(checked === true);
                      if (checked && teamWeeklyRestrictions) {
                        // Apply team settings to the display
                        const newSelectedDays = {
                          sun: false,
                          mon: false,
                          tue: false,
                          wed: false,
                          thu: false,
                          fri: false,
                          sat: false,
                        };
                        const newAllowedTimes: Record<
                          string,
                          { startTime: string; endTime: string }
                        > = {};
                        let firstTimeWindow: [number, number] = [9, 17];
                        let firstDayProcessed = false;

                        Object.entries(teamWeeklyRestrictions).forEach(
                          ([dayKey, dayData]) => {
                            if (
                              dayData &&
                              dayData.startTime &&
                              dayData.endTime
                            ) {
                              const reverseMapping: Record<
                                string,
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
                              const shortDay = reverseMapping[dayKey];
                              if (shortDay) {
                                newSelectedDays[shortDay] = true;
                                newAllowedTimes[dayKey] = {
                                  startTime: dayData.startTime,
                                  endTime: dayData.endTime,
                                };
                                // Get the first day's time window for display
                                if (!firstDayProcessed) {
                                  const startHour = parseInt(
                                    dayData.startTime.split(":")[0],
                                    10,
                                  );
                                  let endHour = parseInt(
                                    dayData.endTime.split(":")[0],
                                    10,
                                  );
                                  if (endHour === 0) endHour = 24; // Convert 00:00 to 24 for display
                                  firstTimeWindow = [startHour, endHour];
                                  firstDayProcessed = true;
                                }
                              }
                            }
                          },
                        );

                        setTimeWindow(firstTimeWindow);
                        setSelectedDays(newSelectedDays);
                        setAllowedMessagingDayTimes(newAllowedTimes);
                      } else if (!checked) {
                        // When unchecking, reset to Mon-Fri 9-5 defaults
                        setTimeWindow([9, 17]);
                        setSelectedDays({
                          sun: false,
                          mon: true,
                          tue: true,
                          wed: true,
                          thu: true,
                          fri: true,
                          sat: false,
                        });
                        setAllowedMessagingDayTimes({
                          monday: {
                            startTime: "09:00:00",
                            endTime: "17:00:00",
                          },
                          tuesday: {
                            startTime: "09:00:00",
                            endTime: "17:00:00",
                          },
                          wednesday: {
                            startTime: "09:00:00",
                            endTime: "17:00:00",
                          },
                          thursday: {
                            startTime: "09:00:00",
                            endTime: "17:00:00",
                          },
                          friday: {
                            startTime: "09:00:00",
                            endTime: "17:00:00",
                          },
                        });
                      }
                    }}
                  />
                  <Label
                    htmlFor="useTeamSettings"
                    className="text-xs cursor-pointer"
                  >
                    Use Team Settings
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Timezone : {currentTeamData?.timeZone}
                </p>
                <div
                  className={`scale-90 origin-top-left -mb-4 ${useTeamSettings ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <CampaignSchedulePicker
                    timeWindow={timeWindow}
                    selectedDays={selectedDays}
                    weeklyRestrictions={allowedMessagingDayTimes}
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
                        setAllowedMessagingDayTimes((prev) => ({
                          ...prev,
                          [apiDayKey]: {
                            startTime: `${value[0].toString().padStart(2, "0")}:00:00`,
                            endTime: `${value[1].toString().padStart(2, "0")}:00:00`,
                          },
                        }));
                      }
                      setTimeWindow(value);
                    }}
                    onDaySelectionChange={(days: SelectedDays) => {
                      setSelectedDays(days);
                    }}
                    onWeeklyRestrictionsChange={(restrictions) => {
                      // Update the allowedMessagingDayTimes from the restrictions format
                      const newAllowedTimes: Record<
                        string,
                        { startTime: string; endTime: string }
                      > = {};

                      // Update selectedDays based on which restrictions exist
                      const newSelectedDays = { ...selectedDays };

                      // Create reverse mapping for day conversion
                      const reverseMapping: Record<string, keyof SelectedDays> =
                        {
                          sunday: "sun",
                          monday: "mon",
                          tuesday: "tue",
                          wednesday: "wed",
                          thursday: "thu",
                          friday: "fri",
                          saturday: "sat",
                        };

                      // Reset all days to false first, then set only the ones in restrictions to true
                      Object.keys(newSelectedDays).forEach((day) => {
                        newSelectedDays[day as keyof SelectedDays] = false;
                      });

                      // Process restrictions and set selected days
                      Object.entries(restrictions).forEach(
                        ([dayKey, restriction]) => {
                          if (restriction) {
                            // Ensure proper time format (HH:MM:SS) without extra characters
                            let startTime = restriction.startTime;
                            let endTime = restriction.endTime;

                            // If the time doesn't already have the correct format, convert it
                            if (!startTime.match(/^\d{2}:\d{2}:\d{2}$/)) {
                              // Extract hour and create proper format
                              const startHour = parseInt(
                                startTime.split(":")[0],
                                10,
                              );
                              startTime = `${String(startHour).padStart(2, "0")}:00:00`;
                            }

                            if (!endTime.match(/^\d{2}:\d{2}:\d{2}$/)) {
                              // Extract hour and create proper format
                              const endHour = parseInt(
                                endTime.split(":")[0],
                                10,
                              );
                              endTime = `${String(endHour).padStart(2, "0")}:00:00`;
                            }

                            newAllowedTimes[dayKey] = {
                              startTime,
                              endTime,
                            };

                            // Mark this day as selected
                            const stateDayKey = reverseMapping[dayKey];
                            if (stateDayKey) {
                              newSelectedDays[stateDayKey] = true;
                            }
                          }
                        },
                      );

                      setSelectedDays(newSelectedDays);
                      setAllowedMessagingDayTimes(newAllowedTimes);
                    }}
                  />
                </div>
              </div>
            </div>
          </form>
        </CardContent>
        <Separator className="flex-shrink-0" />
        <CardFooter className="flex justify-end space-x-2 py-2 px-4 bg-muted/10 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isCreating}
            className="h-8 text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={(e) => handleSubmit(e)}
            disabled={isCreating}
            size="sm"
            className="h-8 text-xs"
          >
            {isCreating ? "Creating..." : "Create Campaign"}
          </Button>
        </CardFooter>
      </Card>
    </Modal>
  );
}
