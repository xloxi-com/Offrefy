/** In-process caches for Admin GraphQL data that rarely changes within a warm instance. */

const shopGidCache = new Map<string, { gid: string; expiresAt: number }>();
const collectionProductsCache = new Map<
  string,
  { ids: string[]; expiresAt: number }
>();

const SHOP_GID_TTL_MS = 60 * 60 * 1000;
const COLLECTION_TTL_MS = 5 * 60 * 1000;

export function getCachedShopGid(shop: string): string | null {
  const hit = shopGidCache.get(shop);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    shopGidCache.delete(shop);
    return null;
  }
  return hit.gid;
}

export function setCachedShopGid(shop: string, gid: string): void {
  shopGidCache.set(shop, {
    gid,
    expiresAt: Date.now() + SHOP_GID_TTL_MS,
  });
}

export function getCachedCollectionProductIds(
  shop: string,
  collectionGid: string,
): string[] | null {
  const key = `${shop}\0${collectionGid}`;
  const hit = collectionProductsCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    collectionProductsCache.delete(key);
    return null;
  }
  return hit.ids;
}

export function setCachedCollectionProductIds(
  shop: string,
  collectionGid: string,
  ids: string[],
): void {
  const key = `${shop}\0${collectionGid}`;
  collectionProductsCache.set(key, {
    ids,
    expiresAt: Date.now() + COLLECTION_TTL_MS,
  });
}

export function invalidateCollectionProductCache(shop: string): void {
  const prefix = `${shop}\0`;
  for (const key of collectionProductsCache.keys()) {
    if (key.startsWith(prefix)) collectionProductsCache.delete(key);
  }
}
