import React, { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCampaignStepStore } from "@/store/useCampaignStepStore";
import { useCampaignStore } from "@/store/useCampaignStore";
import { Label } from "@/components/ui/label";
import { getStepTypeName, getLayoutedElements } from "./FlowBoardUtils";
import { Input } from "../ui/input";
import { useToast } from "@/components/ui/use-toast";
import { campaignStepServices } from "@/services/campaignStep.services";
import {
  BulkUpdateStepsInput,
  MutateCampaignStepLink,
  CreateCampaignStep,
  CreateCampaignStepLink,
} from "@/types/campaignStep";
import { cleanTypename, formatStepLabel } from "@/lib/utils";
import { createDefaultStepInput } from "@/utils/campaignStep.utils";

interface LinkSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  isReadOnly?: boolean;
  edges: any[];
  nodes: any[];
  teamId?: string;
  campaignId?: string;
  setNodes?: (nodes: any[]) => void;
  setEdges?: (edges: any[]) => void;
}

// Helper function to create filter objects based on condition
const createFilterFromCondition = (condition: string): any => {
  switch (condition) {
    case "always_proceed":
      return {
        const: { pass: true },
      };
    case "never_proceed":
      return {
        const: { pass: false },
      };
    case "filter_and":
      return {
        and: {
          and: [{ const: { pass: true } }, { const: { pass: true } }],
        },
      };
    case "filter_or":
      return {
        or: {
          or: [{ const: { pass: true } }, { const: { pass: false } }],
        },
      };
    case "filter_not":
      return {
        not: { const: { pass: false } },
      };
    default:
      return {
        const: { pass: true },
      };
  }
};

// Helper function to extract condition from filter object
const getConditionFromFilter = (filter: any): string => {
  if (!filter) return "";

  // Check for const filters first (most common)
  if (filter.__typename === "ConstFilter" || filter.const !== undefined) {
    const constValue = filter.const !== undefined ? filter.const : filter;

    if (constValue.pass === false) {
      return "never_proceed";
    }
    if (constValue.pass === true) {
      return "always_proceed";
    }
  }

  // Check for AND filter - handle nested structure
  if (filter.__typename === "AndFilter" || filter.and !== undefined) {
    return "filter_and";
  }

  // Check for OR filter - handle nested structure
  if (filter.__typename === "OrFilter" || filter.or !== undefined) {
    return "filter_or";
  }

  // Check for NOT filter
  if (filter.__typename === "NotFilter" || filter.not !== undefined) {
    return "filter_not";
  }

  // For unrecognized filters, return empty
  return "";
};

const getFilterFromTypename = (typename: string, filter: any) => {
  // Create a copy of the filter object without __typename
  const { __typename, ...filterData } = filter || {};
  if (!filter) return {};

  switch (typename) {
    case "ConstFilter":
      return { const: filterData };
    case "OpenedPreviousEmail":
      return { openedPreviousEmail: filterData };
    case "NotFilter":
      return { not: filterData };
    default:
      return { const: filterData };
  }
};

// Helper function to normalize SpanInput - ensures only one field is set
const normalizeSpan = (span: any) => {
  if (!span) return { days: 0 };

  // Return only the field that has a truthy value
  if (span.businessDays != null && span.businessDays !== 0) {
    return { businessDays: span.businessDays };
  }
  if (span.seconds != null && span.seconds !== 0) {
    return { seconds: span.seconds };
  }
  if (span.days != null) {
    return { days: span.days };
  }

  // Default fallback
  return { days: 0 };
};

const LinkSidePanel = ({
  isOpen,
  onClose,
  isReadOnly = false,
  edges,
  nodes,
  teamId,
  campaignId,
  setNodes,
  setEdges,
}: LinkSidePanelProps) => {
  const { toast } = useToast();
  const { steps, links, updateNodeById, bulkUpdateSteps } =
    useCampaignStepStore();
  const { selectedEdge, nodeDelays, updateNodeDelay } = useCampaignStore();

  // Local state for storing conditions
  const [linkConditions, setLinkConditions] = useState<Record<string, string>>(
    {},
  );

  // Local state for tracking link delay and randomWindow changes
  const [linkDelays, setLinkDelays] = useState<
    Record<string, { delay: number; randomWindow: number }>
  >({});

  // State for tracking unsaved changes and saving status
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);

  // Ref for debouncing saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Find the selected edge - MUST BE DEFINED BEFORE useEffects that use it
  const currentEdge = React.useMemo(() => {
    if (!selectedEdge || !links) return null;
    return links.find((link: any) => link.id === selectedEdge);
  }, [selectedEdge, links]);

  // Get the source (from) and target (to) node based on the selected edge
  const sourceNode = React.useMemo(() => {
    if (!currentEdge || !steps) return null;
    return steps.find((step: any) => step.id === currentEdge.prev);
  }, [currentEdge, steps]);

  const targetNode = React.useMemo(() => {
    if (!currentEdge || !steps) return null;
    return steps.find((step: any) => step.id === currentEdge.next);
  }, [currentEdge, steps]);

  // Initialize conditions from existing link data
  useEffect(() => {
    const initialConditions: Record<string, string> = {};
    const initialDelays: Record<
      string,
      { delay: number; randomWindow: number }
    > = {};

    links.forEach((link: any) => {
      if (link.filter) {
        const condition = getConditionFromFilter(link.filter);
        initialConditions[link.id] = condition;
      }

      // Initialize delay data from existing links
      initialDelays[link.id] = {
        delay: link.delay?.days || 0,
        randomWindow: link.randomDelay?.days || 0,
      };
    });

    setLinkConditions(initialConditions);
    setLinkDelays(initialDelays);
  }, [links]);

  // Re-initialize when the selected edge changes to ensure we have the latest data
  useEffect(() => {
    if (currentEdge && links) {
      const link = links.find((l: any) => l.id === currentEdge.id);
      if (link) {
        // Update condition for this specific link
        if (link.filter) {
          const condition = getConditionFromFilter(link.filter);
          setLinkConditions((prev) => ({
            ...prev,
            [link.id]: condition,
          }));
        }

        setLinkDelays((prev) => ({
          ...prev,
          [link.id]: {
            delay: link.delay?.days || 0,
            randomWindow: link.randomDelay?.days || 0,
          },
        }));
      }
    }
  }, [currentEdge, links]);

  // Bulk save function for link updates
  const saveLinkUpdates = useCallback(async () => {
    console.log("Saving link updates...", teamId, campaignId, isSaving);
    if (!teamId || !campaignId || isSaving) return;

    if (lastSavedAt && new Date().getTime() - lastSavedAt.getTime() < 1000) {
      return;
    }

    try {
      setIsSaving(true);

      const linkMutations: MutateCampaignStepLink[] = [];

      // Process all links that have changes
      links.forEach((link: any) => {
        const linkId = link.id;
        const currentCondition = linkConditions[linkId];
        const currentDelayData = linkDelays[linkId];
        const existingCondition = getConditionFromFilter(link.filter);

        // Check if any data has changed
        const hasConditionChange = currentCondition !== existingCondition;

        const hasDelayChange =
          currentDelayData &&
          (currentDelayData.delay !== (link.delay?.days || 0) ||
            currentDelayData.randomWindow !== (link.randomDelay?.days || 0));

        if (hasConditionChange || hasDelayChange) {
          const mutation: MutateCampaignStepLink = {
            id: linkId,
            prev: { uuid: link.prev },
            next: { uuid: link.next },
          };

          // Add delay data (always include to maintain values)
          if (hasDelayChange && currentDelayData) {
            mutation.delay = normalizeSpan({
              days: Math.floor(currentDelayData.delay),
            });
            mutation.randomDelay = normalizeSpan({
              days: Math.floor(currentDelayData.randomWindow),
            });
          } else {
            // Keep existing delay values
            mutation.delay = normalizeSpan(link.delay);
            mutation.randomDelay = normalizeSpan(link.randomDelay);
          }

          // Handle filter data
          if (hasConditionChange) {
            if (currentCondition && currentCondition !== "") {
              // User selected a new condition
              const filterObj = createFilterFromCondition(currentCondition);
              mutation.filter = filterObj;
            }
          } else if (link.filter) {
            // No filter change, keep existing filter
            const filter = getFilterFromTypename(
              link.filter.__typename,
              link.filter,
            );
            mutation.filter = filter;
          } else {
            // No existing filter, use default
            mutation.filter = { const: { pass: true } };
          }

          linkMutations.push(mutation);
        }
      });

      // Only save if there are changes
      if (linkMutations.length > 0) {
        const bulkUpdateInput: BulkUpdateStepsInput = {
          stepCreations: [],
          stepMutations: [],
          linkCreations: [],
          linkMutations: linkMutations,
        };

        const campaignIdStr =
          typeof campaignId === "string" ? campaignId : campaignId[0];

        await bulkUpdateSteps(campaignIdStr, cleanTypename(bulkUpdateInput));

        setLastSavedAt(new Date());
        setHasUnsavedChanges(false);

        toast({
          title: "Link settings saved",
          description: "Your link changes have been saved successfully",
          duration: 2000,
        });
      } else {
        // No changes detected, but clear unsaved changes flag
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error("Failed to save link updates:", error);
      toast({
        title: "Error saving link settings",
        description:
          "There was a problem saving your changes. Please try again.",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    teamId,
    campaignId,
    isSaving,
    lastSavedAt,
    links,
    linkConditions,
    linkDelays,
    bulkUpdateSteps,
    toast,
  ]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Helper function to check if there are actual changes to save
  const hasActualChanges = useCallback(() => {
    return links.some((link: any) => {
      const linkId = link.id;
      const currentCondition = linkConditions[linkId] || "";
      const existingCondition = getConditionFromFilter(link.filter);
      const currentDelayData = linkDelays[linkId];

      const hasConditionChange = currentCondition !== existingCondition;
      const hasDelayChange =
        currentDelayData &&
        (currentDelayData.delay !== (link.delay?.days || 0) ||
          currentDelayData.randomWindow !== (link.randomDelay?.days || 0));

      return hasConditionChange || hasDelayChange;
    });
  }, [links, linkConditions, linkDelays]);

  // Auto-save when switching nodes or when component unmounts
  useEffect(() => {
    return () => {
      // Save any pending changes when the component unmounts or selectedEdge changes
      if (
        hasUnsavedChanges &&
        !isSaving &&
        !isCreatingBranch &&
        hasActualChanges()
      ) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveLinkUpdates();
      }
    };
  }, [
    selectedEdge,
    hasUnsavedChanges,
    isSaving,
    isCreatingBranch,
    hasActualChanges,
    saveLinkUpdates,
  ]);

  // Monitor for changes and reset hasUnsavedChanges if no actual changes exist
  useEffect(() => {
    if (hasUnsavedChanges && !isSaving && !isCreatingBranch) {
      if (!hasActualChanges()) {
        // No actual changes detected, reset the flag
        setHasUnsavedChanges(false);
      }
    }
  }, [
    linkConditions,
    linkDelays,
    links,
    hasUnsavedChanges,
    isSaving,
    isCreatingBranch,
    hasActualChanges,
  ]);

  // Debounced auto-save trigger - only saves when there are actual changes
  useEffect(() => {
    // Only proceed if all conditions are met
    if (!hasUnsavedChanges || isSaving || isCreatingBranch) {
      return;
    }

    // Check if there are actual changes before saving
    if (!hasActualChanges()) {
      setHasUnsavedChanges(false);
      return;
    }

    // Debounce the save by 1 second
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveLinkUpdates();
    }, 1000); // Wait 1 second of inactivity before saving

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    hasUnsavedChanges,
    isSaving,
    isCreatingBranch,
    hasActualChanges,
    saveLinkUpdates,
  ]);

  // Helper function for saving and closing
  const handleComplete = async () => {
    // Save any pending changes before closing
    if (hasUnsavedChanges && hasActualChanges()) {
      await saveLinkUpdates();
    }
    onClose();
  };

  // Helper function to update link delay settings
  const updateLinkDelay = useCallback(
    (linkId: string, field: "delay" | "randomWindow", value: number) => {
      setLinkDelays((prev) => ({
        ...prev,
        [linkId]: {
          ...(prev[linkId] || { delay: 0, randomWindow: 0 }),
          [field]: value,
        },
      }));

      // Update edges in real time
      if (setEdges && edges) {
        const updatedEdges = edges.map((edge: any) => {
          if (edge.id === linkId) {
            return {
              ...edge,
              data: {
                ...edge.data,
                [field === "delay" ? "delay" : "randomWindow"]: value,
              },
            };
          }
          return edge;
        });
        setEdges(updatedEdges);
      }

      setHasUnsavedChanges(true);
    },
    [edges, setEdges],
  );

  // Helper function to update condition
  const updateStepCondition = useCallback(
    async (linkId: string | undefined, condition: string, linkData?: any) => {
      if (!linkId) {
        console.error("Link ID is required to update condition");
        return;
      }

      // Get the previous condition to check if filter was just added
      const previousCondition = linkConditions[linkId] || "";

      // Check if this is selecting an actual filter (AND, OR, NOT)
      const actualFilterTypes = ["filter_and", "filter_or", "filter_not"];
      const isSelectingActualFilter = actualFilterTypes.includes(condition);

      // Check if we should create a branch
      const shouldCreateBranch =
        isSelectingActualFilter && previousCondition !== condition;

      // If selecting a filter that requires branching, create a new branching step
      if (shouldCreateBranch && linkData && teamId && campaignId) {
        // Set flag IMMEDIATELY to prevent auto-save from interfering
        setIsCreatingBranch(true);

        // Also update the condition immediately so auto-save sees it as already saved
        setLinkConditions((prev) => ({
          ...prev,
          [linkId]: condition,
        }));

        try {
          // Create new step with default Send Email properties using campaign settings
          const newStepId = uuidv4();

          // Use the utility function to create a default step with campaign settings
          const defaultStep = createDefaultStepInput("email", 1);

          const newStep: CreateCampaignStep = {
            ...defaultStep,
            id: newStepId,
            stepData: {
              sendEmail: {
                subject: "Follow-up Email",
                body: "Hi,\n\nThis is a follow-up message.\n\nBest regards",
                from: [],
                replyToPrevious: false,
              },
            },
            enabled: true,
          };

          // Create new link connecting to the new step
          const newLinkId = uuidv4();
          const parentStepId = linkData.prev;

          const newLink: CreateCampaignStepLink = {
            prev: {
              uuid: parentStepId,
            },
            next: {
              uuid: newStepId,
            },
            delay: { days: 0 },
            randomDelay: { days: 0 },
            filter: {
              const: { pass: true },
            },
          };

          console.log("New link:", JSON.stringify(newLink, null, 2));

          // Also update the existing link's filter
          const existingLinkMutation: MutateCampaignStepLink = {
            id: linkId,
            prev: { uuid: linkData.prev },
            next: { uuid: linkData.next },
            delay: normalizeSpan(linkData.delay),
            randomDelay: normalizeSpan(linkData.randomDelay),
            filter: createFilterFromCondition(condition),
          };

          // Use bulk update to create both step, link, and update the existing link
          const bulkUpdate: BulkUpdateStepsInput = {
            stepCreations: [newStep],
            linkCreations: [newLink],
            linkMutations: [existingLinkMutation],
          };

          await campaignStepServices.bulkUpdateSteps(campaignId, bulkUpdate);

          // Add the new step to the canvas immediately
          if (setNodes && setEdges && nodes && edges) {
            // Create new node for the canvas
            const newNode = {
              id: newStepId,
              type: "leaf",
              data: {
                stepType: "SendEmail",
                label: "Send Email",
                subject: "",
                body: "",
                from: [],
                replyToPrevious: false,
                enabled: true,
                isLeaf: true,
              },
              position: { x: 0, y: 0 },
              width: 250,
              height: 120,
            };

            // Create new edge for the canvas
            const newEdge = {
              id: `e${parentStepId}-${newStepId}`,
              source: parentStepId,
              target: newStepId,
              type: "custom",
              data: {
                delay: 0,
                randomWindow: 0,
                enabled: true,
              },
            };

            // Update the existing link's edge data to include the filter
            const updatedEdges = edges.map((edge: any) => {
              if (
                edge.id === linkId ||
                (edge.source === linkData.prev && edge.target === linkData.next)
              ) {
                return {
                  ...edge,
                  data: {
                    ...edge.data,
                    filter: createFilterFromCondition(condition),
                    info:
                      condition === "filter_and"
                        ? "All conditions"
                        : condition === "filter_or"
                          ? "Any condition"
                          : "NOT condition",
                  },
                };
              }
              return edge;
            });

            // Update parent node to no longer be a leaf
            const updatedNodes = nodes.map((node: any) => {
              if (node.id === parentStepId) {
                return {
                  ...node,
                  type: "normal",
                  data: {
                    ...node.data,
                    isLeaf: false,
                  },
                };
              }
              return node;
            });

            // Add new node and apply layout
            const allNodes = [...updatedNodes, newNode];
            const allEdges = [...updatedEdges, newEdge];

            // Apply layout to position nodes correctly
            const { nodes: layoutedNodes } = getLayoutedElements(
              allNodes,
              allEdges,
            );

            setNodes(layoutedNodes);
            setEdges(allEdges);
          }

          toast({
            title: "Branching Step Created",
            description: `A new branching path with default email step has been created for the filtered link.`,
          });

          // Reset the creating branch flag
          setIsCreatingBranch(false);
        } catch (error) {
          console.error("❌ Error creating branching step:", error);
          console.error("Error details:", JSON.stringify(error, null, 2));

          // Reset the condition back to empty on error
          setLinkConditions((prev) => ({
            ...prev,
            [linkId]: "",
          }));

          toast({
            title: "Error",
            description: "Failed to create branching step. Please try again.",
            variant: "destructive",
          });

          // Reset flag on error
          setIsCreatingBranch(false);
        }
      } else {
        // Normal filter update (not creating branch)
        setLinkConditions((prev) => ({
          ...prev,
          [linkId]: condition,
        }));
        setHasUnsavedChanges(true);
      }
    },
    [
      linkConditions,
      teamId,
      campaignId,
      toast,
      nodes,
      edges,
      setNodes,
      setEdges,
    ],
  );

  // Get link delay settings with defaults
  const getLinkDelaySettings = useCallback(
    (linkId: string) => {
      return linkDelays[linkId] || { delay: 0, randomWindow: 0 };
    },
    [linkDelays],
  );
  if (!isOpen) return <></>;

  // If no edge is selected, show an empty state
  if (!currentEdge || !sourceNode || !targetNode) {
    return (
      <div className="fixed right-0 top-12 h-[calc(100vh-3rem)] w-[500px] border-l bg-background p-6 shadow-lg animate-in slide-in-from-right z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold">Link Settings</h3>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={handleComplete}>
              ✕
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-center h-[80%]">
          <p className="text-muted-foreground">No link selected</p>
        </div>
      </div>
    );
  }

  const linkDelaySettings = getLinkDelaySettings(currentEdge.id);

  return (
    <div className="fixed right-0 top-12 h-[calc(100vh-3rem)] w-[500px] border-l bg-background p-6 shadow-lg animate-in slide-in-from-right z-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold">Link Setting</h3>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleComplete}>
            ✕
          </Button>
        </div>
      </div>{" "}
      <div className="space-y-4">
        <Label className="text-base">
          Incoming Steps:{" "}
          <span className="text-slate-400">
            {getStepTypeName(
              sourceNode.stepData?.__typename?.replace("Data", "") as any,
            ) || "Unnamed Step"}
          </span>
        </Label>

        {/* Show the source node as the only incoming step */}
        <div className="rounded-md space-y-4">
          {/* Delay Settings */}
          <div className="w-full p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor={`incoming-delay-${sourceNode.id}`}
                  className="text-sm text-muted-foreground"
                >
                  Delay after previous step (days)
                </Label>
                <div className="relative">
                  <div className="absolute right-0 top-0 h-full flex">
                    <button
                      type="button"
                      className="flex items-center justify-center w-10 h-full text-white text-lg font-medium border-l border-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() =>
                        currentEdge.id &&
                        updateLinkDelay(
                          currentEdge.id,
                          "delay",
                          Math.max(0, linkDelaySettings.delay - 1),
                        )
                      }
                      disabled={isReadOnly}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="flex items-center justify-center w-10 h-full text-white text-lg font-medium border-l border-gray-600 rounded-r-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() =>
                        currentEdge.id &&
                        updateLinkDelay(
                          currentEdge.id,
                          "delay",
                          linkDelaySettings.delay + 1,
                        )
                      }
                      disabled={isReadOnly}
                    >
                      +
                    </button>
                  </div>
                  <Input
                    id={`incoming-delay-${sourceNode.id}`}
                    type="number"
                    min="0"
                    step="1"
                    value={linkDelaySettings.delay}
                    onChange={(e) =>
                      currentEdge.id &&
                      updateLinkDelay(
                        currentEdge.id,
                        "delay",
                        Number(e.target.value),
                      )
                    }
                    disabled={isReadOnly}
                    className="pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor={`incoming-daysToWait-${sourceNode.id}`}
                  className="text-sm text-muted-foreground"
                >
                  Randomization Window (±days)
                </Label>
                <div className="relative">
                  <div className="absolute right-0 top-0 h-full flex">
                    <button
                      type="button"
                      className="flex items-center justify-center w-10 h-full text-white text-lg font-medium border-l border-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() =>
                        currentEdge.id &&
                        updateLinkDelay(
                          currentEdge.id,
                          "randomWindow",
                          Math.max(0, linkDelaySettings.randomWindow - 1),
                        )
                      }
                      disabled={isReadOnly}
                    >
                      -
                    </button>
                    <button
                      type="button"
                      className="flex items-center justify-center w-10 h-full text-white text-lg font-medium border-l border-gray-600 rounded-r-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() =>
                        currentEdge.id &&
                        updateLinkDelay(
                          currentEdge.id,
                          "randomWindow",
                          linkDelaySettings.randomWindow + 1,
                        )
                      }
                      disabled={isReadOnly}
                    >
                      +
                    </button>
                  </div>
                  <Input
                    id={`incoming-daysToWait-${sourceNode.id}`}
                    type="number"
                    min="0"
                    step="1"
                    value={linkDelaySettings.randomWindow}
                    onChange={(e) =>
                      currentEdge.id &&
                      updateLinkDelay(
                        currentEdge.id,
                        "randomWindow",
                        Number(e.target.value),
                      )
                    }
                    disabled={isReadOnly}
                    className="pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            </div>
            {/* Condition */}
            <div className="mt-4 space-y-2">
              <Label
                htmlFor={`incoming-condition-${sourceNode.id}`}
                className="text-sm text-muted-foreground"
              >
                Link Filter
              </Label>
              <Select
                value={linkConditions[currentEdge.id] || ""}
                onValueChange={(value) =>
                  currentEdge.id &&
                  updateStepCondition(currentEdge.id, value, currentEdge)
                }
                disabled={isReadOnly}
              >
                <SelectTrigger id={`incoming-condition-${sourceNode.id}`}>
                  <SelectValue placeholder="No filter (default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No filter (default)</SelectItem>
                  <SelectItem value="always_proceed">Always Proceed</SelectItem>
                  <SelectItem value="never_proceed">
                    Never Proceed (Block)
                  </SelectItem>
                  <SelectItem value="filter_and">
                    AND Filter (All conditions must pass)
                  </SelectItem>
                  <SelectItem value="filter_or">
                    OR Filter (Any condition must pass)
                  </SelectItem>
                  <SelectItem value="filter_not">
                    NOT Filter (Inverse condition)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
      {/* Outgoing Step Links */}
      <Label className="text-base ">
        <span className="font-bold text-white">Outgoing Step: </span>
        <span className="text-slate-400">
          {getStepTypeName(
            targetNode.stepData?.__typename?.replace("Data", "") as any,
          ) || "Unnamed Step"}
        </span>
      </Label>
      {/* Show the target node as the only outgoing step */}
      {/* Footer Actions */}
      <div className="absolute bottom-6  right-6">
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleComplete}>
            Cancel
          </Button>
          <Button onClick={handleComplete}>Done</Button>
        </div>
      </div>
    </div>
  );
};

export default LinkSidePanel;
