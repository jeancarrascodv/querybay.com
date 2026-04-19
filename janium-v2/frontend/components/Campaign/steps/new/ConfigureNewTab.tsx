import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef, useMemo } from "react";
import { useCampaignStepStore } from "@/store/useCampaignStepStore";
import { useCampaignStore } from "@/store/useCampaignStore";
import { MutateCampaignStep, BulkUpdateStepsInput } from "@/types/campaignStep";
import { SchedulePicker } from "../../SchedulePicker";
import { StepUIData } from "@/types/campaignStepUI";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DISPLAY_STEP_TYPES,
  DisplayStepType,
  INTERNAL_TO_DISPLAY_MAPPING,
  INTERNAL_STEP_TYPES,
  InternalStepType,
} from "../../constants";
import { Switch } from "@/components/ui/switch";
import { useStepStore } from "@/store/useStepStore";
import { useToast } from "@/components/ui/use-toast";
import { useParams } from "next/navigation";
import { useTeam } from "@/hooks/useTeam";
import { useTeamData } from "@/hooks/useTeamData";
import { v4 as uuidv4 } from "uuid";

interface ConfigureNewTabProps {
  isReadOnly?: boolean;
  onSave: (data: StepUIData, continueEdit: boolean) => void;
  onSaveComplete?: () => void; // Callback when save completes
  onUnsavedChangesChange?: (hasUnsaved: boolean) => void; // Callback when unsaved changes state changes
  onRegisterScheduleMethods?: (methods: {
    cancelSave: () => void;
    forceSave: () => Promise<void>;
    hasUnsavedChanges: () => boolean;
  }) => void;
  dummyNode?: any;
  selectedNode: string | null;
  selectedNodeData?: any; // Optional, used for editing existing nodes
  mode: "add" | "edit";
  nodes?: any[];
  setNodes?: (nodes: any[]) => void;
}
const getStepType = (stepType: string): DisplayStepType | "" => {
  return INTERNAL_TO_DISPLAY_MAPPING[stepType as InternalStepType] || "";
};
// Helper function to check if weeklyRestrictions are effectively empty
const isWeeklyRestrictionsEmpty = (restrictions: any): boolean => {
  if (!restrictions) return true;

  // Check if all days are null or have 00:00:00 times
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  return days.every((day) => {
    const dayRestriction = restrictions[day];
    if (!dayRestriction || dayRestriction === null) return true;

    // Check if times are all zeros (00:00:00)
    if (
      dayRestriction.startTime === "00:00:00" &&
      dayRestriction.endTime === "00:00:00"
    ) {
      return true;
    }

    return false;
  });
};

const ConfigureNewTab = ({
  isReadOnly,
  dummyNode,
  selectedNode,
  selectedNodeData,
  mode,
  nodes,
  setNodes,
  onSaveComplete,
  onUnsavedChangesChange,
  onRegisterScheduleMethods,
}: ConfigureNewTabProps) => {
  const { stepData, bulkUpdateSteps, steps } = useCampaignStepStore();
  const { nodeDelays, updateNodeDelay, selectedCampaign } = useCampaignStore();
  const { toast } = useToast();
  const { campaignId } = useParams();
  const { currentTeamId } = useTeam();

  const isFirstStep = useMemo(() => {
    return steps.length === 0;
  }, [steps]);

  // Fetch team data to get team's allowedMessagingDayTimes for fallback
  const { allTeams } = useTeamData({ includeAllTeams: true });

  // Get the current team's allowedMessagingDayTimes
  const teamWeeklyRestrictions = useMemo(() => {
    const currentTeam = allTeams.find((team) => team.id === currentTeamId);
    return currentTeam?.allowedMessagingDayTimes || null;
  }, [allTeams, currentTeamId]);

  // Use our unified step store
  const {
    stepType,
    timeWindow,
    delay,
    daysToWait,
    selectedDays,
    dayTimeWindows,
    weeklyRestrictions,
    setStepType,
    setTimeWindow,
    setSelectedDays,
    setDayTimeWindows,
    setWeeklyRestrictions,
    status,
    setStatus,
    initFromStepData,
    initFromSelectedNodeData,
  } = useStepStore();
  // State to track whether campaign settings are being used
  const [useCampaignSettings, setUseCampaignSettings] = useState(true);

  const isStepTypeDisabled = useMemo(() => {
    // Only disable if it's the first node AND not editing
    return selectedNode === "1" && !stepType && mode !== "add";
  }, [selectedNode, stepType, mode]);

  // Reset store when adding a new node to ensure clean slate
  // This should run BEFORE any initialization from selectedNodeData
  useEffect(() => {
    if (mode === "add") {
      console.log("Resetting store for new node in add mode");
      // reset(selectedCampaign?.allowedMessagingDayTimes);
      setUseCampaignSettings(true);
    }
  }, [mode]);

  // Initialize from selectedNodeData when available (for editing)
  useEffect(() => {
    if (selectedNodeData && mode === "edit") {
      initFromSelectedNodeData(selectedNodeData);
    }
  }, [selectedNodeData, mode, initFromSelectedNodeData, selectedNode]); // Add selectedNode as dependency

  // Initialize from stepData when component mounts (for add mode)
  useEffect(() => {
    // Only initialize from stepData if the store is empty and we have stepData
    if (stepData && mode === "add" && !stepType) {
      initFromStepData(stepData);
    }
  }, [stepData, initFromStepData, mode, stepType]);

  // Update node delay in campaign store when delay/daysToWait changes
  useEffect(() => {
    if (selectedNode) {
      updateNodeDelay(selectedNode, {
        delay,
        daysToWait,
      });
    }
  }, [delay, daysToWait, selectedNode, updateNodeDelay]);
  // Get available step types based on parent node
  const getAvailableStepTypes = (): DisplayStepType[] => {
    // If it's the first step, only allow Email and LinkedIn Connection Request
    if (isFirstStep) {
      return [
        DISPLAY_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST,
        // DISPLAY_STEP_TYPES.EMAIL, // Commented out for now
      ] as DisplayStepType[];
    } else {
      // If editing an existing node, allow its current type
      if (stepData.stepType) {
        const nonEmailStepTypes = Object.values(DISPLAY_STEP_TYPES).filter(
          (type) => type !== DISPLAY_STEP_TYPES.EMAIL,
        );
        return nonEmailStepTypes;
      }

      // For subsequent steps, check if LinkedIn Connection Request exists in the campaign
      const hasConnectionRequest =
        steps?.some(
          (step: any) =>
            step.stepData?.__typename === "SendLinkedInConnectionRequest" ||
            step.stepData?.sendLinkedInConnectionRequest,
        ) ||
        stepData.stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST;

      // Filter available step types based on whether connection request exists
      return (Object.values(DISPLAY_STEP_TYPES) as DisplayStepType[]).filter(
        (type) => {
          // LinkedIn Connection Request is only allowed as first step
          if (type === DISPLAY_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST) {
            return false;
          }

          // LinkedIn Message is only allowed after LinkedIn Connection Request exists
          if (type === DISPLAY_STEP_TYPES.LINKEDIN_MESSAGE) {
            return hasConnectionRequest;
          }

          // Email is always allowed
          return true;
        },
      );
    }
  };

  // Function to handle immediate status update for existing steps
  const handleStatusUpdate = async (newStatus: string) => {
    // Only trigger immediate update for existing steps in edit mode
    if (
      mode === "edit" &&
      selectedNodeData?.id &&
      currentTeamId &&
      campaignId
    ) {
      try {
        const campaignIdStr =
          typeof campaignId === "string" ? campaignId : campaignId[0];

        // Create a step mutation to update the enabled status
        const stepMutation: MutateCampaignStep = {
          id: selectedNodeData.id,
          enabled: newStatus === "Active",
        };

        // Create bulk update input
        const bulkUpdateInput: BulkUpdateStepsInput = {
          stepCreations: [],
          stepMutations: [stepMutation],
          linkCreations: [],
          linkMutations: [],
        };

        // Execute the bulk update
        await bulkUpdateSteps(campaignIdStr, bulkUpdateInput);

        // Notify parent that save completed
        onSaveComplete?.();

        toast({
          title: "Step status updated",
          description: `Step has been ${newStatus === "Active" ? "enabled" : "disabled"}`,
          duration: 2000,
        });
      } catch (error) {
        console.error("Error updating step status:", error);
        toast({
          title: "Error updating step status",
          description:
            "There was a problem updating the step status. Please try again.",
          variant: "destructive",
          duration: 3000,
        });
        // Revert the status change in the UI
        setStatus(newStatus === "Active" ? "Inactive" : "Active");
      }
    }
  };
  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="stepStatus">Step Status</Label>
        <div className="flex items-center gap-4 py-3 relative">
          <Switch
            id="stepStatus"
            checked={status === "Active"}
            onCheckedChange={async (checked) => {
              const newStatus = checked ? "Active" : "Inactive";
              setStatus(newStatus);

              // Trigger immediate update for existing steps
              await handleStatusUpdate(newStatus);
            }}
            disabled={isReadOnly}
            className="scale-80 text-sm"
          />
          <Label htmlFor="stepStatus" className="cursor-pointe ">
            {status || "Step Active"}
          </Label>
        </div>

        <Label htmlFor="stepType mb-1">Step Type</Label>
        <Select
          value={
            dummyNode
              ? dummyNode.data.stepType
              : stepType
                ? getStepType(stepType)
                : getStepType(selectedNodeData?.stepData?.__typename) ||
                  getStepType(stepType) ||
                  (stepData.stepType ? getStepType(stepData.stepType) : "")
          }
          onValueChange={async (value) => {
            console.log("Selected step type:", value);

            // Update step type in the unified store (this will trigger content preservation)
            setStepType(value);

            // Update dummy node if present
            if (dummyNode && nodes && setNodes) {
              const updatedNodes = nodes.map((node) => {
                if (node.id === "dummy-node") {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      stepType: value,
                      label: value,
                    },
                  };
                }
                return node;
              });
              setNodes(updatedNodes);
              dummyNode.data.stepType = value;
            }

            // Auto-save for existing steps if in edit mode
            if (
              mode === "edit" &&
              selectedNodeData?.id &&
              currentTeamId &&
              campaignId
            ) {
              try {
                const campaignIdStr =
                  typeof campaignId === "string" ? campaignId : campaignId[0];

                // Get the internal step type mapping using constants
                let internalStepType = value;
                if (value === DISPLAY_STEP_TYPES.EMAIL) {
                  internalStepType = INTERNAL_STEP_TYPES.EMAIL;
                } else if (value === DISPLAY_STEP_TYPES.LINKEDIN_MESSAGE) {
                  internalStepType = INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE;
                } else if (
                  value === DISPLAY_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST
                ) {
                  internalStepType =
                    INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST;
                }

                // Create step data based on the step type (following FlowBoard pattern)
                let newStepData: any = {};

                if (internalStepType === INTERNAL_STEP_TYPES.EMAIL) {
                  newStepData.sendEmail = {
                    subject: selectedNodeData?.stepData?.subject || "",
                    body: selectedNodeData?.stepData?.body || "",
                    from: selectedNodeData?.stepData?.from || uuidv4(),
                    replyToPrevious:
                      selectedNodeData?.stepData?.replyToPrevious || false,
                  };
                } else if (
                  internalStepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE
                ) {
                  newStepData.sendLinkedInMessage = {
                    linkedinMessage:
                      selectedNodeData?.stepData?.linkedinMessage || "",
                  };
                } else if (
                  internalStepType ===
                  INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST
                ) {
                  newStepData.sendLinkedInConnectionRequest = {
                    connectionRequestMessage:
                      selectedNodeData?.stepData?.connectionRequestMessage ||
                      "",
                  };
                }

                // Create a step mutation with stepData (not stepType directly)
                const stepMutation = {
                  id: selectedNodeData.id,
                  stepData: newStepData,
                  enabled:
                    selectedNodeData.enabled !== undefined
                      ? selectedNodeData.enabled
                      : true,
                };

                // Create bulk update input
                const bulkUpdateInput = {
                  stepCreations: [],
                  stepMutations: [stepMutation],
                  linkCreations: [],
                  linkMutations: [],
                };

                // Execute the bulk update
                await bulkUpdateSteps(campaignIdStr, bulkUpdateInput);
                // Update the node's step type in the nodes array
                if (nodes && setNodes) {
                  const updatedNodes = nodes.map((node) => {
                    if (node.id === selectedNode) {
                      return {
                        ...node,
                        data: {
                          ...node.data,
                          stepType: internalStepType,
                          label: value,
                        },
                      };
                    }
                    return node;
                  });
                  setNodes(updatedNodes);
                }

                toast({
                  title: "Step type updated",
                  description: `Step type has been changed to ${value}`,
                  duration: 2000,
                });
              } catch (error) {
                console.error("Error updating step type:", error);
                toast({
                  title: "Error updating step type",
                  description:
                    "There was a problem updating the step type. Please try again.",
                  variant: "destructive",
                  duration: 3000,
                });
              }
            }
          }}
          disabled={mode != "add" && (isStepTypeDisabled || isReadOnly)}
        >
          <SelectTrigger id="stepType">
            <SelectValue placeholder="Choose step type" />
          </SelectTrigger>
          <SelectContent>
            {getAvailableStepTypes().map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Commented out - LinkedIn Connection Request not available for now */}
        {/* {isStepTypeDisabled && (
          <p className="text-sm text-muted-foreground mt-2">
            First step must be a LinkedIn Connection Request
          </p>
        )} */}
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Active Days & Hours</Label>
        </div>

        <SchedulePicker
          timeWindow={timeWindow}
          selectedDays={selectedDays}
          weeklyRestrictions={
            // Use campaign settings if step's weeklyRestrictions are empty (all null or all zeros)
            isWeeklyRestrictionsEmpty(selectedNodeData?.weeklyRestrictions)
              ? selectedCampaign?.allowedMessagingDayTimes
              : selectedNodeData?.weeklyRestrictions || weeklyRestrictions
          }
          campaignSettings={selectedCampaign?.allowedMessagingDayTimes}
          teamSettings={teamWeeklyRestrictions || undefined}
          isUsingParentSettings={isWeeklyRestrictionsEmpty(
            selectedNodeData?.weeklyRestrictions,
          )}
          onTimeWindowChange={(value, day) => {
            if (isReadOnly) return;
            ``;
            console.log("Time window changed:", value, "for day:", day);
            // Update in unified store
            setTimeWindow(value);

            // Also update all day time windows
            const updatedDayTimeWindows = { ...dayTimeWindows };
            Object.keys(updatedDayTimeWindows).forEach((dayKey) => {
              updatedDayTimeWindows[dayKey as keyof typeof dayTimeWindows] =
                value;
            });
            setDayTimeWindows(updatedDayTimeWindows);
          }}
          onDaySelectionChange={(days) => {
            if (isReadOnly) return;

            // Convert DaySelection to the format expected by the store
            const selectedDaysRecord = {
              mon: days.mon,
              tue: days.tue,
              wed: days.wed,
              thu: days.thu,
              fri: days.fri,
              sat: days.sat,
              sun: days.sun,
            };
            setSelectedDays(selectedDaysRecord);
          }}
          onWeeklyRestrictionsChange={(restrictions) => {
            if (isReadOnly) return;
            // When restrictions is null, it means "use campaign settings"
            setWeeklyRestrictions(restrictions as any);
          }}
          onUseCampaignSettingsChange={(useCampaignSettingsValue) => {
            console.log("Use campaign settings:", useCampaignSettingsValue);
            setUseCampaignSettings(useCampaignSettingsValue);
          }}
          isReadOnly={isReadOnly}
          stepId={selectedNodeData?.id}
          teamId={currentTeamId || undefined}
          campaignId={
            typeof campaignId === "string" ? campaignId : campaignId?.[0]
          }
          mode={mode}
          onSaveComplete={onSaveComplete}
          onUnsavedChangesChange={onUnsavedChangesChange}
          onRegisterMethods={onRegisterScheduleMethods}
        />
      </div>
    </div>
  );
};

export default ConfigureNewTab;
