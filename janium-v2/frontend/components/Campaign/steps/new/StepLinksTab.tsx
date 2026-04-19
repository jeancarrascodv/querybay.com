import React, { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { useCampaignStepStore } from "@/store/useCampaignStepStore";
import { useCampaignStore } from "@/store/useCampaignStore";
import { campaignStepServices } from "@/services/campaignStep.services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getStepTypeName, getLayoutedElements } from "../../FlowBoardUtils";
import { useToast } from "@/components/ui/use-toast";
import {
  BulkUpdateStepsInput,
  MutateCampaignStepLink,
  CreateCampaignStep,
  CreateCampaignStepLink,
} from "@/types/campaignStep";
import { cleanTypename, formatStepLabel } from "@/lib/utils";
import { createDefaultStepInput } from "@/utils/campaignStep.utils";

interface StepLinksTabProps {
  onNext?: (data: any) => void;
  onCancel?: () => void;
  onSaveComplete?: () => void; // Callback when save completes
  onUnsavedChangesChange?: (hasUnsaved: boolean) => void; // Callback when unsaved state changes
  onRegisterMethods?: (methods: {
    cancelSave: () => void;
    forceSave: () => Promise<void>;
    hasUnsavedChanges: () => boolean;
    discardChanges: () => void;
  }) => void; // Callback to register methods for parent control
  initialData?: any;
  selectedNode?: string | null;
  isReadOnly?: boolean;
  dummyEdge?: any;

  mode?: string;
  onComplete?: (data: any, continueEdit: boolean) => void;
  teamId?: string;
  campaignId?: string;
  nodes?: any[];
  edges?: any[];
  setDummyEdge?: (edges: any[]) => void;
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
    // The structure is { and: { and: [...] } }
    return "filter_and";
  }

  // Check for OR filter - handle nested structure
  if (filter.__typename === "OrFilter" || filter.or !== undefined) {
    // The structure is { or: { or: [...] } }
    return "filter_or";
  }

  // Check for NOT filter
  if (filter.__typename === "NotFilter" || filter.not !== undefined) {
    return "filter_not";
  }

  // For unrecognized filters, return empty
  return "";
};

// Helper function to check if a filter is non-trivial (not just a simple pass filter)
const hasNonTrivialFilter = (filter: any): boolean => {
  if (!filter) return false;

  // If it's a simple const filter with pass: true, it's trivial
  if (
    filter.const &&
    filter.const.pass === true &&
    Object.keys(filter.const).length === 1
  ) {
    return false;
  }

  // Any other filter type is non-trivial
  return true;
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

const StepLinksTab = ({
  onNext,
  onCancel,
  initialData,
  selectedNode: selectedNodeProp,
  isReadOnly = false,
  mode,
  onComplete,
  onSaveComplete,
  onUnsavedChangesChange,
  onRegisterMethods,
  teamId,
  campaignId,
  nodes,
  edges,
  dummyEdge,
  setDummyEdge,
  setNodes,
  setEdges,
}: StepLinksTabProps) => {
  const { toast } = useToast();
  const { selectedNode, nodeDelays, updateNodeDelay } = useCampaignStore();
  const { steps, links, bulkUpdateSteps } = useCampaignStepStore();

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
  const [isCreatingBranch, setIsCreatingBranch] = useState(false); // Flag to prevent auto-save during branch creation

  // Ref for debouncing saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ref to track if changes were discarded (prevents unmount save)
  const discardedRef = useRef(false);

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

  // Find incoming and outgoing nodes from the selected node
  const incomingLinks = React.useMemo(() => {
    if (!selectedNode || !links) return [];
    return links.filter((link: any) => link.next === selectedNode);
  }, [selectedNode, links]);

  const outgoingLinks = React.useMemo(() => {
    if (!selectedNode || !links) return [];
    return links.filter((link: any) => link.prev === selectedNode);
  }, [selectedNode, links]);

  const incomingSteps = React.useMemo(() => {
    return incomingLinks
      .map((link: any) => {
        const step = steps.find((step: any) => step.id === link.prev);
        return step
          ? {
              ...step,
              linkData: link, // include link data if needed
            }
          : null;
      })
      .filter(Boolean);
  }, [incomingLinks, steps]);

  const outgoingSteps = React.useMemo(() => {
    return outgoingLinks
      .map((link: any) => {
        const step = steps.find((step: any) => step.id === link.next);
        return step
          ? {
              ...step,
              linkData: link, // include link data if needed
            }
          : null;
      })
      .filter(Boolean);
  }, [outgoingLinks, steps]);

  // Bulk save function for link updates
  const saveLinkUpdates = useCallback(async () => {
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
            mutation.delay = { days: Math.floor(currentDelayData.delay) };
            mutation.randomDelay = {
              days: Math.floor(currentDelayData.randomWindow),
            };
          } else {
            // Keep existing delay values
            mutation.delay = { days: link.delay?.days || 0 };
            mutation.randomDelay = { days: link.randomDelay?.days || 0 };
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

        // Notify parent that save completed
        onSaveComplete?.();

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

  // Function to trigger save with debounce

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

  // Notify parent when unsaved changes state changes
  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  // Register methods for parent component to control save behavior
  useEffect(() => {
    onRegisterMethods?.({
      cancelSave: () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
      },
      forceSave: async () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        if (hasUnsavedChanges && hasActualChanges()) {
          await saveLinkUpdates();
        }
      },
      hasUnsavedChanges: () => hasUnsavedChanges && hasActualChanges(),
      discardChanges: () => {
        discardedRef.current = true;
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        setHasUnsavedChanges(false);
      },
    });
  }, [onRegisterMethods, hasUnsavedChanges, hasActualChanges, saveLinkUpdates]);

  // Auto-save when switching nodes or when component unmounts
  useEffect(() => {
    return () => {
      // Save any pending changes when the component unmounts or selectedNode changes
      // But not if we're in the middle of creating a branch or changes were discarded
      if (
        hasUnsavedChanges &&
        !isSaving &&
        !isCreatingBranch &&
        !discardedRef.current &&
        hasActualChanges()
      ) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveLinkUpdates();
      }
    };
  }, [
    selectedNode,
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

  // Helper function to update dummy edge delay settings
  const updateDummyEdgeDelay = useCallback(
    (field: "delay" | "randomWindow", value: number) => {
      // Update the edges state directly with new dummy edge data
      if (dummyEdge && dummyEdge.length > 0 && edges && setEdges) {
        const updatedEdges = edges.map((edge: any) => {
          if (
            edge.source === dummyEdge[0].source &&
            edge.target === "dummy-node"
          ) {
            return {
              ...edge,
              data: {
                ...edge.data,
                [field]: value,
              },
            };
          }
          return edge;
        });
        setEdges(updatedEdges);

        // Also update the dummyEdge state if setDummyEdge is provided
        if (setDummyEdge) {
          const updatedDummyEdge = dummyEdge.map((edge: any) => ({
            ...edge,
            data: {
              ...edge.data,
              [field]: value,
            },
          }));
          setDummyEdge(updatedDummyEdge);
        }
      }
    },
    [dummyEdge, edges, setEdges, setDummyEdge],
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
      // These are the filters that require branching logic
      const actualFilterTypes = ["filter_and", "filter_or", "filter_not"];
      const isSelectingActualFilter = actualFilterTypes.includes(condition);

      // Check if we should create a branch:
      // 1. User is selecting an actual filter (AND/OR/NOT)
      // 2. Previous condition was not already this same filter type
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
                subject: "",
                body: "",
                from: [],
                replyToPrevious: false,
              },
            },
            enabled: true,
          };

          // Create new link connecting to the new step
          // If it's an incoming link (linkData.next === selectedNode), branch from linkData.prev
          // If it's an outgoing link (linkData.prev === selectedNode), branch from selectedNode
          const newLinkId = uuidv4();
          const isIncoming = linkData.next === selectedNode;

          const parentStepId = isIncoming ? linkData.prev : selectedNode;

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

          // Also update the existing link's filter
          const existingLinkMutation: MutateCampaignStepLink = {
            id: linkId,
            prev: { uuid: linkData.prev },
            next: { uuid: linkData.next },
            delay: { days: linkData.delay?.days || 0 },
            randomDelay: { days: linkData.randomDelay?.days || 0 },
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
              type: "leaf", // New branch end is always a leaf
              data: {
                stepType: "Send Email",
                label: "Send Email",
                subject: "",
                body: "",
                from: [],
                replyToPrevious: false,
                enabled: true,
                isLeaf: true,
              },
              position: { x: 0, y: 0 }, // Will be positioned by layout
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

          // No need to refresh page - canvas is updated immediately!
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
    [linkConditions, selectedNode, teamId, campaignId, toast],
  );

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

  // Get delay settings with defaults
  const getDelaySettings = (stepId: string) => {
    return nodeDelays[stepId] || { delay: 0, daysToWait: 0 };
  };

  // Get link delay settings with defaults
  const getLinkDelaySettings = useCallback(
    (linkId: string) => {
      return linkDelays[linkId] || { delay: 0, randomWindow: 0 };
    },
    [linkDelays],
  );

  return (
    <div className="space-y-6 pt-4 overflow-y-auto scrollbar-hide">
      {/* Incoming Step Links */}
      <div className="space-y-4">
        <Label className="text-base">Incoming Step Links</Label>
        {incomingSteps.length === 0 && !dummyEdge && (
          <div className="text-sm text-muted-foreground">None</div>
        )}

        {/* Show dummy edge as incoming link if present */}
        {dummyEdge && dummyEdge.length > 0 && (
          <div className="rounded-md space-y-4">
            <div className="text-sm font-medium mb-2">
              Step Link A : Previous Step
            </div>

            {/* Delay Settings */}
            <div className="w-full p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="dummy-edge-delay"
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
                          updateDummyEdgeDelay(
                            "delay",
                            Math.max(0, (dummyEdge[0].data?.delay || 0) - 1),
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
                          updateDummyEdgeDelay(
                            "delay",
                            (dummyEdge[0].data?.delay || 0) + 1,
                          )
                        }
                        disabled={isReadOnly}
                      >
                        +
                      </button>
                    </div>
                    <Input
                      id="dummy-edge-delay"
                      type="number"
                      min="0"
                      step="1"
                      value={dummyEdge[0].data?.delay || 0}
                      onChange={(e) =>
                        updateDummyEdgeDelay("delay", Number(e.target.value))
                      }
                      disabled={isReadOnly}
                      className="pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="dummy-edge-randomWindow"
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
                          updateDummyEdgeDelay(
                            "randomWindow",
                            Math.max(
                              0,
                              (dummyEdge[0].data?.randomWindow || 0) - 1,
                            ),
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
                          updateDummyEdgeDelay(
                            "randomWindow",
                            (dummyEdge[0].data?.randomWindow || 0) + 1,
                          )
                        }
                        disabled={isReadOnly}
                      >
                        +
                      </button>
                    </div>
                    <Input
                      id="dummy-edge-randomWindow"
                      type="number"
                      min="0"
                      step="1"
                      value={dummyEdge[0].data?.randomWindow || 0}
                      onChange={(e) =>
                        updateDummyEdgeDelay(
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
            </div>
          </div>
        )}

        {!dummyEdge &&
          incomingSteps.map((step: any, i: number) => {
            const delaySettings = getDelaySettings(step.id);
            const linkDelaySettings = getLinkDelaySettings(step.linkData?.id);
            return (
              <div key={step.id} className="rounded-md space-y-4">
                <div className="text-sm font-medium mb-2">
                  Step Link {String.fromCharCode(65 + i)} :{" "}
                  {formatStepLabel(
                    getStepTypeName(step.stepData?.__typename),
                  ) || "Unnamed Step"}
                </div>

                {/* Delay Settings */}
                <div className="w-full p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor={`incoming-delay-${step.id}`}
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
                              step.linkData?.id &&
                              updateLinkDelay(
                                step.linkData.id,
                                "delay",
                                Math.max(0, linkDelaySettings.delay - 1),
                              )
                            }
                            disabled={isReadOnly || !step.linkData?.id}
                          >
                            −
                          </button>

                          {/* Plus button */}
                          <button
                            type="button"
                            className="flex items-center justify-center w-10 h-full text-white text-lg font-medium border-l border-gray-600 rounded-r-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() =>
                              step.linkData?.id &&
                              updateLinkDelay(
                                step.linkData.id,
                                "delay",
                                linkDelaySettings.delay + 1,
                              )
                            }
                            disabled={isReadOnly || !step.linkData?.id}
                          >
                            +
                          </button>
                        </div>
                        <Input
                          id={`incoming-delay-${step.id}`}
                          type="number"
                          min="0"
                          step="1"
                          value={linkDelaySettings.delay}
                          onChange={(e) =>
                            step.linkData?.id &&
                            updateLinkDelay(
                              step.linkData.id,
                              "delay",
                              Number(e.target.value),
                            )
                          }
                          disabled={isReadOnly || !step.linkData?.id}
                          className="pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor={`incoming-randomWindow-${step.id}`}
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
                              step.linkData?.id &&
                              updateLinkDelay(
                                step.linkData.id,
                                "randomWindow",
                                Math.max(0, linkDelaySettings.randomWindow - 1),
                              )
                            }
                            disabled={isReadOnly || !step.linkData?.id}
                          >
                            -
                          </button>
                          <button
                            type="button"
                            className="flex items-center justify-center w-10 h-full text-white text-lg font-medium border-l border-gray-600 rounded-r-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() =>
                              step.linkData?.id &&
                              updateLinkDelay(
                                step.linkData.id,
                                "randomWindow",
                                linkDelaySettings.randomWindow + 1,
                              )
                            }
                            disabled={isReadOnly || !step.linkData?.id}
                          >
                            +
                          </button>
                        </div>
                        <Input
                          id={`incoming-randomWindow-${step.id}`}
                          type="number"
                          min="0"
                          step="1"
                          value={linkDelaySettings.randomWindow}
                          onChange={(e) =>
                            step.linkData?.id &&
                            updateLinkDelay(
                              step.linkData.id,
                              "randomWindow",
                              Number(e.target.value),
                            )
                          }
                          disabled={isReadOnly || !step.linkData?.id}
                          className="pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>
                  </div>
                  {/* Condition */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor={`incoming-condition-${step.id}`}
                        className="text-sm text-muted-foreground"
                      >
                        Link Filter
                      </Label>
                    </div>

                    <Select
                      value={linkConditions[step.linkData?.id] || ""}
                      onValueChange={(value) => {
                        step.linkData?.id &&
                          updateStepCondition(
                            step.linkData.id,
                            value,
                            step.linkData,
                          );
                      }}
                      disabled={isReadOnly || !step.linkData?.id}
                    >
                      <SelectTrigger id={`incoming-condition-${step.id}`}>
                        <SelectValue placeholder="No filter (default)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No filter (default)</SelectItem>
                        <SelectItem value="always_proceed">
                          Always Proceed
                        </SelectItem>
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
            );
          })}
      </div>
      {/* Divider between incoming and outgoing links */}
      <div className="my-6 border-t border-gray-200 dark:border-gray-800"></div>
      {/* Outgoing Step Links */}
      <div className="space-y-4">
        <Label className="text-base">Outgoing Step Links</Label>
        {outgoingSteps.length === 0 && !dummyEdge && (
          <div className="text-sm text-muted-foreground">None</div>
        )}
        {outgoingSteps.map((step: any, i: number) => {
          const delaySettings = getDelaySettings(step.id);
          const linkDelaySettings = getLinkDelaySettings(step.linkData?.id);
          return (
            <div key={step.id} className="rounded-md space-y-4 mb-4">
              <div className="text-sm font-medium mb-2">
                Step Link {String.fromCharCode(65 + i)} :{" "}
                {formatStepLabel(getStepTypeName(step.stepData?.__typename)) ||
                  "Unnamed Step"}{" "}
              </div>
              <div className="w-full p-4">
                {/* Delay Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor={`outgoing-delay-${step.id}`}
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
                            step.linkData?.id &&
                            updateLinkDelay(
                              step.linkData.id,
                              "delay",
                              Math.max(0, linkDelaySettings.delay - 1),
                            )
                          }
                          disabled={isReadOnly || !step.linkData?.id}
                        >
                          −
                        </button>

                        {/* Plus button */}
                        <button
                          type="button"
                          className="flex items-center justify-center w-10 h-full text-white text-lg font-medium border-l border-gray-600 rounded-r-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() =>
                            step.linkData?.id &&
                            updateLinkDelay(
                              step.linkData.id,
                              "delay",
                              linkDelaySettings.delay + 1,
                            )
                          }
                          disabled={isReadOnly || !step.linkData?.id}
                        >
                          +
                        </button>
                      </div>
                      <Input
                        id={`outgoing-delay-${step.id}`}
                        type="number"
                        min="0"
                        step="1"
                        value={linkDelaySettings.delay}
                        onChange={(e) =>
                          step.linkData?.id &&
                          updateLinkDelay(
                            step.linkData.id,
                            "delay",
                            Number(e.target.value),
                          )
                        }
                        disabled={isReadOnly || !step.linkData?.id}
                        className="pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor={`outgoing-randomWindow-${step.id}`}
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
                            step.linkData?.id &&
                            updateLinkDelay(
                              step.linkData.id,
                              "randomWindow",
                              Math.max(0, linkDelaySettings.randomWindow - 1),
                            )
                          }
                          disabled={isReadOnly || !step.linkData?.id}
                        >
                          -
                        </button>
                        <button
                          type="button"
                          className="flex items-center justify-center w-10 h-full text-white text-lg font-medium border-l border-gray-600 rounded-r-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() =>
                            step.linkData?.id &&
                            updateLinkDelay(
                              step.linkData.id,
                              "randomWindow",
                              linkDelaySettings.randomWindow + 1,
                            )
                          }
                          disabled={isReadOnly || !step.linkData?.id}
                        >
                          +
                        </button>
                      </div>
                      <Input
                        id={`outgoing-randomWindow-${step.id}`}
                        type="number"
                        min="0"
                        step="1"
                        value={linkDelaySettings.randomWindow}
                        onChange={(e) =>
                          step.linkData?.id &&
                          updateLinkDelay(
                            step.linkData.id,
                            "randomWindow",
                            Number(e.target.value),
                          )
                        }
                        disabled={isReadOnly || !step.linkData?.id}
                        className="pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Condition */}
                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor={`outgoing-condition-${step.id}`}
                      className="text-sm text-muted-foreground"
                    >
                      Link Filter
                    </Label>
                  </div>

                  <Select
                    value={linkConditions[step.linkData?.id] || ""}
                    onValueChange={(value) => {
                      step.linkData?.id &&
                        updateStepCondition(
                          step.linkData.id,
                          value,
                          step.linkData,
                        );
                    }}
                    disabled={isReadOnly || !step.linkData?.id}
                  >
                    <SelectTrigger id={`outgoing-condition-${step.id}`}>
                      <SelectValue placeholder="No filter (default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No filter (default)</SelectItem>
                      <SelectItem value="always_proceed">
                        Always Proceed
                      </SelectItem>
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
          );
        })}
      </div>
    </div>
  );
};

export default StepLinksTab;
