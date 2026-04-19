import {
  NODE_DIMENSIONS,
  INTERNAL_STEP_TYPES,
  INTERNAL_TO_DISPLAY_MAPPING,
  DISPLAY_TO_INTERNAL_MAPPING,
  InternalStepType,
  DisplayStepType,
} from "./constants";
import dagre from "dagre";

export const createEmptyStartNode = () => ({
  id: "empty-start",
  type: "normal",
  position: { x: 0, y: 0 },
  data: {
    enabled: true,
    label: "",
    stepType: "" as InternalStepType,
  },
  width: NODE_DIMENSIONS.width,
  height: NODE_DIMENSIONS.height,
});

export function checkNodesOrEdgeChange(
  bufferNodes: any[],
  bufferEdges: any[],
  nodes: any[],
  edges: any[]
) {
  if (bufferNodes && bufferEdges) {
    // If we have a save buffer, check if the current state matches it
    const normalizeNodes = (nodes: any[]) =>
      nodes.map(
        ({
          width,
          height,
          position,
          ...rest
        }: {
          width?: number;
          height?: number;
          position?: any;
          [key: string]: any;
        }) => rest
      );
    const bufferNodesChange =
      JSON.stringify(normalizeNodes(bufferNodes)) !==
      JSON.stringify(normalizeNodes(nodes));
    const bufferEdgesChange =
      JSON.stringify(bufferEdges) !== JSON.stringify(edges);
    return { bufferNodesChange, bufferEdgesChange };
  }
}
export const getLayoutedElements = (nodes: any[], edges: any[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: "TB",
    ranksep: 100,
    nodesep: 100,
    marginx: 100,
    marginy: 100,
    width: NODE_DIMENSIONS.width,
    height: NODE_DIMENSIONS.height,
  });

  // Create a map to track original x positions of nodes
  const originalXPositions = new Map(
    nodes.map((node) => [node.id, node?.position?.x])
  );

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: NODE_DIMENSIONS.width,
      height: NODE_DIMENSIONS.height,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  // First pass: Get initial positions from dagre
  const initialLayoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    let xPos = nodeWithPosition?.x - NODE_DIMENSIONS.width / 2;
    let yPos = nodeWithPosition?.y - NODE_DIMENSIONS.height * 2;

    return {
      ...node,
      position: { x: xPos, y: yPos },
      width: NODE_DIMENSIONS.width,
      height: NODE_DIMENSIONS.height,
    };
  });

  // Fix inconsistent Y-level spacing
  const CONSISTENT_Y_SPACING = 180; // Set consistent spacing between levels

  // Group nodes by their current Y positions and create consistent spacing
  const yPositions = Array.from(
    new Set(initialLayoutedNodes.map((node) => node.position?.y))
  ).sort((a, b) => a - b);

  // Create a mapping from old Y positions to new consistent Y positions
  const yMapping = new Map();
  yPositions.forEach((oldY, index) => {
    yMapping.set(oldY, index * CONSISTENT_Y_SPACING);
  });

  // Map to store nodes at each y-level for x positioning
  const yLevelNodes: { [key: number]: number } = {};

  // Apply consistent Y positions and handle x positioning
  const layoutedNodes = initialLayoutedNodes.map((node) => {
    let xPos = node.position?.x;
    const newYPos = yMapping.get(node?.position?.y);

    // Check if this is a leaf node (no outgoing edges)
    const isLeafNode = !edges.some((edge) => edge.source === node.id);

    // If this y-level already has nodes, offset x position slightly
    if (yLevelNodes[newYPos]) {
      xPos += yLevelNodes[newYPos] * 0.01;
      yLevelNodes[newYPos]++;
    } else {
      yLevelNodes[newYPos] = 1;
    }

    // For leaf nodes or nodes that were previously leaf nodes, maintain their x position
    if (isLeafNode || originalXPositions.get(node.id) === node?.position?.x) {
      xPos = node?.position?.x; // Keep original x position
    }

    return {
      ...node,
      position: { x: xPos, y: newYPos },
      width: NODE_DIMENSIONS.width,
      height: NODE_DIMENSIONS.height,
    };
  });

  // Log the Y-level mapping for debugging

  return { nodes: layoutedNodes, edges };
};

export function getStepTypeName(stepType: InternalStepType): string {
  return INTERNAL_TO_DISPLAY_MAPPING[stepType] || stepType;
}
