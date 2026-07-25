import { ensureDocumentHead } from "./documentHeadGuard.client";

/** Warm the editor JS chunk (hover / focus on Offers — not on first paint). */
export function preloadVolumeDiscountEditor(): void {
  if (typeof document === "undefined") return;
  if (!ensureDocumentHead()) return;

  void import("../components/VolumeDiscountCreateView").catch(() => {
    /* Prefetch is best-effort; never surface as an Application Error. */
  });
}
