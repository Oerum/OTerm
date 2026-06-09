import type { GraphCommit } from "../types/branchManager";

/** VS Code Git Graph–style lane palette */
const GRAPH_LANE_COLORS = [
  "#3794ff",
  "#f0883e",
  "#3fb950",
  "#a371f7",
  "#db6d28",
  "#56d4dd",
  "#f778ba",
  "#d29922",
];

const GRAPH_ROW_HEIGHT = 36;
const GRAPH_LANE_WIDTH = 14;
const GRAPH_NODE_R = 4;
const GRAPH_HEAD_R = 5;

/** Snap to half-pixels so strokes anti-alias cleanly. */
function snap(n: number): number {
  return Math.round(n * 2) / 2;
}

function fmt(n: number): string {
  const v = snap(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export type GraphPath = {
  d: string;
  color: string;
};

export type GraphRowLayout = {
  hash: string;
  nodeLane: number;
  laneCount: number;
  color: string;
  nodeX: number;
  nodeY: number;
  paths: GraphPath[];
};

export type GraphLayout = {
  rows: GraphRowLayout[];
  rowHeight: number;
  laneWidth: number;
  totalHeight: number;
  totalWidth: number;
};

type LaneState = string | null;

function laneColor(lane: number): string {
  return GRAPH_LANE_COLORS[lane % GRAPH_LANE_COLORS.length];
}

function laneX(lane: number): number {
  return lane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2;
}

function nodeCenter(row: number, lane: number): { x: number; y: number } {
  return {
    x: laneX(lane),
    y: row * GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2,
  };
}

function rowTop(row: number): number {
  return row * GRAPH_ROW_HEIGHT;
}

function rowBottom(row: number): number {
  return (row + 1) * GRAPH_ROW_HEIGHT;
}

export function buildGraphLayout(commits: Pick<GraphCommit, "hash" | "parents">[]): GraphLayout {
  if (commits.length === 0) {
    return {
      rows: [],
      rowHeight: GRAPH_ROW_HEIGHT,
      laneWidth: GRAPH_LANE_WIDTH,
      totalHeight: 0,
      totalWidth: 0,
    };
  }

  const loaded = new Set(commits.map((commit) => commit.hash));
  let lanes: LaneState[] = [];
  const rows: GraphRowLayout[] = [];
  let maxLanes = 0;

  for (let rowIdx = 0; rowIdx < commits.length; rowIdx++) {
    const commit = commits[rowIdx];
    const paths: GraphPath[] = [];

    let nodeLane = lanes.indexOf(commit.hash);
    if (nodeLane === -1) {
      nodeLane = lanes.length;
      lanes.push(commit.hash);
    }

    const nodeColor = laneColor(nodeLane);
    const { x: nodeX, y: nodeY } = nodeCenter(rowIdx, nodeLane);

    const parents = commit.parents;
    const newLanes: LaneState[] = [];

    for (let lane = 0; lane < nodeLane; lane++) {
      newLanes.push(lanes[lane]);
    }

    newLanes.push(parents[0] ?? null);

    for (let lane = nodeLane + 1; lane < lanes.length; lane++) {
      newLanes.push(lanes[lane]);
    }

    for (let p = 1; p < parents.length; p++) {
      newLanes.push(parents[p]);
    }

    while (newLanes.length > 0 && newLanes[newLanes.length - 1] === null) {
      newLanes.pop();
    }

    // Passive lanes: full-height verticals through this row (VS Code style).
    for (let lane = 0; lane < lanes.length; lane++) {
      if (lane === nodeLane) continue;
      paths.push({
        d: verticalLine(laneX(lane), rowTop(rowIdx), rowBottom(rowIdx)),
        color: laneColor(lane),
      });
    }

    // Commit lane: one continuous path per row (avoids double-stroked junctions).
    const top = rowTop(rowIdx);
    const bottom = rowBottom(rowIdx);
    let parentLane = nodeLane;
    if (parents[0]) {
      const idx = newLanes.indexOf(parents[0]);
      if (idx !== -1) parentLane = idx;
    }
    const nextHash = commits[rowIdx + 1]?.hash;
    const hasParent = Boolean(parents[0] && nextHash === parents[0]);

    if (hasParent && parentLane === nodeLane) {
      paths.push({ d: verticalLine(nodeX, top, bottom), color: nodeColor });
    } else if (hasParent) {
      const parentX = laneX(parentLane);
      paths.push({
        d: commitLanePath(nodeX, nodeY, top, bottom, parentX),
        color: nodeColor,
      });
    } else {
      paths.push({ d: verticalLine(nodeX, top, nodeY), color: nodeColor });
    }

    for (let p = 1; p < parents.length; p++) {
      const parentHash = parents[p];
      if (!parentHash || !loaded.has(parentHash) || rowIdx + 1 >= commits.length) continue;
      const mergeLane = newLanes.indexOf(parentHash);
      if (mergeLane === -1) continue;
      const mergeX = laneX(mergeLane);
      paths.push({
        d: branchPath(nodeX, nodeY, mergeX, bottom),
        color: laneColor(mergeLane),
      });
    }

    const laneCount = Math.max(lanes.length, newLanes.length, nodeLane + 1);
    maxLanes = Math.max(maxLanes, laneCount);

    rows.push({
      hash: commit.hash,
      nodeLane,
      laneCount,
      color: nodeColor,
      nodeX,
      nodeY,
      paths,
    });

    lanes = newLanes;
  }

  return {
    rows,
    rowHeight: GRAPH_ROW_HEIGHT,
    laneWidth: GRAPH_LANE_WIDTH,
    totalHeight: commits.length * GRAPH_ROW_HEIGHT,
    totalWidth: Math.max(maxLanes, 1) * GRAPH_LANE_WIDTH,
  };
}

/** Vertical segment */
function verticalLine(x: number, y1: number, y2: number): string {
  return `M ${fmt(x)} ${fmt(y1)} V ${fmt(y2)}`;
}

/** Top → dot → smooth cubic bend → row bottom on another lane (single path). */
function commitLanePath(
  nodeX: number,
  nodeY: number,
  top: number,
  bottom: number,
  targetX: number,
): string {
  if (Math.abs(nodeX - targetX) < 0.01) {
    return verticalLine(nodeX, top, bottom);
  }
  const mid = snap(nodeY + (bottom - nodeY) * 0.5);
  return [
    `M ${fmt(nodeX)} ${fmt(top)}`,
    `V ${fmt(nodeY)}`,
    `C ${fmt(nodeX)} ${fmt(mid)}, ${fmt(targetX)} ${fmt(mid)}, ${fmt(targetX)} ${fmt(bottom)}`,
  ].join(" ");
}

/** Dot → smooth cubic bend → row bottom (merge leg). */
function branchPath(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(x1 - x2) < 0.01) {
    return verticalLine(x1, y1, y2);
  }
  const mid = snap(y1 + (y2 - y1) * 0.5);
  return `M ${fmt(x1)} ${fmt(y1)} C ${fmt(x1)} ${fmt(mid)}, ${fmt(x2)} ${fmt(mid)}, ${fmt(x2)} ${fmt(y2)}`;
}

export function parseDecorations(raw: string): string[] {
  return raw
    .replace(/[()]/g, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function isHeadCommit(decorations: string): boolean {
  return decorations.includes("HEAD");
}

export function primaryBranchLabel(decorations: string): string | null {
  const parts = parseDecorations(decorations);
  const head = parts.find((part) => part.startsWith("HEAD -> "));
  if (head) return head.replace("HEAD -> ", "").trim();
  return parts[0] ?? null;
}
