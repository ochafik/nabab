/**
 * MCP App lifecycle: connect to the host (Claude) as an MCP App, load
 * networks from tool input/result streaming, apply host theming, and
 * restore state from localStorage.
 */
import { S } from './state.js';
import { rerender } from './render-bus.js';
import { loadNetwork, loadStateFromLocalStorage } from './loading.js';

export async function initMcpApp(): Promise<void> {
  const { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } =
    await import('@modelcontextprotocol/ext-apps');

  // Hide standalone-only toolbar items
  for (const id of ['btn-load-example', 'example-select', 'btn-export', 'btn-layout', 'btn-fit']) {
    const el = document.getElementById(id);
    if (el) (el.closest<HTMLElement>('.export-wrapper') ?? el).style.display = 'none';
  }
  // Hide hint text
  for (const el of document.querySelectorAll<HTMLElement>('.hint')) el.style.display = 'none';

  const app = new App({ name: 'Nabab Network Viewer', version: '1.0.0' });

  /** Try to load a network from tool args (input or partial input). */
  function tryLoadFromArgs(args: Record<string, unknown> | undefined, partial = false): void {
    if (!args) return;
    const source = args.source as string | undefined;
    if (!source) return;

    // For URLs, we can't fetch client-side — wait for the server's tool result
    if (/^https?:\/\/|^file:\/\//.test(source)) {
      if (!partial) {
        document.getElementById('network-name')!.textContent = 'Loading from URL…';
      }
      return;
    }

    // Inline content: try to parse (may be incomplete during streaming)
    try {
      loadNetwork(source, true);
      if (!partial && args.evidence && typeof args.evidence === 'object') {
        S.hardEvidence = new Map(Object.entries(args.evidence as Record<string, string>));
        for (const k of S.hardEvidence.keys()) S.observationEnabled.add(k);
        rerender();
      }
    } catch {
      // Incomplete XML during streaming — show what we have so far
      if (partial) {
        document.getElementById('network-name')!.textContent = 'Streaming network…';
      }
    }
  }

  app.ontoolinputpartial = (params) => {
    tryLoadFromArgs(params.arguments as Record<string, unknown> | undefined, true);
  };

  app.ontoolinput = (params) => {
    tryLoadFromArgs(params.arguments as Record<string, unknown> | undefined, false);
  };

  app.ontoolresult = (result) => {
    const data = result.structuredContent as { source?: string; evidence?: Record<string, string> } | undefined;
    if (data?.source) {
      loadNetwork(data.source, true);
      if (data.evidence) {
        S.hardEvidence = new Map(Object.entries(data.evidence));
        for (const k of S.hardEvidence.keys()) S.observationEnabled.add(k);
        rerender();
      }
    }
  };

  app.onhostcontextchanged = (ctx) => {
    if (ctx.theme) applyDocumentTheme(ctx.theme);
    if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
    if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
    if (ctx.safeAreaInsets) {
      const { top, right, bottom, left } = ctx.safeAreaInsets;
      document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
    }
  };

  app.onerror = console.error;
  app.onteardown = async () => ({});

  await app.connect();
  const ctx = app.getHostContext();
  if (ctx) app.onhostcontextchanged?.(ctx);

  // Try restoring from localStorage
  if (!loadStateFromLocalStorage()) {
    document.getElementById('network-name')!.textContent = 'Waiting for network…';
  }
}
