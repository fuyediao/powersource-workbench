/**
 * Ensure npm-preloaded editor vendors are marked ready.
 * Remote CDN fetches are not used — call `installEditorVendors()` at boot.
 */

/**
 * Whether the matching global from `installEditorVendors` is already on `window`.
 *
 * @param id - Script element id used by Aura loaders.
 * @returns True when the vendor global is present.
 */
function hasVendorGlobal(id: string): boolean {
    const w = window as unknown as Window & Record<string, unknown>;
    switch (id) {
        case "auraMermaidScript":
            return !!w.mermaid;
        case "auraHljsScript":
        case "auraHljsThirdScript":
            return !!w.hljs;
        case "auraKatexScript":
        case "auraKatexChemScript":
            return !!w.katex;
        case "auraEchartsScript":
            return !!w.echarts;
        case "auraFlowchartScript":
            return !!w.flowchart;
        case "auraGraphVizScript":
            return !!w.__AURA_GRAPHVIZ__;
        case "auraPlantumlScript":
            return !!w.__AURA_PLANTUML__;
        case "auraAbcjsScript":
            // Shared id for abcjs and smiles-drawer.
            return !!w.ABCJS || !!w.SmiDrawer;
        case "auraMarkerScript":
            return !!w.markmap;
        default:
            return false;
    }
}

/**
 * Insert a marker script tag so later ensure calls treat the vendor as loaded.
 *
 * @param id - Script element id.
 */
function markScriptLoaded(id: string): void {
    if (document.getElementById(id)) {
        return;
    }
    const marker = document.createElement("script");
    marker.id = id;
    document.head.appendChild(marker);
}

/**
 * Ensure a preloaded vendor is marked ready (no network / CDN).
 *
 * @param id - Script element id.
 * @returns Resolves when the vendor is available locally.
 */
export const addScript = (id: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        if (hasVendorGlobal(id) || document.getElementById(id)) {
            markScriptLoaded(id);
            resolve(true);
            return;
        }
        reject(
            new Error(
                `Editor vendor not preloaded: ${id}. Call installEditorVendors() first.`,
            ),
        );
    });
};
