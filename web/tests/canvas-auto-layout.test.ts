import { expect, test } from "bun:test";

import { autoLayoutCanvasNodes, getCanvasLayoutBounds } from "../src/lib/canvas/canvas-auto-layout";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

function node(id: string, x: number, y: number, width = 200, height = 120, groupId?: string): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, position: { x, y }, width, height, metadata: groupId ? { groupId } : undefined };
}

test("lays out connected nodes from left to right without vertical overlap", () => {
    const nodes = [node("source", 800, 500), node("middle-a", 100, 100), node("middle-b", 120, 140), node("result", -200, 0)];
    const connections: CanvasConnection[] = [
        { id: "1", fromNodeId: "source", toNodeId: "middle-a" },
        { id: "2", fromNodeId: "source", toNodeId: "middle-b" },
        { id: "3", fromNodeId: "middle-a", toNodeId: "result" },
    ];
    const arranged = autoLayoutCanvasNodes(nodes, connections);
    const byId = new Map(arranged.map((item) => [item.id, item]));

    expect(byId.get("middle-a")!.position.x).toBeGreaterThan(byId.get("source")!.position.x + byId.get("source")!.width);
    expect(byId.get("result")!.position.x).toBeGreaterThan(byId.get("middle-a")!.position.x + byId.get("middle-a")!.width);
    expect(Math.abs(byId.get("middle-a")!.position.y - byId.get("middle-b")!.position.y)).toBeGreaterThanOrEqual(200);
});

test("moves a group and its children as one layout unit", () => {
    const group: CanvasNodeData = { id: "group", type: CanvasNodeType.Group, title: "group", position: { x: 400, y: 300 }, width: 500, height: 360 };
    const child = node("child", 450, 380, 160, 100, "group");
    const result = node("result", 0, 0);
    const arranged = autoLayoutCanvasNodes([child, group, result], [{ id: "1", fromNodeId: "child", toNodeId: "result" }]);
    const byId = new Map(arranged.map((item) => [item.id, item]));

    expect(byId.get("child")!.position.x - byId.get("group")!.position.x).toBe(50);
    expect(byId.get("child")!.position.y - byId.get("group")!.position.y).toBe(80);
    expect(byId.get("result")!.position.x).toBeGreaterThan(byId.get("group")!.position.x + byId.get("group")!.width);
});

test("packs disconnected nodes into a compact grid and reports the final bounds", () => {
    const arranged = autoLayoutCanvasNodes(
        Array.from({ length: 9 }, (_, index) => node(String(index), index * 4, index * 6)),
        [],
    );
    const uniqueX = new Set(arranged.map((item) => item.position.x));
    const uniqueY = new Set(arranged.map((item) => item.position.y));
    const bounds = getCanvasLayoutBounds(arranged);

    expect(uniqueX.size).toBe(3);
    expect(uniqueY.size).toBe(3);
    expect(bounds).toEqual({ left: 0, top: 0, right: 920, bottom: 520, width: 920, height: 520 });
});
