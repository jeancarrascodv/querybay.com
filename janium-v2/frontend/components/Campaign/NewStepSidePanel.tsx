import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useCampaignStepStore } from "@/store/useCampaignStepStore";
import { useStepStore } from "@/store/useStepStore";
import { StepSidePanelProps, StepUIData } from "@/types/campaignStepUI";
import { campaignStepServices } from "@/services/campaignStep.services";
import { BulkUpdateStepsInput } from "@/types/campaignStep";

import StepLinksTab from "./steps/new/StepLinksTab";
import ConfigureNewTab from "./steps/new/ConfigureNewTab";
import { ContentTab } from "./steps/new/ContentTab";
import { LogsViewerTrigger } from "@/components/logs-viewer";
import { cleanTypename, formatStepLabel } from "@/lib/utils";
import {
  INTERNAL_STEP_TYPES,
  INTERNAL_TO_DISPLAY_MAPPING,
  NODE_DIMENSIONS,
  InternalStepType,
  DISPLAY_STEP_TYPES,
} from "./constants";
import { getLayoutedElements } from "./FlowBoardUtils";

// Define the props for the new side panel
interface NewStepSidePanelProps extends StepSidePanelProps {
  isSavingNodes: boolean;
  edges: any[];
  nodes: any[];
  campaignId: string;
  teamId: string;
  dummyNode: any;
  dummyEdge: any[];
  setDummyNode: (node: any) => void;
  setDummyEdge: (edges: any[]) => void;
  setNodes: (nodes: any[]) => void;
  setEdges: (edges: any[]) => void;
  saveLayout: (nodes: any[], edges: any[]) => void;
  getNodesWithLeafStatus: (nodes: any[]) => any[];
}

const NewStepSidePanel = ({
  isOpen,
  isSavingNodes,
  onClose,
  onAdd,
  editingStep,
  selectedNode,
  teamId,
  dummyNode,
  dummyEdge,
  setDummyNode,
  setDummyEdge,
  campaignId,
  setSidePanelOpen,
  nodes,
  edges,
  setNodes,
  setEdges,
  getNodesWithLeafStatus,
}: NewStepSidePanelProps) => {
  // Get campaign and team context
  const { toast } = useToast();
  // Memoize selected node data to avoid unnecessary re-computations
  // Determine if this is the first node being created (no steps exist)
  const { steps, links } = useCampaignStepStore();
  const selectedNodeData = useMemo(() => {
    if (!selectedNode || !steps || steps.length === 0) {
      return null;
    }

    // Find the step data for the selected node
    return steps.find((step) => step.id === selectedNode) || null;
  }, [selectedNode, steps]);
  const [newNodeid, setNewNodeId] = useState<string | null>(null);

  // State to track if we're processing a save
  const [isSaving, setIsSaving] = useState(false);

  // State to track last saved timestamp
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // State to show "Change saved" briefly after save
  const [justSaved, setJustSaved] = useState(false);

  // State to track seconds since last save (for dynamic display)
  const [secondsSinceLastSave, setSecondsSinceLastSave] = useState<number>(0);

  // State for tracking unsaved changes from each tab
  const [hasScheduleUnsavedChanges, setHasScheduleUnsavedChanges] =
    useState(false);
  const [hasLinksUnsavedChanges, setHasLinksUnsavedChanges] = useState(false);
  const [hasContentUnsavedChanges, setHasContentUnsavedChanges] =
    useState(false);

  // Combined unsaved changes check
  const hasAnyUnsavedChanges =
    hasScheduleUnsavedChanges ||
    hasLinksUnsavedChanges ||
    hasContentUnsavedChanges;
  const [activeTab, setActiveTab] = useState("step-links");
  // State for close confirmation dialog
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // Refs to store methods for cancel/force save from each tab
  const scheduleMethodsRef = useRef<{
    cancelSave: () => void;
    forceSave: () => Promise<void>;
    hasUnsavedChanges: () => boolean;
    discardChanges?: () => void;
  } | null>(null);

  const linksMethodsRef = useRef<{
    cancelSave: () => void;
    forceSave: () => Promise<void>;
    hasUnsavedChanges: () => boolean;
    discardChanges: () => void;
  } | null>(null);

  const contentMethodsRef = useRef<{
    cancelSave: () => void;
    forceSave: () => Promise<void>;
    hasUnsavedChanges: () => boolean;
    discardChanges: () => void;
  } | null>(null);

  // Callback to register schedule methods from SchedulePicker
  const handleRegisterScheduleMethods = useCallback(
    (methods: {
      cancelSave: () => void;
      forceSave: () => Promise<void>;
      hasUnsavedChanges: () => boolean;
      discardChanges?: () => void;
    }) => {
      scheduleMethodsRef.current = methods;
    },
    [],
  );

  // Callback to register links methods from StepLinksTab
  const handleRegisterLinksMethods = useCallback(
    (methods: {
      cancelSave: () => void;
      forceSave: () => Promise<void>;
      hasUnsavedChanges: () => boolean;
      discardChanges: () => void;
    }) => {
      linksMethodsRef.current = methods;
    },
    [],
  );

  // Callback to register content methods from ContentTab
  const handleRegisterContentMethods = useCallback(
    (methods: {
      cancelSave: () => void;
      forceSave: () => Promise<void>;
      hasUnsavedChanges: () => boolean;
      discardChanges: () => void;
    }) => {
      contentMethodsRef.current = methods;
    },
    [],
  );

  // Handle close button click - show confirmation if there are unsaved changes
  const handleCloseClick = () => {
    if (hasAnyUnsavedChanges) {
      // Cancel all pending auto-saves
      scheduleMethodsRef.current?.cancelSave();
      linksMethodsRef.current?.cancelSave();
      contentMethodsRef.current?.cancelSave();
      setCloseConfirmOpen(true);
    } else {
      onClose();
    }
  };

  // Handle confirm close without saving
  const handleConfirmCloseWithoutSaving = () => {
    // Call discardChanges on all tabs to prevent unmount saves
    scheduleMethodsRef.current?.discardChanges?.();
    linksMethodsRef.current?.discardChanges();
    contentMethodsRef.current?.discardChanges();

    setCloseConfirmOpen(false);
    setHasScheduleUnsavedChanges(false);
    setHasLinksUnsavedChanges(false);
    setHasContentUnsavedChanges(false);
    onClose();
  };
  const { stepData, updateStepData, resetStepData, setMode, mode } =
    useCampaignStepStore();
  // Handle save and close
  const handleSaveAndClose = async () => {
    // Force save all tabs that have unsaved changes
    const savePromises: Promise<void>[] = [];

    if (scheduleMethodsRef.current?.hasUnsavedChanges()) {
      savePromises.push(scheduleMethodsRef.current.forceSave());
    }
    if (linksMethodsRef.current?.hasUnsavedChanges()) {
      savePromises.push(linksMethodsRef.current.forceSave());
    }
    if (contentMethodsRef.current?.hasUnsavedChanges()) {
      savePromises.push(contentMethodsRef.current.forceSave());
    }

    await Promise.all(savePromises);
    setCloseConfirmOpen(false);
    onClose();
  };

  // Update seconds counter every second when we have a lastSavedAt
  useEffect(() => {
    if (!lastSavedAt) return;

    // Reset counter when lastSavedAt changes
    setSecondsSinceLastSave(0);

    // Show "Change saved" briefly
    setJustSaved(true);
    const justSavedTimer = setTimeout(() => setJustSaved(false), 2000);

    const interval = setInterval(() => {
      setSecondsSinceLastSave(
        Math.floor((Date.now() - lastSavedAt.getTime()) / 1000),
      );
    }, 1000);

    return () => {
      clearTimeout(justSavedTimer);
      clearInterval(interval);
    };
  }, [lastSavedAt]);

  // Ref to track pre-generated step ID for new steps
  const newStepIdRef = useRef<string | null>(null);
  const showStepLinks = useMemo(() => {
    // const incomingLinks = links.filter(
    //   (link: any) => link.next === selectedNode,
    // );
    // const outgoingLinks = links.filter(
    //   (link: any) => link.prev === selectedNode,
    // );
    // const hasLinks = incomingLinks.length > 0 || outgoingLinks.length > 0;
    // return selectedNode !== "empty-start" && hasLinks;
    const hasLinks = steps.length > 1;

    if (mode === "add") {
      return steps.length > 0;
    }
    if (activeTab == "step-links") {
      setActiveTab("configure");
    }

    return hasLinks;
  }, [steps, selectedNode]);
  // Default to configure tab if it's the first step

  useEffect(() => {
    // Only reset to configure tab when starting fresh with empty-start
    // Don't reset if we've just created a step (newNodeid is set) or are in edit mode
    if (selectedNode === "empty-start" && mode === "add" && !newNodeid) {
      setActiveTab("configure");
    }
  }, [selectedNode, setActiveTab, nodes, mode, newNodeid]);

  // Memoize selected node data to avoid unnecessary re-computations

  // Effective node data that includes pre-generated ID for new steps not yet in store
  const effectiveNodeData = useMemo(() => {
    // If we have stored data from the steps store, use it
    if (newNodeid) {
      return {
        id: newNodeid,
        ...stepData,
      };
    }
    if (selectedNodeData) {
      return selectedNodeData;
    }

    // If stepData has an ID (pre-generated for new steps), create a minimal step data object
    // This happens when transitioning from Configure to Content tab before the step is saved
    if (stepData?.id) {
      return {
        id: stepData.id,
        ...stepData,
      };
    }

    return null;
  }, [selectedNodeData, stepData, newNodeid]);

  // Get direct access to the step store methods for better component integration
  const stepStore = useStepStore();
  const { reset, setStepType, stepType } = stepStore;
  useEffect(() => {
    if (dummyNode) {
      if (steps.length != 0) {
        setActiveTab("step-links");
      }
    } else if (mode === "add") {
      // Only reset to configure tab if we're in add mode (not after step creation)
      setActiveTab("configure");
    }
  }, [selectedNode, setActiveTab, dummyNode, mode]);

  // useEffect(() => {
  //   if (stepType == "" && activeTab === "content") {
  //     // If step type is not set and we're on content tab, switch to configure
  //     setActiveTab("step-links");
  //   }
  // }, [stepType, activeTab]);
  useEffect(() => {
    if (editingStep) {
      // When editing an existing step:
      // 1. Update the campaign step store
      updateStepData(editingStep);
      // 2. Initialize unified store with the same data
      // initFromStepData(editingStep);
      // 3. Set mode to edit (not add)
      setMode("edit");
      // 4. Clear the newStepIdRef since we're editing an existing step
      newStepIdRef.current = null;
      setNewNodeId(null);
    } else {
      // When creating a new step:
      // 1. Reset the campaign step store
      resetStepData();
      // 2. Reset the unified store only if we're opening for the first time
      // Don't reset if we're just switching between panels or tabs
      if (!stepStore.stepType) {
        reset();
      }
      // 3. Set mode to add
      setMode("add");
      // 4. Reset the newStepIdRef for a fresh new step
      newStepIdRef.current = null;
      setNewNodeId(null);

      // 5. If we have a selected node type already set, update the step type
      if (selectedNode && selectedNode === "empty-start") {
        // For first node, default step type to LinkedIn Connection Request
        setStepType(DISPLAY_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST);
      }
    }
  }, [
    editingStep,
    selectedNode,
    updateStepData,
    resetStepData,
    // initFromStepData,
    reset,
    setMode,
    // setStepType,
  ]);

  if (!isOpen || isSavingNodes) return null;

  const handleComplete = async (
    data: StepUIData | null = null,
    continueEdit = false,
  ) => {
    try {
      if (isSaving) return;

      // Get data from the step store using our direct reference
      const storeData = stepStore.getStepData();

      // Prepare the final data for API submission by merging all data sources
      const finalData =
        mode === "edit" || editingStep?.id
          ? {
              ...stepData,
              ...storeData,
              ...(data || {}),
              id: editingStep?.id || selectedNode,
              __typename: stepData.__typename || "CampaignStep",
            } // Editing - store data takes priority but we respect tab-specific overrides
          : ({
              ...storeData,
              ...(data || {}),
              id: newStepIdRef.current || uuidv4(), // Pre-generate ID for new steps
              __typename: "SendEmail", // Default to SendEmail for new steps
            } as StepUIData); // Creating - store data is primary but allow tab overrides

      // Store the generated ID for later reference
      if (!editingStep?.id && !newStepIdRef.current && finalData.id) {
        newStepIdRef.current = finalData.id;
      }

      // Make sure we include the tempId for proper replacement of visual node
      if ((stepData.tempId || storeData.tempId) && !finalData.tempId) {
        finalData.tempId = stepData.tempId || storeData.tempId;
      }

      // Handle first node in a sequence
      if (selectedNode === "empty-start") {
        finalData.isFirstNode = true;
      }

      // Based on the active tab and continue flag, we either save the step or move to the next tab
      if (activeTab === "configure" && continueEdit) {
        // When moving from Configure to Content tab:
        // Save the step to backend directly using bulkUpdateSteps
        setIsSaving(true);

        try {
          const { bulkUpdateSteps } = useCampaignStepStore.getState();

          // Build step creation input based on step type
          const stepCreation: any = {
            id: finalData.id,
            enabled: true,
            priority: 0,
            stepData: {},
          };

          // Set step data based on step type
          const stepTypeValue = finalData.stepType || finalData.__typename;
          if (
            stepTypeValue === INTERNAL_STEP_TYPES.EMAIL ||
            stepTypeValue === "SendEmail" ||
            stepTypeValue === "EMAIL"
          ) {
            // Build sendEmail data - from field should be a UUID or omitted
            const fromValue =
              finalData.from && finalData.from.length > 0
                ? finalData.from[0] // Use first sender if array
                : undefined;

            stepCreation.stepData = {
              sendEmail: {
                subject: finalData.subject || "",
                body: (finalData as any).email_body || finalData.body || "",
                ...(fromValue && { from: fromValue }), // Only include from if it has a value
                replyToPrevious: (finalData as any).replyInThread || false,
              },
            };
          } else if (
            stepTypeValue === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE ||
            stepTypeValue === "SendLinkedInMessage" ||
            stepTypeValue === "LINKEDIN_MESSAGE"
          ) {
            stepCreation.stepData = {
              sendLinkedInMessage: {
                linkedinMessage: finalData.linkedinMessage || "",
              },
            };
          } else if (
            stepTypeValue === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST ||
            stepTypeValue === "SendLinkedInConnectionRequest" ||
            stepTypeValue === "LINKEDIN_CONNECTION_REQUEST"
          ) {
            stepCreation.stepData = {
              sendLinkedInConnectionRequest: {
                connectionRequestMessage:
                  finalData.connectionRequestMessage || "",
              },
            };
          }

          // Add weekly restrictions if provided
          if (finalData.weeklyRestrictions !== undefined) {
            stepCreation.weeklyRestrictions = finalData.weeklyRestrictions;
          }

          // Build bulk update input
          const bulkUpdateInput: BulkUpdateStepsInput = {
            stepCreations: [stepCreation],
            stepMutations: [],
            linkCreations: [],
            linkMutations: [],
          };

          // If we have a parent node (selectedNode) and this is not the first node, create link(s)
          if (
            selectedNode &&
            selectedNode !== "empty-start" &&
            steps.length > 0
          ) {
            // Check if we're adding a node between two existing nodes
            const isAddingBetween = dummyEdge && dummyEdge.length === 2;

            if (isAddingBetween) {
              // Find the target node from the second dummy edge
              const targetNodeId = dummyEdge[1]?.target;

              if (targetNodeId) {
                // Find the original link between source and target
                const originalLink = links.find(
                  (link) =>
                    link.prev === selectedNode && link.next === targetNodeId,
                );

                // Delete the original link if it exists
                if (originalLink) {
                  bulkUpdateInput.linkDeletions = [originalLink.id];
                }

                // Create link from source to new node, and from new node to target
                bulkUpdateInput.linkCreations = [
                  {
                    prev: { uuid: selectedNode },
                    next: { tag: finalData.id },
                    delay: { days: dummyEdge[0]?.data?.delay || 0 },
                    randomDelay: {
                      days: dummyEdge[0]?.data?.randomWindow || 0,
                    },
                  },
                  {
                    prev: { tag: finalData.id },
                    next: { uuid: targetNodeId },
                    delay: { days: dummyEdge[1]?.data?.delay || 0 },
                    randomDelay: {
                      days: dummyEdge[1]?.data?.randomWindow || 0,
                    },
                  },
                ];
              }
            } else {
              // Regular case: just add link from parent to new step
              const linkCreation = {
                prev: { uuid: selectedNode },
                next: { tag: finalData.id }, // Use tag for the new step since it's being created
                delay: { days: dummyEdge?.[0]?.data?.delay || 0 },
                randomDelay: { days: dummyEdge?.[0]?.data?.randomWindow || 0 },
              };
              bulkUpdateInput.linkCreations = [linkCreation];
            }
          }

          // Call the API directly
          const campaignIdStr =
            typeof campaignId === "string" ? campaignId : campaignId[0];
          const result = await bulkUpdateSteps(
            campaignIdStr,
            cleanTypename(bulkUpdateInput),
          );

          // Get the actual created step from the result to get the correct ID
          const oldSteps = new Set(steps.map((s) => s.id));
          // The server may have assigned a different ID than what we sent
          const createdStep = result?.steps?.find(
            (s: any) => !oldSteps.has(s.id),
          );
          const actualStepId = createdStep?.id || finalData.id;
          console.log("Created step with ID:", actualStepId);

          // Update the ref with the actual step ID for future reference
          newStepIdRef.current = actualStepId ?? null;
          setNewNodeId(actualStepId ?? null);

          // Update nodes with correct leaf status
          if (result?.steps && result?.links) {
            const stepsMap = new Map(
              result.steps.map((step: any) => [step.id, step]),
            );

            // Build nodes from result steps (matching FlowBoard structure)
            const builtNodes = result.steps.map((step: any) => {
              let stepType = "";
              let extraData = {};

              if (step.stepData?.__typename === "SendEmail") {
                stepType = INTERNAL_STEP_TYPES.EMAIL;
                extraData = {
                  subject: step.stepData.subject || "",
                  body: step.stepData.body || "",
                  from: step.stepData.from || [],
                  replyToPrevious: step.stepData.replyToPrevious || false,
                };
              } else if (step.stepData?.__typename === "SendLinkedInMessage") {
                stepType = INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE;
                extraData = { linkedinMessage: step.stepData.linkedinMessage };
              } else if (
                step.stepData?.__typename === "SendLinkedInConnectionRequest"
              ) {
                stepType = INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST;
                extraData = {
                  connectionRequestMessage:
                    step.stepData.connectionRequestMessage,
                };
              }

              return {
                id: step.id,
                type: "normal",
                data: {
                  stepType:
                    INTERNAL_TO_DISPLAY_MAPPING[stepType as InternalStepType] ||
                    stepType,
                  enabled: step.enabled,
                  label: formatStepLabel(stepType),
                  isLeaf: false,
                  ...extraData,
                },
                position: step.ui?.box
                  ? { x: step.ui.box.xmin, y: step.ui.box.ymin }
                  : { x: 0, y: 0 },
                width: NODE_DIMENSIONS.width,
                height: NODE_DIMENSIONS.height,
              };
            });

            // Build edges from result links (matching FlowBoard structure)
            const builtEdges: any[] = [];
            const nodesWithChildren = new Set();

            if (result.links?.length > 0) {
              result.links.forEach((link: any) => {
                const sourceStep = stepsMap.get(link.prev);
                const targetStep = stepsMap.get(link.next);
                if (sourceStep && targetStep) {
                  nodesWithChildren.add(link.prev);

                  // Check if filter is non-trivial
                  const hasFilter =
                    link.filter &&
                    !(
                      link.filter.const &&
                      link.filter.const.pass === true &&
                      Object.keys(link.filter.const).length === 1
                    );

                  // Get filter description
                  let filterInfo = "";
                  if (hasFilter && link.filter) {
                    if (
                      link.filter.__typename === "OpenedPreviousEmail" ||
                      link.filter.openedPreviousEmail
                    ) {
                      filterInfo = "Email opened";
                    } else if (
                      link.filter.__typename === "NotFilter" ||
                      link.filter.not
                    ) {
                      if (
                        link.filter.not?.openedPreviousEmail ||
                        link.filter.not?.__typename === "OpenedPreviousEmail"
                      ) {
                        filterInfo = "Email NOT opened";
                      } else {
                        filterInfo = "NOT condition";
                      }
                    } else if (
                      link.filter.__typename === "AndFilter" ||
                      link.filter.and
                    ) {
                      filterInfo = `All conditions (${(link.filter.and || []).length})`;
                    } else if (
                      link.filter.__typename === "OrFilter" ||
                      link.filter.or
                    ) {
                      filterInfo = `Any condition (${(link.filter.or || []).length})`;
                    } else if (
                      link.filter.const &&
                      link.filter.const.pass === false
                    ) {
                      filterInfo = "Never proceed";
                    } else {
                      filterInfo = "Custom filter";
                    }
                  }

                  builtEdges.push({
                    id: link.id,
                    source: sourceStep.id,
                    target: targetStep.id,
                    type: "custom",
                    data: {
                      delay: link.delay?.days || 0,
                      randomWindow: link.randomDelay?.days || 0,
                      enabled:
                        link.enabled !== undefined ? link.enabled : false,
                      info: hasFilter ? filterInfo : false,
                      filter: link.filter,
                    },
                  });
                }
              });
            }

            // Update nodes with leaf status
            const nodesWithLeafStatus = getNodesWithLeafStatus(builtNodes);

            // Apply layout to position nodes properly
            const { nodes: layoutedNodes, edges: layoutedEdges } =
              getLayoutedElements(nodesWithLeafStatus, builtEdges);

            setNodes(layoutedNodes);
            setEdges(layoutedEdges);

            // Clear dummy node and edge
            setDummyNode(null);
            setDummyEdge([]);
          }

          // Switch to edit mode so ContentTab can update the existing step
          setMode("edit");

          // Update stepData with the actual step ID from the server
          updateStepData({
            ...finalData,
            id: actualStepId,
          });

          setLastSavedAt(new Date());
          setIsSaving(false);
          setActiveTab("content");
          console.log("Step created and moved to Content tab");
        } catch (error) {
          console.error("Error saving step:", error);
          toast({
            title: "Error saving step",
            description:
              "There was a problem saving your step. Please try again.",
            variant: "destructive",
            duration: 3000,
          });
          setIsSaving(false);
          return;
        }
      } else if (activeTab === "step-links" && continueEdit) {
        // When moving from Links to Configure tab:
        // Simply transition to the next tab, data is already in the step store
        setActiveTab("configure");
      } else {
        // If not continuing or completing the final tab, save to the flow board
        // This will trigger the FlowBoard's handleNodesChange which eventually calls bulkUpdateSteps
        setIsSaving(true);

        onAdd(finalData, continueEdit);

        // Only show toast on complete save, not intermediate tab navigation
        if (!continueEdit) {
          toast({
            title: "Step saved",
            description: "Your step has been saved successfully",
            duration: 2000,
          });
        }

        if (!continueEdit) {
          // Clean up when done and closing:
          // 1. Reset the campaign step store
          resetStepData();
          // 2. Reset our step store to prevent state leakage to new steps
          stepStore.reset();
          // 3. Close the panel
          onClose();
        }

        setIsSaving(false);
      }
    } catch (error) {
      console.error("Error saving step:", error);
      toast({
        title: "Error saving step",
        description: "There was a problem saving your step. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
      setIsSaving(false);
    } finally {
      if (!continueEdit) {
        setSidePanelOpen(false);
      }
    }
  };

  const getPanelTitle = () => {
    // Get the step type directly from our step store reference
    const currentStepType = useStepStore.getState().stepType;
    const stepTypeName = currentStepType
      ? ` ${currentStepType.replace(/_/g, " ")}`
      : "";

    const currentMode = useCampaignStepStore.getState().mode;

    // switch (currentMode) {
    //   case "add":
    //     return `Add New${formatStepLabel(stepTypeName)} Step`;
    //   case "edit":
    //     return `Edit${formatStepLabel(stepTypeName)} Step`;
    //   case "view":
    //     return `${formatStepLabel(stepTypeName)} Step Details`;
    // default:
    return "Step Details";
    // }
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

  // Handler for deleting a step
  const handleDeleteStep = async () => {
    if (!selectedNode || !teamId || !campaignId || mode === "add") {
      console.error("Cannot delete: missing required data or in add mode");
      return;
    }

    try {
      setIsSaving(true);

      // Find incoming and outgoing links for this step
      const incomingLinks = links.filter((link) => link.next === selectedNode);
      const outgoingLinks = links.filter((link) => link.prev === selectedNode);

      // Prepare bulk update input
      const bulkUpdate: BulkUpdateStepsInput = {
        stepDeletions: [selectedNode],
        linkDeletions: [
          ...incomingLinks.map((link) => link.id),
          ...outgoingLinks.map((link) => link.id),
        ],
        linkCreations: [],
      };

      // If there's exactly one incoming and one outgoing link, reconnect them
      if (incomingLinks.length === 1 && outgoingLinks.length === 1) {
        const incomingLink = incomingLinks[0];
        const outgoingLink = outgoingLinks[0];

        // Create a new link to reconnect predecessor and successor
        bulkUpdate.linkCreations = [
          {
            prev: { uuid: incomingLink.prev },
            next: { uuid: outgoingLink.next },
            delay: normalizeSpan(incomingLink.delay),
            randomDelay: normalizeSpan(incomingLink.randomDelay),
            ...(incomingLink.filter && { filter: { const: { pass: true } } }),
          },
        ];
      }

      // Execute the bulk update
      await campaignStepServices.bulkUpdateSteps(
        campaignId,
        cleanTypename(bulkUpdate),
      );

      // Update local canvas state
      // Remove the node
      const updatedNodes = nodes.filter((node) => node.id !== selectedNode);

      // Remove edges connected to this node
      const updatedEdges = edges.filter(
        (edge) => edge.source !== selectedNode && edge.target !== selectedNode,
      );

      // If we reconnected nodes, add the new edge
      if (incomingLinks.length === 1 && outgoingLinks.length === 1) {
        const incomingLink = incomingLinks[0];
        const outgoingLink = outgoingLinks[0];

        updatedEdges.push({
          id: `e${incomingLink.prev}-${outgoingLink.next}`,
          source: incomingLink.prev,
          target: outgoingLink.next,
          type: "custom",
          data: {
            delay: incomingLink.delay?.days || 0,
            randomWindow: incomingLink.randomDelay?.days || 0,
            filter: incomingLink.filter,
          },
        });
      }

      // Update state
      setNodes(updatedNodes);
      setEdges(updatedEdges);

      toast({
        title: "Step Deleted",
        description: "The step has been deleted successfully",
      });

      // Close the panel
      onClose();
    } catch (error) {
      console.error("❌ Error deleting step:", error);
      toast({
        title: "Error",
        description: "Failed to delete step. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <div className="fixed right-0 top-12 h-[calc(100vh-3rem)] w-[500px] border-l bg-background p-6 shadow-lg animate-in slide-in-from-right z-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold mt-1">{getPanelTitle()}</h3>
          {stepData.stepType && (
            <p className="text-sm text-muted-foreground">
              {formatStepLabel(stepData.stepType)} Step
            </p>
          )}
          {(mode === "edit" || (mode === "add" && activeTab === "content")) && (
            <>
              {isSaving && (
                <span className="text-xs text-muted-foreground/50 animate-pulse">
                  Saving...
                </span>
              )}
              {!isSaving && !lastSavedAt && (
                <span className="text-xs text-muted-foreground/50">
                  Changes save automatically
                </span>
              )}
              {!isSaving && lastSavedAt && justSaved && (
                <span className="text-xs text-green-600">Change saved</span>
              )}
              {!isSaving && lastSavedAt && !justSaved && (
                <span className="text-xs text-muted-foreground/50">
                  Last saved {secondsSinceLastSave} seconds ago
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {mode !== "add" && effectiveNodeData?.id && (
            <LogsViewerTrigger
              buttonText="Show Logs"
              buttonVariant="outline"
              initialFilters={{ campaignStepId: effectiveNodeData.id }}
              title="Step Logs"
            />
          )}
          <Button
            variant="ghost"
            onClick={handleCloseClick}
            disabled={isSaving}
          >
            ✕
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(newTab) => {
          // Preserve the current step type when switching tabs
          const currentStepType = stepStore.stepType;

          // Ensure consistent state when switching tabs
          if (newTab === "content") {
            // Make sure we have a step type before showing content tab
            // if (!currentStepType) {
            //   console.warn("Step type not set before content tab");
            //   // Don't switch to content tab if step type is not set
            //   return;
            // }
            if (mode == "edit" && steps.length < 1) {
              const data = stepStore.getStepData();
              handleComplete(data as StepUIData | null, true);
            }
            if (mode === "add" && activeTab === "configure") {
              // In add mode, clicking Content tab should behave like clicking Next
              // (save the step and switch to content with the new node selected)
              const data = stepStore.getStepData();
              handleComplete(data as StepUIData | null, true);
              return; // handleComplete will set activeTab to "content" after save
            }
          }

          setActiveTab(newTab);
        }}
        className="h-[calc(100%-6rem)] flex flex-col"
      >
        {/* Calculate if selected node has any links */}
        {(() => {
          // const incomingLinks = links.filter(
          //   (link: any) => link.next === selectedNode,
          // );
          // const outgoingLinks = links.filter(
          //   (link: any) => link.prev === selectedNode,
          // );
          // const hasLinks = incomingLinks.length > 0 || outgoingLinks.length > 0;
          // const showStepLinks = selectedNode !== "empty-start" && hasLinks;

          return (
            <TabsList
              className={`grid w-full ${showStepLinks ? "grid-cols-3" : "grid-cols-2"}`}
            >
              {showStepLinks && (
                <TabsTrigger value="step-links">Step Links</TabsTrigger>
              )}
              <TabsTrigger value="configure">Configure</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
            </TabsList>
          );
        })()}

        <TabsContent
          value="step-links"
          className="flex-1 overflow-y-auto p-4 space-y-6"
        >
          {/* Step Links Tab Content */}
          <StepLinksTab
            selectedNode={selectedNode}
            campaignId={campaignId}
            teamId={teamId}
            isReadOnly={mode === "view"}
            onComplete={handleComplete}
            onSaveComplete={() => setLastSavedAt(new Date())}
            onUnsavedChangesChange={setHasLinksUnsavedChanges}
            onRegisterMethods={handleRegisterLinksMethods}
            mode={mode}
            dummyEdge={dummyEdge}
            setDummyEdge={setDummyEdge}
            initialData={stepData}
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            setEdges={setEdges}
            onNext={() => {
              // Save data before moving to next tab
              const data = stepStore.getStepData();
              // Cast as any or null to avoid type issues since handleComplete handles partials internally
              handleComplete(data as StepUIData | null, true);
              setActiveTab("configure");
            }}
            onCancel={handleCloseClick}
          />
        </TabsContent>

        <TabsContent value="configure" className="flex-1 overflow-y-auto p-4">
          <ConfigureNewTab
            selectedNode={selectedNode}
            isReadOnly={mode === "view"}
            selectedNodeData={selectedNodeData}
            dummyNode={dummyNode}
            nodes={nodes}
            setNodes={setNodes}
            onSave={(data, continueEdit) => {
              // Ensure store is updated with latest data
              handleComplete(data, continueEdit);
            }}
            onSaveComplete={() => setLastSavedAt(new Date())}
            onUnsavedChangesChange={setHasScheduleUnsavedChanges}
            onRegisterScheduleMethods={handleRegisterScheduleMethods}
            mode={mode === "view" ? "edit" : (mode as "add" | "edit")}
          />
        </TabsContent>

        <TabsContent value="content" className="flex-1 overflow-y-auto p-4">
          <ContentTab
            selectedNode={selectedNode}
            selectedNodeData={effectiveNodeData}
            onNext={() => handleComplete(null, false)}
            onBack={() => setActiveTab("configure")}
            onCancel={handleCloseClick}
            onCompleted={handleComplete}
            onSaveComplete={() => setLastSavedAt(new Date())}
            onUnsavedChangesChange={setHasContentUnsavedChanges}
            onRegisterMethods={handleRegisterContentMethods}
            initialData={stepData}
            continueEdit={true}
            mode={mode === "view" ? "edit" : (mode as "add" | "edit")}
          />
        </TabsContent>
      </Tabs>
      {/* Footer Actions */}
      <div className="flex justify-between mb-12 -mt-12 pb-10">
        {mode !== "add" && (
          <Button
            variant="destructive"
            onClick={handleDeleteStep}
            disabled={isSaving}
          >
            {isSaving ? "Deleting..." : "Delete Step"}
          </Button>
        )}
        {mode === "add" && <div></div>}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleCloseClick}
            disabled={isSaving}
          >
            Close
          </Button>
          {activeTab !== "content" && (
            <Button
              onClick={() => {
                if (activeTab === "content") {
                  // When on content tab, save directly using store data
                  handleComplete(null, false);
                } else {
                  // On other tabs, move to next tab with save
                  // Get current state from the store
                  const data = stepStore.getStepData();
                  // Save and continue - this will call bulkUpdateSteps when going from configure to content
                  handleComplete(data as StepUIData | null, true);
                }
              }}
              disabled={
                (activeTab === "configure" &&
                  dummyNode?.data?.stepType == "") ||
                hasAnyUnsavedChanges
              }
            >
              {hasAnyUnsavedChanges
                ? "Saving..."
                : activeTab === "content"
                  ? "Save"
                  : "Next"}
            </Button>
          )}
        </div>
      </div>

      {/* Close Confirmation Dialog */}
      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Would you like to save them before
              closing?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleConfirmCloseWithoutSaving}>
              Discard Changes
            </Button>
            <Button onClick={handleSaveAndClose}>Save & Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NewStepSidePanel;
