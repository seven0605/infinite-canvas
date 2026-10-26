export function isApplePlatform() {
    if (typeof navigator === "undefined") return false;
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

export function isCanvasZoomWheel(event: Pick<WheelEvent, "ctrlKey" | "metaKey">) {
    return isApplePlatform() ? event.metaKey : event.ctrlKey;
}

export function canvasZoomModifierLabel() {
    return isApplePlatform() ? "Command" : "Ctrl";
}
