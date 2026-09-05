const FEED_ORIGIN = "https://download.powersource.work";
const CHANNEL = "beta";

/**
 * Fetches the public installer manifest for one platform.
 * @param {string} platform Feed folder id (`windows`, `macos-m`, or `macos-i`).
 * @returns {Promise<{ok: boolean, version?: string, downloadUrl?: string} | null>}
 */
async function fetchManifest(platform) {
  try {
    const response = await fetch(
      `${FEED_ORIGIN}/${platform}/${CHANNEL}?format=json`,
    );
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Marks the card that matches this machine.
 * @returns {Promise<void>}
 */
async function markSuggestedCard() {
  const suggested = await detectSuggestedPlatform();
  if (!suggested) {
    return;
  }
  const card = document.querySelector(`[data-platform="${suggested}"]`);
  if (card instanceof HTMLElement) {
    card.dataset.suggested = "";
  }
}

/**
 * Resolves the installer platform for this browser, or "".
 * @returns {Promise<string>}
 */
async function detectSuggestedPlatform() {
  const ua = navigator.userAgent;
  const plat = navigator.platform || "";
  if (/Win/i.test(plat) || /Windows/i.test(ua)) {
    return "windows";
  }
  const isMac = /Mac/i.test(plat) || /Mac OS/i.test(ua);
  if (!isMac) {
    return "";
  }
  try {
    const uaData = navigator.userAgentData;
    if (uaData?.getHighEntropyValues) {
      const { architecture } = await uaData.getHighEntropyValues([
        "architecture",
      ]);
      if (architecture === "x86") {
        return "macos-i";
      }
    }
  } catch {
    // Browser withheld architecture; default to Apple silicon.
  }
  return "macos-m";
}

/**
 * Fills one card from the live feed.
 * @param {HTMLElement} card Platform card.
 * @returns {Promise<void>}
 */
async function hydrateCard(card) {
  const platform = card.dataset.platform;
  const meta = card.querySelector("[data-meta]");
  const link = card.querySelector("[data-link]");
  const soon = card.querySelector("[data-soon]");
  if (!platform || !(meta instanceof HTMLElement)) {
    return;
  }

  const manifest = await fetchManifest(platform);
  const ready = Boolean(manifest?.ok && manifest.downloadUrl);

  if (ready && link instanceof HTMLAnchorElement) {
    meta.textContent = manifest.version
      ? `Version ${manifest.version}`
      : "Ready";
    link.href = `${FEED_ORIGIN}/${platform}/${CHANNEL}`;
    link.hidden = false;
    if (soon instanceof HTMLElement) {
      soon.hidden = true;
    }
    return;
  }

  meta.textContent = "";
  if (link instanceof HTMLAnchorElement) {
    link.hidden = true;
  }
  if (soon instanceof HTMLElement) {
    soon.hidden = false;
  }
}

/**
 * Loads manifests and highlights the matching OS.
 * @returns {Promise<void>}
 */
async function init() {
  await Promise.all([
    markSuggestedCard(),
    ...[...document.querySelectorAll("[data-platform]")].map((card) =>
      card instanceof HTMLElement ? hydrateCard(card) : Promise.resolve(),
    ),
  ]);
}

void init();
