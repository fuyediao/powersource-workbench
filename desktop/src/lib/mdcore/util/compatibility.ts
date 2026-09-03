export const isSafari = () => {
    return navigator.userAgent.indexOf("Safari") > -1 && navigator.userAgent.indexOf("Chrome") === -1;
};

export const isFirefox = () => {
    return navigator.userAgent.toLowerCase().indexOf("firefox") > -1;
};

// Handle iPhone tap delay / double-tap requirement
export const getEventName = () => {
    if (navigator.userAgent.indexOf("iPhone") > -1) {
        return "touchstart";
    } else {
        return "click";
    }
};

// Distinguish ctrl vs meta on Mac
export const isCtrl = (event: KeyboardEvent) => {
    if (navigator.platform.toUpperCase().indexOf("MAC") >= 0) {
        // mac
        if (event.metaKey && !event.ctrlKey) {
            return true;
        }
        return false;
    } else {
        if (!event.metaKey && event.ctrlKey) {
            return true;
        }
        return false;
    }
};

// Display shortcuts for Mac and Windows
export const updateHotkeyTip = (hotkey: string) => {
    if (/Mac/.test(navigator.platform) || navigator.platform === "iPhone") {
        if (hotkey.indexOf("⇧") > -1 && isFirefox()) {
            // On Mac Firefox, after shift is pressed, key matches Windows
            hotkey = hotkey.replace(";", ":").replace("=", "+").replace("-", "_");
        }
    } else {
        if (hotkey.startsWith("⌘")) {
            hotkey = hotkey.replace("⌘", "⌘+");
        } else if (hotkey.startsWith("⌥") && hotkey.substr(1, 1) !== "⌘") {
            hotkey = hotkey.replace("⌥", "⌥+");
        } else {
            hotkey = hotkey.replace("⇧⌘", "⌘+⇧+").replace("⌥⌘", "⌥+⌘+");
        }
        hotkey = hotkey.replace("⌘", "Ctrl").replace("⇧", "Shift")
            .replace("⌥", "Alt");
        if (hotkey.indexOf("Shift") > -1) {
            hotkey = hotkey.replace(";", ":").replace("=", "+").replace("-", "_");
        }
    }
    return hotkey;
};

export const isChrome = () => {
    return /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
};
