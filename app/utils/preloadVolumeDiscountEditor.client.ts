/** Warm the editor JS chunk while the merchant is on the Offers list. */
export function preloadVolumeDiscountEditor(): void {
  void import("../components/VolumeDiscountCreateView");
}
