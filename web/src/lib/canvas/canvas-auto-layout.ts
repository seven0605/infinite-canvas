import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

const COLUMN_GAP = 160;
const ROW_GAP = 80;

type LayoutUnit = {
    id: string;
    nodeIds: string[];
    left: number;
    top: number;
    width: number;
    height: number;
};

export type CanvasLayoutBounds = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

function getUnitBounds(id: string, nodeIds: string[], nodeById: Map<string, CanvasNodeData>): LayoutUnit {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    nodeIds.forEach((nodeId) => {
        const node = nodeById.get(nodeId);
        if (!node) return;
        left = Math.min(left, node.position.x);
        top = Math.min(top, node.position.y);
        right = Math.max(right, node.position.x + Math.max(node.width, 1));
        bottom = Math.max(bottom, node.position.y + Math.max(node.height, 1));
    });

    return { id, nodeIds, left, top, width: right - left, height: bottom - top };
}

function buildLayoutUnits(nodes: CanvasNodeData[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const membersByGroup = new Map<string, string[]>();
    nodes.forEach((node) => {
        const groupId = node.metadata?.groupId;
        if (!groupId || !nodeById.has(groupId)) return;
        const members = membersByGroup.get(groupId) || [];
        members.push(node.id);
        membersByGroup.set(groupId, members);
    });

    const assigned = new Set<string>();
    const units: LayoutUnit[] = [];
    nodes
        .filter((node) => node.type === CanvasNodeType.Group)
        .forEach((node) => {
            const nodeIds = [node.id, ...(membersByGroup.get(node.id) || [])];
            nodeIds.forEach((nodeId) => assigned.add(nodeId));
            units.push(getUnitBounds(node.id, nodeIds, nodeById));
        });
    nodes.forEach((node) => {
        if (assigned.has(node.id)) return;
        assigned.add(node.id);
        units.push(getUnitBounds(node.id, [node.id], nodeById));
    });

    return { units, nodeById };
}

/**
 * Arranges connected nodes into left-to-right dependency columns. Groups move as
 * one unit, while disconnected nodes are packed into a compact grid to the right.
 */
export function autoLayoutCanvasNodes(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    if (nodes.length < 2) return nodes;

    const { units, nodeById } = buildLayoutUnits(nodes);
    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    const unitByNodeId = new Map<string, string>();
    units.forEach((unit) => unit.nodeIds.forEach((nodeId) => unitByNodeId.set(nodeId, unit.id)));

    const outgoing = new Map(units.map((unit) => [unit.id, new Set<string>()]));
    const incoming = new Map(units.map((unit) => [unit.id, new Set<string>()]));
    connections.forEach((connection) => {
        const sourceId = unitByNodeId.get(connection.fromNodeId);
        const targetId = unitByNodeId.get(connection.toNodeId);
        if (!sourceId || !targetId || sourceId === targetId || outgoing.get(sourceId)?.has(targetId)) return;
        outgoing.get(sourceId)?.add(targetId);
        incoming.get(targetId)?.add(sourceId);
    });

    const stableUnits = [...units].sort((a, b) => a.top - b.top || a.left - b.left);
    const connected = new Set(stableUnits.filter((unit) => (incoming.get(unit.id)?.size || 0) + (outgoing.get(unit.id)?.size || 0) > 0).map((unit) => unit.id));
    const indegree = new Map(stableUnits.map((unit) => [unit.id, incoming.get(unit.id)?.size || 0]));
    const rank = new Map(stableUnits.map((unit) => [unit.id, 0]));
    const queue = stableUnits.filter((unit) => connected.has(unit.id) && indegree.get(unit.id) === 0);
    const processed = new Set<string>();

    while (queue.length) {
        const unit = queue.shift()!;
        processed.add(unit.id);
        outgoing.get(unit.id)?.forEach((targetId) => {
            rank.set(targetId, Math.max(rank.get(targetId) || 0, (rank.get(unit.id) || 0) + 1));
            const nextIndegree = (indegree.get(targetId) || 0) - 1;
            indegree.set(targetId, nextIndegree);
            const target = unitById.get(targetId);
            if (nextIndegree === 0 && target) queue.push(target);
        });
    }

    // Cycles are uncommon on the canvas. Keep any cyclic units together in a
    // stable column instead of allowing them to block the rest of the layout.
    const maxProcessedRank = Math.max(0, ...[...processed].map((id) => rank.get(id) || 0));
    stableUnits.filter((unit) => connected.has(unit.id) && !processed.has(unit.id)).forEach((unit) => rank.set(unit.id, maxProcessedRank + 1));

    const maxConnectedRank = connected.size ? Math.max(0, ...[...connected].map((id) => rank.get(id) || 0)) : -1;
    const looseUnits = stableUnits.filter((unit) => !connected.has(unit.id));
    const looseRows = Math.max(1, Math.ceil(Math.sqrt(looseUnits.length)));
    looseUnits.forEach((unit, index) => rank.set(unit.id, maxConnectedRank + 1 + Math.floor(index / looseRows)));

    const columns = new Map<number, LayoutUnit[]>();
    stableUnits.forEach((unit) => {
        const columnRank = rank.get(unit.id) || 0;
        const column = columns.get(columnRank) || [];
        column.push(unit);
        columns.set(columnRank, column);
    });

    const sortedRanks = [...columns.keys()].sort((a, b) => a - b);
    const columnHeights = new Map(
        sortedRanks.map((columnRank) => {
            const column = columns.get(columnRank) || [];
            return [columnRank, column.reduce((sum, unit) => sum + unit.height, 0) + Math.max(0, column.length - 1) * ROW_GAP];
        }),
    );
    const layoutHeight = Math.max(0, ...columnHeights.values());
    const nextPositionById = new Map<string, { x: number; y: number }>();
    let x = 0;

    sortedRanks.forEach((columnRank) => {
        const column = columns.get(columnRank) || [];
        const columnWidth = Math.max(0, ...column.map((unit) => unit.width));
        let y = (layoutHeight - (columnHeights.get(columnRank) || 0)) / 2;
        column.forEach((unit) => {
            const dx = x - unit.left;
            const dy = y - unit.top;
            unit.nodeIds.forEach((nodeId) => {
                const node = nodeById.get(nodeId);
                if (node) nextPositionById.set(nodeId, { x: node.position.x + dx, y: node.position.y + dy });
            });
            y += unit.height + ROW_GAP;
        });
        x += columnWidth + COLUMN_GAP;
    });

    return nodes.map((node) => {
        const position = nextPositionById.get(node.id);
        return position ? { ...node, position } : node;
    });
}

export function getCanvasLayoutBounds(nodes: CanvasNodeData[]): CanvasLayoutBounds | null {
    if (!nodes.length) return null;
    const left = Math.min(...nodes.map((node) => node.position.x));
    const top = Math.min(...nodes.map((node) => node.position.y));
    const right = Math.max(...nodes.map((node) => node.position.x + node.width));
    const bottom = Math.max(...nodes.map((node) => node.position.y + node.height));
    return { left, top, right, bottom, width: Math.max(right - left, 1), height: Math.max(bottom - top, 1) };
}
