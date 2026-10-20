// The setup steps bar opens screens elsewhere on the dashboard with a window
// event: openSetup("floor-map") etc. A screen not on the page yet (the floor
// plan while the grid view shows) picks it up when it appears.
export type SetupTarget = "floor-map" | "draw-tables" | "bulk-tables" | "set-entrance" | "import-guests";

export function openSetup(target: SetupTarget) {
  (window as unknown as { __setupPending?: SetupTarget | null }).__setupPending = target;
  window.dispatchEvent(new CustomEvent("seating4u:open", { detail: target }));
}

// call from a screen: runs `fn` for its target (now, or if it was asked before the screen appeared)
export function onSetup(target: SetupTarget, fn: () => void): () => void {
  const w = window as unknown as { __setupPending?: SetupTarget | null };
  if (w.__setupPending === target) {
    w.__setupPending = null;
    setTimeout(fn, 50);
  }
  const h = (e: Event) => {
    if ((e as CustomEvent).detail === target) {
      w.__setupPending = null;
      fn();
    }
  };
  window.addEventListener("seating4u:open", h);
  return () => window.removeEventListener("seating4u:open", h);
}
