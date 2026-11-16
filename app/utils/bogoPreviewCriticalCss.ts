/**
 * Minimal BOGO layout for admin Product Page Preview.
 * No Vite `?raw` — safe for SSR. Full sheet loads client-side.
 */
export const BOGO_PREVIEW_CRITICAL_CSS = `
[data-offrefy-root].offrefy-bogo-host{display:block;width:100%;box-sizing:border-box;margin:0;padding:0;background:transparent!important;border:0!important;box-shadow:none!important}
[data-offrefy-root] .offrefy-bogo{--ob-accent:#111827;--ob-ink:#111827;--ob-muted:#6b7280;--ob-line:#e5e7eb;--ob-soft:#f3f4f6;--ob-panel:#fff;--ob-buy-w:132px;--ob-get-w:132px;--ob-op-w:28px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ob-ink);background:var(--ob-panel);border:1px solid var(--ob-line);border-radius:14px;padding:14px 14px 16px;box-sizing:border-box}
[data-offrefy-root] .offrefy-bogo *,[data-offrefy-root] .offrefy-bogo *::before,[data-offrefy-root] .offrefy-bogo *::after{box-sizing:border-box}
[data-offrefy-root] .offrefy-bogo__head{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}
[data-offrefy-root] .offrefy-bogo__title{margin:0;font-size:1.05rem;font-weight:700;line-height:1.25}
[data-offrefy-root] .offrefy-bogo__sub{margin:0;font-size:.82rem;color:var(--ob-muted);line-height:1.35}
[data-offrefy-root] .offrefy-bogo__badge{display:inline-flex;align-items:center;align-self:flex-start;padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700;background:var(--ob-soft);color:var(--ob-ink)}
[data-offrefy-root] .offrefy-bogo__equation{display:grid;grid-template-columns:minmax(0,var(--ob-buy-w)) var(--ob-op-w) minmax(0,1fr) var(--ob-op-w) minmax(0,var(--ob-get-w));align-items:start;gap:8px;width:100%}
[data-offrefy-root] .offrefy-bogo__tile{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px;border:1px solid var(--ob-line);border-radius:12px;background:#fff}
[data-offrefy-root] .offrefy-bogo__tile-label{font-size:.68rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ob-muted)}
[data-offrefy-root] .offrefy-bogo__media{position:relative;display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:1;max-height:120px;overflow:hidden;border-radius:10px;background:var(--ob-soft)}
[data-offrefy-root] .offrefy-bogo__media img,[data-offrefy-root] .offrefy-bogo__img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}
[data-offrefy-root] .offrefy-bogo__name{margin:0;font-size:.82rem;font-weight:600;line-height:1.3}
[data-offrefy-root] .offrefy-bogo__price,[data-offrefy-root] .offrefy-bogo__qty{margin:0;font-size:.78rem;color:var(--ob-muted)}
[data-offrefy-root] .offrefy-bogo__op{display:flex;align-items:center;justify-content:center;align-self:center;width:var(--ob-op-w);height:var(--ob-op-w);border-radius:999px;background:var(--ob-soft);color:var(--ob-ink)}
[data-offrefy-root] .offrefy-bogo__choices-wrap{position:relative;min-width:0}
[data-offrefy-root] .offrefy-bogo__choices{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:2px;-webkit-overflow-scrolling:touch}
[data-offrefy-root] .offrefy-bogo__choice{position:relative;flex:0 0 auto;width:min(132px,100%);scroll-snap-align:start;cursor:pointer;border:1px solid var(--ob-line);border-radius:12px;padding:8px;background:#fff}
[data-offrefy-root] .offrefy-bogo__choice.is-selected{border-color:var(--ob-accent);box-shadow:0 0 0 1px var(--ob-accent)}
[data-offrefy-root] .offrefy-bogo__choice-check{position:absolute;top:6px;right:6px;width:18px;height:18px;border-radius:999px;color:#fff;background:var(--ob-accent);display:none;align-items:center;justify-content:center}
[data-offrefy-root] .offrefy-bogo__choice.is-selected .offrefy-bogo__choice-check{display:inline-flex}
[data-offrefy-root] .offrefy-bogo__cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:12px;padding:10px 14px;border:0;border-radius:10px;background:var(--ob-accent);color:#fff;font-size:.9rem;font-weight:700;cursor:pointer}
[data-offrefy-root] .offrefy-bogo__foot{margin:8px 0 0;font-size:.75rem;color:var(--ob-muted);text-align:center}
[data-offrefy-root] .offrefy-bogo__ribbon{position:absolute;top:8px;left:8px;z-index:2;padding:2px 7px;border-radius:999px;font-size:.65rem;font-weight:700;background:#111827;color:#fff}
@media (max-width:520px){
  [data-offrefy-root] .offrefy-bogo__equation{grid-template-columns:1fr;gap:10px}
  [data-offrefy-root] .offrefy-bogo__op{display:none}
}
`;
