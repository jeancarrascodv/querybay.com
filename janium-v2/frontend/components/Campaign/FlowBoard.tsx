import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import ReactFlow, {
  Controls,
  useNodesState,
  useEdgesState,
  ReactFlowInstance,
} from "reactflow";
import { useTheme } from "next-themes";
import "reactflow/dist/style.css";
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from "uuid";
import CustomEdge from "./CustomEdge";
import CustomNode from "./CustomNode";
import NewStepSidePanel from "./NewStepSidePanel";
import { useCampaignStore } from "@/store/useCampaignStore";
import DefaultNode from "./DefaultNode";
import InteractiveDotBackground from "./InteractiveDotBackground";
import { useCampaignStepStore } from "@/store/useCampaignStepStore";
import { useParams } from "next/navigation";
import {
  NODE_DIMENSIONS,
  INTERNAL_STEP_TYPES,
  INTERNAL_TO_DISPLAY_MAPPING,
  DISPLAY_TO_INTERNAL_MAPPING,
  InternalStepType,
  DisplayStepType,
} from "./constants";

import { cleanTypename, formatStepLabel } from "@/lib/utils";
import { useTeamStore } from "@/store/useTeamStore";
import {
  BulkUpdateStepsInput,
  CreateCampaignStep,
  CreateCampaignStepLink,
  MutateCampaignStep,
  MutateCampaignStepLink,
} from "@/types/campaignStep";
import {
  checkNodesOrEdgeChange,
  createEmptyStartNode,
  getLayoutedElements,
} from "./FlowBoardUtils";
import LinkSidePanel from "./LinkSidePanel";
import { useStepStore } from "@/store/useStepStore";

const nodeTypes = {
  leaf: CustomNode,
  normal: DefaultNode,
};

const FlowBoard = () => {
  const { theme } = useTheme();
  const { toast } = useToast();
  const { campaignId } = useParams();
  const {
    selectedNode,
    selectedEdge,
    setSelectedEdge,
    setSelectedNode,
    editingStep,
    setEditingStep,
    setMode,
    mode,
    nodeDelays,
    isSidePanelOpen,
    setIsSidePanelOpen,
  } = useCampaignStore();
  const {
    steps: stepData,
    links: stepLinks,
    setCurrentStep,
    setSaved,
    getCampaignFlow,
  } = useCampaignStepStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const currentTeamId = useTeamStore((state) => state.currentTeamId);

  const [addingNodeBetween, setAddingNodeBetween] = useState(false);
  const [isLinkSidePanelOpen, setIsLinkSidePanelOpen] = useState(false);
  const [dummyNode, setDummyNode] = useState<any>(null);
  const [dummyEdge, setDummyEdge] = useState<any>(null);
  const [pendingNodeData, setPendingNodeData] = useState<{
    sourceId: string;
    targetId: string;
    edgeId: string;
    nodeId: string;
  } | null>(null);

  const [saveBuffer, setSaveBuffer] = useState<{
    nodes: any[];
    edges: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedChanges, setSavedChanges] = useState(false);
  // Refs to prevent multiple initialization
  const stepsLoadedRef = useRef(false);
  const initializedRef = useRef(false);
  const prevCreatedStep = useRef<string | null>(null);
  const prevCreatedLink = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const { reset: resetSidepanel } = useStepStore();

  // Define addDummyNode first so it can be used in handleEdgePlusClick
  const addDummyNode = useCallback(
    (sourceNodeId: string, targetNodeId?: string) => {
      const newDummyNode = {
        id: "dummy-node",
        type: "normal",
        data: {
          stepType: "",
          label: "",
          enabled: true,
          selectedNode: selectedNode,
        },
        position: { x: 0, y: 0 },
      };
      if (sourceNodeId === "empty-start") {
        newDummyNode.data.label = "";
        setDummyNode(newDummyNode);
        setNodes([newDummyNode]);
        setEdges([]);
        return;
      }
      const newEdges = [
        {
          id: `e${sourceNodeId}-dummy-node`,
          source: sourceNodeId,
          target: "dummy-node",
          type: "custom",
          data: { delay: 0 },
        },
        ...(targetNodeId
          ? [
              {
                id: `e-dummy-node-${targetNodeId}`,
                source: "dummy-node",
                target: targetNodeId,
                type: "custom",
                data: { delay: 0 },
              },
            ]
          : []),
      ];

      setDummyEdge(newEdges);
      setDummyNode(newDummyNode);

      const processed = processStepsToElements(stepData, stepLinks);
      let tempNodes = processed.nodes;
      let tempEdges = processed.edges;

      if (targetNodeId) {
        tempEdges = tempEdges.filter(
          (edge) =>
            !(edge.source === sourceNodeId && edge.target === targetNodeId),
        );
      }

      const layoutedNodes = getLayoutedElements(
        [...tempNodes, newDummyNode],
        [...tempEdges, ...newEdges],
      );

      setNodes(layoutedNodes.nodes);
      setEdges(layoutedNodes.edges);
    },
    [
      nodes,
      edges,
      stepData,
      stepLinks,
      setDummyNode,
      setDummyEdge,
      setNodes,
      setEdges,
    ],
  );

  // Memoized handler for adding node (must be after addDummyNode)
  const handleEdgePlusClick = useCallback(
    (sourceNodeId: string) => {
      console.log("handleEdgePlusClick called for:", sourceNodeId);
      addDummyNode(sourceNodeId);
      setSelectedNode(sourceNodeId);
      setEditingStep(null);
      setMode("add");
      setIsSidePanelOpen(true);
      resetSidepanel();
    },
    [addDummyNode, setSelectedNode, setEditingStep, setMode, resetSidepanel],
  );

  const addNodeBetween = useCallback(
    (edgeId: string, sourceId: string, targetId: string) => {
      console.log("Adding node between:", { edgeId, sourceId, targetId });
      // Remove the edge between source and target, and set up pendingNodeData
      resetSidepanel();
      addDummyNode(sourceId, targetId);
      setPendingNodeData({ sourceId, targetId, edgeId, nodeId: "" });
      setSelectedNode(sourceId);
      setSelectedEdge(edgeId); // Clear selected edge
      setEditingStep(null);
      setMode("add");

      setIsSidePanelOpen(true);
      setIsLinkSidePanelOpen(false); // Close link panel if open
      setAddingNodeBetween(true);
      // Remove the edge visually immediately for better UX
    },
    [
      addDummyNode,
      setSelectedNode,
      setSelectedEdge,
      setEditingStep,
      setMode,
      setEdges,
    ],
  );

  const handleEdgeDelayClick = useCallback(
    (sourceNodeId: string, edgeData: any, id: string) => {
      console.log("Editing edge delay:", edgeData, id);
      // setSelectedNode(sourceNodeId);
      setSelectedEdge(id);
      setEditingStep(edgeData);
      setIsLinkSidePanelOpen(true);
      // setIsSidePanelOpen(true);
    },
    [setSelectedNode, setEditingStep],
  );

  // Memoized edge types
  const edgeTypes = useMemo(
    () => ({
      custom: (props: any) => (
        <CustomEdge
          {...props}
          onPlusClick={addNodeBetween}
          onDelayClick={handleEdgeDelayClick}
          isSelected={selectedEdge === props.id}
        />
      ),
    }),
    [addNodeBetween, handleEdgeDelayClick, selectedEdge],
  );

  // Memoized node data updater
  const getNodesWithLeafStatus = useCallback(
    (currentNodes: any[]) => {
      return currentNodes.map((node) => {
        const isLeaf = !edges.some((edge) => edge.source === node.id);
        return {
          ...node,
          type: isLeaf ? "leaf" : "normal",
          data: {
            ...node.data,
            isLeaf,
            onAdd: () => {
              console.log("Adding node:", node.id);
              setSelectedNode(node.id);
              setEditingStep(null);
              setMode("add");
              setIsSidePanelOpen(true);
            },
            onEdgePlusClick: handleEdgePlusClick,
          },
        };
      });
    },
    [edges, setSelectedNode, setEditingStep, setMode, handleEdgePlusClick],
  );

  // Process elements to steps for saving
  const processElementsToSteps = useCallback(
    (nodes: any[], edges: any[]) => {
      if (!nodes.length)
        return {
          stepCreations: [],
          stepMutations: [],
          linkCreations: [],
          linkMutations: [],
        };

      // Filter out dummy node before processing
      const filteredNodes = nodes.filter((node) => node.id !== "dummy-node");

      const existingStepsMap = new Map(stepData.map((step) => [step.id, step]));
      const stepLinksMap = new Map();

      stepLinks.forEach((link) => {
        stepLinksMap.set(`${link.prev}-${link.next}`, link);
      });

      const stepCreations: CreateCampaignStep[] = [];
      const stepMutations: MutateCampaignStep[] = [];
      const linkCreations: CreateCampaignStepLink[] = [];
      const linkMutations: MutateCampaignStepLink[] = [];

      let priorityCounter = 1;

      // Process nodes
      filteredNodes.forEach((node) => {
        const nodeData = node.data;
        const displayStepType = nodeData.stepType as DisplayStepType;
        const internalStepType =
          DISPLAY_TO_INTERNAL_MAPPING[displayStepType] || nodeData.stepType;

        const extraData = Object.keys(nodeData)
          .filter(
            (key) =>
              ![
                "stepType",
                "label",
                "isLeaf",
                "onAdd",
                "onEdgePlusClick",
              ].includes(key),
          )
          .reduce(
            (obj, key) => {
              obj[key] = nodeData[key];
              return obj;
            },
            {} as Record<string, any>,
          );

        let newStepData: any = {};

        if (
          internalStepType === INTERNAL_STEP_TYPES.EMAIL ||
          nodeData.stepType === "Email"
        ) {
          newStepData.sendEmail = {
            subject: extraData.subject || "",
            body: extraData.body || "",
            from: uuidv4(),

            replyToPrevious: extraData.replyToPrevious || false,
          };
        } else if (
          internalStepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE ||
          nodeData.stepType === "LinkedIn Message"
        ) {
          newStepData.sendLinkedInMessage = {
            linkedinMessage:
              extraData.linkedinMessage || extraData.message || "",
          };
        } else if (
          internalStepType ===
            INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST ||
          nodeData.stepType === "LinkedIn Connection Request"
        ) {
          newStepData.sendLinkedInConnectionRequest = {
            connectionRequestMessage:
              extraData.connectionRequestMessage || extraData.message || "",
          };
        }

        if (!existingStepsMap.has(node.id)) {
          if (prevCreatedStep.current === node.id) return;
          prevCreatedStep.current = node.id;

          stepCreations.push({
            stepData: newStepData,
            priority: priorityCounter++,
            enabled: nodeData.enabled !== undefined ? nodeData.enabled : true, // Default to enabled if not specified
            ui: {
              box: {
                xmin: Math.round(node.position?.x || 0),
                xmax: Math.round(
                  (node.position?.x || 0) + NODE_DIMENSIONS.width,
                ),
                ymin: Math.round(node.position?.y || 0),
                ymax: Math.round(
                  (node.position?.y || 0) + NODE_DIMENSIONS.height,
                ),
              },
            },
            id: node.id,
          });
        } else {
          const existingStep = existingStepsMap.get(node.id);
          const bufferStep = saveBuffer?.nodes.find(
            (bufferNode) => bufferNode.id === node.id,
          );

          if (JSON.stringify(bufferStep) !== JSON.stringify(existingStep)) {
            stepMutations.push({
              id: node.id,
              stepData: newStepData,
              enabled:
                nodeData.enabled !== undefined
                  ? nodeData.enabled
                  : (existingStep?.enabled ?? true), // Use nodeData.enabled or fallback to existing, then default to true
              ui: {
                box: {
                  xmin: Math.round(node.position?.x || 0),
                  xmax: Math.round(
                    (node.position?.x || 0) + NODE_DIMENSIONS.width,
                  ),
                  ymin: Math.round(node.position?.y || 0),
                  ymax: Math.round(
                    (node.position?.y || 0) + NODE_DIMENSIONS.height,
                  ),
                },
              },
            });
          }
        }
      });

      // Filter out edges connected to dummy node
      const filteredEdges = edges.filter(
        (edge) => edge.source !== "dummy-node" && edge.target !== "dummy-node",
      );

      // Process edges
      filteredEdges.forEach((edge) => {
        const sourceId = edge.source;
        const targetId = edge.target;
        const delay = edge.data?.delay || 0;
        const randomWindow = edge.data?.randomWindow || 0;
        const originalLinkIdToMutate = edge.data?.originalLinkIdToMutate;

        if (originalLinkIdToMutate) {
          const mutation: any = {
            id: originalLinkIdToMutate,
            prev: { uuid: sourceId },
            next: { tag: targetId },
            delay: { days: Math.floor(delay) },
            randomDelay: { days: Math.floor(randomWindow) },
          };

          // Add filter if present
          if (edge.data?.filter) {
            mutation.filter = edge.data.filter;
          }

          linkMutations.push(mutation);
          return;
        }

        const existingLink = stepLinksMap.get(`${sourceId}-${targetId}`);

        if (existingLink) {
          // Check if delay, randomDelay, or filter has changed
          const hasDelayChange =
            (existingLink.delay?.days || 0) !== Math.floor(delay);
          const hasRandomDelayChange =
            (existingLink.randomDelay?.days || 0) !== Math.floor(randomWindow);
          const hasFilterChange =
            edge.data?.filter &&
            JSON.stringify(existingLink.filter) !==
              JSON.stringify(edge.data.filter);

          if (hasDelayChange || hasRandomDelayChange || hasFilterChange) {
            const mutation: any = {
              id: existingLink.id,
              prev: { uuid: sourceId },
              next: { uuid: targetId },
              delay: { days: Math.floor(delay) },
              randomDelay: { days: Math.floor(randomWindow) },
            };

            // // Add filter if present
            // if (edge.data?.filter) {
            //   mutation.filter = edge.data.filter;
            // }

            linkMutations.push(mutation);
          }
        } else {
          if (prevCreatedLink.current === edge.id) return;
          prevCreatedLink.current = edge.id;

          const targetStepIsNew = stepCreations.some(
            (step) => step.id === targetId,
          );
          const sourceStepIsNew = stepCreations.some(
            (step) => step.id === sourceId,
          );

          const linkCreation: any = {
            prev: {
              uuid: !sourceStepIsNew ? sourceId : undefined,
              tag: sourceStepIsNew ? sourceId : undefined,
            },
            next: {
              uuid: !targetStepIsNew ? targetId : undefined,
              tag: targetStepIsNew ? targetId : undefined,
            },
            delay: { days: Math.floor(delay) },
            randomDelay: { days: Math.floor(randomWindow) },
          };

          // Add filter if present
          if (edge.data?.filter) {
            linkCreation.filter = edge.data.filter;
          }

          linkCreations.push(linkCreation);
        }
      });

      return { stepCreations, stepMutations, linkCreations, linkMutations };
    },
    [stepData, stepLinks, saveBuffer],
  );

  // Process steps to elements for loading
  const processStepsToElements = useCallback(
    (campaignSteps: any[], campaignStepLinks: any[]) => {
      if (!campaignSteps.length) {
        const startNode = createEmptyStartNode();
        setDummyNode(startNode);
        return { nodes: [startNode], edges: [] };
      }

      const stepsMap = new Map(campaignSteps.map((step) => [step.id, step]));

      let nodes = campaignSteps.map((step) => {
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
            connectionRequestMessage: step.stepData.connectionRequestMessage,
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
            onEdgePlusClick: handleEdgePlusClick,
            selectedNode: selectedNode,
            onAdd: () => {
              setSelectedNode(step.id);
              setEditingStep(null);
              setMode("add");
              setIsSidePanelOpen(true);
            },
            ...extraData,
          },
          position: step.ui?.box
            ? { x: step.ui.box.xmin, y: step.ui.box.ymin }
            : { x: 0, y: 0 },
          width: NODE_DIMENSIONS.width,
          height: NODE_DIMENSIONS.height,
        };
      });

      const edges: any[] = [];
      const nodesWithChildren = new Set();

      if (campaignStepLinks?.length > 0) {
        campaignStepLinks.forEach((link) => {
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

            edges.push({
              id: link.id,
              source: sourceStep.id,
              target: targetStep.id,
              type: "custom",
              data: {
                delay: link.delay?.days || 0,
                randomWindow: link.randomDelay?.days || 0,
                enabled: link.enabled !== undefined ? link.enabled : false,
                info: hasFilter ? filterInfo : false,
                filter: link.filter,
              },
            });
          }
        });
      }

      nodes = nodes.map((node) => ({
        ...node,
        data: { ...node.data, isLeaf: !nodesWithChildren.has(node.id) },
        type: !nodesWithChildren.has(node.id) ? "leaf" : "normal",
      }));

      const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges);
      return { nodes: layoutedNodes, edges };
    },
    [handleEdgePlusClick, setSelectedNode, setEditingStep, setMode],
  );

  // Save layout function
  const saveLayout = useCallback(
    async (nodes: any[], currentEdges: any[] = edges, continueEdit = false) => {
      if (!currentTeamId || !campaignId || isSaving) return;

      console.log("Saving layout...", nodes, saveBuffer, continueEdit);

      if (saveBuffer?.nodes && saveBuffer?.edges) {
        const result = checkNodesOrEdgeChange(
          saveBuffer.nodes,
          saveBuffer.edges,
          nodes,
          currentEdges,
        );
        if (result && !result.bufferNodesChange && !result.bufferEdgesChange) {
          return;
        }
      }

      if (lastSavedAt && new Date().getTime() - lastSavedAt.getTime() < 1000) {
        return;
      }

      try {
        setIsSaving(true);
        setSaved(false); // Reset saved state when starting save

        const updateData = processElementsToSteps(nodes, currentEdges);
        const bulkUpdateInput: BulkUpdateStepsInput = {
          stepCreations: updateData.stepCreations || [],
          stepMutations: updateData.stepMutations || [],
          linkCreations: updateData.linkCreations || [],
          linkMutations: updateData.linkMutations || [],
        };

        // Skip API call if there are no actual changes to save
        const hasChanges =
          (bulkUpdateInput.stepCreations?.length ?? 0) > 0 ||
          (bulkUpdateInput.stepMutations?.length ?? 0) > 0 ||
          (bulkUpdateInput.linkCreations?.length ?? 0) > 0 ||
          (bulkUpdateInput.linkMutations?.length ?? 0) > 0;

        if (!hasChanges) {
          console.log("No changes to save, skipping bulk update");
          setIsSaving(false);
          return;
        }

        const campaignIdStr =
          typeof campaignId === "string" ? campaignId : campaignId[0];

        const results = await useCampaignStepStore
          .getState()
          .bulkUpdateSteps(campaignIdStr, cleanTypename(bulkUpdateInput));
        console.log("Save results:", results);

        const { nodes: updatedNodes, edges: updatedLinks } =
          processStepsToElements(results.steps, results.links);

        updatedNodes.filter((node) => node.id !== "dummy-node");
        setNodes(updatedNodes);
        setEdges(updatedLinks);
        setSaveBuffer({ nodes: [...updatedNodes], edges: [...updatedLinks] });
        setLastSavedAt(new Date());
        setHasUnsavedChanges(false);
        setSaved(true);
        if (!continueEdit) {
          setIsSidePanelOpen(false);
        }
        setSavedChanges(true);

        // Reset the prevCreated refs after successful save
        prevCreatedStep.current = null;
        prevCreatedLink.current = null;

        toast({
          title: "Layout saved",
          description: "Your changes have been saved successfully",
          duration: 2000,
        });
      } catch (error) {
        console.error("Failed to save layout:", error);
        toast({
          title: "Error saving layout",
          description:
            "There was a problem saving your changes. Please try again.",
          variant: "destructive",
          duration: 4000,
        });
      } finally {
        setIsSaving(false);
        if (!continueEdit) {
          setIsSidePanelOpen(false);
        }
      }
    },
    [
      currentTeamId,
      campaignId,
      processElementsToSteps,
      edges,
      saveBuffer,
      lastSavedAt,
      isSaving,
      processStepsToElements,
      setSaved,
      toast,
    ],
  );
  // Function to trigger save with debounce
  const triggerSave = useCallback(
    (tempnodes?: any, tempedges?: any, continueEdit = false) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        saveLayout(tempnodes ?? nodes, tempedges ?? edges, continueEdit);
      }, 1000);
    },
    [nodes, edges, saveLayout],
  );

  useEffect(() => {
    if (nodes.length === 0 || !stepsLoadedRef.current || !selectedNode) return;
    const _nodes = nodes.map((node) => {
      return {
        ...node,
        data: {
          ...node.data,
          selectedNode: selectedNode,
        },
      };
    });
    setNodes(_nodes);
  }, [selectedNode, setNodes]);

  // Add node function
  const addNode = useCallback(
    (stepData: any, continueEdit = false) => {
      // Helper function to remove dummy node and edges
      const removeDummyNodeAndEdges = (nodesList: any[], edgesList: any[]) => {
        const filteredNodes = nodesList.filter(
          (node) => node.id !== "dummy-node",
        );
        const filteredEdges = edgesList.filter(
          (edge) =>
            edge.source !== "dummy-node" && edge.target !== "dummy-node",
        );
        return { filteredNodes, filteredEdges };
      };

      // If in edit mode, update the existing node
      if (mode === "edit" && editingStep && selectedNode) {
        const updatedNodes = nodes.map((node) =>
          node.id === selectedNode
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...stepData,
                  stepType: stepData.stepType || node.data.stepType,
                  label: formatStepLabel(
                    stepData.stepType || node.data.stepType,
                  ),
                },
              }
            : node,
        );
        const { nodes: layoutedNodes } = getLayoutedElements(
          updatedNodes,
          edges,
        );
        setNodes(layoutedNodes);
        setHasUnsavedChanges(true);
        setSaved(false);

        if (!continueEdit) {
          setIsSidePanelOpen(false);
        }
        setEditingStep(null);
        setCurrentStep("setup");

        // Trigger save after update
        triggerSave(layoutedNodes, edges, continueEdit);
        return;
      }

      // If editing an existing node (stepData.id exists and node is present), update it
      if (stepData.id && nodes.some((node) => node.id === stepData.id)) {
        const updatedNodes = nodes.map((node) =>
          node.id === stepData.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...stepData,
                  stepType: stepData.stepType || node.data.stepType,
                  label: formatStepLabel(
                    stepData.stepType || node.data.stepType,
                  ),
                },
              }
            : node,
        );

        // Remove dummy node and edges before layout
        const { filteredNodes, filteredEdges } = removeDummyNodeAndEdges(
          updatedNodes,
          edges,
        );

        const { nodes: layoutedNodes } = getLayoutedElements(
          filteredNodes,
          filteredEdges,
        );
        setNodes(layoutedNodes);
        setEdges(filteredEdges);
        setHasUnsavedChanges(true);
        setSaved(false);

        // Clear dummy node and edge state
        setDummyNode(null);
        setDummyEdge(null);

        if (!continueEdit) {
          setIsSidePanelOpen(false);
        }
        setEditingStep(null);
        setCurrentStep("setup");

        // Trigger save after update
        triggerSave(layoutedNodes, filteredEdges, continueEdit);
        return;
      }

      // If adding the very first node (empty board)
      if (
        nodes.length === 0 ||
        selectedNode === "empty-start" ||
        stepData.isFirstNode
      ) {
        const newNodeId = stepData.id || uuidv4();
        console.log("Adding first node with id:", newNodeId);
        const newNode = {
          id: newNodeId,
          type: "normal",
          data: {
            ...stepData,
            stepType: stepData.stepType,
            label: formatStepLabel(stepData.stepType),
          },
          position: { x: 0, y: 0 },
        };
        const filteredNodes = nodes.filter(
          (node) => node.id !== "empty-start" && node.id !== "dummy-node",
        );

        // Remove dummy edges
        const { filteredEdges } = removeDummyNodeAndEdges(nodes, edges);

        const { nodes: layoutedNodes } = getLayoutedElements(
          getNodesWithLeafStatus([...filteredNodes, newNode]),
          filteredEdges,
        );
        setNodes(layoutedNodes);
        setEdges(filteredEdges);

        setHasUnsavedChanges(true);
        setSaved(false);

        // Clear dummy node and edge state
        setDummyNode(null);
        setDummyEdge(null);

        if (!continueEdit) {
          setIsSidePanelOpen(false);
        }
        setEditingStep(null);
        setCurrentStep("setup");

        // Trigger save after adding first node
        triggerSave(layoutedNodes, filteredEdges, continueEdit);
        return;
      }
      // If adding a node between two nodes (pendingNodeData)
      if (pendingNodeData) {
        const newNodeId = stepData.id || uuidv4();
        const newNode = {
          id: newNodeId,
          type: "normal",
          data: {
            ...stepData,
            stepType: stepData.stepType,
            label: formatStepLabel(stepData.stepType),
          },
          position: { x: 0, y: 0 },
        };
        const updatedEdges = edges.filter(
          (edge) => edge.id !== pendingNodeData.edgeId,
        );
        const originalLinkInStore = stepLinks.find(
          (link) =>
            link.prev === pendingNodeData.sourceId &&
            link.next === pendingNodeData.targetId,
        );

        // Get delay and randomWindow from dummy edge if it exists, otherwise use nodeDelays
        const delay =
          dummyEdge && dummyEdge.length > 0
            ? dummyEdge[0].data?.delay || 0
            : nodeDelays[pendingNodeData.sourceId]?.delay || 0;

        const randomWindow =
          dummyEdge && dummyEdge.length > 0
            ? dummyEdge[0].data?.randomWindow || 0
            : 0;

        const newEdges = [
          {
            id: `e${pendingNodeData.sourceId}-${newNodeId}`,
            source: pendingNodeData.sourceId,
            target: newNodeId,
            type: "custom",
            data: {
              delay,
              randomWindow,
              ...(originalLinkInStore && {
                originalLinkIdToMutate: originalLinkInStore.id,
              }),
            },
          },
          {
            id: `e${newNodeId}-${pendingNodeData.targetId}`,
            source: newNodeId,
            target: pendingNodeData.targetId,
            type: "custom",
            data: { delay: 0, randomWindow: 0 },
          },
        ];

        // Remove dummy node and edges
        const { filteredNodes } = removeDummyNodeAndEdges(
          [...nodes, newNode],
          [...updatedEdges, ...newEdges],
        );
        const { filteredEdges } = removeDummyNodeAndEdges(nodes, [
          ...updatedEdges,
          ...newEdges,
        ]);

        const { nodes: layoutedNodes } = getLayoutedElements(
          getNodesWithLeafStatus(filteredNodes),
          filteredEdges,
        );
        setNodes(layoutedNodes);
        setEdges(filteredEdges);
        setPendingNodeData(null);
        setHasUnsavedChanges(true);
        setSaved(false);
        setAddingNodeBetween(false);
        // Clear dummy node and edge state
        setDummyNode(null);
        setDummyEdge(null);

        if (!continueEdit) {
          setIsSidePanelOpen(false);
        }
        setEditingStep(null);
        setCurrentStep("setup");

        // Trigger save after adding node between
        triggerSave(layoutedNodes, filteredEdges, continueEdit);
        return;
      }

      // Regular case: add node after selected node
      if (selectedNode && selectedNode !== "empty-start") {
        const newNodeId = stepData.id || uuidv4();
        const newNode = {
          id: newNodeId,
          type: "normal",
          data: {
            ...stepData,
            stepType: stepData.stepType,
            label: formatStepLabel(stepData.stepType),
          },
          position: { x: 0, y: 0 },
        };

        // Get delay and randomWindow from dummy edge if it exists, otherwise use nodeDelays
        const delay =
          dummyEdge && dummyEdge.length > 0
            ? dummyEdge[0].data?.delay || 0
            : nodeDelays[selectedNode]?.delay || 0;

        const randomWindow =
          dummyEdge && dummyEdge.length > 0
            ? dummyEdge[0].data?.randomWindow || 0
            : 0;

        const newEdge = {
          id: `e${selectedNode}-${newNodeId}`,
          source: selectedNode,
          target: newNodeId,
          type: "custom",
          data: { delay, randomWindow },
        };

        // Remove dummy node and edges before adding new node
        const { filteredNodes } = removeDummyNodeAndEdges(
          [...nodes, newNode],
          edges,
        );
        const { filteredEdges } = removeDummyNodeAndEdges(nodes, [
          ...edges,
          newEdge,
        ]);

        const { nodes: layoutedNodes } = getLayoutedElements(
          getNodesWithLeafStatus(filteredNodes),
          filteredEdges,
        );
        setNodes(layoutedNodes);
        setEdges(filteredEdges);
        setHasUnsavedChanges(true);
        setSaved(false);

        // Clear dummy node and edge state
        setDummyNode(null);
        setDummyEdge(null);

        if (!continueEdit) {
          setIsSidePanelOpen(false);
        }
        setEditingStep(null);
        setCurrentStep("setup");

        // Trigger save after adding regular node
        triggerSave(layoutedNodes, filteredEdges, continueEdit);
        return;
      }
    },
    [
      mode,
      editingStep,
      selectedNode,
      pendingNodeData,
      nodes,
      edges,
      getNodesWithLeafStatus,
      nodeDelays,
      stepLinks,
      setCurrentStep,
      setSaved,
      triggerSave,
      dummyEdge,
    ],
  );

  // Event handlers
  const onNodesDelete = useCallback(
    (deleted: any) => {
      setEdges(
        edges.filter(
          (edge) =>
            !deleted.some(
              (node: any) => node.id === edge.source || node.id === edge.target,
            ),
        ),
      );
    },
    [edges, setEdges],
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: any) => {
      if (addingNodeBetween) {
        setAddingNodeBetween(false);
      }
      console.log("Node clicked:", node);
      setEditingStep(null);
      setEditingStep(node.data);
      setMode("view");
      setIsSidePanelOpen(true);
      console.log(
        nodes?.length >= 1,
        selectedNode !== "empty-start",
        !dummyNode,
      );
      if (
        nodes?.length >= 1 &&
        (selectedNode !== "empty-start" || !dummyNode)
      ) {
        console.log("Clearing dummy edges");
        setDummyEdge(null);
        setDummyEdge(null);
        setSelectedNode(node.id);
      }
    },
    [
      setSelectedNode,
      setEditingStep,
      setMode,
      setIsSidePanelOpen,
      addingNodeBetween,
      nodes,
      selectedNode,
      dummyNode,
    ],
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: any) => {
      if (!addingNodeBetween) return;
      console.log("Edge clicked:", edge);
      event.stopPropagation();
      setSelectedEdge(edge.id);
      setSelectedNode(null);
      setEditingStep(null);
    },
    [setSelectedEdge, setSelectedNode, setEditingStep],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
    // Fit view on initial load with a slight delay to ensure nodes are rendered
    setTimeout(() => {
      instance.fitView({ padding: 0.2, maxZoom: 1.2 });
    }, 100);
  }, []);
  // Load campaign flow on mount
  useEffect(() => {
    const loadCampaignFlow = async () => {
      try {
        if (nodes.length > 0 || stepsLoadedRef.current) return;
        if (campaignId && !stepsLoadedRef.current) {
          try {
            const steps = await getCampaignFlow(
              typeof campaignId === "string" ? campaignId : campaignId[0],
            );
            console.log("Loaded campaign flow steps:", steps);
            stepsLoadedRef.current = true;
          } catch (error) {
            console.error("Failed to load campaign flow:", error);
            toast({
              title: "Error",
              description: "Failed to load campaign flow",
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        console.error("Error loading campaign flow:", error);
        toast({
          title: "Error",
          description: "Failed to load campaign flow",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadCampaignFlow();
  }, [currentTeamId, campaignId, getCampaignFlow, toast]);

  // Initialize nodes and edges from step data
  useEffect(() => {
    if (savedChanges) {
      const { nodes: processedNodes, edges: processedEdges } =
        processStepsToElements(stepData, stepLinks);

      if (processedNodes.length > 0) {
        // Filter out dummy node when processing steps
        const filteredNodes = processedNodes.filter(
          (node) => node.id !== "dummy-node",
        );
        const filteredEdges = processedEdges.filter(
          (edge) =>
            edge.source !== "dummy-node" && edge.target !== "dummy-node",
        );
        setNodes(filteredNodes);
        setEdges(filteredEdges);
        initializedRef.current = true;
        // Fit view after save changes re-init
        setTimeout(() => {
          reactFlowInstance.current?.fitView({ padding: 0.2, maxZoom: 1.2 });
        }, 150);
      }
      if (!addingNodeBetween) {
        console.log("Closing side panel after saveChanges re-init", mode);
        setIsSidePanelOpen(false);
      }
      setSavedChanges(false);
      return;
    }
    // Prevent re-initialization if already initialized and nodes exist
    if (initializedRef.current && nodes.length > 0) {
      return;
    }

    // If still loading, wait
    if (loading) {
      return;
    }

    if (saveBuffer?.nodes && saveBuffer?.edges) {
      // Filter out dummy node when restoring from save buffer
      const filteredNodes = saveBuffer.nodes.filter(
        (node) => node.id !== "dummy-node",
      );
      const filteredEdges = saveBuffer.edges.filter(
        (edge) => edge.source !== "dummy-node" && edge.target !== "dummy-node",
      );
      setNodes(filteredNodes);
      setEdges(filteredEdges);
      initializedRef.current = true;
      // Fit view after restoring from save buffer
      setTimeout(() => {
        reactFlowInstance.current?.fitView({ padding: 0.2, maxZoom: 1.2 });
      }, 150);
      return;
    }

    if (stepData && stepData.length > 0) {
      const { nodes: processedNodes, edges: processedEdges } =
        processStepsToElements(stepData, stepLinks);

      if (processedNodes.length > 0) {
        // Filter out dummy node when processing steps
        const filteredNodes = processedNodes.filter(
          (node) => node.id !== "dummy-node",
        );
        const filteredEdges = processedEdges.filter(
          (edge) =>
            edge.source !== "dummy-node" && edge.target !== "dummy-node",
        );
        setNodes(filteredNodes);
        setEdges(filteredEdges);
        initializedRef.current = true;
        // Fit view after nodes are loaded
        setTimeout(() => {
          reactFlowInstance.current?.fitView({ padding: 0.2, maxZoom: 1.2 });
        }, 150);
      }
    } else if (stepData && stepData.length === 0) {
      addDummyNode("empty-start");
      initializedRef.current = true;
    }
  }, [
    stepData,
    stepLinks,
    processStepsToElements,
    saveBuffer,
    loading,
    nodes.length,
  ]);
  // Auto-open sidebar for empty state
  useEffect(() => {
    if (loading) return;
    if (dummyNode) return;
    // Only open side panel if there are no steps AND no nodes have been rendered yet
    // This prevents reopening after saving the first node
    if (
      stepData &&
      stepData.length === 0 &&
      nodes.length === 0 &&
      !isSidePanelOpen
    ) {
      setSelectedNode("empty-start");
      setMode("add");
      setIsSidePanelOpen(true);
    }
  }, [
    stepData,
    isSidePanelOpen,
    setSelectedNode,
    setMode,
    loading,
    nodes.length,
    dummyNode,
  ]);

  useEffect(() => {
    if (!edges || edges.length === 0) return;

    if (selectedEdge) {
      setIsLinkSidePanelOpen(true);
      // Close step side panel when link panel opens
      console.log("Resetting savedChanges flag");
      if (!addingNodeBetween) {
        setIsSidePanelOpen(false);
      }
    }
  }, [selectedEdge]);

  useEffect(() => {
    if (selectedNode) {
      // Close link side panel when step panel opens
      setIsLinkSidePanelOpen(false);
    }
  }, [selectedNode]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative h-[calc(110vh-220px)]">
      {isSaving && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white px-3 py-1 rounded-md z-10">
          Saving layout...
        </div>
      )}
      {hasUnsavedChanges && !isSaving && (
        <div className="absolute top-2 right-2 bg-yellow-500 text-white px-3 py-1 rounded-md z-10">
          Unsaved changes
        </div>
      )}
      <LinkSidePanel
        isOpen={isLinkSidePanelOpen}
        onClose={() => {
          setIsLinkSidePanelOpen(false);
        }}
        nodes={nodes}
        edges={edges}
        teamId={currentTeamId ?? ""}
        campaignId={campaignId as string}
        setNodes={setNodes}
        setEdges={setEdges}
      />
      <NewStepSidePanel
        isOpen={isSidePanelOpen}
        isSavingNodes={isSaving}
        setSidePanelOpen={setIsSidePanelOpen}
        onClose={() => {
          setIsSidePanelOpen(false);
          setEditingStep(null);
          setMode("view");
        }}
        dummyNode={dummyNode}
        setDummyNode={setDummyNode}
        dummyEdge={dummyEdge}
        setDummyEdge={setDummyEdge}
        campaignId={campaignId as string}
        teamId={currentTeamId ?? ""}
        onAdd={addNode}
        editingStep={editingStep}
        selectedNode={selectedNode ?? ""}
        edges={edges}
        nodes={nodes}
        setNodes={setNodes}
        setEdges={setEdges}
        saveLayout={saveLayout}
        getNodesWithLeafStatus={getNodesWithLeafStatus}
      />

      <div className="w-full h-full border rounded-md relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          onInit={onInit}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          proOptions={{ hideAttribution: true }}
          className={theme === "dark" ? "dark-flow" : "light-flow"}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{
            type: "custom",
            style: { strokeWidth: 2 },
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          edgesFocusable={true}
          onNodeClick={onNodeClick}
          onEdgeDoubleClick={onEdgeClick}
          onEdgeClick={onEdgeClick}
          minZoom={0.5}
          maxZoom={1.5}
          nodeTypes={nodeTypes}
        >
          <InteractiveDotBackground theme={theme} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
};

export default FlowBoard;
