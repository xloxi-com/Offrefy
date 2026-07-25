/**
 * React Router injects route CSS with `document.head.appendChild`. In Shopify's
 * embedded iframe, `document.head` can be briefly null while React reconciles
 * `<html>/<head>`, which surfaces as:
 *   TypeError: Cannot read properties of null (reading 'appendChild')
 */

function recreateHead(doc: Document): HTMLHeadElement | null {
  const root = doc.documentElement;
  if (!root || root.nodeName !== "HTML") return null;
  const head = doc.createElement("head");
  root.insertBefore(head, root.firstChild);
  return head;
}

export function ensureDocumentHead(): HTMLHeadElement | null {
  if (typeof document === "undefined") return null;
  return document.head ?? recreateHead(document);
}

/**
 * Patch `Document.prototype.head` so RR/Vite CSS injection never sees null.
 * Idempotent; safe to call from entry.client before hydrate.
 */
export function installDocumentHeadGuard(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __offrefyDocHeadGuard?: boolean };
  if (w.__offrefyDocHeadGuard) return;
  w.__offrefyDocHeadGuard = true;

  try {
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, "head");
    if (!desc?.get) {
      ensureDocumentHead();
      return;
    }

    Object.defineProperty(Document.prototype, "head", {
      configurable: true,
      enumerable: desc.enumerable ?? false,
      get(this: Document) {
        const current = desc.get!.call(this) as HTMLHeadElement | null;
        if (current) return current;
        return recreateHead(this);
      },
    });
  } catch {
    ensureDocumentHead();
  }
}
