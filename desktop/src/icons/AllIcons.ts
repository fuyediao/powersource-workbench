import { createElement, useId, type ReactElement, type SVGProps } from 'react';
type IconProps = SVGProps<SVGSVGElement>;
const baseProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};
/** @returns A sort / reorder list icon. */
export function SortIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M4 6h10M4 12h16M4 18h7"
  }), createElement("path", {
    d: "m17 15 3 3 3-3M20 10v8"
  }));
}
/** @returns A six-dot drag handle icon. */
export function GripIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "9",
    cy: "6",
    r: "1.2",
    fill: "currentColor",
    stroke: "none"
  }), createElement("circle", {
    cx: "15",
    cy: "6",
    r: "1.2",
    fill: "currentColor",
    stroke: "none"
  }), createElement("circle", {
    cx: "9",
    cy: "12",
    r: "1.2",
    fill: "currentColor",
    stroke: "none"
  }), createElement("circle", {
    cx: "15",
    cy: "12",
    r: "1.2",
    fill: "currentColor",
    stroke: "none"
  }), createElement("circle", {
    cx: "9",
    cy: "18",
    r: "1.2",
    fill: "currentColor",
    stroke: "none"
  }), createElement("circle", {
    cx: "15",
    cy: "18",
    r: "1.2",
    fill: "currentColor",
    stroke: "none"
  }));
}
/** @returns A search / magnifying-glass icon. */
export function SearchIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), createElement("path", {
    d: "m21 21-4.3-4.3"
  }));
}
/** @returns A funnel-shaped filter icon. */
export function FilterIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z"
  }));
}
/** @returns A sun icon. */
export function SunIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), createElement("path", {
    d: "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
  }));
}
/** @returns A moon icon. */
export function MoonIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z"
  }));
}
/** @returns A grid icon. */
export function GridIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("rect", {
    x: "4",
    y: "4",
    width: "6",
    height: "6",
    rx: "1"
  }), createElement("rect", {
    x: "14",
    y: "4",
    width: "6",
    height: "6",
    rx: "1"
  }), createElement("rect", {
    x: "4",
    y: "14",
    width: "6",
    height: "6",
    rx: "1"
  }), createElement("rect", {
    x: "14",
    y: "14",
    width: "6",
    height: "6",
    rx: "1"
  }));
}
/** @returns A code icon. */
export function CodeIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14"
  }));
}
/** @returns A play icon. */
export function PlayIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m9 7 8 5-8 5V7Z"
  }));
}
/** @returns A tool icon. */
export function ToolIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-3 3-3-3 3-3Z"
  }));
}
/** @returns A palette / design icon. */
export function DesignIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), createElement("path", {
    d: "M12 3v6M12 15v6M3 12h6M15 12h6"
  }));
}
/** @returns A sparkles / AI icon. */
export function AiIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m12 3-1.6 4.9a2 2 0 0 1-1.3 1.3L4.2 11l4.9 1.6a2 2 0 0 1 1.3 1.3L12 18.8l1.6-4.9a2 2 0 0 1 1.3-1.3L20 11l-4.9-1.6a2 2 0 0 1-1.3-1.3L12 3Z"
  }), createElement("path", {
    d: "M5 3v3M3.5 4.5h3"
  }), createElement("path", {
    d: "M19 17.5v3M17.5 19h3"
  }));
}
/**
 * Italic AI wordmark from the repo-root `ai.svg` mark (Home / Spotlight Ask search).
 * @param props - SVG props.
 * @returns Filled AI wordmark.
 */
export function AskAiMarkIcon(props: IconProps) {
  return createElement("svg", {
    viewBox: "-4 -4 24.77 24.2",
    fill: "currentColor",
    "aria-hidden": true,
    ...props
  }, createElement("path", {
    d: "M6.16 0h2.29s8.32 16.2 8.32 16.2h-2.35L6.16 0Z"
  }), createElement("path", {
    fillRule: "evenodd",
    d: "M2.92 0h1.08s8.32 16.2 8.32 16.2h-2.36l-2.52-4.98H3.18l-.83 4.98H0S2.92 0 2.92 0ZM3.36 9.39h3.14s-2.45-4.81-2.45-4.81l-.69 4.81Z"
  }));
}
/** @returns A folded map icon for Map function tiles. */
export function MapIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("polygon", {
    points: "3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"
  }), createElement("line", {
    x1: "9",
    y1: "3",
    x2: "9",
    y2: "18"
  }), createElement("line", {
    x1: "15",
    y1: "6",
    x2: "15",
    y2: "21"
  }));
}
/** @returns A four-tile admin grid icon. */
export function AdminAppsIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("rect", {
    width: "7",
    height: "7",
    x: "3",
    y: "3",
    rx: "1"
  }), createElement("rect", {
    width: "7",
    height: "7",
    x: "14",
    y: "3",
    rx: "1"
  }), createElement("rect", {
    width: "7",
    height: "7",
    x: "14",
    y: "14",
    rx: "1"
  }), createElement("rect", {
    width: "7",
    height: "7",
    x: "3",
    y: "14",
    rx: "1"
  }));
}
/** @returns A document icon for Univer Docs. */
export function UniverDocsIcon(props: IconProps) {
    return createElement("svg", {
        ...baseProps,
        ...props
    }, createElement("path", {
        d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
    }), createElement("polyline", {
        points: "14 2 14 8 20 8"
    }), createElement("path", {
        d: "M8 13h8M8 17h5"
    }));
}
/** @returns A spreadsheet grid icon for Univer Sheets. */
export function UniverSheetsIcon(props: IconProps) {
    return createElement("svg", {
        ...baseProps,
        ...props
    }, createElement("rect", {
        x: "3",
        y: "3",
        width: "18",
        height: "18",
        rx: "2"
    }), createElement("path", {
        d: "M3 9h18M3 15h18M9 3v18M15 3v18"
    }));
}
/** @returns A presentation / slides icon for Univer Slides. */
export function UniverSlidesIcon(props: IconProps) {
    return createElement("svg", {
        ...baseProps,
        ...props
    }, createElement("rect", {
        x: "2",
        y: "3",
        width: "20",
        height: "14",
        rx: "2"
    }), createElement("path", {
        d: "M12 17v4M8 21h8"
    }));
}
/** @returns A Markdown document icon (file with MD mark) for the editor Function tile. */
export function AuraMarkdownIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
  }), createElement("polyline", {
    points: "14 2 14 8 20 8"
  }), createElement("path", {
    // MD letters: M (peaks) + D (rounded stem)
    d: "M8 17V13l2 2.5L12 13v4M16 13h-2v4h2c.6 0 1-.4 1-1v-2c0-.6-.4-1-1-1z"
  }));
}
/** @returns A language icon. */
export function LanguageIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), createElement("path", {
    d: "M3 12h18M12 3c3 3.3 3 14.7 0 18M12 3c-3 3.3-3 14.7 0 18"
  }));
}
/** @returns A page / document layout icon. */
export function PageIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("rect", {
    x: "4",
    y: "3",
    width: "16",
    height: "18",
    rx: "2"
  }), createElement("path", {
    d: "M8 8h8M8 12h8M8 16h5"
  }));
}
/** @returns A plus icon. */
export function PlusIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M12 5v14M5 12h14"
  }));
}
/** @returns A folder icon. */
export function FolderIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
  }));
}
/** @returns An image-plus (add gallery image) icon. */
export function ImagePlusIcon(props: IconProps) {
    return createElement("svg", {
        ...baseProps,
        ...props
    }, createElement("path", {
        d: "M16 5h6"
    }), createElement("path", {
        d: "M19 2v6"
    }), createElement("path", {
        d: "M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"
    }), createElement("path", {
        d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
    }), createElement("circle", {
        cx: "9",
        cy: "9",
        r: "2"
    }));
}
/** @returns A history / clock-arrow icon. */
export function HistoryIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M3 12a9 9 0 1 0 3-6.7"
  }), createElement("path", {
    d: "M3 4v5h5"
  }), createElement("path", {
    d: "M12 7v5l3 2"
  }));
}
/** @returns A heart / favorite icon. */
export function HeartIcon(props: IconProps & {
    filled?: boolean;
}) {
    const { filled, ...rest } = props;
    return createElement('svg', {
      'aria-hidden': true,
      ...baseProps,
      ...rest,
      fill: filled ? 'currentColor' : 'none',
    }, createElement('path', {
      d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
    }));
}
/** @returns A filled star icon (favorites tab). */
export function StarIcon(props: IconProps & {
    filled?: boolean;
}) {
    const { filled = true, ...rest } = props;
    return createElement('svg', {
      'aria-hidden': true,
      ...baseProps,
      ...rest,
      fill: filled ? 'currentColor' : 'none',
    }, createElement('path', {
      d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    }));
}
/** @returns An upward chevron. */
export function ChevronUpIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('path', { d: 'm18 15-6-6-6 6' }));
}
/** @returns A checkbox / select-mode icon. */
export function CheckSquareIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('path', { d: 'M9 11l3 3L22 4' }), createElement('path', { d: 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' }));
}
/** @returns An upload icon. */
export function UploadIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('path', { d: 'M12 16V4M7 9l5-5 5 5' }), createElement('path', { d: 'M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2' }));
}
/** @returns A cloud-with-upload-arrow icon (file drop affordance). */
export function CloudUploadIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('path', { d: 'M12 13v8' }), createElement('path', { d: 'm8 17 4-4 4 4' }), createElement('path', { d: 'M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284' }));
}
/** @returns A clipboard icon. */
export function ClipboardIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }), createElement('path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }));
}
/** @returns A download icon. */
export function DownloadIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('path', { d: 'M12 4v12M7 11l5 5 5-5' }), createElement('path', { d: 'M20 20H4' }));
}
/** @returns A close / X icon. */
export function CloseIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M6 6l12 12M18 6 6 18"
  }));
}
/** @returns A minus / remove badge icon. */
export function MinusIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M6 12h12"
  }));
}
/** @returns A trend icon. */
export function TrendIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m4 16 5-5 4 3 7-7"
  }), createElement("path", {
    d: "M15 7h5v5"
  }));
}
/** @returns An image / wallpaper icon. */
export function ImageIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("rect", {
    x: "3",
    y: "5",
    width: "18",
    height: "14",
    rx: "2"
  }), createElement("circle", {
    cx: "9",
    cy: "10",
    r: "1.5"
  }), createElement("path", {
    d: "m21 15-4.5-4.5L9 18"
  }));
}
/** @returns A settings / gear icon. */
export function SettingsIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
  }), createElement("path", {
    d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
  }));
}
/** @returns A news icon. */
export function NewsIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("rect", {
    x: "4",
    y: "4",
    width: "16",
    height: "16",
    rx: "2"
  }), createElement("path", {
    d: "M8 9h8M8 13h8M8 17h5"
  }));
}
/** @returns A weather / cloud-sun icon. */
export function WeatherIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M7 18h9.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.5A3.5 3.5 0 0 0 7 18Z"
  }), createElement("path", {
    d: "M17.5 7.5a3 3 0 1 0-2.2-5"
  }));
}
/** @returns A checklist / todo icon. */
export function TodoIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M9 6h11M9 12h11M9 18h11"
  }), createElement("path", {
    d: "m4 6 1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17"
  }));
}
/** @returns A currency / exchange icon. */
export function CurrencyIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), createElement("path", {
    d: "M12 7v10M9.5 9.5c.6-1 1.5-1.5 2.5-1.5 1.7 0 3 1 3 2.5S13.7 13 12 13s-3 1-3 2.5 1.3 2.5 3 2.5c1 0 1.9-.5 2.5-1.5"
  }));
}
/** @returns A horizontal swap / exchange arrows icon. */
export function SwapIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M7 8h11"
  }), createElement("path", {
    d: "m15 5 3 3-3 3"
  }), createElement("path", {
    d: "M17 16H6"
  }), createElement("path", {
    d: "m9 13-3 3 3 3"
  }));
}
/** @returns A checkmark icon. */
export function CheckIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m5 12 4.5 4.5L19 7"
  }));
}
/** @returns A push-pin icon (window always-on-top). */
export function PinIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M12 17v5"
  }), createElement("path", {
    d: "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
  }));
}
/** @returns A home / launcher house icon. */
export function HomeIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
  }), createElement("polyline", {
    points: "9 22 9 12 15 12 15 22"
  }));
}
/** @returns A location pin icon. */
export function LocationIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"
  }), createElement("circle", {
    cx: "12",
    cy: "10",
    r: "2.5"
  }));
}
/** @returns A user / account icon. */
export function UserIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "12",
    cy: "8",
    r: "3.5"
  }), createElement("path", {
    d: "M5.5 19.5a6.5 6.5 0 0 1 13 0"
  }));
}
/** @returns A shield / privacy icon. */
export function ShieldIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M12 3 5 6.5v5.2c0 4.2 2.8 7.4 7 8.8 4.2-1.4 7-4.6 7-8.8V6.5L12 3Z"
  }), createElement("path", {
    d: "m9.5 12 1.8 1.8 3.7-3.7"
  }));
}
/**
 * Key icon for member write-access management (Lucide `key` paths).
 * @param props - SVG props.
 * @returns Key SVG.
 */
export function KeyIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "7.5",
    cy: "15.5",
    r: "5.5"
  }), createElement("path", {
    d: "m21 2-9.6 9.6"
  }), createElement("path", {
    d: "m15.5 7.5 3 3L22 7l-3-3"
  }));
}
/**
 * Mail envelope icon (auth provider / invite).
 * @param props - SVG props.
 * @returns Envelope SVG.
 */
export function MailIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("rect", {
    width: "20",
    height: "16",
    x: "2",
    y: "4",
    rx: "2"
  }), createElement("path", {
    d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
  }));
}
/**
 * Phone handset icon (customer detail quick action).
 * @param props - SVG props.
 * @returns Phone SVG.
 */
export function PhoneIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("path", {
        d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.93a16 16 0 0 0 6 6l1-1.06a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
    }));
}
/** @returns A calendar icon for the Calendar function tile. */
export function CalendarIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('rect', { x: '3', y: '5', width: '18', height: '16', rx: '2' }), createElement('path', { d: 'M8 3v4M16 3v4M3 11h18' }));
}
/** @returns A kanban columns icon for the Board function tile. */
export function KanbanIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('g', { transform: 'rotate(180 12 12)' }, createElement('rect', { x: '3', y: '4', width: '5', height: '16', rx: '1' }), createElement('rect', { x: '9.5', y: '4', width: '5', height: '10', rx: '1' }), createElement('rect', { x: '16', y: '4', width: '5', height: '13', rx: '1' })));
}
/**
 * Open-source notices (Settings sidebar).
 * @returns Lucide scale (balance) icon.
 */
export function OpenSourceIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"
  }), createElement("path", {
    d: "m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"
  }), createElement("path", {
    d: "M7 21h10"
  }), createElement("path", {
    d: "M12 3v18"
  }), createElement("path", {
    d: "M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"
  }));
}
/**
 * Clash cat mark (SVG Repo `clash-svgrepo-com`).
 * 48 viewBox paths with stroke ~Lucide 1.8/24; eyes are filled so they stay
 * readable when the outline is thickened.
 * @returns Clash function-tile icon.
 */
export function ClashIcon(props: IconProps) {
    return createElement('svg', {
        'aria-hidden': true,
        viewBox: '0 0 48 48',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 3.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        ...props,
    },
        createElement('path', {
            d: 'M27.19,42.5a89.0444,89.0444,0,0,1-14.6813-1.5725S13.94,12.3721,17.9209,5.5357c-.13-.297,2.9919,1.2125,4.4218,6.2665a25.5569,25.5569,0,0,1,4.8471-.47',
        }),
        createElement('path', {
            d: 'M27.19,42.5a89.0444,89.0444,0,0,0,14.6813-1.5725S40.44,12.3721,36.4583,5.5357c.03-.2006-3.59,1.7549-4.4218,6.2665a25.5582,25.5582,0,0,0-4.8471-.47',
        }),
        createElement('path', {
            d: 'M12.5083,40.927C10.5777,40.6,7.56,40.6178,6.4685,37.44c-1.0674-3.107.4377-6.6708,3.7411-7.0453',
        }),
        createElement('path', {
            d: 'M25.4634,26.3872a1.4666,1.4666,0,0,0,1.4726-1.4725',
        }),
        createElement('path', {
            d: 'M28.4091,26.3872a1.4666,1.4666,0,0,1-1.4726-1.4725',
        }),
        createElement('ellipse', {
            cx: '21.2404',
            cy: '20.3089',
            rx: '1.35',
            ry: '1.7',
            fill: 'currentColor',
            stroke: 'none',
        }),
        createElement('ellipse', {
            cx: '33.1398',
            cy: '20.3089',
            rx: '1.35',
            ry: '1.7',
            fill: 'currentColor',
            stroke: 'none',
        }),
    );
}
/** @returns A notebook icon for the Folio workspace tile. */
export function FolioIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', {
        d: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5z',
    }), createElement('path', { d: 'M5 4.5v15A1.5 1.5 0 0 0 6.5 21' }), createElement('path', { d: 'M9 8h7M9 12h7M9 16h4' }));
}
// ---------------------------------------------------------------------------
// Admin CRM sidebar icons (Lucide paths aligned with geocrm-web AdminLayout)
// ---------------------------------------------------------------------------
/** @returns Lucide users icon (Customers). */
export function LucideUsersIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }), createElement('path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }), createElement('path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }), createElement('circle', { cx: '9', cy: '7', r: '4' }));
}
/** @returns Lucide circle-user icon (Contacts / UserCircle2). */
export function LucideCircleUserIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('circle', { cx: '12', cy: '12', r: '10' }), createElement('circle', { cx: '12', cy: '10', r: '3' }), createElement('path', { d: 'M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662' }));
}
/** @returns Lucide list-checks icon (Leads). */
export function LucideListChecksIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M13 5h8' }), createElement('path', { d: 'M13 12h8' }), createElement('path', { d: 'M13 19h8' }), createElement('path', { d: 'm3 17 2 2 4-4' }), createElement('path', { d: 'm3 7 2 2 4-4' }));
}
/** @returns Lucide clipboard-list icon (Visit log). */
export function LucideClipboardListIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }), createElement('path', {
        d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
    }), createElement('path', { d: 'M12 11h4' }), createElement('path', { d: 'M12 16h4' }), createElement('path', { d: 'M8 11h.01' }), createElement('path', { d: 'M8 16h.01' }));
}
/** @returns Lucide briefcase icon (Opportunities). */
export function LucideBriefcaseIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' }), createElement('rect', { width: '20', height: '14', x: '2', y: '6', rx: '2' }));
}
/** @returns Lucide calendar-check icon (Follow-ups). */
export function LucideCalendarCheckIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M8 2v4' }), createElement('path', { d: 'M16 2v4' }), createElement('rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }), createElement('path', { d: 'M3 10h18' }), createElement('path', { d: 'm9 16 2 2 4-4' }));
}
/** @returns Lucide megaphone icon (KOL). */
export function LucideMegaphoneIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', {
        d: 'M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
    }), createElement('path', { d: 'M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14' }), createElement('path', { d: 'M8 6v8' }));
}
/** @returns Lucide handshake icon (Agent). */
export function LucideHandshakeIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'm11 17 2 2a1 1 0 1 0 3-3' }), createElement('path', {
        d: 'm14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4',
    }), createElement('path', { d: 'm21 3 1 11h-2' }), createElement('path', { d: 'M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3' }), createElement('path', { d: 'M3 4h8' }));
}
/** @returns Lucide store icon (NEXDOT). */
export function LucideStoreIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5' }), createElement('path', {
        d: 'M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244',
    }), createElement('path', { d: 'M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05' }));
}
/** @returns Lucide user-cog icon (NEXDOT users). */
export function LucideUserCogIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M10 15H6a4 4 0 0 0-4 4v2' }), createElement('path', { d: 'm14.305 16.53.923-.382' }), createElement('path', { d: 'm15.228 13.852-.923-.383' }), createElement('path', { d: 'm16.852 12.228-.383-.923' }), createElement('path', { d: 'm16.852 17.772-.383.924' }), createElement('path', { d: 'm19.148 12.228.383-.923' }), createElement('path', { d: 'm19.53 18.696-.382-.924' }), createElement('path', { d: 'm20.772 13.852.924-.383' }), createElement('path', { d: 'm20.772 16.148.924.383' }), createElement('circle', { cx: '18', cy: '15', r: '3' }), createElement('circle', { cx: '9', cy: '7', r: '4' }));
}
/** @returns Lucide list icon (Competitor management / list). */
export function LucideListIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M3 5h.01' }), createElement('path', { d: 'M3 12h.01' }), createElement('path', { d: 'M3 19h.01' }), createElement('path', { d: 'M8 5h13' }), createElement('path', { d: 'M8 12h13' }), createElement('path', { d: 'M8 19h13' }));
}
/** @returns Lucide images icon (Shared media). */
export function LucideImagesIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'm22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16' }), createElement('path', { d: 'M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2' }), createElement('circle', { cx: '13', cy: '7', r: '1', fill: 'currentColor' }), createElement('rect', { x: '8', y: '2', width: '14', height: '14', rx: '2' }));
}
/** @returns Lucide package icon (CRM orders). */
export function LucidePackageIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', {
        d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
    }), createElement('path', { d: 'M12 22V12' }), createElement('polyline', { points: '3.29 7 12 12 20.71 7' }), createElement('path', { d: 'm7.5 4.27 9 5.15' }));
}
/** @returns Lucide building-2 icon (NEXDOT orders). */
export function LucideBuilding2Icon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M10 12h4' }), createElement('path', { d: 'M10 8h4' }), createElement('path', { d: 'M14 21v-3a2 2 0 0 0-4 0v3' }), createElement('path', {
        d: 'M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2',
    }), createElement('path', { d: 'M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16' }));
}
/** @returns Lucide truck icon (T&E orders). */
export function LucideTruckIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2' }), createElement('path', { d: 'M15 18H9' }), createElement('path', {
        d: 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14',
    }), createElement('circle', { cx: '17', cy: '18', r: '2' }), createElement('circle', { cx: '7', cy: '18', r: '2' }));
}
/** @returns Lucide book-open icon (Product catalog). */
export function LucideBookOpenIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M12 7v14' }), createElement('path', {
        d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
    }));
}
/** @returns Lucide boxes icon (NEXDOT products). */
export function LucideBoxesIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', {
        d: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z',
    }), createElement('path', { d: 'm7 16.5-4.74-2.85' }), createElement('path', { d: 'm7 16.5 5-3' }), createElement('path', { d: 'M7 16.5v5.17' }), createElement('path', {
        d: 'M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z',
    }), createElement('path', { d: 'm17 16.5-5-3' }), createElement('path', { d: 'm17 16.5 4.74-2.85' }), createElement('path', { d: 'M17 16.5v5.17' }), createElement('path', {
        d: 'M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z',
    }), createElement('path', { d: 'M12 8 7.26 5.15' }), createElement('path', { d: 'm12 8 4.74-2.85' }), createElement('path', { d: 'M12 13.5V8' }));
}
/** @returns Lucide layers icon (T&E products). */
export function LucideLayersIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', {
        d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
    }), createElement('path', {
        d: 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
    }), createElement('path', {
        d: 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
    }));
}
/** @returns Lucide clipboard-check icon (T&E applications). */
export function LucideClipboardCheckIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }), createElement('path', {
        d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
    }), createElement('path', { d: 'm9 14 2 2 4-4' }));
}
/** @returns Lucide users-round icon (T&E users). */
export function LucideUsersRoundIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', { d: 'M18 21a8 8 0 0 0-16 0' }), createElement('circle', { cx: '10', cy: '8', r: '5' }), createElement('path', { d: 'M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3' }));
}
/** @returns Lucide messages-square icon (T&E community). */
export function LucideMessagesSquareIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props }, createElement('path', {
        d: 'M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
    }), createElement('path', {
        d: 'M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1',
    }));
}
/** @returns Lucide target icon (T&E Marketing). */
export function LucideTargetIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props },
        createElement('circle', { cx: '12', cy: '12', r: '10' }),
        createElement('circle', { cx: '12', cy: '12', r: '6' }),
        createElement('circle', { cx: '12', cy: '12', r: '2' }),
    );
}
/** @returns Lucide wifi icon (Clash Proxies). */
export function LucideWifiIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props },
        createElement('path', { d: 'M12 20h.01' }),
        createElement('path', { d: 'M2 8.82a15 15 0 0 1 20 0' }),
        createElement('path', { d: 'M5 12.859a10 10 0 0 1 14 0' }),
        createElement('path', { d: 'M8.5 16.429a5 5 0 0 1 7 0' }),
    );
}
/** @returns Lucide server icon (Clash Subscription). */
export function LucideServerIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props },
        createElement('rect', { width: '20', height: '8', x: '2', y: '2', rx: '2', ry: '2' }),
        createElement('rect', { width: '20', height: '8', x: '2', y: '14', rx: '2', ry: '2' }),
        createElement('line', { x1: '6', x2: '6.01', y1: '6', y2: '6' }),
        createElement('line', { x1: '6', x2: '6.01', y1: '18', y2: '18' }),
    );
}
/** @returns Lucide git-fork icon (Clash Rules). */
export function LucideGitForkIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props },
        createElement('circle', { cx: '12', cy: '18', r: '3' }),
        createElement('circle', { cx: '6', cy: '6', r: '3' }),
        createElement('circle', { cx: '18', cy: '6', r: '3' }),
        createElement('path', { d: 'M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9' }),
        createElement('path', { d: 'M12 12v3' }),
    );
}
/** @returns Lucide lock-open icon (Clash Unlock). */
export function LucideLockOpenIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props },
        createElement('rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }),
        createElement('path', { d: 'M7 11V7a5 5 0 0 1 9.9-1' }),
    );
}
/** @returns Lucide arrow-up icon (Clash upload). */
export function LucideArrowUpIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props },
        createElement('path', { d: 'm5 12 7-7 7 7' }),
        createElement('path', { d: 'M12 19V5' }),
    );
}
/** @returns Lucide arrow-down icon (Clash download). */
export function LucideArrowDownIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...baseProps, ...props },
        createElement('path', { d: 'M12 5v14' }),
        createElement('path', { d: 'm19 12-7 7-7-7' }),
    );
}
/** @returns Tag / label icon. */
export function TagIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("path", {
        d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.432 0l6.768-6.768a2.426 2.426 0 0 0 0-3.432z"
    }), createElement("circle", {
        cx: "7.5",
        cy: "7.5",
        r: "1.5",
        fill: "currentColor",
        stroke: "none"
    }));
}
/** @returns Inbox tray icon. */
export function InboxIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("polyline", {
        points: "22 12 16 12 14 15 10 15 8 12 2 12"
    }), createElement("path", {
        d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
    }));
}
/** @returns Bold text icon. */
export function BoldIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("path", {
        d: "M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"
    }), createElement("path", {
        d: "M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"
    }));
}
/** @returns Italic text icon. */
export function ItalicIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("line", {
        x1: "19",
        x2: "10",
        y1: "4",
        y2: "4"
    }), createElement("line", {
        x1: "14",
        x2: "5",
        y1: "20",
        y2: "20"
    }), createElement("line", {
        x1: "15",
        x2: "9",
        y1: "4",
        y2: "20"
    }));
}
/** @returns Underline text icon. */
export function UnderlineIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("path", {
        d: "M6 4v6a6 6 0 0 0 12 0V4"
    }), createElement("line", {
        x1: "4",
        x2: "20",
        y1: "20",
        y2: "20"
    }));
}
/** @returns Strikethrough text icon. */
export function StrikeIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("path", {
        d: "M16 4H9a3 3 0 0 0-2.83 4"
    }), createElement("path", {
        d: "M14 12a4 4 0 0 1 0 8H6"
    }), createElement("line", {
        x1: "4",
        x2: "20",
        y1: "12",
        y2: "12"
    }));
}
/** @returns Numbered list icon. */
export function ListOrderedIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("line", {
        x1: "10",
        x2: "21",
        y1: "6",
        y2: "6"
    }), createElement("line", {
        x1: "10",
        x2: "21",
        y1: "12",
        y2: "12"
    }), createElement("line", {
        x1: "10",
        x2: "21",
        y1: "18",
        y2: "18"
    }), createElement("path", {
        d: "M4 6h1v4"
    }), createElement("path", {
        d: "M4 10h2"
    }), createElement("path", {
        d: "M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"
    }));
}
/** @returns Bulleted list icon. */
export function ListUnorderedIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("line", {
        x1: "8",
        x2: "21",
        y1: "6",
        y2: "6"
    }), createElement("line", {
        x1: "8",
        x2: "21",
        y1: "12",
        y2: "12"
    }), createElement("line", {
        x1: "8",
        x2: "21",
        y1: "18",
        y2: "18"
    }), createElement("line", {
        x1: "3",
        x2: "3.01",
        y1: "6",
        y2: "6"
    }), createElement("line", {
        x1: "3",
        x2: "3.01",
        y1: "12",
        y2: "12"
    }), createElement("line", {
        x1: "3",
        x2: "3.01",
        y1: "18",
        y2: "18"
    }));
}
/** @returns Blockquote icon. */
export function QuoteIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("path", {
        d: "M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"
    }), createElement("path", {
        d: "M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"
    }));
}
/** @returns Insert-link icon. */
export function LinkIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("path", {
        d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
    }), createElement("path", {
        d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
    }));
}
/** @returns Smile / emoji icon. */
export function SmileIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("circle", {
        cx: "12",
        cy: "12",
        r: "10"
    }), createElement("path", {
        d: "M8 14s1.5 2 4 2 4-2 4-2"
    }), createElement("line", {
        x1: "9",
        x2: "9.01",
        y1: "9",
        y2: "9"
    }), createElement("line", {
        x1: "15",
        x2: "15.01",
        y1: "9",
        y2: "9"
    }));
}
/** @returns Paperclip attachment icon. */
export function PaperclipIcon(props: IconProps) {
    return createElement("svg", {
        "aria-hidden": true,
        ...baseProps,
        ...props
    }, createElement("path", {
        d: "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
    }));
}
/** @returns A multi-user / group icon. */
export function UsersIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "9",
    cy: "8",
    r: "3"
  }), createElement("path", {
    d: "M3.5 19a5.5 5.5 0 0 1 11 0"
  }), createElement("circle", {
    cx: "17",
    cy: "9",
    r: "2.5"
  }), createElement("path", {
    d: "M15.5 19a4.5 4.5 0 0 1 5-4.2"
  }));
}
/** @returns A crown / leaders icon. */
export function CrownIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M4 16.5 6.5 8l3.5 4.5L12 6l2 6.5L17.5 8 20 16.5H4Z"
  }), createElement("path", {
    d: "M5 19h14"
  }));
}
/** @returns A brain / AI settings icon. */
export function BrainIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M9.5 4.5a3 3 0 0 0-3 3v.4A3 3 0 0 0 4 10.5c0 1.2.7 2.2 1.7 2.7A3 3 0 0 0 7 18.5h1.5"
  }), createElement("path", {
    d: "M14.5 4.5a3 3 0 0 1 3 3v.4A3 3 0 0 1 20 10.5c0 1.2-.7 2.2-1.7 2.7A3 3 0 0 1 17 18.5h-1.5"
  }), createElement("path", {
    d: "M9.5 4.5c.8-.6 1.7-.9 2.5-.9s1.7.3 2.5.9"
  }), createElement("path", {
    d: "M12 8.5v7"
  }), createElement("path", {
    d: "M9.5 11.5h5"
  }));
}
/** @returns A user-cog / user management icon. */
export function UserCogIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "9",
    cy: "8",
    r: "3.5"
  }), createElement("path", {
    d: "M3.5 19.5a5.5 5.5 0 0 1 11 0"
  }), createElement("circle", {
    cx: "18",
    cy: "15",
    r: "2.2"
  }), createElement("path", {
    d: "M18 11.5v1.2M18 17.3v1.2M14.9 13.2l.9.9M20.2 16.9l.9.9M14.9 17.8l.9-.9M20.2 14.1l.9-.9"
  }));
}
/** @returns A sign-out / door icon. */
export function LogoutIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
  }), createElement("path", {
    d: "M16 17l5-5-5-5"
  }), createElement("path", {
    d: "M21 12H9"
  }));
}
/** @returns A reset / restore-defaults icon. */
export function ResetIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M3 12a9 9 0 1 0 3-6.7"
  }), createElement("path", {
    d: "M3 4v5h5"
  }));
}
const brandFrame = {
  viewBox: '0 0 24 24'
};
/** @returns A downward chevron for selects. */
export function ChevronDownIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m6 9 6 6 6-6"
  }));
}
/** @returns A leftward chevron. */
export function ChevronLeftIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m15 18-6-6 6-6"
  }));
}
/** @returns A rightward chevron. */
export function ChevronRightIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m9 18 6-6-6-6"
  }));
}
/** @returns A leftward arrow (back navigation). */
export function ArrowLeftIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M19 12H5M11 18l-6-6 6-6"
  }));
}
/** @returns A rightward arrow. */
export function ArrowRightIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M5 12h14M13 6l6 6-6 6"
  }));
}
/** @returns A circular refresh / reload icon. */
export function RefreshIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M21 12a9 9 0 1 1-2.6-6.3"
  }), createElement("path", {
    d: "M21 3v6h-6"
  }));
}
/** @returns An external-link (open in system browser) icon. */
export function ExternalLinkIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M14 4h6v6"
  }), createElement("path", {
    d: "M10 14 20 4"
  }), createElement("path", {
    d: "M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"
  }));
}
/** @returns Reply / left-arrow icon. */
export function ReplyIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('polyline', { points: '9 17 4 12 9 7' }), createElement('path', { d: 'M20 18v-2a4 4 0 0 0-4-4H4' }));
}
/** @returns Reply-all icon. */
export function ReplyAllIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('polyline', { points: '7 17 2 12 7 7' }), createElement('polyline', { points: '13 17 8 12 13 7' }), createElement('path', { d: 'M22 18v-2a4 4 0 0 0-4-4H8' }));
}
/** @returns Forward icon. */
export function ForwardIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('polyline', { points: '15 17 20 12 15 7' }), createElement('path', { d: 'M4 18v-2a4 4 0 0 1 4-4h12' }));
}
/** @returns Archive box icon. */
export function ArchiveIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('rect', { x: '3', y: '4', width: '18', height: '4', rx: '1' }), createElement('path', { d: 'M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8' }), createElement('path', { d: 'M10 12h4' }));
}
/** @returns Printer icon. */
export function PrinterIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('path', { d: 'M6 9V3h12v6' }), createElement('path', { d: 'M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2' }), createElement('rect', { x: '6', y: '14', width: '12', height: '8', rx: '1' }));
}
/** @returns Horizontal more menu icon. */
export function MoreHorizontalIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('circle', { cx: '5', cy: '12', r: '1.4' }), createElement('circle', { cx: '12', cy: '12', r: '1.4' }), createElement('circle', { cx: '19', cy: '12', r: '1.4' }));
}
/** @returns Bell / reminder icon. */
export function BellIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('path', { d: 'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7' }), createElement('path', { d: 'M13.7 21a2 2 0 0 1-3.4 0' }));
}
/** @returns Maximize window icon. */
export function MaximizeIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }));
}
/** @returns Minimize window icon. */
export function MinimizeIcon(props: IconProps) {
    return createElement('svg', { ...baseProps, ...props }, createElement('path', { d: 'M5 19h14' }));
}
/** @returns AliMail / Alibaba brand mark. */
export function AlibabaIcon(props: IconProps) {
    return createElement('svg', { viewBox: '0 0 1820 1024', 'aria-hidden': true, ...props }, createElement('path', {
        fill: '#E33C39',
        d: 'M1386.25 91.55h-165.31s-62.49 18.83-62.49 18.83L935.63 421.83S754.25 158.75 724.35 123.58c-32.51-37.77-70.26-32.59-70.26-32.59H472.51L306.54 934.33c222.63-56.45 271.55-189.83 271.55-189.83l65.35-360.51 292.55 401.79 276.92-398.09s51.2 281.85 92.13 382.76c40.93 100.91 249.13 165.5 249.13 165.5L1386.25 91.55z',
    }));
}
/** @returns A multicolor Google brand mark. */
export function GoogleIcon(props: IconProps) {
  return createElement("svg", {
    ...brandFrame,
    ...props
  }, createElement("path", {
    fill: "#4285F4",
    d: "M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9c-.3 1.4-1 2.6-2.1 3.4v2.8h3.4c2-1.8 3.4-4.5 3.4-8.3Z"
  }), createElement("path", {
    fill: "#34A853",
    d: "M12 23c2.9 0 5.3-1 7.1-2.6l-3.4-2.8c-1 .7-2.2 1.1-3.7 1.1-2.8 0-5.2-1.9-6.1-4.4H2.4v2.8C4.2 20.5 7.8 23 12 23Z"
  }), createElement("path", {
    fill: "#FBBC05",
    d: "M5.9 14.3c-.2-.7-.4-1.4-.4-2.3s.1-1.6.4-2.3V7H2.4C1.5 8.5 1 10.2 1 12s.5 3.5 1.4 5l3.5-2.7Z"
  }), createElement("path", {
    fill: "#EA4335",
    d: "M12 5.4c1.6 0 3 .5 4.1 1.6L19.2 4C17.2 2.1 14.8 1 12 1 7.8 1 4.2 3.5 2.4 7l3.5 2.7c.9-2.5 3.3-4.3 6.1-4.3Z"
  }));
}
/** @returns An eye (show password) icon. */
export function EyeIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
  }), createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }));
}
/** @returns An eye-off (hide password) icon. */
export function EyeOffIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M3 3l18 18"
  }), createElement("path", {
    d: "M10.6 10.6a3 3 0 0 0 4.2 4.2"
  }), createElement("path", {
    d: "M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1"
  }), createElement("path", {
    d: "M6.1 6.1C3.9 7.7 2 12 2 12s3.5 7 10 7a10.5 10.5 0 0 0 4.4-1"
  }));
}
/** @returns An Apple logo mark (filled). */
export function AppleIcon(props: IconProps) {
  return createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
    ...props
  }, createElement("path", {
    d: "M16.7 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3.1 1-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.1 1.7 2.4 3 2.3 1.2-.1 1.6-.7 3.1-.7s1.8.7 3.1.7c1.3 0 2.1-1.1 2.9-2.2.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8ZM14.8 5.7c.6-.8 1.1-1.9.9-3-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.9 1 0 2-.5 2.6-1.3Z"
  }));
}
/**
 * GeoCRM map-explorer brand mark (pin + AI sparkle), matching geocrm-web.
 * @param props - SVG props.
 * @returns Brand mark SVG.
 */
export function MapExplorerIcon(props: IconProps) {
  const gid = useId().replace(/:/g, '');
  return createElement("svg", {
    viewBox: "0 0 512 512",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
    ...props
  }, createElement("defs", null, createElement("linearGradient", {
    id: `${gid}-pinGrad`,
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%"
  }, createElement("stop", {
    offset: "0%",
    stopColor: "#4FC08D"
  }), createElement("stop", {
    offset: "100%",
    stopColor: "#3FCF8E"
  })), createElement("linearGradient", {
    id: `${gid}-aiGrad`,
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%"
  }, createElement("stop", {
    offset: "0%",
    stopColor: "#646CFF"
  }), createElement("stop", {
    offset: "100%",
    stopColor: "#61DAFB"
  })), createElement("filter", {
    id: `${gid}-glow`,
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "140%"
  }, createElement("feGaussianBlur", {
    stdDeviation: "8",
    result: "blur"
  }), createElement("feComposite", {
    in: "SourceGraphic",
    in2: "blur",
    operator: "over"
  })), createElement("mask", {
    id: `${gid}-pinHole`
  }, createElement("path", {
    d: "M 256 80 C 160 80 82 158 82 254 C 82 371 256 460 256 460 C 256 460 430 371 430 254 C 430 158 352 80 256 80 Z",
    fill: "#fff"
  }), createElement("circle", {
    cx: "256",
    cy: "236",
    r: "92",
    fill: "#000"
  }))), createElement("path", {
    d: "M 256 80 C 160 80 82 158 82 254 C 82 371 256 460 256 460 C 256 460 430 371 430 254 C 430 158 352 80 256 80 Z",
    fill: `url(#${gid}-pinGrad)`,
    mask: `url(#${gid}-pinHole)`
  }), createElement("path", {
    d: "M 256 156 C 266 206 206 226 336 236 C 206 246 266 266 256 316 C 246 266 306 246 176 236 C 306 226 246 206 256 156 Z",
    fill: `url(#${gid}-aiGrad)`,
    filter: `url(#${gid}-glow)`
  }), createElement("circle", {
    cx: "256",
    cy: "236",
    r: "16",
    fill: "#000"
  }), createElement("circle", {
    cx: "150",
    cy: "140",
    r: "10",
    fill: "#4FC08D",
    opacity: "0.6"
  }), createElement("circle", {
    cx: "362",
    cy: "140",
    r: "10",
    fill: "#61DAFB",
    opacity: "0.6"
  }));
}
/** @returns A Bing brand mark. */
export function BingIcon(props: IconProps) {
  const gradientId = 'bing-brand-gradient';
  return createElement("svg", {
    ...brandFrame,
    viewBox: "8475 1399 12749 18216",
    ...props
  }, createElement("defs", null, createElement("linearGradient", {
    id: gradientId,
    gradientUnits: "userSpaceOnUse",
    x1: "9438.21",
    y1: "2509.42",
    x2: "9012.51",
    y2: "23085.06"
  }, createElement("stop", {
    offset: "0",
    stopColor: "#26B8F4"
  }), createElement("stop", {
    offset: "1",
    stopColor: "#1B48EF"
  }))), createElement("polygon", {
    fill: `url(#${gradientId})`,
    points: "8475.16,1399.66 12124.09,2685.03 12136.1,15485.22 17223.25,12520.22 14741.02,11358.99 13148.22,7402.88 21223.77,10231.3 21217.16,14376.26 12123.05,19614.59 8487.02,17591.25"
  }));
}
/** @returns A Yahoo brand mark. */
export function YahooIcon(props: IconProps) {
  return createElement("svg", {
    ...brandFrame,
    viewBox: "0 0 3386.34 3010.5",
    fillRule: "evenodd",
    clipRule: "evenodd",
    ...props
  }, createElement("path", {
    fill: "#5f01d1",
    fillRule: "nonzero",
    d: "M0 732.88h645.84l376.07 962.1 380.96-962.1h628.76l-946.8 2277.62H451.98l259.19-603.53L.02 732.88zm2763.84 768.75h-704.26L2684.65 0l701.69.03-622.5 1501.6zm-519.78 143.72c216.09 0 391.25 175.17 391.25 391.22 0 216.06-175.16 391.23-391.25 391.23-216.06 0-391.19-175.17-391.19-391.23 0-216.05 175.16-391.22 391.19-391.22z"
  }));
}
/** @returns OpenAI / ChatGPT brand mark. */
export function ChatGptIcon(props: IconProps) {
  return createElement("svg", {
    viewBox: "0 0 320 320",
    fill: "currentColor",
    ...props
  }, createElement("path", {
    d: "m297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z"
  }));
}
/** @returns Anthropic / Claude brand mark. */
export function ClaudeIcon(props: IconProps) {
  return createElement("svg", {
    viewBox: "0 0 512 509.64",
    xmlns: "http://www.w3.org/2000/svg",
    shapeRendering: "geometricPrecision",
    fillRule: "evenodd",
    clipRule: "evenodd",
    "aria-hidden": true,
    ...props
  }, createElement("path", {
    fill: "#D77655",
    d: "M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.612-115.613 115.612H115.612C52.026 509.639 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z"
  }), createElement("path", {
    fill: "#FCF2EE",
    fillRule: "nonzero",
    d: "M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474-.101.102.024.101z"
  }));
}
/** @returns Google Gemini brand spark. */
export function GeminiIcon(props: IconProps) {
  const maskId = useId();
  return createElement("svg", {
    viewBox: "0 0 65 65",
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    "aria-hidden": true,
    ...props
  }, createElement("mask", {
    id: maskId,
    style: {
      maskType: 'alpha'
    },
    maskUnits: "userSpaceOnUse",
    x: 0,
    y: 0,
    width: 65,
    height: 65
  }, createElement("path", {
    d: "M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z",
    fill: "#000"
  })), createElement("g", {
    mask: `url(#${maskId})`
  }, createElement("path", {
    d: "M-5.859 50.734c7.498 2.663 16.116-2.33 19.249-11.152 3.133-8.821-.406-18.131-7.904-20.794-7.498-2.663-16.116 2.33-19.25 11.151-3.132 8.822.407 18.132 7.905 20.795z",
    fill: "#FFE432"
  }), createElement("path", {
    d: "M27.433 21.649c10.3 0 18.651-8.535 18.651-19.062 0-10.528-8.35-19.062-18.651-19.062S8.78-7.94 8.78 2.587c0 10.527 8.35 19.062 18.652 19.062z",
    fill: "#FC413D"
  }), createElement("path", {
    d: "M20.184 82.608c10.753-.525 18.918-12.244 18.237-26.174-.68-13.93-9.95-24.797-20.703-24.271C6.965 32.689-1.2 44.407-.519 58.337c.681 13.93 9.95 24.797 20.703 24.271z",
    fill: "#00B95C"
  }), createElement("path", {
    d: "M30.954 74.181c9.014-5.485 11.427-17.976 5.389-27.9-6.038-9.925-18.241-13.524-27.256-8.04-9.015 5.486-11.428 17.977-5.39 27.902 6.04 9.924 18.242 13.523 27.257 8.038z",
    fill: "#00B95C"
  }), createElement("path", {
    d: "M67.391 42.993c10.132 0 18.346-7.91 18.346-17.666 0-9.757-8.214-17.667-18.346-17.667s-18.346 7.91-18.346 17.667c0 9.757 8.214 17.666 18.346 17.666z",
    fill: "#3186FF"
  }), createElement("path", {
    d: "M-13.065 40.944c9.33 7.094 22.959 4.869 30.442-4.972 7.483-9.84 5.987-23.569-3.343-30.663C4.704-1.786-8.924.439-16.408 10.28c-7.483 9.84-5.986 23.57 3.343 30.664z",
    fill: "#FBBC04"
  }), createElement("path", {
    d: "M34.74 51.43c11.135 7.656 25.896 5.524 32.968-4.764 7.073-10.287 3.779-24.832-7.357-32.488C49.215 6.52 34.455 8.654 27.382 18.94c-7.072 10.288-3.779 24.833 7.357 32.49z",
    fill: "#3186FF"
  }), createElement("path", {
    d: "M54.984-2.336c2.833 3.852-.808 11.34-8.131 16.727-7.324 5.387-15.557 6.631-18.39 2.78-2.833-3.853.807-11.342 8.13-16.728 7.324-5.387 15.558-6.631 18.39-2.78z",
    fill: "#749BFF"
  }), createElement("path", {
    d: "M31.727 16.104C43.053 5.598 46.94-8.626 40.41-15.666c-6.53-7.04-21.006-4.232-32.332 6.274s-15.214 24.73-8.683 31.77c6.53 7.04 21.006 4.232 32.332-6.274z",
    fill: "#FC413D"
  }), createElement("path", {
    d: "M8.51 53.838c6.732 4.818 14.46 5.55 17.262 1.636 2.802-3.915-.384-10.994-7.116-15.812-6.731-4.818-14.46-5.55-17.261-1.636-2.802 3.915.383 10.994 7.115 15.812z",
    fill: "#FFEE48"
  })));
}
/** @returns xAI / Grok brand mark. */
export function GrokIcon(props: IconProps) {
  return createElement("svg", {
    viewBox: "0 0 512 509.641",
    xmlns: "http://www.w3.org/2000/svg",
    fillRule: "evenodd",
    clipRule: "evenodd",
    "aria-hidden": true,
    ...props
  }, createElement("path", {
    d: "M115.612 0h280.776C459.975 0 512 52.026 512 115.612v278.416c0 63.587-52.025 115.613-115.612 115.613H115.612C52.026 509.641 0 457.615 0 394.028V115.612C0 52.026 52.026 0 115.612 0z"
  }), createElement("path", {
    fill: "#fff",
    d: "M213.235 306.019l178.976-180.002v.169l51.695-51.763c-.924 1.32-1.86 2.605-2.785 3.89-39.281 54.164-58.46 80.649-43.07 146.922l-.09-.101c10.61 45.11-.744 95.137-37.398 131.836-46.216 46.306-120.167 56.611-181.063 14.928l42.462-19.675c38.863 15.278 81.392 8.57 111.947-22.03 30.566-30.6 37.432-75.159 22.065-112.252-2.92-7.025-11.67-8.795-17.792-4.263l-124.947 92.341zm-25.786 22.437l-.033.034L68.094 435.217c7.565-10.429 16.957-20.294 26.327-30.149 26.428-27.803 52.653-55.359 36.654-94.302-21.422-52.112-8.952-113.177 30.724-152.898 41.243-41.254 101.98-51.661 152.706-30.758 11.23 4.172 21.016 10.114 28.638 15.639l-42.359 19.584c-39.44-16.563-84.629-5.299-112.207 22.313-37.298 37.308-44.84 102.003-1.128 143.81z"
  }));
}
/** @returns A globe / IP-check icon. */
export function GlobeIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), createElement("path", {
    d: "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"
  }));
}
/**
 * NEXTORCH brand mark (N + T). N uses `currentColor`; T uses `--nt-t` (default green).
 * @param props - SVG props.
 * @returns Brand-mark SVG.
 */
export function NextorchBrandIcon(props: IconProps) {
  return createElement("svg", {
    viewBox: "0 0 414 311",
    "aria-hidden": true,
    ...props
  }, createElement("path", {
    fill: "currentColor",
    d: "M0 0L23 23L23 256L77 310L77 77L249 249L249 140L233 156L77 0Z"
  }), createElement("path", {
    fill: "var(--nt-t, #47b135)",
    d: "M154 0L208 54L257 54L257 257L311 311L311 54L360 54L414 0Z"
  }));
}
/**
 * POWERSOURCE brand mark for OA / ERP Home tiles (from repo `PS.svg`).
 * Fixed brand colors (gold + red); does not follow Appearance `--brand`.
 * @param props - SVG props.
 * @returns Brand-mark SVG.
 */
export function PowersourceBrandIcon(props: IconProps) {
    return createElement("svg", {
        viewBox: "0 0 100 99.99",
        "aria-hidden": true,
        ...props
    }, createElement("path", {
        fill: "#cea53e",
        d: "M62.61,1.6h-6.26c-.77.46-1.36.93-2.2,1.73h13.82c1.71.64,3.85,1.65,5.49,2.5h-16.35s0,1.01,0,1.01c0,0-5.32,0-5.32,0-.2.44-.32.79-.45,1.25h25.96c1.19.77,2.8,1.95,3.79,2.74h-23.98s0,1.12,0,1.12h-6.19c.03.43.06.7.13,1.12h32.67c.6.54,1.35,1.28,1.9,1.83h-13.65s1.48.97,1.48.97h-16.33v.98h-4.7c.25.43.51.82.82,1.22h35.25c.54.6.88,1.03,1.41,1.77h-11.56s.99,1,.99,1h-22.2v1.08h-6.55c-.34.17-1.25.72-1.84,1.14h43.41c.25.36,1,1.58,1.12,1.83h-10.45s.68.93.68.93h-26.36v1.07h-15.64v1.12s53.45,0,53.45,0c.27.54.52,1.07.85,1.83h-9.81s.51.97.51.97h-29.36v1.27h-17.13v.91s57.05,0,57.05,0c.16.42.46,1.29.62,1.82h-9.42s.36,1,.36,1h-31.48v1.23h-18.56v.91s59.99,0,59.99,0c.15.54.34,1.42.47,2.1h-9.21s.17.78.17.78h-32.85v1.16h-19.98v.96s62.38,0,62.38,0c.06.37.19,1.39.22,1.82h-9.16s.09,1.03.09,1.03h-33.55v1.17h-21.41v.98s64.26,0,64.26,0c.01.25.04,1.42.04,1.82h-9.22s-.04,1.14-.04,1.14h-33.63v1h-22.83v1.03s65.63,0,65.63,0c-.01.36-.09,1.47-.14,1.82h-9.41s-.18,1.14-.18,1.14h-33.08v.99h-24.26v1.05s66.52,0,66.52,0c-.05.35-.24,1.48-.32,1.81h-9.73s-.33,1.13-.33,1.13h-31.87v.98h-24.26l.34,1.09h65.11c-.11.49-.33,1.19-.53,1.82h-10.23s-.48,1.07-.48,1.07h-29.95v.63h-8.65v1.47h48.21c-.2.53-.57,1.46-.79,1.93h-10.98s-.61.96-.61.96h-27.19v.96h-8.65v1.24h45.91c-.14.28-.91,1.69-1,1.82h-12.07s-.84.96-.84.96h-23.35v.95h-8.65v1.25h42.94c-.34.51-.87,1.26-1.28,1.8h-13.81s-1.25,1-1.25,1h-17.96v.94h-8.65v1.24h39.08c-.45.53-1.25,1.4-1.67,1.82h-17.14s-2.04.96-2.04.96h-9.57v.95h-8.65v1.27h34.02c-.9.78-2.5,2.03-3.56,2.78h-21.81s0,.94,0,.94h-8.65v1.28h27.05c-1.64.99-3.56,1.94-5.27,2.72h-13.14s0,.95,0,.95h-8.65v1.37h15.31c-6.65,2.01-14.39,2.38-20.9,1.44v-35.77s-13.7,0-13.7,0c-1.81-.1-2.28-1.58-2.31-3.75s9.07-32.13,9.07-32.13c.22-.65.93-2.33,1.56-2.58l12.79-5.13C42.38,9.02,52.67.07,52.67.07c3.61,0,9.53,1.34,9.93,1.53Z"
    }), createElement("g", {
        fill: "#b3382b"
    }, createElement("path", {
        d: "M52.67.06s-10.29,8.96-2.4,20.06l-12.79,5.13c-.63.25-1.33,1.93-1.56,2.58,0,0-9.07,30.09-9.07,32.13s.45,3.62,2.31,3.75h2.97s0,32.99,0,32.99C14.29,89.83,1.98,73.39.23,54.68-2.24,28.74,15.59,5.09,41.76.67c-5.95,5.45-6.88,13.37-2.1,19.42l-11.51,4.51c-1.36.51-2.34,1.64-2.8,3.09l-8.77,30.97c-.36,1.26.08,3.64,1.01,4.34,1.24.93.87.71,5.76.71-.73-.36-1.52-1.97-1.49-4.22.03-2.1,9.09-32.09,9.09-32.09.46-1.11,1.35-2.17,2.4-2.57l11.88-4.64c-4.29-6.9-3.62-15.15,3.11-20.16.42-.07,4.17.02,4.33.04Z"
    }), createElement("polygon", {
        points: "42.87 99.49 37.74 98.48 37.75 63.72 42.87 63.72 42.87 99.49"
    })));
}
/**
 * NEXDOT wordmark: NEX in `currentColor`, DOT in brand green.
 * @param props - SVG props.
 * @returns Wordmark SVG.
 */
/** @returns Hamburger menu icon for chat sidebar toggle. */
export function MenuIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("line", {
    x1: "4",
    x2: "20",
    y1: "6",
    y2: "6"
  }), createElement("line", {
    x1: "4",
    x2: "20",
    y1: "12",
    y2: "12"
  }), createElement("line", {
    x1: "4",
    x2: "20",
    y1: "18",
    y2: "18"
  }));
}
/** @returns Bot / assistant avatar icon. */
export function BotIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M12 8V4H8"
  }), createElement("rect", {
    width: "16",
    height: "12",
    x: "4",
    y: "8",
    rx: "2"
  }), createElement("path", {
    d: "M2 14h2"
  }), createElement("path", {
    d: "M20 14h2"
  }), createElement("path", {
    d: "M15 13v2"
  }), createElement("path", {
    d: "M9 13v2"
  }));
}
/** @returns Microphone icon for voice input. */
export function MicIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
  }), createElement("path", {
    d: "M19 10v2a7 7 0 0 1-14 0v-2"
  }), createElement("line", {
    x1: "12",
    x2: "12",
    y1: "19",
    y2: "22"
  }));
}
/** @returns Send message icon. */
export function SendIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m22 2-7 20-4-9-9-4Z"
  }), createElement("path", {
    d: "M22 2 11 13"
  }));
}
/** @returns Stop / square icon for aborting generation. */
export function StopIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    ...props
  }, createElement("rect", {
    x: "6",
    y: "6",
    width: "12",
    height: "12",
    rx: "1"
  }));
}
/** @returns Quick mode / zap icon. */
export function ZapIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
  }));
}
/** @returns Think mode / CPU icon. */
export function CpuIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("rect", {
    width: "16",
    height: "16",
    x: "4",
    y: "4",
    rx: "2"
  }), createElement("rect", {
    width: "6",
    height: "6",
    x: "9",
    y: "9",
    rx: "1"
  }), createElement("path", {
    d: "M15 2v2"
  }), createElement("path", {
    d: "M15 20v2"
  }), createElement("path", {
    d: "M2 15h2"
  }), createElement("path", {
    d: "M2 9h2"
  }), createElement("path", {
    d: "M20 15h2"
  }), createElement("path", {
    d: "M20 9h2"
  }), createElement("path", {
    d: "M9 2v2"
  }), createElement("path", {
    d: "M9 20v2"
  }));
}
/** @returns Trash / delete icon. */
export function TrashIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M3 6h18"
  }), createElement("path", {
    d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
  }), createElement("path", {
    d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
  }));
}
/** @returns Copy to clipboard icon. */
export function CopyIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("rect", {
    width: "14",
    height: "14",
    x: "8",
    y: "8",
    rx: "2",
    ry: "2"
  }), createElement("path", {
    d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
  }));
}
/** @returns Overlapping squares with a plus (Canvas / new document). */
export function CanvasIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("rect", {
    width: "14",
    height: "14",
    x: "8",
    y: "8",
    rx: "2",
    ry: "2"
  }), createElement("path", {
    d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
  }), createElement("path", {
    d: "M12 11v6"
  }), createElement("path", {
    d: "M9 14h6"
  }));
}
/** @returns Pencil / edit icon. */
export function PencilIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
  }), createElement("path", {
    d: "m15 5 4 4"
  }));
}
/** @returns Message square icon (Ask mode). */
export function MessageSquareIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
  }));
}
/** @returns Infinity icon (Agent mode). */
/** @returns Lucide brain (stroke) for Artificial Intelligence tiles. */
export function ArtificialIntelligenceIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M12 18V5"
  }), createElement("path", {
    d: "M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"
  }), createElement("path", {
    d: "M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"
  }), createElement("path", {
    d: "M17.997 5.125a4 4 0 0 1 2.526 5.77"
  }), createElement("path", {
    d: "M18 18a4 4 0 0 0 2-7.464"
  }), createElement("path", {
    d: "M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"
  }), createElement("path", {
    d: "M6 18a4 4 0 0 1-2-7.464"
  }), createElement("path", {
    d: "M6.003 5.125a4 4 0 0 0-2.526 5.77"
  }));
}
/** @returns Lucide waypoints (stroke) for Harness tiles — same weight as other Function icons. */
export function HarnessIcon(props: IconProps) {
  return createElement("svg", {
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m10.586 5.414-5.172 5.172"
  }), createElement("path", {
    d: "m18.586 13.414-5.172 5.172"
  }), createElement("path", {
    d: "M6 12h12"
  }), createElement("circle", {
    cx: "12",
    cy: "20",
    r: "2"
  }), createElement("circle", {
    cx: "12",
    cy: "4",
    r: "2"
  }), createElement("circle", {
    cx: "20",
    cy: "12",
    r: "2"
  }), createElement("circle", {
    cx: "4",
    cy: "12",
    r: "2"
  }));
}
/** @returns Lucide terminal (stroke) for Harness command cards. */
export function TerminalIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("polyline", {
    points: "4 17 10 11 4 5"
  }), createElement("line", {
    x1: "12",
    y1: "19",
    x2: "20",
    y2: "19"
  }));
}
/** @returns Pause bars for suspending a Harness scheduled job. */
export function PauseIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("rect", {
    x: "6",
    y: "4",
    width: "4",
    height: "16",
    rx: "1"
  }), createElement("rect", {
    x: "14",
    y: "4",
    width: "4",
    height: "16",
    rx: "1"
  }));
}
/** @returns Infinity icon (legacy Agent glyph). */
export function InfinityIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8"
  }));
}
/** @returns Sparkles icon (default model fallback). */
export function SparklesIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"
  }));
}
/** @returns Map pin icon for location chips. */
export function MapPinIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"
  }), createElement("circle", {
    cx: "12",
    cy: "10",
    r: "3"
  }));
}
/** @returns A clock / hours icon. */
export function ClockIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), createElement("polyline", {
    points: "12 6 12 12 16 14"
  }));
}
/** @returns A file-text / log icon. */
export function FileTextIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("path", {
    d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
  }), createElement("path", {
    d: "M14 2v4a2 2 0 0 0 2 2h4"
  }), createElement("path", {
    d: "M10 9H8"
  }), createElement("path", {
    d: "M16 13H8"
  }), createElement("path", {
    d: "M16 17H8"
  }));
}
/** @returns A navigation / directions icon. */
export function NavigationIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    ...baseProps,
    ...props
  }, createElement("polygon", {
    points: "3 11 22 2 13 21 11 13 3 11"
  }));
}
/**
 * NEXDOT wordmark stacked as two lines (NEX over DOT).
 * NEX uses `currentColor`; DOT uses brand green `#4cb140`.
 * @param props - SVG props.
 * @returns Wordmark SVG.
 */
export function NexdotWordmarkIcon(props: IconProps) {
  return createElement("svg", {
        viewBox: "0 0 820 800",
    "aria-hidden": true,
    ...props
  }, createElement("g", {
        fill: "currentColor",
        transform: "translate(17 8)"
  }, createElement("polygon", {
    points: "75 1.83 189 216.83 189 1.83 257 1.83 257 345.83 184.5 345.83 69 131.83 69 345.83 0 345.83 0 1.83 75 1.83"
  }), createElement("polygon", {
    points: "511 1.83 511 70.83 365 70.83 365 140.83 511 140.83 511 206.83 365 206.83 365 279.83 511 279.83 511.56 344.89 510.36 345.69 296 345.83 296 1.83 511 1.83"
  }), createElement("path", {
    d: "M604,1.59l55.94,103.01L714.65,1.59h72.01l-90.07,171.89,90.07,172.32h-72.01l-55.02-102.39-55.63,102.39h-72.01l90.2-171.8L531.99,1.52l72.01.07Z"
  })), createElement("g", {
        fill: "#4cb140",
        transform: "translate(-805.5 430)"
  }, createElement("path", {
    d: "M809,1.87l132.55-.04c187.67,10.61,189.86,334.68-3.99,344.09l-129.13.62.58-344.67ZM880,278.25c13.1.83,26.37,1.58,39.55,1.04,33.34-1.37,58.07-8.15,75.87-38.13,24.77-41.72,23.6-128.03-20.11-157.73-27.56-18.73-63.75-13.78-95.38-13.75l-.8,1.2.86,207.36Z"
  }), createElement("path", {
    d: "M1236.79.12c193.71-7.6,202.03,340.19,9.75,347.75-190.64,7.5-200.61-340.26-9.75-347.75ZM1233.8,69.13c-74.9,6.81-78.18,124.95-49.97,175.37,30.09,53.79,99.91,44.14,122.65-10.69,23.57-56.81,10.56-172.26-72.68-164.68Z"
  }), createElement("polygon", {
    points: "1622 1.83 1622 70.83 1536 70.83 1536 345.83 1467 345.83 1467 70.83 1381 70.83 1381 1.83 1622 1.83"
  })));
}
// ---------------------------------------------------------------------------
// Markdown editor icons (formerly icons/aura/AllIcons)
// ---------------------------------------------------------------------------
/**
 * Sidebar panel toggle icon.
 *
 * @param props - SVG props plus collapsed chevron direction.
 * @returns SVG element.
 */
export function SidebarIcon({ collapsed, ...props }: IconProps & {
    collapsed?: boolean;
}) {
    return createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      'aria-hidden': true,
      ...props,
    }, createElement('rect', {
      x: 1.5,
      y: 1.5,
      width: 11,
      height: 11,
      rx: 1.5,
      stroke: 'currentColor',
      strokeWidth: 1.4,
    }), createElement('path', {
      d: 'M5 1.5v11',
      stroke: 'currentColor',
      strokeWidth: 1.4,
    }), collapsed
      ? createElement('path', {
          d: 'M7.5 5l2 2-2 2',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        })
      : createElement('path', {
          d: 'M9.5 5l-2 2 2 2',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }));
}
/**
 * Source-mode (Markdown brackets) icon.
 *
 * @param props - SVG props.
 * @returns SVG element.
 */
export function SourceIcon(props: IconProps) {
    return createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 16 16',
      fill: 'none',
      'aria-hidden': true,
      ...props,
    }, createElement('path', {
      d: 'M5.5 3.5 2 8l3.5 4.5M10.5 3.5 14 8l-3.5 4.5M9 3l-2 10',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }));
}
/**
 * Double-chevron hint for status-bar menus.
 *
 * @param props - SVG props.
 * @returns SVG element.
 */
export function ChevronMenuIcon(props: IconProps) {
    return createElement('svg', {
      width: 10,
      height: 10,
      viewBox: '0 0 10 10',
      fill: 'none',
      'aria-hidden': true,
      className: 'block size-2.5 shrink-0 opacity-70',
      ...props,
    }, createElement('path', {
      d: 'M2.5 3.25 5 1.5l2.5 1.75M2.5 6.75 5 8.5l2.5-1.75',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }));
}
/**
 * Expand / collapse chevron for find-replace.
 *
 * @param props - SVG props plus expanded state.
 * @returns SVG element.
 */
export function FindExpandIcon({ expanded, ...props }: IconProps & {
    expanded?: boolean;
}) {
    return createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true, ...props }, createElement('path', {
      d: expanded ? 'M2 4l4 4 4-4' : 'M4 2l4 4-4 4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
    }));
}
/**
 * Previous-match caret.
 *
 * @param props - SVG props.
 * @returns SVG element.
 */
export function FindPrevIcon(props: IconProps) {
    return createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true, ...props }, createElement('path', { d: 'M6 3l4 5H2z', fill: 'currentColor' }));
}
/**
 * Next-match caret.
 *
 * @param props - SVG props.
 * @returns SVG element.
 */
export function FindNextIcon(props: IconProps) {
    return createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true, ...props }, createElement('path', { d: 'M6 9L2 4h8z', fill: 'currentColor' }));
}
/** Path data for the code-block copy control (non-React DOM). */
export const COPY_ICON_PATH = 'M22.545-0h-17.455c-1.6 0-2.909 1.309-2.909 2.909v20.364h2.909v-20.364h17.455v-2.909zM26.909 5.818h-16c-1.6 0-2.909 1.309-2.909 2.909v20.364c0 1.6 1.309 2.909 2.909 2.909h16c1.6 0 2.909-1.309 2.909-2.909v-20.364c0-1.6-1.309-2.909-2.909-2.909zM26.909 29.091h-16v-20.364h16v20.364z';
/**
 * Rotate (redo-style) icon for the image lightbox.
 *
 * @param props - SVG props.
 * @returns SVG element.
 */
export function RotateIcon(props: IconProps) {
    return createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': true,
      ...props,
    }, createElement('path', {
      d: 'M4 12a8 8 0 0 1 13.66-5.66M20 4v5h-5',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }), createElement('path', {
      d: 'M20 12a8 8 0 0 1-13.66 5.66M4 20v-5h5',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }));
}
/**
 * Replace-one icon.
 *
 * @param props - SVG props.
 * @returns SVG element.
 */
export function ReplaceOneIcon(props: IconProps) {
    return createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true, ...props }, createElement('rect', {
      x: 2,
      y: 2,
      width: 6,
      height: 6,
      rx: 1,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
    }), createElement('path', {
      d: 'M8 7h4M10 5v4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
    }));
}
/**
 * Replace-all icon.
 *
 * @param props - SVG props.
 * @returns SVG element.
 */
export function ReplaceAllIcon(props: IconProps) {
    return createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true, ...props }, createElement('rect', {
      x: 1.5,
      y: 1.5,
      width: 5,
      height: 5,
      rx: 0.8,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.1,
    }), createElement('rect', {
      x: 4,
      y: 4,
      width: 5,
      height: 5,
      rx: 0.8,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.1,
    }), createElement('path', {
      d: 'M9.5 8.5h3M11 7v3',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.1,
    }));
}
/** GFM / Typora alert subtypes that have dedicated icons. */
export type CalloutIconType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
/** Path data for callout / alert icons (16×16, filled). */
export const CALLOUT_ICON_PATHS: Record<CalloutIconType, string> = {
    NOTE: 'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.5h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
    TIP: 'M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z',
    IMPORTANT: 'M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
    WARNING: 'M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
    CAUTION: 'M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.141.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
};
/**
 * Resolve callout icon path data for a subtype string.
 *
 * @param type - Alert subtype (case-insensitive).
 * @returns SVG path `d` attribute.
 */
export function calloutIconPath(type: string): string {
    const key = type.toUpperCase() as CalloutIconType;
    return CALLOUT_ICON_PATHS[key] ?? CALLOUT_ICON_PATHS.NOTE;
}
/**
 * Inline SVG markup for a GFM / Typora callout icon (Aura DOM string render).
 *
 * @param type - Alert subtype such as `NOTE`.
 * @returns SVG HTML snippet.
 */
export function calloutIconSvgHtml(type: string): string {
    const d = calloutIconPath(type);
    return (`<svg class="aura-callout-icon" viewBox="0 0 16 16" width="16" height="16" ` +
        `fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`);
}
/**
 * React callout / alert icon.
 *
 * @param props - SVG props plus callout subtype.
 * @returns SVG element.
 */
export function CalloutIcon({ type, ...props }: IconProps & {
    type: string;
}) {
    return createElement('svg', {
      className: 'aura-callout-icon',
      viewBox: '0 0 16 16',
      width: 16,
      height: 16,
      fill: 'currentColor',
      'aria-hidden': true,
      ...props,
    }, createElement('path', { d: calloutIconPath(type) }));
}
/** Path data for in-document `[ToC]` expand / collapse chevron (32×32). */
export const OUTLINE_ACTION_ICON_PATH = 'M3.76 6.12l12.24 12.213 12.24-12.213 3.76 3.76-16 16-16-16 3.76-3.76z';
/**
 * Inline SVG markup for a ToC branch expand control.
 *
 * @returns SVG HTML with `aura-outline__action` class.
 */
export function outlineActionIconSvgHtml(): string {
    return (`<svg class="aura-outline__action" viewBox="0 0 32 32" aria-hidden="true">` +
        `<path d="${OUTLINE_ACTION_ICON_PATH}"></path></svg>`);
}
/**
 * Empty SVG spacer so leaf ToC rows align with branched rows.
 *
 * @returns Empty SVG HTML snippet.
 */
export function outlineLeafSpacerSvgHtml(): string {
    return '<svg aria-hidden="true"></svg>';
}
/**
 * React ToC expand / collapse chevron.
 *
 * @param props - SVG props.
 * @returns SVG element.
 */
export function OutlineActionIcon(props: IconProps) {
    return createElement('svg', {
      className: 'aura-outline__action',
      viewBox: '0 0 32 32',
      'aria-hidden': true,
      ...props,
    }, createElement('path', { d: OUTLINE_ACTION_ICON_PATH }));
}
// --- AI Settings provider icons (Cherry Studio brands) ---
/** @returns Brand icon for AI provider `302ai`. */
export function Ai302aiProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-ai302light__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 27,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 27H27V92H92V27Z" })), createElement("g", { mask: `url(#${iconId}-ai302light__a)` }, createElement("mask", {
        id: `${iconId}-ai302light__b`,
        width: 65,
        height: 65,
        x: 27,
        y: 27,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 27H27V92H92V27Z" })), createElement("g", { mask: `url(#${iconId}-ai302light__b)` }, createElement("path", { fill: "#3F3FAA", d: "M62.6384 91.9985C78.8537 91.9985 91.9992 78.8292 91.9992 62.5841C91.9992 46.3391 78.8537 33.1699 62.6384 33.1699C46.4232 33.1699 33.2781 46.3391 33.2781 62.5841C33.2781 78.8292 46.4232 91.9985 62.6384 91.9985Z" }), createElement("path", { fill: "#8E47F0", d: "M56.3605 85.8285C72.5758 85.8285 85.721 72.6595 85.721 56.4144C85.721 40.1692 72.5758 27 56.3605 27C40.1451 27 27 40.1692 27 56.4144C27 72.6595 40.1451 85.8285 56.3605 85.8285Z" }), createElement("path", { fill: "#fff", d: "M55.9083 75.9903C53.8225 75.9903 51.8076 75.3 50.1372 73.9946C48.1539 72.4454 46.8899 70.2134 46.5821 67.7126C46.4885 66.9488 46.4846 66.1913 46.5708 65.4465C45.9907 65.5594 45.3904 65.6179 44.7787 65.6179C39.5862 65.6179 35.3613 61.3851 35.3613 56.1832C35.3613 50.9811 39.5862 46.7485 44.7787 46.7485C45.5209 46.7485 46.2441 46.8347 46.9368 46.9984C46.8962 46.6432 46.876 46.2829 46.876 45.9212C46.876 40.7192 51.1009 36.4865 56.2934 36.4865C61.4858 36.4865 65.7108 40.7192 65.7108 45.9212C65.7108 46.2232 65.6968 46.5239 65.6679 46.8233C66.4302 46.6901 67.2129 46.6495 68.0018 46.7091C73.1804 47.0936 77.0813 51.6282 76.6975 56.8164C76.5112 59.3297 75.3588 61.6199 73.454 63.2655C71.5478 64.9111 69.115 65.7157 66.6087 65.5277C66.1528 65.4937 65.7047 65.4276 65.2664 65.3312C65.2688 65.3528 65.2713 65.3742 65.2751 65.3959C65.5841 67.8967 64.9027 70.3683 63.3565 72.3566C61.8101 74.3447 59.5824 75.6095 57.0862 75.9191C56.6924 75.9673 56.2983 75.9903 55.9083 75.9903ZM50.6817 63.5296C50.0206 64.6765 49.7584 65.9771 49.9218 67.299C50.1207 68.9066 50.9312 70.3402 52.2065 71.335C53.4806 72.3311 55.0664 72.7701 56.6708 72.5708C58.2754 72.3717 59.7065 71.5597 60.6993 70.282C61.6936 69.0041 62.1319 67.4157 61.933 65.8094C61.8025 64.7488 61.3998 63.7527 60.7641 62.9091C60.3487 62.5069 59.9687 62.0654 59.6279 61.5844C59.0899 60.8258 59.2672 59.7726 60.0244 59.2333C60.7817 58.6927 61.8328 58.8717 62.3713 59.6293C62.4966 59.8056 62.6296 59.9743 62.7713 60.1341C62.8842 60.214 62.9893 60.3093 63.0844 60.4185C63.1412 60.4856 63.1981 60.5528 63.2525 60.6213C64.2405 61.5159 65.5018 62.0627 66.857 62.1629C70.1929 62.4129 73.093 59.8996 73.34 56.5651C73.587 53.2307 71.0807 50.3176 67.7524 50.0702C66.4771 49.975 65.232 50.277 64.1469 50.9431C63.6314 51.3669 62.8904 51.4595 62.2699 51.1182C61.4555 50.6703 61.1565 49.6451 61.6037 48.8293C62.0888 47.9437 62.3447 46.9375 62.3447 45.92C62.3447 42.5767 59.6294 39.8564 56.2921 39.8564C52.955 39.8564 50.2397 42.5767 50.2397 45.92C50.2397 47.1164 50.5868 48.2723 51.2428 49.2645C51.2744 49.3127 51.3036 49.3621 51.3301 49.4129C53.0956 51.1283 54.1937 53.5301 54.1937 56.1832C54.1937 59.1483 52.8233 61.7989 50.6817 63.5296ZM44.7775 50.1209C41.4403 50.1209 38.725 52.8412 38.725 56.1846C38.725 59.5277 41.4403 62.248 44.7775 62.248C48.1146 62.248 50.8299 59.5277 50.8299 56.1846C50.8299 52.8412 48.1146 50.1209 44.7775 50.1209Z" })))));
}
/** @returns Brand icon for AI provider `aihubmix`. */
export function AihubmixProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 120 120",
        ...props
    }, createElement("path", { fill: "#006FFB", d: "M0 0H120V120H0z" }), createElement("path", { fill: "#FDFEFE", d: "M60.3712 31C60.4344 31 60.4976 31 60.5626 31C61.7537 34.6203 61.7537 34.6203 62.1896 36.2484C62.2223 36.3701 62.2552 36.4917 62.2889 36.6169C62.7744 38.4222 63.2176 40.2249 63.5294 42.0694C63.545 42.1557 63.5604 42.2419 63.5765 42.3307C64.0223 44.8313 63.8134 47.3259 63.6251 49.8407C63.2785 54.4762 63.0179 59.3176 66.1862 63.1088C68.1923 65.3638 70.8966 67.0075 73.961 67.2621C77.3742 67.4489 80.4483 66.6453 83.0383 64.337C85.2675 62.2947 86.755 59.4957 86.8959 56.4372C86.8975 56.3227 86.8992 56.2081 86.901 56.0901C86.9033 55.958 86.9059 55.8259 86.9085 55.6938C86.9097 55.6246 86.911 55.5555 86.9123 55.4842C87.0136 50.4089 87.7527 45.3468 89.0819 40.4472C92.8108 45.1041 93.3976 53.4721 92.7964 59.1687C92.6617 60.2917 92.4509 61.4005 92.2047 62.504C92.1486 62.7579 92.096 63.0124 92.0442 63.2673C91.5475 65.615 90.6253 67.8857 89.5604 70.0295C89.5176 70.1163 89.4746 70.203 89.4304 70.2924C88.2361 72.6856 86.7483 74.901 84.9667 76.9002C84.9053 76.9696 84.8439 77.039 84.7808 77.1105C84.2281 77.7303 83.6525 78.3235 83.0646 78.9101C82.9331 79.043 82.9331 79.043 82.7988 79.1787C82.2117 79.7654 81.6004 80.3003 80.9472 80.8127C80.8788 80.867 80.8103 80.9214 80.7398 80.9773C77.3568 83.6448 73.5192 85.6434 69.3673 86.8245C69.3015 86.8436 69.2358 86.8628 69.168 86.8825C68.2156 87.1571 67.2543 87.3716 66.2809 87.5581C66.1344 87.5871 66.1344 87.5871 65.9848 87.6166C64.1214 87.9598 62.2312 88.0057 60.3414 87.9995C60.2346 87.9994 60.1279 87.9991 60.0178 87.999C58.4579 87.9952 56.9352 87.948 55.3948 87.6834C55.3023 87.6685 55.21 87.6537 55.1148 87.6385C54.0086 87.4609 52.9297 87.2334 51.8538 86.92C51.7107 86.8806 51.5677 86.8414 51.4246 86.8022C45.3067 85.0902 39.1722 81.2148 35.2973 76.1368C35.1939 76.0074 35.0901 75.8781 34.9863 75.7491C34.2284 74.8021 33.5341 73.8333 32.9047 72.7969C32.8596 72.7227 32.8146 72.6487 32.7681 72.5724C29.6294 67.3671 27.9922 61.5371 28 55.471C28 55.3979 28.0001 55.3248 28.0001 55.2494C28.0056 53.4362 28.1894 51.6799 28.5024 49.8944C28.5207 49.7895 28.5391 49.6845 28.558 49.5763C29.1369 46.373 30.2938 43.3476 31.7563 40.4472C31.851 40.4944 31.851 40.4944 31.9477 40.5427C32.0146 40.7521 32.0146 40.7521 32.0751 41.0317C32.098 41.1352 32.1208 41.2388 32.1443 41.3455C32.1683 41.4584 32.1923 41.5714 32.2168 41.6877C32.2548 41.8635 32.2548 41.8635 32.2936 42.0427C32.3456 42.2855 32.3972 42.5283 32.4485 42.7712C32.5132 43.0778 32.5793 43.384 32.6457 43.6902C33.2198 46.3919 33.6236 49.1472 33.8618 51.8984C33.8706 51.9998 33.8795 52.1012 33.8887 52.2056C33.9394 52.8388 33.9665 53.4696 33.9776 54.1044C33.9797 54.2181 33.9797 54.2181 33.9819 54.3341C33.9873 54.6459 33.9925 54.9577 33.9959 55.2695C34.0359 58.719 35.2329 61.7444 37.7045 64.1791C39.025 65.4288 40.708 66.4199 42.475 66.8804C42.574 66.9062 42.574 66.9062 42.675 66.9326C45.6724 67.6876 48.9569 67.2921 51.6362 65.7225C54.3717 64.0508 56.2788 61.5747 57.1174 58.4829C57.2517 57.8842 57.3386 57.2793 57.4045 56.6697C57.4133 56.5898 57.4222 56.51 57.4311 56.4275C57.501 55.7369 57.5261 55.0496 57.5301 54.3556C57.5304 54.2934 57.5309 54.2312 57.5313 54.1671C57.535 52.7539 57.4197 51.3502 57.3088 49.9422C56.9221 45.0175 56.9221 45.0175 57.3088 42.6421C57.3209 42.5663 57.333 42.4903 57.3454 42.4123C57.5609 41.0731 57.8387 39.7594 58.1743 38.4452C58.2478 38.1573 58.3197 37.869 58.3916 37.5807C58.7225 36.2642 59.1005 34.9661 59.5099 33.6719C59.5328 33.5996 59.5556 33.5273 59.5792 33.4528C59.7118 33.0342 59.8466 32.6163 59.9824 32.1989C60.0206 32.0812 60.0586 31.9637 60.0978 31.8426C60.1888 31.5617 60.28 31.2808 60.3712 31Z" })));
}
/** @returns Brand icon for AI provider `aionly`. */
export function AionlyProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#2172FC", d: "M51.8669 42.9666C51.9203 42.9968 51.9738 43.0271 52.0287 43.0582C52.6108 43.4298 52.8969 43.9904 53.2251 44.5795C53.3136 44.7369 53.402 44.8943 53.4904 45.0517C53.6412 45.3206 53.7917 45.5897 53.9415 45.8592C54.2926 46.4897 54.6524 47.1143 55.0184 47.7363C55.4418 48.4568 55.8493 49.1842 56.2466 49.9194C56.7637 50.875 57.3077 51.8152 57.8512 52.756C57.883 52.8112 57.9147 52.8663 57.9474 52.9231C58.0306 53.0674 58.114 53.2114 58.1974 53.3555C58.4632 53.8435 58.4838 54.3074 58.4033 54.851C58.2402 55.3315 57.9768 55.7713 57.7242 56.2092C57.6772 56.2913 57.6772 56.2913 57.6293 56.3751C57.4623 56.6653 57.2919 56.9535 57.12 57.2408C56.8298 57.7268 56.5476 58.2175 56.2651 58.7081C56.184 58.849 56.184 58.849 56.1012 58.9928C55.9901 59.1855 55.8791 59.3783 55.768 59.5712C55.5007 60.0353 55.233 60.4991 54.9654 60.963C54.8592 61.1469 54.7531 61.3308 54.647 61.5147C54.4348 61.8826 54.2225 62.2504 54.0104 62.6182C53.9578 62.7094 53.9053 62.8004 53.8512 62.8942C53.7451 63.078 53.6391 63.2618 53.533 63.4456C53.2666 63.9074 53.0001 64.3693 52.734 64.8313C52.2228 65.7186 51.7102 66.6049 51.1931 67.4888C50.7329 68.2757 50.2792 69.0663 49.8279 69.8584C49.3887 70.629 48.9441 71.3962 48.4959 72.1616C48.1156 72.8122 47.7409 73.4658 47.3678 74.1206C46.9003 74.9412 46.4281 75.759 45.9502 76.5737C45.6803 77.0348 45.4138 77.4976 45.1511 77.9628C45.0912 78.0688 45.0312 78.1747 44.9712 78.2806C44.8574 78.4817 44.7444 78.6831 44.6317 78.8848C43.7636 80.42 42.8681 81.6912 41.1055 82.2321C40.5064 82.3924 39.9184 82.3913 39.3022 82.3891C39.1766 82.3895 39.051 82.3902 38.9254 82.3909C38.5871 82.3924 38.2489 82.3923 37.9105 82.3918C37.6274 82.3915 37.3442 82.3921 37.0611 82.3925C36.3934 82.3937 35.7256 82.3936 35.0579 82.3926C34.3697 82.3917 33.6817 82.3928 32.9937 82.3951C32.4014 82.397 31.8093 82.3976 31.2171 82.3971C30.864 82.3968 30.5109 82.397 30.1579 82.3984C29.8262 82.3998 29.4946 82.3995 29.1631 82.3978C29.0416 82.3975 28.9201 82.3978 28.7986 82.3987C27.6563 82.4064 27.6563 82.4064 27.2493 82.0152C26.9877 81.6523 26.9703 81.3852 27.0255 80.9595C27.131 80.5348 27.3707 80.182 27.5995 79.8134C27.7087 79.6321 27.8178 79.4507 27.9268 79.2693C28.0115 79.1296 28.0115 79.1296 28.098 78.987C28.3717 78.5324 28.6353 78.072 28.8993 77.6116C29.0062 77.4261 29.1131 77.2407 29.22 77.0552C29.2996 76.917 29.2996 76.917 29.3808 76.7761C29.6463 76.3152 29.9121 75.8546 30.178 75.3939C30.2841 75.21 30.3902 75.0261 30.4963 74.8421C33.6796 69.3244 36.8629 63.8067 40.0462 58.2889C40.0988 58.1979 40.1513 58.1068 40.2054 58.013C40.3115 57.8293 40.4175 57.6454 40.5236 57.4617C40.7901 56.9998 41.0564 56.5379 41.3225 56.0759C41.9834 54.9289 42.6479 53.7841 43.3158 52.6411C43.5632 52.2178 43.8102 51.7942 44.0572 51.3706C44.1565 51.2003 44.256 51.0299 44.3553 50.8596C44.5501 50.5256 44.7449 50.1915 44.9396 49.8575C45.3551 49.1446 45.7711 48.4319 46.1877 47.7198C46.2174 47.669 46.247 47.6183 46.2776 47.5661C46.4291 47.3072 46.5809 47.0484 46.7331 46.7899C46.794 46.6863 46.855 46.5827 46.9159 46.4792C46.9461 46.4279 46.9763 46.3765 47.0074 46.3236C47.1939 46.0063 47.3781 45.6878 47.5608 45.3683C47.6809 45.1585 47.8021 44.9492 47.9234 44.7401C48.0071 44.5948 48.0895 44.4489 48.1719 44.3029C48.5598 43.636 49.0221 42.994 49.7898 42.7488C50.4878 42.6262 51.2498 42.5888 51.8669 42.9666Z" }), createElement("path", { fill: "#00E5E5", d: "M62.1678 54.1285C62.3314 54.1271 62.3314 54.1271 62.4985 54.1256 62.6187 54.1262 62.7391 54.1269 62.8594 54.1276 62.9866 54.1272 63.1138 54.1266 63.241 54.1259 63.5862 54.1243 63.9314 54.125 64.2766 54.126 64.6387 54.1268 65.0007 54.1261 65.3628 54.1255 65.9715 54.1249 66.58 54.1257 67.1887 54.1273 67.8903 54.1292 68.5919 54.1286 69.2936 54.1267 69.8972 54.1252 70.5008 54.125 71.1045 54.1258 71.4645 54.1264 71.8244 54.1265 72.1844 54.1253 72.5235 54.1243 72.8626 54.125 73.2017 54.127 73.3255 54.1274 73.4492 54.1273 73.5729 54.1265 74.9979 54.1186 76.0688 54.5352 77.1231 55.481 77.6685 56.0525 78.0481 56.7129 78.4352 57.3974 78.5197 57.5454 78.6042 57.6934 78.6889 57.8414 78.7465 57.9422 78.8039 58.0429 78.8614 58.1437 79.1384 58.6292 79.4206 59.1116 79.7032 59.5938 80.1635 60.3807 80.617 61.1713 81.0684 61.9633 81.5099 62.7379 81.9564 63.5094 82.4066 64.279 82.929 65.1723 83.4456 66.069 83.9621 66.9657 84.2277 67.4266 84.4936 67.8873 84.7594 68.348 84.8655 68.5319 84.9716 68.7158 85.0777 68.8997 85.1302 68.9907 85.1827 69.0818 85.2369 69.1756 89.5344 76.6245 89.5344 76.6245 89.6938 76.9009 89.799 77.0832 89.9042 77.2656 90.0094 77.4479 90.2586 77.8798 90.5077 78.3116 90.7564 78.7438 90.8742 78.9484 90.992 79.153 91.1099 79.3575 91.1928 79.5023 91.2765 79.6472 91.3594 79.7921 91.4352 79.9232 91.4352 79.9231 91.5126 80.0568 91.5568 80.134 91.6011 80.2111 91.6469 80.2904 91.7369 80.4438 91.834 80.5935 91.9327 80.7416 92.048 81.2304 92.0227 81.5041 91.7961 81.9503 91.5821 82.2203 91.3452 82.3425 91.0047 82.387 90.9123 82.3874 90.8199 82.3877 90.7248 82.388 90.5651 82.3894 90.5651 82.3894 90.4021 82.3909 90.2848 82.3907 90.1674 82.3904 90.05 82.3901 89.9259 82.3908 89.8017 82.3915 89.6776 82.3923 89.3406 82.3942 89.0036 82.3945 88.6667 82.3943 88.3845 82.3943 88.1023 82.395 87.8201 82.3957 87.1532 82.3973 86.4864 82.3976 85.8194 82.397 85.1344 82.3964 84.4494 82.3984 83.7643 82.4016 83.1743 82.4042 82.5843 82.4051 81.9942 82.4048 81.6427 82.4046 81.2912 82.405 80.9397 82.4072 80.6081 82.4091 80.2765 82.4088 79.9449 82.4072 79.8243 82.4069 79.7038 82.4073 79.5832 82.4085 78.4026 82.4197 77.2459 82.1819 76.313 81.4207 76.2474 81.3737 76.1819 81.3266 76.1144 81.2781 75.4097 80.7237 75.0211 79.9776 74.5865 79.2081 74.4401 78.9495 74.2915 78.6923 74.1424 78.4354 73.8722 77.9696 73.6036 77.5029 73.3354 77.0359 73.0694 76.573 72.8024 76.1107 72.5355 75.6483 72.4293 75.4644 72.3232 75.2804 72.2172 75.0965 72.1646 75.0055 72.1121 74.9144 72.058 74.8207 71.8988 74.5448 71.7397 74.2689 71.5805 73.993 71.528 73.9019 71.4754 73.811 71.4213 73.7172 71.3151 73.5331 71.2089 73.349 71.1028 73.1649 70.8387 72.7072 70.5745 72.2495 70.3101 71.7919 69.7891 70.89 69.2698 69.9873 68.7539 69.0825 68.2566 68.2106 67.7551 67.3411 67.2483 66.4746 66.7259 65.5813 66.2093 64.6846 65.6927 63.7879 65.4272 63.3271 65.1613 62.8665 64.8955 62.4058 64.7894 62.2219 64.6833 62.0379 64.5772 61.854 64.5246 61.7629 64.4721 61.6719 64.418 61.5781 64.2588 61.3022 64.0997 61.0263 63.9405 60.7504 63.8879 60.6593 63.8354 60.5682 63.7813 60.4743 63.6756 60.2912 63.5699 60.1081 63.4644 59.925 63.1355 59.3551 62.8067 58.7851 62.4776 58.2154 62.3684 58.0261 62.2594 57.8368 62.1505 57.6474 61.9314 57.2662 61.712 56.8855 61.4844 56.5093 61.4522 56.4554 61.4199 56.4014 61.3868 56.3458 61.3071 56.2128 61.2262 56.0805 61.1452 55.9483 60.9634 55.5451 60.8958 55.172 61.0437 54.7446 61.3528 54.2913 61.6192 54.1292 62.1678 54.1285ZM54.1324 38.0307C54.2145 38.03 54.2965 38.0295 54.3811 38.0288 54.4711 38.0286 54.561 38.0284 54.6537 38.0281 54.796 38.0273 54.796 38.0273 54.9411 38.0265 55.2561 38.0247 55.571 38.0238 55.886 38.0229 55.9937 38.0226 56.1015 38.0222 56.2125 38.0219 56.7247 38.0203 57.2369 38.0191 57.7492 38.0183 58.3377 38.0176 58.9261 38.0153 59.5147 38.0119 60.0263 38.0089 60.538 38.008 61.0496 38.0076 61.2661 38.0072 61.4826 38.0063 61.699 38.0047 64.375 37.9864 64.375 37.9864 65.5751 38.7117 65.6237 38.7408 65.6723 38.77 65.7223 38.8 66.0898 39.0259 66.4164 39.2663 66.7212 39.5711 66.7212 39.6272 66.7212 39.6832 66.7212 39.7409 66.7772 39.7409 66.8332 39.7409 66.8909 39.7409 67.4383 40.428 67.8746 41.1994 68.3022 41.9639 68.3607 42.0675 68.4193 42.1712 68.4779 42.2748 68.568 42.4339 68.6581 42.5931 68.748 42.7525 69.0469 43.2822 69.3507 43.809 69.6551 44.3355 69.7605 44.5179 69.8658 44.7003 69.9712 44.8826 70.0231 44.9726 70.0751 45.0626 70.1287 45.1553 70.2873 45.43 70.4459 45.7047 70.6045 45.9795 70.6571 46.0708 70.7097 46.162 70.764 46.256 70.8696 46.4391 70.9751 46.6222 71.0806 46.8053 71.3257 47.2305 71.5712 47.6556 71.8181 48.0798 71.9045 48.2283 71.9908 48.3769 72.0771 48.5255 72.1846 48.7107 72.2924 48.8957 72.4004 49.0806 72.6499 49.5109 72.893 49.9442 73.1246 50.3845 73.1665 50.4638 73.2085 50.5431 73.2517 50.6249 73.355 50.894 73.3695 51.0846 73.3425 51.3706 73.1391 51.7409 72.9243 52.0544 72.507 52.1826 72.3129 52.2217 72.1371 52.2304 71.9392 52.2308 71.824 52.2314 71.824 52.2314 71.7066 52.2319 71.5813 52.2319 71.5813 52.2319 71.4534 52.2318 71.3648 52.2321 71.2763 52.2324 71.1851 52.2327 70.8919 52.2335 70.5986 52.2337 70.3053 52.2338 70.1011 52.234 69.8967 52.2343 69.6924 52.2346 69.2635 52.2351 68.8345 52.2353 68.4056 52.2352 67.8581 52.2352 67.3107 52.2364 66.7633 52.2378 66.3408 52.2387 65.9183 52.239 65.4959 52.2389 65.2942 52.239 65.0925 52.2394 64.8908 52.24 62.916 52.2458 61.1163 52.12 59.5879 50.7008 58.7692 49.8236 58.2236 48.6876 57.6353 47.6532 57.3415 47.1366 57.0442 46.6221 56.7468 46.1075 56.6407 45.9236 56.5346 45.7397 56.4285 45.5558 56.3759 45.4647 56.3234 45.3737 56.2693 45.2799 55.7918 44.4522 55.7918 44.4522 55.6325 44.176 55.527 43.9932 55.4215 43.8103 55.316 43.6275 55.07 43.2013 54.8241 42.7748 54.5785 42.3483 54.4922 42.1984 54.4059 42.0485 54.3195 41.8986 54.2117 41.7114 54.1039 41.5242 53.9962 41.3369 53.7211 40.8594 53.4418 40.3852 53.1532 39.9157 52.9375 39.535 52.8929 39.1494 52.9693 38.7222 53.2591 38.227 53.5584 38.0336 54.1324 38.0307Z" }), createElement("path", { fill: "#2171FC", d: "M53.3483 68.1671C53.4643 68.1665 53.4643 68.1665 53.5826 68.1659C53.6674 68.1659 53.752 68.166 53.8392 68.166C53.9733 68.1656 53.9733 68.1656 54.11 68.1652C54.4064 68.1644 54.7029 68.1642 54.9993 68.1641C55.2057 68.1639 55.412 68.1636 55.6184 68.1633C56.0518 68.1628 56.4853 68.1626 56.9188 68.1626C57.472 68.1627 58.0252 68.1615 58.5785 68.16C59.0052 68.1591 59.432 68.1589 59.8587 68.159C60.0626 68.1589 60.2664 68.1585 60.4702 68.1578C62.2039 68.1528 63.8471 68.1613 65.2794 69.282C65.3812 69.3599 65.3812 69.3599 65.4851 69.4394C66.6231 70.3813 67.2475 71.7864 67.9455 73.0585C68.1821 73.4891 68.4238 73.9158 68.675 74.3381C69.0245 74.9261 69.368 75.5174 69.7096 76.1101C69.7632 76.2032 69.8168 76.2962 69.872 76.392C70.0968 76.7821 70.3215 77.1723 70.546 77.5626C70.661 77.7622 70.7759 77.9618 70.891 78.1614C70.9984 78.348 71.1058 78.5346 71.2132 78.7212C71.488 79.1981 71.7665 79.6721 72.0527 80.1421C72.3012 80.5664 72.3652 80.9179 72.2977 81.3997C72.183 81.7815 71.9177 82.0744 71.5773 82.2759C71.3673 82.3649 71.2192 82.3765 70.9917 82.3774C70.9117 82.3781 70.8317 82.3788 70.7492 82.3796C70.6619 82.3796 70.5746 82.3795 70.4847 82.3794C70.3923 82.3799 70.2999 82.3805 70.2048 82.3811C69.8985 82.3827 69.5923 82.383 69.2861 82.3833C69.0726 82.3838 68.8593 82.3844 68.6458 82.3849C68.1976 82.3859 67.7494 82.3863 67.3012 82.3862C66.7861 82.3861 66.271 82.3878 65.756 82.3905C65.258 82.3931 64.7601 82.3937 64.2622 82.3935C64.0516 82.3938 63.8411 82.3945 63.6305 82.3958C61.7504 82.4065 60.1232 82.2292 58.7165 80.8639C58.2461 80.3794 57.9076 79.8355 57.583 79.2475C57.402 78.9224 57.2142 78.6013 57.0275 78.2795C56.862 77.9939 56.6972 77.7078 56.5326 77.4216C56.2089 76.8586 55.8844 76.2959 55.5598 75.7335C55.4536 75.5495 55.3475 75.3656 55.2414 75.1817C55.1889 75.0906 55.1363 74.9996 55.0823 74.9058C54.6048 74.0781 54.6048 74.0781 54.4453 73.8018C54.3401 73.6193 54.2348 73.4368 54.1295 73.2543C53.8812 72.8241 53.633 72.3937 53.3849 71.9633C53.2679 71.7603 53.1509 71.5574 53.0339 71.3544C52.9515 71.2115 52.8692 71.0685 52.7868 70.9255C52.7367 70.8386 52.6867 70.7518 52.6351 70.6624C52.5912 70.5862 52.5472 70.51 52.5021 70.4315C52.4162 70.284 52.3279 70.1381 52.2376 69.9935C52.081 69.7201 52.0478 69.5117 52.0369 69.1971C52.1713 68.7562 52.3292 68.5147 52.716 68.2633C52.9552 68.1836 53.1009 68.1676 53.3483 68.1671Z" })));
}
/** @returns Brand icon for AI provider `alayanew`. */
export function AlayanewProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#FF8400", d: "M67.5578 36.2259C71.6597 39.1998 74.8258 42.3911 75.8356 47.4744C75.9918 48.6422 76.0881 49.8179 76.172 50.9932C76.87 51.0312 77.568 51.0694 78.2872 51.1086C82.8747 51.7012 86.7111 54.1249 89.5332 57.7567C92.2368 61.9807 93.5482 66.2946 92.785 71.2981C91.5247 76.0214 89.3617 80.0213 85.178 82.6836C81.7255 84.5225 78.3736 86.0861 74.4415 84.9502C73.0956 84.2195 73.0956 84.2195 71.865 82.9889C72.0137 79.8645 72.5411 77.1329 73.4416 74.1439C74.6349 69.9527 75.0347 65.9656 73.5954 61.7994C72.2921 59.9566 71.3378 58.9529 69.4038 57.7615C66.9313 57.4803 64.4634 57.7355 61.9889 57.9118C58.0929 58.0743 58.0929 58.0743 55.944 56.305C55.5125 55.7704 55.081 55.2358 54.6365 54.685C51.2252 52.2088 47.4607 51.7583 43.352 51.296C42.8118 51.1961 42.2716 51.0961 41.7151 50.9932C40.7116 48.9861 41.6271 47.3163 42.28 45.2536C44.1552 40.623 47.4392 37.3634 51.8676 35.1492C56.7528 33.4652 63.0717 33.4773 67.5578 36.2259Z" }), createElement("path", { fill: "#4362FF", d: "M52.8355 56.2324C54.1483 57.2443 54.6418 58.0821 55.251 59.607 54.768 59.9425 54.285 60.278 53.7873 60.6237 48.4877 64.4276 43.7974 68.2919 41.938 74.8284 41.3442 78.525 42.2327 81.9978 43.5603 85.4497 38.0006 84.6146 34.4195 83.0285 30.8385 78.5828 28.0476 74.7051 27.7032 71.0007 28.1777 66.3753 29.0626 61.8793 31.829 58.27 35.5614 55.6748 41.2091 52.7264 47.342 53.3193 52.8355 56.2324ZM64.6344 59.9915C67.0601 60.0262 67.9885 60.1082 70.0952 61.4144 72.4731 65.2984 72.0267 68.4593 71.0204 72.6599 70.7942 73.5483 70.558 74.4343 70.3104 75.317 69.3196 78.982 69.403 81.375 69.403 85.4496 64.7328 85.4496 60.0627 85.4496 55.251 85.4496 56.2082 83.5352 56.9708 82.3194 58.289 80.7195 61.4543 76.5404 62.5554 72.1879 62.0193 66.9906 61.7225 65.3298 61.3855 63.6908 60.9978 62.0489 60.9288 61.6492 60.8598 61.2494 60.7887 60.8375 61.8467 59.7796 63.191 60.0417 64.6344 59.9915Z" }), createElement("path", { fill: "#4362FF", d: "M57.0584 62.799C57.6866 63.0464 57.6866 63.0464 58.3274 63.2989C59.927 67.5329 59.9412 71.6243 58.3852 75.9102C56.6697 79.3471 54.3682 81.8211 50.9438 83.6039C48.6164 84.0514 47.783 83.9626 45.8292 82.6424C44.4076 80.5891 44.1755 79.3428 44.1755 76.8356C45.5918 71.7389 49.0497 67.0903 53.1743 63.8373C55.251 62.6836 55.251 62.6836 57.0584 62.799Z" })));
}
/** @returns Brand icon for AI provider `aws-bedrock`. */
export function AwsBedrockProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 120 120",
        ...props
    }, createElement("path", { fill: `url(#${iconId}-awsbedrocklight__a)`, d: "M0 0H120V120H0z" }), createElement("path", {
        fill: "#fff",
        fillRule: "evenodd",
        d: "M59.4997 84.4436L49.6443 87.7303L45.8012 85.1663L49.9855 83.7688L48.7018 79.9175L41.5193 82.3108L39.1874 80.7589V69.6558C39.1874 68.888 38.7528 68.1852 38.0662 67.84L31.0626 64.338V54.6609L37.1563 51.6141L43.25 54.6609V61.5308C43.25 62.3027 43.6846 63.0055 44.3712 63.3508L52.4961 67.4133L54.316 63.7773L47.3124 60.2755V54.6609L54.316 51.163C55.0026 50.8176 55.4373 50.1148 55.4373 49.3429V43.249H51.3748V48.0876L45.2811 51.1344L39.1874 48.0876V38.244L43.25 35.5342V43.249H47.3124V32.8286L49.6443 31.2727L59.4997 34.5592V84.4436ZM81.8434 79.8123C82.9605 79.8123 83.8745 80.7219 83.8745 81.8432C83.8745 82.9644 82.9605 83.8745 81.8434 83.8745C80.7266 83.8745 79.8126 82.9644 79.8126 81.8432C79.8126 80.7219 80.7266 79.8123 81.8434 79.8123ZM77.7808 35.124C78.8984 35.124 79.8126 36.0339 79.8126 37.1552C79.8126 38.2765 78.8984 39.1865 77.7808 39.1865C76.6637 39.1865 75.7497 38.2765 75.7497 37.1552C75.7497 36.0339 76.6637 35.124 77.7808 35.124ZM85.9063 59.4995C87.0231 59.4995 87.9371 60.4095 87.9371 61.5308C87.9371 62.6521 87.0231 63.562 85.9063 63.562C84.7887 63.562 83.8745 62.6521 83.8745 61.5308C83.8745 60.4095 84.7887 59.4995 85.9063 59.4995ZM80.1859 63.562C81.0269 65.9224 83.2616 67.6246 85.9063 67.6246C89.2656 67.6246 92 64.8946 92 61.5308C92 58.171 89.2656 55.437 85.9063 55.437C83.2616 55.437 81.0269 57.1432 80.1859 59.4995H63.5623V51.3742H77.7808C78.9021 51.3742 79.8126 50.4683 79.8126 49.3429V42.8754C82.1724 42.0344 83.8745 39.8 83.8745 37.1552C83.8745 33.7955 81.1409 31.0614 77.7808 31.0614C74.4212 31.0614 71.6871 33.7955 71.6871 37.1552C71.6871 39.8 73.3897 42.0344 75.7497 42.8754V47.3117H63.5623V33.0927C63.5623 32.2192 63.0016 31.4433 62.1728 31.167L49.9855 27.1044C49.3883 26.9053 48.7384 26.9947 48.2183 27.3401L36.0309 35.4652C35.4662 35.843 35.125 36.4768 35.125 37.1552V48.0876L28.1212 51.5896C27.4348 51.935 27 52.6378 27 53.4056V65.5933C27 66.3652 27.4348 67.0681 28.1212 67.4133L35.125 70.9113V81.8432C35.125 82.5216 35.4662 83.1594 36.0309 83.5332L48.2183 91.6587C48.5556 91.8862 48.9456 92 49.3437 92C49.5589 92 49.7743 91.9671 49.9855 91.8939L62.1728 87.8318C63.0016 87.5596 63.5623 86.7837 63.5623 85.9062V75.7493H72.8779L76.3428 79.2187L76.3956 79.1663C75.9979 79.9789 75.7497 80.8804 75.7497 81.8432C75.7497 85.2029 78.4841 87.937 81.8434 87.937C85.203 87.937 87.9371 85.2029 87.9371 81.8432C87.9371 78.4838 85.203 75.7493 81.8434 75.7493C80.8765 75.7493 79.9746 75.9975 79.1666 76.3998L79.219 76.3469L75.1569 72.2839C74.7747 71.9025 74.2588 71.6872 73.7189 71.6872H63.5623V63.562H80.1859Z",
        clipRule: "evenodd"
    }), createElement("defs", {}, createElement("linearGradient", {
        id: `${iconId}-awsbedrocklight__a`,
        x1: 0,
        x2: 12000,
        y1: 12000,
        y2: 0,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#055F4E" }), createElement("stop", { offset: 1, stopColor: "#56C0A7" })))));
}
/** @returns Brand icon for AI provider `azure-openai`. */
export function AzureOpenaiProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-azureailight__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 27,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 27H27V92H92V27Z" })), createElement("g", { mask: `url(#${iconId}-azureailight__a)` }, createElement("mask", {
        id: `${iconId}-azureailight__b`,
        width: 65,
        height: 65,
        x: 27,
        y: 27,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 27H27V92H92V27Z" })), createElement("g", { mask: `url(#${iconId}-azureailight__b)` }, createElement("path", {
        fill: `url(#${iconId}-azureailight__c)`,
        fillRule: "evenodd",
        d: "M70.9652 27C72.8962 27 74.6079 28.4923 75.2227 30.5994C75.8375 32.7065 79.4341 45.739 79.4341 45.739V71.636H66.3989L66.6644 27H70.9652Z",
        clipRule: "evenodd"
    }), createElement("path", { fill: `url(#${iconId}-azureailight__d)`, d: "M90.0998 47.2316C90.0998 46.3108 89.3553 45.6066 88.4751 45.6066H80.797C78.2013 45.6088 75.7126 46.641 73.8774 48.4767C72.0423 50.3124 71.0107 52.8015 71.009 55.3972V71.6363H80.3149C82.9098 71.6336 85.3974 70.6012 87.232 68.7663C89.0666 66.9311 90.0982 64.4433 90.0998 61.8484V47.2316Z" }), createElement("path", {
        fill: `url(#${iconId}-azureailight__e)`,
        fillRule: "evenodd",
        d: "M70.9646 27.0001C70.612 26.9976 70.2626 27.0651 69.9366 27.1988C69.6104 27.3325 69.3142 27.5297 69.065 27.7789C68.8156 28.0282 68.6184 28.3245 68.4846 28.6506C68.3511 28.9767 68.2834 29.3262 68.2861 29.6786L68.0234 78.9648C68.0226 82.4217 66.6489 85.7369 64.2046 88.1812C61.7601 90.6259 58.4451 91.9992 54.9882 92H31.3335C31.0745 92.0015 30.819 91.941 30.5884 91.8231C30.3578 91.7052 30.1589 91.5337 30.0084 91.3228C29.8578 91.1119 29.7602 90.8685 29.7235 90.6123C29.6869 90.3553 29.7124 90.0938 29.7979 89.8497L48.7562 35.7344C49.6493 33.1864 51.3107 30.978 53.5114 29.4137C55.7121 27.8494 58.3438 27.0061 61.044 27.0001H71.0079H70.9646Z",
        clipRule: "evenodd"
    }))), createElement("defs", {}, createElement("linearGradient", {
        id: `${iconId}-azureailight__c`,
        x1: 76.406,
        x2: 65.435,
        y1: 72.6,
        y2: 28.668,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#712575" }), createElement("stop", { offset: 0.09, stopColor: "#9A2884" }), createElement("stop", { offset: 0.18, stopColor: "#BF2C92" }), createElement("stop", { offset: 0.27, stopColor: "#DA2E9C" }), createElement("stop", { offset: 0.34, stopColor: "#EB30A2" }), createElement("stop", { offset: 0.4, stopColor: "#F131A5" }), createElement("stop", { offset: 0.5, stopColor: "#EC30A3" }), createElement("stop", { offset: 0.61, stopColor: "#DF2F9E" }), createElement("stop", { offset: 0.72, stopColor: "#C92D96" }), createElement("stop", { offset: 0.83, stopColor: "#AA2A8A" }), createElement("stop", { offset: 0.95, stopColor: "#83267C" }), createElement("stop", { offset: 1, stopColor: "#712575" })), createElement("linearGradient", {
        id: `${iconId}-azureailight__d`,
        x1: 80.578,
        x2: 80.578,
        y1: 27.921,
        y2: 89.894,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#DA7ED0" }), createElement("stop", { offset: 0.08, stopColor: "#B17BD5" }), createElement("stop", { offset: 0.19, stopColor: "#8778DB" }), createElement("stop", { offset: 0.3, stopColor: "#6276E1" }), createElement("stop", { offset: 0.41, stopColor: "#4574E5" }), createElement("stop", { offset: 0.54, stopColor: "#2E72E8" }), createElement("stop", { offset: 0.67, stopColor: "#1D71EB" }), createElement("stop", { offset: 0.81, stopColor: "#1471EC" }), createElement("stop", { offset: 1, stopColor: "#1171ED" })), createElement("linearGradient", {
        id: `${iconId}-azureailight__e`,
        x1: 76.844,
        x2: 35.764,
        y1: 29.326,
        y2: 95.204,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#DA7ED0" }), createElement("stop", { offset: 0.05, stopColor: "#B77BD4" }), createElement("stop", { offset: 0.11, stopColor: "#9079DA" }), createElement("stop", { offset: 0.18, stopColor: "#6E77DF" }), createElement("stop", { offset: 0.25, stopColor: "#5175E3" }), createElement("stop", { offset: 0.33, stopColor: "#3973E7" }), createElement("stop", { offset: 0.42, stopColor: "#2772E9" }), createElement("stop", { offset: 0.54, stopColor: "#1A71EB" }), createElement("stop", { offset: 0.68, stopColor: "#1371EC" }), createElement("stop", { offset: 1, stopColor: "#1171ED" })))));
}
/** @returns Brand icon for AI provider `baichuan`. */
export function BaichuanProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: `url(#${iconId}-baichuanlight__a)`, d: "M48.6657 30H39.2111L33.302 42.7824V76.61L27 89H42.3636L48.3554 76.61L48.6657 30ZM70.3343 30H54.9707V89H70.3343V30ZM76.6364 46.9124H92V89H76.6364V46.9124ZM92 30H76.6364V42.1923H92V30Z" }), createElement("defs", {}, createElement("linearGradient", {
        id: `${iconId}-baichuanlight__a`,
        x1: 38.547,
        x2: 86.816,
        y1: 35.12,
        y2: 88.562,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#FEC13E" }), createElement("stop", { offset: 1, stopColor: "#FF6933" })))));
}
/** @returns Brand icon for AI provider `baidu-cloud`. */
export function BaiduCloudProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-baiducloudlight__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 27,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 27H27V92H92V27Z" })), createElement("g", { mask: `url(#${iconId}-baiducloudlight__a)` }, createElement("path", { fill: "#5BCA87", d: "M85.8107 42.1937L75.0234 48.45C74.6537 48.6612 74.2355 48.7722 73.81 48.7722C73.3843 48.7722 72.9662 48.6612 72.5967 48.45L60.6909 41.5817C60.3209 41.37 59.9022 41.2587 59.4762 41.2587C59.0499 41.2587 58.6312 41.37 58.2615 41.5817L46.38 48.45C46.0105 48.6612 45.5922 48.7722 45.1666 48.7722C44.741 48.7722 44.3228 48.6612 43.9533 48.45L33.1633 42.2127L59.5047 27L85.8107 42.1937Z" }), createElement("path", { fill: "#EC5D3E", d: "M77.4853 52.6399C77.1227 52.8536 76.8226 53.1586 76.6143 53.5245C76.4063 53.8904 76.2974 54.3045 76.2991 54.7253V68.462C76.2972 68.8845 76.1848 69.2989 75.9735 69.6648C75.762 70.0304 75.4589 70.3348 75.0939 70.5474L63.1014 77.3453C62.7314 77.5569 62.4245 77.8637 62.2127 78.2337C62.0007 78.6037 61.8915 79.0234 61.8961 79.4497V91.9267L73.8914 85.0587L88.2726 76.8063V46.3836L77.4853 52.6399Z" }), createElement("path", { fill: "#2464F5", d: "M56.7371 78.2986C56.5464 77.9162 56.2624 77.5882 55.9111 77.3452L43.9158 70.5311C43.5615 70.3136 43.2683 70.0097 43.0641 69.6476C42.8599 69.2855 42.7513 68.8774 42.7485 68.4619V54.709C42.7401 54.2903 42.6228 53.881 42.4082 53.5215C42.1935 53.162 41.8889 52.8646 41.5244 52.6587L40.3029 51.9545L30.7371 46.3862V76.8063L45.121 85.0586L57.1326 92V79.5201C57.1144 79.0853 56.9776 78.6609 56.7371 78.2986Z" }))));
}
/** @returns Brand icon for AI provider `burncloud`. */
export function BurncloudProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: `url(#${iconId}-burncloudlight__a)`, d: "M77.3307 54.4326C76.0568 52.5527 74.701 50.7286 73.2672 48.9657C73.2672 48.9657 68.0441 42.9221 68.9146 34C68.9146 34 48.8926 41.7704 48.6034 57.5994C48.6034 57.5994 45.7012 52.9942 46.281 44.3605C46.281 44.3605 39.8982 50.4041 39.0276 60.1895C32.934 62.203 28 67.3832 28 72.5635C28 79.7588 35.8347 85.8024 45.1198 85.8024C38.1556 84.6507 32.9325 80.0471 32.9325 74.2902C32.9325 70.2617 35.2549 67.0965 38.737 64.7931C38.9308 66.9053 39.4142 69.2076 40.1873 71.7001C40.1873 71.7001 43.6694 82.6372 55.8567 85.5141C59.3388 86.3774 63.1116 86.0907 66.5937 84.6507C70.3665 82.9239 74.7191 79.4705 74.7191 71.7001C74.7191 71.7001 75.0083 63.9297 70.365 59.9012C70.365 59.9012 76.4601 74.2902 65.1419 78.6071C61.3701 80.0465 57.5983 80.0465 53.8265 78.6071C48.8926 76.5936 42.7989 71.4134 43.6694 57.8861C43.6694 57.8861 46.5717 67.6716 52.956 71.4134C52.956 71.4134 47.1515 54.721 64.2714 43.2088C64.2714 43.2088 65.7232 49.2524 69.7851 52.7059C70.9464 53.8576 81.3926 61.9163 79.3609 75.7302C81.3926 73.1401 83.1337 66.8082 81.3926 61.9163C81.3926 61.9163 81.1019 60.7646 80.2314 59.3262C84.584 60.1895 88.0661 63.643 88.3568 71.4134C88.6475 78.032 83.7135 83.5006 77.3307 85.8024C86.0359 84.6507 93 78.032 93 69.6866C93 61.6279 86.6158 55.0093 77.3307 54.4326Z" }), createElement("defs", {}, createElement("linearGradient", {
        id: `${iconId}-burncloudlight__a`,
        x1: 60.668,
        x2: 60.553,
        y1: 50.168,
        y2: 76.783,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#F7B52C" }), createElement("stop", { offset: 1, stopColor: "#E95513" })))));
}
/** @returns Brand icon for AI provider `cerebras`. */
export function CerebrasProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", {
        fill: "#F05A28",
        fillRule: "evenodd",
        d: "M67.8767 87.721C63.9268 87.721 60.186 86.9303 56.7706 85.5117C51.659 83.3721 47.291 79.7908 44.2008 75.2791C41.1106 70.7674 39.3216 65.3489 39.3216 59.4884C39.3216 55.5814 40.1116 51.8837 41.5753 48.4884C43.7361 43.4187 47.3607 39.1162 51.9146 36.0699C56.4685 33.0233 61.9518 31.2558 67.8767 31.2558V27C63.3459 27 59.0244 27.9071 55.0745 29.5582C49.173 32.0233 44.1543 36.1395 40.6227 41.3256C37.0679 46.5117 35 52.7675 35 59.4884C35 63.9768 35.9293 68.2558 37.5791 72.1396C40.0651 77.9767 44.2473 82.9303 49.475 86.4419C54.7259 89.9535 61.0457 92 67.8534 92V87.721H67.8767Z",
        clipRule: "evenodd"
    }), createElement("path", {
        fill: "#F05A28",
        fillRule: "evenodd",
        d: "M53.2372 76.8142C50.5652 74.5816 48.5671 71.8839 47.2195 68.9304C45.8719 65.977 45.1749 62.7909 45.1749 59.5816C45.1749 57.0234 45.6163 54.4653 46.476 52.0235C47.3589 49.5816 48.66 47.256 50.449 45.1397C52.6795 42.4886 55.398 40.4886 58.3487 39.1397C61.2995 37.7909 64.5291 37.1165 67.7355 37.1165C70.2912 37.1165 72.8702 37.5583 75.3098 38.4188C77.7727 39.3025 80.0961 40.6049 82.2105 42.3723L84.9753 39.0932C82.466 37.0002 79.6779 35.4189 76.7504 34.3956C73.8229 33.349 70.7792 32.8375 67.7355 32.8375C63.9017 32.8375 60.0913 33.6513 56.5597 35.256C53.028 36.8607 49.7985 39.256 47.1498 42.3955C45.0354 44.9072 43.4787 47.6746 42.4332 50.5816C41.3877 53.4886 40.8765 56.5351 40.8765 59.5816C40.8765 63.3956 41.6897 67.2095 43.2928 70.7211C44.8961 74.2328 47.3124 77.4653 50.4723 80.0933L53.2372 76.8142Z",
        clipRule: "evenodd"
    }), createElement("path", {
        fill: "#F05A28",
        fillRule: "evenodd",
        d: "M59.8601 74.0466C57.0487 72.5582 54.8414 70.3954 53.3312 67.8605C51.821 65.3256 51.031 62.3953 51.031 59.4418C51.031 56.8372 51.6351 54.2093 52.9595 51.7674C54.4465 48.9535 56.6305 46.7675 59.1863 45.2791C61.7421 43.7675 64.6696 42.9768 67.6436 42.9768C70.2458 42.9768 72.8946 43.5815 75.3574 44.8837L77.3556 41.093C74.2654 39.4652 70.9196 38.6744 67.6204 38.6976C63.8796 38.6976 60.1853 39.6977 56.9791 41.5814C53.7726 43.4652 51.0078 46.2558 49.1491 49.7675C47.5227 52.8605 46.7327 56.1861 46.7327 59.4418C46.7327 63.1629 47.7317 66.8373 49.637 70.0233C51.5422 73.2326 54.3303 75.9535 57.862 77.8139L59.8601 74.0466Z",
        clipRule: "evenodd"
    }), createElement("path", {
        fill: "#F05A28",
        fillRule: "evenodd",
        d: "M67.8979 69.9535C66.4341 69.9535 65.04 69.6512 63.7853 69.1163C61.8801 68.3256 60.277 66.9768 59.1385 65.2792C58 63.5815 57.3262 61.5582 57.3262 59.3722C57.3262 57.907 57.6282 56.5117 58.1626 55.2558C58.9526 53.3722 60.3002 51.7443 61.9963 50.6047C63.6924 49.4652 65.7138 48.7907 67.8979 48.7907V44.5117C65.8532 44.5117 63.9015 44.9303 62.1125 45.6745C59.4406 46.814 57.1868 48.6745 55.5836 51.0465C53.9572 53.4419 53.0278 56.3256 53.0278 59.3954C53.0278 61.4419 53.446 63.3954 54.1895 65.1861C55.328 67.8606 57.2101 70.1164 59.5799 71.7209C61.9498 73.3024 64.8077 74.2326 67.8979 74.2326V69.9535Z",
        clipRule: "evenodd"
    }), createElement("path", {
        fill: "#000",
        fillRule: "evenodd",
        d: "M71.3836 56.0001C70.8957 55.4885 70.3612 55.0698 69.8268 54.7675C69.2924 54.4652 68.7348 54.3024 68.154 54.3024C67.364 54.3024 66.6903 54.4419 66.0629 54.721C65.4588 55.0001 64.9244 55.3722 64.4829 55.8606C64.0415 56.3256 63.7162 56.8838 63.4839 57.4885C63.2516 58.0931 63.1586 58.7442 63.1586 59.3954C63.1586 60.0466 63.2748 60.6978 63.4839 61.3023C63.7162 61.907 64.0415 62.4652 64.4829 62.9303C64.9244 63.3955 65.4356 63.7909 66.0629 64.0698C66.6671 64.3489 67.364 64.4884 68.154 64.4884C68.8045 64.4884 69.4319 64.3489 69.9895 64.0931C70.5471 63.8141 71.035 63.4187 71.4301 62.9071L74.2646 65.9536C73.8465 66.3722 73.3585 66.7442 72.8009 67.0465C72.2432 67.3489 71.6856 67.6048 71.128 67.7907C70.5704 67.9768 70.0127 68.1164 69.5016 68.1861C68.9904 68.2792 68.5258 68.3024 68.154 68.3024C66.8761 68.3024 65.6679 68.0931 64.5526 67.6745C63.4141 67.2559 62.4384 66.6512 61.6252 65.8606C60.7887 65.0931 60.1381 64.1396 59.6502 63.0466C59.1623 61.9536 58.9299 60.721 58.9299 59.3954C58.9299 58.0466 59.1623 56.8372 59.6502 55.7443C60.1381 54.6512 60.7887 53.721 61.6252 52.9303C62.4617 52.1629 63.4374 51.5582 64.5526 51.1163C65.6911 50.6978 66.8993 50.4885 68.154 50.4885C69.246 50.4885 70.338 50.6978 71.4301 51.1163C72.5221 51.535 73.4979 52.1861 74.3111 53.0699L71.3836 56.0001Z",
        clipRule: "evenodd"
    })));
}
/** @returns Brand icon for AI provider `cherryin`. */
export function CherryinProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 120 120",
        ...props
    }, createElement("path", { fill: "#FF5F5F", d: "M0 0H120V120H0z" }), createElement("path", { fill: "#FFFEFE", d: "M51.1455 34.0171C55.2885 34.0171 59.4315 34.0171 63.7 34.0171C64.4947 35.527 65.289 37.0364 66.0713 38.5527C66.1593 38.7231 66.2473 38.8935 66.3353 39.0639C66.5167 39.4149 66.698 39.766 66.8792 40.117C67.2709 40.8754 67.6631 41.6334 68.0552 42.3914C68.2701 42.8065 68.4848 43.2217 68.6995 43.6369C68.7634 43.7603 68.7634 43.7603 68.8287 43.8864C69.0916 44.3947 69.3545 44.9032 69.6172 45.4117C70.5132 47.1458 71.4109 48.879 72.3149 50.6091C72.6923 51.3316 73.0685 52.0549 73.4431 52.779C73.486 52.8619 73.5289 52.9449 73.5731 53.0303C73.7946 53.4584 74.0155 53.8867 74.2362 54.3152C74.6367 55.0927 75.0395 55.8685 75.4559 56.6375C76.7755 59.0897 77.8668 61.6328 78.9716 64.1865C79.4387 65.2655 79.9104 66.3423 80.3854 67.4178C80.5291 67.7437 80.6717 68.0702 80.8142 68.3966C80.9009 68.5932 80.9878 68.7897 81.0746 68.9863C81.133 69.1212 81.133 69.1212 81.1928 69.2589C81.3823 69.7303 81.3823 69.7303 81.773 70.0253C81.7051 69.444 81.637 68.8628 81.5688 68.2816C81.5312 67.961 81.4938 67.6403 81.4565 67.3197C81.3354 66.2833 81.2115 65.2477 81.0763 64.2132C80.2526 57.8848 80.2007 51.6014 80.2256 45.2304C80.2304 44.0044 80.2326 42.7785 80.2347 41.5526C80.239 39.0408 80.2461 36.529 80.2555 34.0171C81.7641 34.014 83.2727 34.0116 84.7813 34.01C85.4818 34.0093 86.1822 34.0083 86.8826 34.0067C87.558 34.0053 88.2334 34.0044 88.9087 34.0042C89.167 34.0039 89.4252 34.0034 89.6835 34.0026C90.044 34.0016 90.4043 34.0014 90.7648 34.0016C90.8727 34.001 90.9806 34.0005 91.0917 34C91.8286 34.0014 91.8286 34.0014 91.9823 34.1551C91.9958 34.4277 91.9993 34.7008 91.9993 34.9736C91.9995 35.1526 91.9998 35.3318 92 35.5163C91.9997 35.7175 91.9993 35.9188 91.9989 36.1202C91.9989 36.3319 91.999 36.5438 91.9993 36.7555C91.9995 37.3405 91.999 37.9253 91.9982 38.5101C91.9977 39.1397 91.9978 39.7693 91.998 40.399C91.9981 41.4907 91.9976 42.5826 91.9968 43.6744C91.9958 45.253 91.9954 46.8315 91.9952 48.4101C91.9949 50.9709 91.9939 53.5318 91.9926 56.0927C91.9913 58.5809 91.9904 61.0692 91.9898 63.5576C91.9898 63.7875 91.9898 63.7875 91.9898 64.0219C91.9895 64.7908 91.9894 65.5596 91.9891 66.3285C91.9877 72.7114 91.9852 79.0942 91.9823 85.4771C87.7937 85.4771 83.6051 85.4771 79.2898 85.4771C78.7889 84.4754 78.2881 83.4739 77.7722 82.4418C77.2534 81.4556 77.2535 81.4556 76.7326 80.4706C76.3185 79.6845 75.9248 78.8885 75.53 78.0927C75.1413 77.3118 74.7408 76.5383 74.3318 75.7679C73.7642 74.699 73.2207 73.6196 72.6825 72.5357C72.2173 71.6014 71.7358 70.677 71.2464 69.7553C70.8346 68.9772 70.4375 68.1926 70.0463 67.4041C69.6067 66.5179 69.1566 65.6389 68.6925 64.7655C67.0924 61.7375 65.6499 58.661 64.2735 55.5268C63.7979 54.4438 63.3202 53.3617 62.8398 52.2809C62.6847 51.9311 62.5306 51.581 62.3767 51.2308C62.2821 51.018 62.1876 50.8052 62.093 50.5926C62.0502 50.4945 62.0073 50.3962 61.9631 50.2951C61.7638 49.7906 61.7638 49.7906 61.3547 49.4689C61.3641 49.5531 61.3736 49.6373 61.3833 49.724C62.9236 63.4433 62.9236 63.4433 62.9002 69.7114C62.8985 70.2689 62.8984 70.8262 62.898 71.3835C62.8972 72.4314 62.8949 73.4793 62.8922 74.5273C62.8884 75.9485 62.887 77.3699 62.8854 78.7912C62.8828 81.0198 62.8774 83.2484 62.8723 85.4771C59.0024 85.4771 55.1326 85.4771 51.1455 85.4771C51.1455 68.4953 51.1455 51.5135 51.1455 34.0171Z" }), createElement("path", { fill: "#fff", d: "M27 34.1554C31.0519 34.1554 35.1038 34.1554 39.2786 34.1554C39.2786 51.0916 39.2786 68.0277 39.2786 85.4772C35.2267 85.4772 31.1747 85.4772 27 85.4772C27 68.541 27 51.6048 27 34.1554Z" })));
}
/** @returns Brand icon for AI provider `copilot`. */
export function CopilotProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#000", d: "M79.1271 41.0009C82.6817 44.7721 84.2051 49.9702 84.84 57.2066C86.5157 57.2066 88.0897 57.589 89.1563 59.0412L91.1369 61.7423C91.6954 62.5068 92 63.4239 92 64.3923V71.7052C91.9962 72.1757 91.8844 72.6388 91.6727 73.0587C91.4611 73.4784 91.1565 73.8437 90.7809 74.1258C81.8183 80.7 70.7479 86 59.5 86C47.0586 86 34.5664 78.789 28.2187 74.1258C27.8437 73.8437 27.5387 73.4784 27.3273 73.0587C27.1159 72.6388 27.0039 72.1757 27 71.7052V64.3923C27 63.4239 27.3047 62.5066 27.8633 61.7168L29.8438 59.0412C30.9101 57.589 32.4843 57.2066 34.1601 57.2066C34.7949 49.9702 36.293 44.7721 39.873 41.0009C46.627 33.8154 55.5897 33 59.3984 33H59.5C63.2324 33 72.2969 33.7389 79.1271 41.0009ZM59.5 53.0534C58.7384 53.0534 57.8495 53.1044 56.8848 53.2063C56.6443 54.3465 56.1203 55.4073 55.3614 56.2896C54.2911 57.3515 53.0224 58.1908 51.6281 58.7591C50.2338 59.3277 48.7413 59.6138 47.2363 59.6019C45.5097 59.6019 43.707 59.2198 42.2343 58.2769C40.8379 58.761 39.4922 59.4236 39.3906 61.0796C39.2637 64.1884 39.2383 67.3225 39.2383 70.4566C39.2383 72.011 39.2383 73.5909 39.1875 75.1706C39.1875 76.0879 39.7461 76.9288 40.5839 77.311C47.2871 80.3687 53.6601 81.9231 59.5 81.9231C65.3397 81.9231 71.6875 80.3943 78.4161 77.311C78.8267 77.1232 79.1758 76.8226 79.4228 76.4437C79.67 76.0648 79.8052 75.6234 79.8125 75.1706C79.8886 70.4821 79.8125 65.7429 79.6093 61.0796C79.5078 59.3981 78.162 58.761 76.7657 58.2769C75.2928 59.2198 73.4647 59.5764 71.7636 59.5764C70.2604 59.5919 68.769 59.3095 67.3747 58.7455C65.9805 58.1813 64.7108 57.3469 63.6386 56.2896C62.8797 55.4073 62.3557 54.3465 62.1152 53.2063C61.2521 53.1044 60.3634 53.0789 59.5 53.0534ZM52.6445 64.2648C54.1172 64.2648 55.3104 65.4371 55.3104 66.9148V71.8071C55.3104 72.51 55.0323 73.1841 54.5372 73.6812C54.0419 74.178 53.3703 74.4571 52.6699 74.4571C51.9696 74.4571 51.2979 74.178 50.8027 73.6812C50.3075 73.1841 50.0293 72.51 50.0293 71.8071V66.8896C50.0293 65.4115 51.1972 64.2393 52.6699 64.2393L52.6445 64.2648ZM66.2032 64.2648C67.6756 64.2648 68.8438 65.4371 68.8438 66.9148V71.8071C68.8438 72.51 68.5656 73.1841 68.0703 73.6812C67.5752 74.178 66.9035 74.4571 66.2032 74.4571C65.5027 74.4571 64.8311 74.178 64.336 73.6812C63.8406 73.1841 63.5625 72.51 63.5625 71.8071V66.8896C63.5625 65.4115 64.7558 64.2393 66.2032 64.2393V64.2648ZM47.668 40.211C44.8242 40.4914 42.4375 41.4341 41.2188 42.7591C38.5781 45.6385 39.1367 52.9769 40.6601 54.5313C42.1665 55.79 44.0843 56.4436 46.043 56.366C47.7695 56.366 51.0195 55.9838 53.6855 53.2572C54.8788 52.1106 55.5899 49.2567 55.5136 46.3774C55.4375 44.0587 54.7772 42.1221 53.8125 41.3068C52.7461 40.3894 50.3593 39.9817 47.668 40.211ZM65.1875 41.3068C64.2226 42.1221 63.5625 44.0587 63.4864 46.3774C63.4101 49.2567 64.121 52.1106 65.3146 53.2572C66.3134 54.259 67.5018 55.0502 68.8102 55.584C70.1183 56.1178 71.5196 56.3836 72.9317 56.366C75.1913 56.366 77.2479 55.6269 78.3397 54.5313C79.8631 52.9769 80.4219 45.6385 77.7813 42.7336C76.5625 41.4596 74.1759 40.4914 71.3322 40.211C68.6406 39.9563 66.2538 40.3894 65.1875 41.3068ZM59.5 47.2692C58.8399 47.2692 58.0782 47.3202 57.2147 47.3967C57.3165 47.8298 57.3417 48.3394 57.3926 48.849C57.3926 49.2312 57.3926 49.6134 57.3417 49.9957C58.1542 49.9193 58.8652 49.9193 59.5 49.9193C60.1601 49.9193 60.8458 49.9193 61.6583 49.9957C61.6074 49.588 61.6074 49.2312 61.6074 48.849C61.6583 48.3394 61.6835 47.8298 61.7853 47.3967C60.9218 47.3202 60.1601 47.2692 59.5 47.2692Z" })));
}
/** @returns Brand icon for AI provider `dashscope`. */
export function DashscopeProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#1C54E3", d: "M45.4547 52.1572V68.8473L59.9047 60.4967L45.4574 52.1599L45.4547 52.1572Z" }), createElement("path", { fill: "#AA9AFF", d: "M86.24 42.3226C86.24 42.3226 86.2238 42.3063 86.2129 42.3063L74.3657 35.4592L45.4547 52.1601L59.9047 60.5078L86.1804 45.34L86.2238 45.3128C86.4862 45.1633 86.7045 44.9474 86.8571 44.6867C87.0095 44.426 87.0908 44.1298 87.0924 43.8278C87.094 43.5259 87.016 43.2287 86.8665 42.9664C86.717 42.7041 86.5008 42.4858 86.24 42.3335V42.3226Z" }), createElement("path", { fill: "#00EAD1", d: "M87.0942 61.7623C86.7933 61.761 86.4978 61.8407 86.2383 61.9926C86.2383 61.9926 86.222 61.9926 86.214 62.0007L74.364 68.8479L88.0422 76.7434H88.0584C88.5566 75.8883 88.8182 74.9162 88.8168 73.9265V63.485C88.8161 63.0284 88.6343 62.5906 88.3114 62.2678C87.9886 61.9447 87.5509 61.7632 87.0942 61.7623Z" }), createElement("path", { fill: "#00CEC9", d: "M88.0426 76.7435L74.3644 68.8481L45.4642 85.5355L57.0297 92.2124C57.0297 92.2124 57.073 92.2282 57.0892 92.2449C57.9519 92.74 58.9292 93 59.9238 93C60.9186 93 61.8958 92.74 62.7582 92.2449C62.7745 92.2365 62.8015 92.2282 62.8178 92.2124L85.9434 78.8589C85.9516 78.8589 85.9597 78.8507 85.9706 78.8426C86.84 78.3469 87.5659 77.6238 88.0697 76.7516H88.0534L88.0426 76.7435Z" }), createElement("path", { fill: "#00EAD1", d: "M59.9055 60.4971L45.4526 68.8476L41.5415 71.1011L31.7771 76.743H31.7582C32.2267 77.5637 32.8849 78.2463 33.6785 78.7419L33.8897 78.8611L33.9331 78.8882L33.9873 78.9207L45.4499 85.535L74.3529 68.8476L59.9028 60.4999L59.9055 60.4971Z" }), createElement("path", { fill: "#7347FF", d: "M62.7992 28.7855C62.5284 28.623 62.2358 28.4956 61.946 28.3846C61.8918 28.3683 61.8431 28.3413 61.7916 28.325C61.1822 28.1109 60.5413 28.001 59.8956 28C59.2646 28 58.6578 28.1029 58.0863 28.298L58.0023 28.325C57.6527 28.4468 57.3155 28.601 56.9947 28.7855L33.8934 42.1441C33.8934 42.1441 33.8853 42.1441 33.8771 42.1522C32.9995 42.6479 32.2737 43.3738 31.7617 44.2459H31.778L45.4535 52.1495L74.3647 35.4702L62.7992 28.7855Z" }), createElement("path", { fill: "#0423DA", d: "M31.7774 44.2537H31.7585C31.2603 45.1088 30.9986 46.081 31 47.0706V73.926C31 74.9498 31.2709 75.9168 31.7585 76.751H31.7774L45.4529 68.8474V52.1572L31.7774 44.2537Z" })));
}
/** @returns Brand icon for AI provider `deepseek`. */
export function DeepseekProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#4D6BFE", d: "M92.3161 40.0273C91.6283 39.6903 91.3298 40.3345 90.9292 40.6633C90.7909 40.7694 90.6747 40.908 90.5583 41.033C89.5508 42.112 88.3754 42.8187 86.8398 42.7344C84.5946 42.6094 82.6772 43.3161 80.9818 45.0393C80.6216 42.9138 79.4246 41.6473 77.6046 40.8319C76.6513 40.4079 75.6872 39.9866 75.0182 39.0652C74.5524 38.4101 74.4251 37.679 74.1922 36.9615C74.0433 36.5266 73.8943 36.0836 73.3986 36.0102C72.857 35.9259 72.6458 36.3798 72.4345 36.7604C71.5868 38.315 71.2591 40.0273 71.2916 41.7614C71.3647 45.6645 73.006 48.7738 76.2694 50.9835C76.6405 51.2363 76.7352 51.4918 76.6188 51.8615C76.3967 52.6225 76.1313 53.3618 75.8984 54.1255C75.7495 54.612 75.5273 54.7153 75.0073 54.506C73.2504 53.7482 71.6544 52.6595 70.3058 51.2988C67.9849 49.0483 65.8887 46.5641 63.2725 44.618C62.6662 44.1685 62.0438 43.7415 61.4064 43.3378C58.7388 40.7368 61.7585 38.6004 62.4573 38.3476C63.1885 38.0813 62.7091 37.1735 60.3475 37.1844C57.9859 37.1952 55.8247 37.9861 53.0703 39.0435C52.6611 39.2009 52.2399 39.3253 51.811 39.4158C49.2372 38.9291 46.6048 38.8356 44.003 39.1386C38.898 39.7094 34.822 42.1338 31.824 46.2679C28.222 51.2363 27.3743 56.8843 28.4115 62.7714C29.503 68.9793 32.6608 74.119 37.5113 78.1361C42.5433 82.3028 48.3363 84.344 54.9472 83.9526C58.9609 83.7216 63.4322 83.1807 68.4723 78.8972C69.7452 79.5332 71.0776 79.7859 73.293 79.9762C74.9993 80.1366 76.6405 79.8947 77.9107 79.6283C79.9012 79.2043 79.7631 77.3533 79.0454 77.0163C73.2091 74.2874 74.4901 75.3991 73.3228 74.4994C76.2911 70.9769 80.7597 67.3186 82.5093 55.4655C82.6447 54.5223 82.5283 53.9298 82.5093 53.1687C82.4984 52.7067 82.6041 52.5246 83.1322 52.473C84.5975 52.3204 86.0189 51.8819 87.3165 51.1819C91.097 49.1081 92.6245 45.7052 92.985 41.6228C93.0394 40.9977 92.9744 40.3562 92.3161 40.0273ZM59.3644 76.769C53.7068 72.3061 50.9633 70.8356 49.8313 70.8981C48.7696 70.9634 48.9619 72.1783 49.1948 72.972C49.4386 73.7547 49.7554 74.2929 50.1996 74.9806C50.5083 75.4344 50.7196 76.1113 49.8936 76.6195C48.0709 77.7502 44.9049 76.239 44.756 76.1656C41.07 73.9858 37.9853 71.1101 35.8159 67.1772C33.7197 63.3911 32.501 59.3305 32.3006 54.9952C32.2465 53.9461 32.5525 53.5764 33.5925 53.3862C34.9577 53.124 36.3566 53.0882 37.7334 53.2802C43.5075 54.1283 48.4203 56.7185 52.5423 60.8199C54.893 63.1573 56.6724 65.9487 58.5059 68.6775C60.4558 71.5749 62.552 74.3364 65.2224 76.5978C66.1649 77.3914 66.915 77.9948 67.6355 78.4378C65.4634 78.6824 61.8398 78.7368 59.3644 76.769ZM62.0726 59.2652C62.0722 59.1302 62.1044 58.9971 62.1667 58.8774C62.229 58.7577 62.3193 58.655 62.43 58.5783C62.5406 58.5014 62.6683 58.4528 62.8018 58.4366C62.9354 58.4204 63.0709 58.437 63.1966 58.4851C63.3568 58.5428 63.4951 58.6492 63.5922 58.7896C63.6893 58.9299 63.7404 59.0971 63.7383 59.2679C63.7386 59.3782 63.7171 59.4876 63.6749 59.5896C63.6327 59.6915 63.5708 59.784 63.4927 59.8616C63.4145 59.9393 63.3217 60.0006 63.2198 60.0419C63.1178 60.0833 63.0086 60.1038 62.8986 60.1023C62.7895 60.1027 62.6814 60.0812 62.5807 60.0391C62.4799 59.9971 62.3885 59.9353 62.3118 59.8573C62.2351 59.7793 62.1747 59.6868 62.1342 59.5852C62.0936 59.4835 62.0709 59.3747 62.0726 59.2652ZM70.4954 63.6031C69.9537 63.8232 69.4148 64.0135 68.8975 64.038C68.1193 64.0652 67.3557 63.8213 66.7363 63.3476C65.9942 62.7225 65.4634 62.3746 65.2413 61.2874C65.1647 60.7561 65.1794 60.2156 65.2847 59.6892C65.4742 58.8004 65.263 58.2296 64.6374 57.7133C64.131 57.2892 63.4837 57.1724 62.7741 57.1724C62.5312 57.1582 62.2952 57.0855 62.0862 56.9604C61.7883 56.8136 61.5446 56.444 61.7775 55.9874C61.8533 55.8406 62.2108 55.4818 62.2975 55.4166C63.2616 54.8675 64.3747 55.0469 65.4012 55.46C66.3545 55.8514 67.0748 56.569 68.1121 57.5855C69.1711 58.8113 69.3634 59.1511 69.9673 60.0697C70.4439 60.79 70.8773 61.5293 71.1724 62.3746C71.3539 62.9045 71.121 63.3367 70.4954 63.6031Z" })));
}
/** @returns Brand icon for AI provider `dmxapi`. */
export function DmxapiProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        xmlnsXlink: "http://www.w3.org/1999/xlink",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: `url(#${iconId}-dmxapilight__a)`, d: "M27 27H92V92H27z" }), createElement("defs", {}, createElement("pattern", {
        id: `${iconId}-dmxapilight__a`,
        width: 1,
        height: 1,
        patternContentUnits: "objectBoundingBox"
    }, createElement("use", { xlinkHref: `#${iconId}-dmxapilight__b`, transform: "scale(.00292)" })), createElement("image", {
        xlinkHref: "data:image/png;base64,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",
        id: `${iconId}-dmxapilight__b`,
        width: 342,
        height: 342,
        preserveAspectRatio: "none"
    }))));
}
/** @returns Brand icon for AI provider `doubao`. */
export function DoubaoProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#00E5E5", d: "M81.9634 56.9965 73.2121 91.2285C73.1905 91.3222 73.1911 91.4199 73.2133 91.5129 73.2357 91.6067 73.2795 91.6941 73.3409 91.769 73.4024 91.843 73.4804 91.9029 73.5687 91.9423 73.657 91.9825 73.7531 92.0022 73.8503 91.9998H91.3467C91.4436 92.0022 91.5405 91.9825 91.628 91.9423 91.717 91.9029 91.795 91.843 91.8565 91.769 91.9179 91.6941 91.9613 91.6067 91.9841 91.5129 92.0062 91.4199 92.007 91.3222 91.9849 91.2285L83.189 56.9965C83.1505 56.8651 83.0699 56.7498 82.9591 56.6674 82.8489 56.5852 82.7144 56.541 82.5762 56.541 82.4382 56.541 82.3038 56.5852 82.1933 56.6674 82.0828 56.7498 82.0021 56.8651 81.9634 56.9965ZM33.7947 64.7525 27.0157 91.2269C26.9943 91.3206 26.9948 91.4175 27.0172 91.5121 27.0395 91.605 27.0831 91.6925 27.1446 91.7674 27.2062 91.8414 27.2841 91.9013 27.3723 91.9415 27.4606 91.9817 27.5569 92.0013 27.654 91.999H41.161C41.258 92.0013 41.3544 91.9817 41.4426 91.9415 41.5309 91.9013 41.6088 91.8414 41.6703 91.7674 41.7318 91.6925 41.7755 91.605 41.7979 91.5121 41.8202 91.4175 41.8206 91.3206 41.7993 91.2269L35.0139 64.7525C34.9734 64.6237 34.8925 64.5108 34.7829 64.4307 34.6732 64.3507 34.5405 64.3075 34.4043 64.3075 34.2681 64.3075 34.1354 64.3507 34.0257 64.4307 33.916 64.5108 33.8351 64.6237 33.7947 64.7525Z" }), createElement("path", { fill: "#006EFF", d: "M45.7511 42.8338L33.3995 91.2261C33.3787 91.3175 33.3785 91.4121 33.3991 91.5034C33.4197 91.5948 33.4605 91.6807 33.5185 91.754C33.5765 91.8281 33.6503 91.8887 33.7346 91.9305C33.8188 91.9722 33.9115 91.9959 34.0058 91.9982H58.7155C58.8124 92.0006 58.909 91.9809 58.997 91.9407C59.0854 91.9005 59.1631 91.8414 59.2249 91.7666C59.2864 91.6925 59.3301 91.6051 59.3522 91.5113C59.3747 91.4176 59.375 91.3199 59.354 91.2261L46.9703 42.8338C46.9299 42.7048 46.8489 42.592 46.7393 42.512C46.6295 42.4319 46.4969 42.3887 46.3607 42.3887C46.2245 42.3887 46.0918 42.4319 45.9821 42.512C45.8724 42.592 45.7915 42.7048 45.7511 42.8338Z" }), createElement("path", { fill: "#006EFF", d: "M67.0588 27.4451C67.0184 27.3161 66.9377 27.2034 66.8282 27.1233C66.7182 27.0433 66.5856 27 66.4497 27C66.3131 27 66.1805 27.0433 66.0709 27.1233C65.9613 27.2034 65.8803 27.3161 65.8398 27.4451L48.9561 91.2261C48.9347 91.3199 48.9352 91.4176 48.9575 91.5105C48.9799 91.6043 49.0236 91.6917 49.0851 91.7666C49.1466 91.8407 49.2245 91.9005 49.3128 91.9407C49.401 91.9809 49.4974 91.9998 49.5945 91.9974H83.3363C83.4335 91.9998 83.5296 91.9809 83.6182 91.9407C83.7062 91.9005 83.7842 91.8407 83.8457 91.7666C83.9071 91.6917 83.9508 91.6043 83.9733 91.5105C83.9954 91.4176 83.9961 91.3199 83.9745 91.2261L67.0588 27.4451Z" }), createElement("path", { fill: "#00E5E5", d: "M54.6544 49.8717L43.9434 91.2214C43.9209 91.316 43.9206 91.4144 43.9423 91.509C43.9642 91.6027 44.0076 91.691 44.0693 91.7666C44.1309 91.8415 44.2093 91.9021 44.2981 91.9423C44.387 91.9825 44.484 92.0022 44.5818 91.9998H65.9529C66.0507 92.0022 66.1476 91.9825 66.2365 91.9423C66.3252 91.9021 66.4038 91.8415 66.4653 91.7666C66.527 91.691 66.5704 91.6027 66.5923 91.509C66.6142 91.4144 66.6139 91.316 66.5914 91.2214L55.8738 49.8717C55.8334 49.7426 55.7524 49.63 55.6424 49.5498C55.5332 49.4697 55.4005 49.4267 55.264 49.4267C55.1281 49.4267 54.9954 49.4697 54.8855 49.5498C54.7759 49.63 54.6949 49.7426 54.6544 49.8717Z" })));
}
/** @returns Brand icon for AI provider `fireworks`. */
export function FireworksProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", {
        fill: "#5019C5",
        fillRule: "evenodd",
        d: "M68.0833 44L60.4973 62.12L52.9031 44H48.0335L56.3535 63.808C56.6859 64.6136 57.2546 65.3034 57.9872 65.7891C58.7195 66.2749 59.5824 66.5347 60.4656 66.5352C61.3488 66.536 62.2122 66.2774 62.9451 65.7923C63.6782 65.3075 64.2481 64.6184 64.5815 63.8134L72.9529 44H68.0833ZM71.3225 71.6054L85.2 57.6214L83.3068 53.1707L68.151 68.4746C67.5322 69.0989 67.1143 69.889 66.9488 70.7461C66.7836 71.6032 66.8787 72.4891 67.2221 73.2933C67.5593 74.0923 68.1291 74.7749 68.8598 75.2552C69.5906 75.7354 70.4493 75.9917 71.3279 75.992L71.3333 76L93 75.9466L91.1067 71.496L71.3279 71.6054H71.3225ZM35.8 57.6106L37.6931 53.16L52.849 68.464C54.1165 69.7413 54.4821 71.6347 53.7779 73.2827C53.4405 74.0813 52.8706 74.7638 52.1399 75.244C51.4093 75.7243 50.5506 75.9808 49.6721 75.9813L28.0054 75.9333L28 75.9387L29.8932 71.488L49.6721 71.6L35.8 57.6106Z",
        clipRule: "evenodd"
    })));
}
/** @returns Brand icon for AI provider `gateway`. */
export function GatewayProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", {
        fill: "#000",
        fillRule: "evenodd",
        d: "M59.5 32L92 88H27L59.5 32Z",
        clipRule: "evenodd"
    })));
}
/** @returns Brand icon for AI provider `github`. */
export function GithubProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-githublight__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 27,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 27H27V92H92V27Z" })), createElement("g", { mask: `url(#${iconId}-githublight__a)` }, createElement("mask", {
        id: `${iconId}-githublight__b`,
        width: 65,
        height: 65,
        x: 27,
        y: 27,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 27H27V92H92V27Z" })), createElement("g", { mask: `url(#${iconId}-githublight__b)` }, createElement("path", {
        fill: "#000",
        fillRule: "evenodd",
        d: "M59.5268 27.5416C41.5403 27.5416 27 42.1891 27 60.3101C27 74.7953 36.3165 87.0565 49.241 91.3961C50.8569 91.7226 51.4488 90.6909 51.4488 89.8233C51.4488 89.064 51.3955 86.4602 51.3955 83.747C42.3473 85.7005 40.4631 79.8407 40.4631 79.8407C39.009 76.0431 36.8545 75.0671 36.8545 75.0671C33.893 73.0596 37.0702 73.0596 37.0702 73.0596C40.3552 73.2765 42.079 76.4231 42.079 76.4231C44.9866 81.414 49.6718 80.0038 51.5566 79.1355C51.8256 77.0197 52.6878 75.5551 53.6033 74.7412C46.3867 73.9818 38.7939 71.1608 38.7939 58.5738C38.7939 54.9931 40.0856 52.0636 42.1322 49.7852C41.8093 48.9716 40.6782 45.6074 42.4559 41.1046C42.4559 41.1046 45.2023 40.2364 51.3948 44.4682C54.0461 43.7509 56.7803 43.386 59.5268 43.383C62.2733 43.383 65.0729 43.7631 67.6583 44.4682C73.8515 40.2364 76.5979 41.1046 76.5979 41.1046C78.3757 45.6074 77.2436 48.9716 76.9208 49.7852C79.0214 52.0636 80.2599 54.9931 80.2599 58.5738C80.2599 71.1608 72.6671 73.9271 65.3966 74.7412C66.5817 75.772 67.6044 77.7247 67.6044 80.8174C67.6044 85.2116 67.5511 88.7384 67.5511 89.8233C67.5511 90.6909 68.1436 91.7226 69.7589 91.3969C82.6833 87.056 92 74.7953 92 60.3101C92.0529 42.1891 77.4595 27.5416 59.5268 27.5416Z",
        clipRule: "evenodd"
    })))));
}
/** @returns Brand icon for AI provider `groq`. */
export function GroqProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 120 120",
        ...props
    }, createElement("path", { fill: "#F54F35", d: "M0 0H120V120H0z" }), createElement("path", { fill: "#FEFBFB", d: "M75.3878 32.3434L76.392 33.1449C79.805 36.1866 82.065 40.5117 82.806 44.9993C82.8571 45.9607 82.8841 46.923 82.8912 47.8859L82.9072 49.5982L82.9134 51.4343L82.9224 53.3395C82.9276 54.6692 82.9307 55.9995 82.933 57.3288C82.9383 59.3537 82.9547 61.3786 82.9711 63.404C82.9747 64.6989 82.9773 65.9933 82.9796 67.2873L83 69.1104C82.9822 75.2889 81.2126 80.6221 76.9197 85.2186C74.5079 87.4494 72.0724 89.106 69.0296 90.3496L67.7649 90.9061C62.8503 92.6753 57.0087 92.1701 52.1979 90.3099C49.5403 89.0552 47.3466 87.5837 45.1859 85.6038C47.1348 83.2168 49.1121 81.1772 51.5442 79.2756L53.1671 80.528C56.1194 82.6153 59.0673 83.2759 62.671 82.9672C66.3591 82.2372 69.2705 80.593 71.6789 77.6936C73.8905 74.1163 74.1111 71.2487 74.0795 67.0974L74.0858 65.2664C74.0876 63.9931 74.0831 62.7208 74.0743 61.4479C74.0636 59.5074 74.0743 57.5664 74.088 55.6259C74.0867 54.3852 74.084 53.1451 74.0795 51.9041L74.0929 50.1576C74.0409 45.9411 73.1752 43.1916 70.553 39.8906C66.9573 37.0124 63.6091 35.5606 58.9417 35.7816C55.0592 36.408 51.906 38.2601 49.5223 41.3718C47.5554 44.4783 46.7013 47.6729 47.3053 51.3274C48.4663 55.307 49.9646 58.6824 53.6637 60.819C56.7624 62.4333 59.4347 62.6771 62.9032 62.764L64.3839 62.8183C65.5789 62.8616 66.7744 62.8957 67.9699 62.9283V71.3658C59.1307 71.7205 52.2783 71.7108 45.2643 65.6453C40.8771 61.2704 38.1971 55.3361 38 49.152C38.2086 43.9473 40.0823 39.716 43.0664 35.5073L43.9609 34.1558C52.4438 25.2576 65.8767 24.6633 75.3878 32.3434Z" })));
}
/** @returns Brand icon for AI provider `huggingface`. */
export function HuggingfaceProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#FF9D0B", d: "M31.692 58.1732C31.692 48.1068 37.1491 38.8086 46.0042 33.774C50.3681 31.3003 55.2987 30 60.3149 30C65.3312 30 70.2617 31.3003 74.6256 33.774C83.4807 38.8086 88.9379 48.1068 88.9379 58.1732C88.9379 73.7323 76.1237 86.3456 60.3164 86.3456C44.5091 86.3456 31.692 73.7294 31.692 58.1732Z" }), createElement("path", { fill: "#FFD21E", d: "M60.3153 83.4383C74.4887 83.4383 85.9822 72.125 85.9822 58.1733C85.9822 44.2215 74.4887 32.9112 60.3153 32.9112C46.139 32.9112 34.6455 44.2215 34.6455 58.1733C34.6455 72.125 46.139 83.4354 60.3153 83.4354V83.4383Z" }), createElement("path", { fill: "#FF323D", d: "M60.1303 68.745C67.3897 68.745 69.7328 62.3749 69.7328 59.1041C69.7328 57.4022 68.5716 57.94 66.7102 58.8411C64.9906 59.6773 62.6771 60.8355 60.1391 60.8355C54.8267 60.8355 50.5366 55.8333 50.5366 59.1041C50.5366 62.3749 52.8707 68.745 60.1391 68.745H60.1303Z" }), createElement("path", { fill: "#3A3B45", d: "M68.6537 51.3039C69.5992 51.623 69.9685 53.5287 70.92 53.0323C72.2406 52.3439 73.0089 50.9405 72.8671 49.475C72.7934 48.7546 72.5072 48.0724 72.0447 47.5152C71.5822 46.958 70.9644 46.5511 70.2699 46.346C69.5728 46.1351 68.8292 46.1329 68.1308 46.3398C67.4325 46.5467 66.81 46.9535 66.3403 47.5102C65.3888 48.6448 65.2264 50.2284 65.9266 51.5284C66.3787 52.3646 67.8117 51.0055 68.6596 51.295L68.6537 51.3039ZM51.2599 51.3039C50.3144 51.623 49.9361 53.5287 48.9906 53.0323C48.3488 52.7009 47.8208 52.185 47.4744 51.5511C47.1279 50.9172 46.9789 50.1942 47.0465 49.475C47.1883 48.0124 48.2136 46.7774 49.6407 46.346C50.3378 46.1351 51.0814 46.1329 51.7798 46.3398C52.4781 46.5467 53.1006 46.9535 53.5703 47.5102C54.5217 48.6448 54.6842 50.2284 53.984 51.5284C53.5349 52.3646 52.093 51.0055 51.251 51.295L51.2599 51.3039ZM54.569 67.0816C54.9627 66.2977 55.5135 65.6031 56.1869 65.041C56.8604 64.4788 57.6422 64.0611 58.4839 63.8138C58.6907 63.7547 58.9094 63.9911 59.1309 64.3191L59.6982 65.2232C59.9021 65.5186 60.1089 65.7402 60.3158 65.7402C60.5344 65.7402 60.759 65.5216 60.9747 65.232L61.5803 64.3397C61.8167 64.0147 62.0442 63.7843 62.2717 63.8522C63.8584 64.3486 65.185 65.4359 65.965 66.8837C68.7188 64.7445 69.7321 61.2551 69.7321 59.1041C69.7321 57.6031 68.828 57.8455 67.3389 58.5427L65.5189 59.4173C63.9825 60.1264 62.1269 60.8355 60.1296 60.8355C58.1323 60.8355 56.2827 60.1264 54.7433 59.4173L53.003 58.5811C51.4667 57.8484 50.5271 57.5706 50.5271 59.1041C50.5271 61.1813 51.4726 64.5141 54.0342 66.668L54.5661 67.0816H54.569Z" }), createElement("path", { fill: "#FF9D0B", d: "M77.6723 54.7194C77.9853 54.7222 78.2957 54.6632 78.5859 54.5459C78.876 54.4285 79.1402 54.2551 79.3633 54.0356C79.5865 53.8161 79.7641 53.5547 79.8861 53.2664C80.0081 52.9782 80.0721 52.6688 80.0744 52.3558C80.0744 51.0528 78.9989 49.9921 77.6723 49.9921C77.3595 49.9898 77.0494 50.049 76.7596 50.1665C76.4698 50.284 76.206 50.4575 75.9832 50.677C75.7604 50.8965 75.583 51.1577 75.4612 51.4457C75.3394 51.7338 75.2755 52.043 75.2732 52.3558C75.2732 53.6617 76.3486 54.7194 77.6723 54.7194ZM43.3277 54.7194C43.6404 54.7218 43.9506 54.6625 44.2404 54.545C44.5302 54.4275 44.794 54.254 45.0168 54.0345C45.2396 53.815 45.417 53.5538 45.5388 53.2658C45.6606 52.9778 45.7245 52.6685 45.7268 52.3558C45.7268 51.0528 44.6514 49.9921 43.3277 49.9921C43.0147 49.9893 42.7043 50.0484 42.4141 50.1657C42.124 50.283 41.8598 50.4565 41.6367 50.6759C41.4135 50.8955 41.2359 51.1568 41.1139 51.4451C40.9919 51.7333 40.9279 52.0428 40.9256 52.3558C40.9256 53.6617 42.001 54.7194 43.3277 54.7194ZM38.3846 62.7176C37.188 62.7176 36.1243 63.1963 35.3798 64.0768C34.7446 64.846 34.3968 65.8122 34.3958 66.8098C33.9304 66.6719 33.4482 66.5984 32.9628 66.5912C31.8194 66.5912 30.7853 67.0225 30.0525 67.7997C29.4015 68.4608 28.9898 69.3204 28.8828 70.242C28.7758 71.1637 28.9794 72.0947 29.4616 72.8875C28.8107 73.4096 28.3471 74.1294 28.1409 74.938C27.9636 75.5939 27.7863 76.9767 28.7318 78.3831C28.377 78.9173 28.1655 79.5337 28.1174 80.1731C28.0692 80.8127 28.1862 81.4537 28.457 82.0351C29.1603 83.6099 30.8503 84.8656 34.0413 86.1862L34.7504 86.4699C37.0195 87.3563 39.1026 87.9236 39.1173 87.9295C41.747 88.6475 44.4593 89.0375 47.1894 89.0936C51.518 89.0936 54.6144 87.7847 56.3931 85.2112C59.1409 81.2461 58.8808 77.6031 55.5835 74.093L55.1373 73.6379C53.0928 71.617 51.7248 68.6446 51.4441 67.9887C50.8679 66.0534 49.3463 63.9024 46.8289 63.9024C45.4698 63.9231 44.2022 64.5909 43.4311 65.69C42.6924 64.7741 41.9685 64.0561 41.3186 63.6395C40.4475 63.0607 39.4301 62.7411 38.3846 62.7176ZM82.6154 62.7176C83.812 62.7176 84.8816 63.1963 85.6203 64.0768C86.2585 64.8509 86.6041 65.8141 86.6041 66.8098C87.071 66.6709 87.5555 66.6 88.043 66.5912C89.1895 66.5912 90.2235 67.0225 90.9533 67.7997C91.6044 68.4608 92.016 69.3204 92.1231 70.242C92.2302 71.1637 92.0264 72.0947 91.5443 72.8875C92.1943 73.4134 92.6582 74.1343 92.8591 74.938C93.0364 75.5939 93.2137 76.9767 92.2682 78.3831C92.9891 79.4763 93.0925 80.8531 92.5429 82.0351C91.8397 83.6099 90.1496 84.8656 86.9616 86.1862L86.2555 86.4699C83.9804 87.3563 81.8974 87.9236 81.8827 87.9295C79.253 88.6475 76.5407 89.0375 73.8106 89.0936C69.482 89.0936 66.3856 87.7847 64.6069 85.2112C61.8591 81.2461 62.1192 77.6031 65.4165 74.093L65.8626 73.6379C67.9161 71.617 69.2812 68.6446 69.5619 67.9887C70.138 66.0534 71.6537 63.9024 74.1711 63.9024C75.5302 63.9231 76.7978 64.5909 77.5689 65.69C78.3075 64.7741 79.0315 64.0561 79.6903 63.6395C80.4113 63.1608 81.2356 62.8565 82.0954 62.7531L82.6154 62.7176Z" }), createElement("path", { fill: "#FFD21E", d: "M53.9546 83.5744C55.9874 80.6375 55.8397 78.4333 53.0535 75.6944C50.2613 72.9526 48.6363 68.9342 48.6363 68.9342C48.6363 68.9342 48.0306 66.606 46.6508 66.8246C45.268 67.0433 44.2575 70.5179 47.1531 72.6482C50.0398 74.7785 46.5769 76.2233 45.4601 74.226C44.3521 72.2257 41.3088 67.0876 39.7281 66.0978C38.1562 65.1169 37.0483 65.6605 37.4176 67.6962C37.7869 69.7261 44.3816 74.6396 43.7405 75.6944C43.0963 76.764 40.8361 74.4535 40.8361 74.4535C40.8361 74.4535 33.7686 68.1158 32.2234 69.7704C30.6869 71.4191 33.3992 72.8018 37.2462 75.0976C41.1108 77.3963 41.4122 78.0079 40.8656 78.8795C40.3131 79.7511 31.7949 72.6748 30.9972 75.6797C30.1994 78.6668 39.6926 79.5325 39.1076 81.6066C38.5167 83.6749 32.4154 77.6947 31.1744 80.02C29.9187 82.3541 39.7812 85.0961 39.861 85.1167C43.0373 85.9322 51.127 87.6547 53.9546 83.5744ZM67.0495 83.5744C65.0197 80.6375 65.1586 78.4333 67.9507 75.6944C70.7369 72.9526 72.362 68.9342 72.362 68.9342C72.362 68.9342 72.9676 66.606 74.3563 66.8246C75.7303 67.0433 76.7407 70.5179 73.854 72.6482C70.9585 74.7785 74.4302 76.2233 75.5381 74.226C76.6521 72.2257 79.6954 67.0876 81.2702 66.0978C82.842 65.1169 83.9588 65.6605 83.5807 67.6962C83.2114 69.7261 76.6225 74.6396 77.2666 75.6944C77.9019 76.764 80.1622 74.4535 80.1622 74.4535C80.1622 74.4535 87.2385 68.1158 88.7749 69.7704C90.3113 71.4191 87.6079 72.8018 83.752 75.0976C79.8874 77.3963 79.592 78.0079 80.1326 78.8795C80.6851 79.7511 89.2034 72.6748 90.0011 75.6797C90.7989 78.6668 81.3145 79.5325 81.8966 81.6066C82.4874 83.6749 88.5829 77.6947 89.8297 80.02C91.0795 82.3541 81.2259 85.0961 81.1431 85.1167C77.961 85.9322 69.8712 87.6547 67.0495 83.5744Z" })));
}
/** @returns Brand icon for AI provider `jina`. */
export function JinaProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#EB6161", d: "M42.8218 90.4163C51.0077 90.4163 57.6438 83.7804 57.6438 75.5948C57.6438 67.4094 51.0077 60.7738 42.8218 60.7738C34.6359 60.7738 28 67.4094 28 75.5948C28 83.7804 34.6359 90.4163 42.8218 90.4163Z" }), createElement("path", { fill: "#009191", d: "M93 32.3905L92.8063 60.7738C92.8063 76.9512 79.8251 90.1254 63.6468 90.416L63.3555 60.8707L63.3562 32.4874C63.3562 30.5499 64.9061 29 66.8438 29H89.5124C91.4501 29 93 30.4531 93 32.3905Z" })));
}
/** @returns Brand icon for AI provider `lanyun`. */
export function LanyunProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-lanyunlight__a`,
        width: 65,
        height: 61,
        x: 28,
        y: 30,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M93 30H28V90.4297H93V30Z" })), createElement("g", { mask: `url(#${iconId}-lanyunlight__a)` }, createElement("path", { fill: `url(#${iconId}-lanyunlight__b)`, d: "M28.8273 53.4258C27.7272 54.5263 27.7272 56.314 28.8273 57.4196C29.9274 58.5202 31.7145 58.5202 32.8198 57.4196C33.9198 56.3192 33.9198 54.5315 32.8198 53.4258C31.7197 52.3253 29.9326 52.3253 28.8273 53.4258Z" }), createElement("path", { fill: `url(#${iconId}-lanyunlight__c)`, d: "M54.3681 87.4122C53.676 88.1049 53.676 89.2205 54.3681 89.9132C55.0602 90.6053 56.1758 90.6053 56.8679 89.9132C57.56 89.2205 57.56 88.1049 56.8679 87.4122C56.1758 86.7201 55.0602 86.7201 54.3681 87.4122Z" }), createElement("path", { fill: `url(#${iconId}-lanyunlight__d)`, d: "M83.3676 38.4991C84.2807 38.4991 85.0206 37.759 85.0206 36.8459C85.0206 35.9327 84.2807 35.1924 83.3676 35.1924C82.4552 35.1924 81.7152 35.9327 81.7152 36.8459C81.7152 37.759 82.4552 38.4991 83.3676 38.4991Z" }), createElement("path", { fill: `url(#${iconId}-lanyunlight__e)`, d: "M57.0116 74.8986C57.4403 75.3274 58.0239 75.6013 58.6282 75.5651C58.6334 75.5651 58.6437 75.5651 58.6489 75.5651C58.716 75.5651 58.7831 75.5599 58.8503 75.5651C59.4649 75.5909 60.0589 75.3377 60.4979 74.8986L61.2416 74.1546C61.6755 73.7206 61.9337 73.1212 61.9079 72.5064C61.9079 72.4393 61.9079 72.3721 61.9079 72.3049C61.9079 72.2997 61.9079 72.2894 61.9079 72.2842C61.9441 71.6797 61.6703 71.0959 61.2416 70.667L60.4979 69.923C60.0692 69.4942 59.4856 69.2204 58.8813 69.2565C58.7883 69.2617 58.6953 69.2669 58.6024 69.2617C58.0084 69.2514 57.4403 69.5046 57.0219 69.923L56.2782 70.667C55.8443 71.1011 55.5861 71.7004 55.6119 72.3152C55.6119 72.3514 55.6119 72.3927 55.6119 72.4289C55.6119 72.4393 55.6119 72.4495 55.6119 72.4599C55.6119 72.4961 55.6119 72.5271 55.6119 72.5632C55.5861 73.1626 55.8546 73.7361 56.2782 74.1546L57.0219 74.8986H57.0116Z" }), createElement("path", { fill: `url(#${iconId}-lanyunlight__f)`, d: "M85.584 68.399C86.7047 65.6347 87.3294 62.6174 87.3294 59.4502C87.3294 46.3217 76.695 35.6833 63.5711 35.6833C60.4103 35.6833 57.394 36.3086 54.6307 37.4297C48.9597 33.2344 43.0975 29.9535 38.6196 30C36.094 30.0311 34.0952 31.984 33.8421 34.4641C33.3876 39.8012 36.5485 46.5489 40.7372 52.8885C40.138 54.9758 39.8127 57.1769 39.8127 59.4554C39.8127 63.3304 40.7475 66.9833 42.3899 70.2125C42.3899 70.2125 42.3951 70.2125 42.4003 70.2125C42.4984 70.202 42.5966 70.197 42.6947 70.202C42.7205 70.202 42.7515 70.197 42.7773 70.202C43.3816 70.2382 43.9653 69.9644 44.394 69.5356L45.1377 68.7915C45.5664 68.3628 45.8401 67.7789 45.8039 67.1744C45.8039 67.1486 45.8039 67.1176 45.8039 67.0917C45.8039 66.9935 45.8039 66.8954 45.8143 66.7973C45.8194 66.7404 45.8298 66.6784 45.8401 66.6216C45.8556 66.5338 45.8763 66.4511 45.9072 66.3632C45.9279 66.2961 45.9537 66.2341 45.9796 66.1669C46.0106 66.0894 46.0467 66.0171 46.088 65.9447C46.1242 65.8776 46.1706 65.8156 46.2119 65.7536C46.2585 65.6864 46.3101 65.6244 46.3669 65.5624C46.3927 65.5366 46.4082 65.5004 46.4393 65.4746C46.4702 65.4436 46.5115 65.4177 46.5476 65.3868C46.5838 65.3557 46.6096 65.3196 46.6458 65.2937C46.682 65.2627 46.7233 65.2421 46.7594 65.2162C46.7956 65.1904 46.8318 65.1645 46.8679 65.1439C46.9608 65.0871 47.0538 65.0406 47.1519 64.9993C47.1881 64.9838 47.2191 64.9683 47.2552 64.9527C47.3792 64.9114 47.5031 64.8752 47.6323 64.8546C47.6943 64.8442 47.7511 64.8442 47.8131 64.8391C47.8906 64.8339 47.9629 64.8287 48.0403 64.8287C48.1024 64.8287 48.1643 64.8339 48.2314 64.8391C48.3141 64.8494 48.3967 64.8597 48.4742 64.8804C48.5258 64.8907 48.5775 64.9011 48.6239 64.9166C48.8718 64.9889 49.1043 65.0974 49.316 65.2524C49.3367 65.2679 49.3574 65.2886 49.378 65.3041C49.3986 65.3196 49.4194 65.3402 49.44 65.3557C49.5537 65.4539 49.6569 65.5521 49.7447 65.6657C49.7447 65.6657 49.755 65.6709 49.755 65.6761C49.7705 65.6916 49.7809 65.7123 49.7912 65.7329C49.8377 65.8 49.8842 65.8672 49.9255 65.9344C49.9462 65.9654 49.9617 66.0015 49.9824 66.0377C50.0184 66.1101 50.0495 66.1824 50.0805 66.2599C50.0907 66.2857 50.1011 66.3064 50.1063 66.3323C50.1424 66.4356 50.1682 66.5389 50.1889 66.6474C50.1889 66.6681 50.1889 66.6836 50.1941 66.7043C50.2096 66.792 50.2147 66.8747 50.2199 66.9626C50.2199 66.9988 50.2199 67.0349 50.2199 67.0711C50.2199 67.0969 50.2199 67.1176 50.2199 67.1434C50.1941 67.7582 50.4471 68.3524 50.8862 68.7915L51.6299 69.5356C52.0586 69.9644 52.6422 70.2176 53.2465 70.202C53.2672 70.202 53.2931 70.202 53.3136 70.202C53.324 70.202 53.3395 70.202 53.3498 70.202C53.3859 70.202 53.4221 70.202 53.4583 70.202C53.4634 70.202 53.4738 70.202 53.4789 70.202C53.4841 70.202 53.4944 70.202 53.4996 70.202C54.1039 70.2382 54.6875 69.9644 55.1162 69.5356L55.86 68.7915C56.2886 68.3628 56.5624 67.7789 56.5262 67.1744C56.5262 67.1744 56.5262 67.1744 56.5262 67.1693C56.5262 67.1176 56.5262 67.0659 56.5262 67.0194C56.5262 66.9522 56.5314 66.8851 56.5366 66.8231C56.5417 66.7507 56.5572 66.6784 56.5727 66.606C56.583 66.5441 56.5985 66.4821 56.614 66.4201C56.6243 66.3839 56.6399 66.3477 56.6502 66.3116C56.6605 66.2806 56.676 66.2496 56.6864 66.2134C56.7019 66.1773 56.7122 66.1411 56.7277 66.1101C56.7535 66.0481 56.7896 65.9913 56.8258 65.9344C56.8258 65.9344 56.8258 65.9344 56.8258 65.9293C56.8517 65.8879 56.8722 65.8517 56.8981 65.8104C56.9136 65.7898 56.9239 65.769 56.9394 65.7484C56.9498 65.7329 56.9601 65.7226 56.9704 65.7123C57.0014 65.6709 57.0427 65.6244 57.0789 65.583C57.0996 65.5624 57.1201 65.5366 57.1408 65.5159C57.1512 65.5056 57.1563 65.4952 57.1667 65.4849C57.1873 65.4642 57.2132 65.4487 57.2338 65.4281C57.2545 65.4074 57.2751 65.3868 57.3009 65.366C57.3268 65.3454 57.3423 65.3196 57.3681 65.2989C57.4094 65.2679 57.4559 65.2421 57.4972 65.2111C57.523 65.1904 57.554 65.1749 57.5799 65.1542C57.6521 65.1129 57.7193 65.0767 57.7968 65.0406C57.8329 65.0251 57.8639 65.0096 57.9 64.994C57.9259 64.9838 57.9517 64.9682 57.9775 64.9631C58.1015 64.9166 58.2306 64.8856 58.3649 64.8649C58.4217 64.8546 58.4785 64.8546 58.5405 64.8494C58.618 64.8442 58.6955 64.8391 58.7729 64.8391C58.8143 64.8391 58.8555 64.8391 58.8969 64.8391C59.4909 64.8494 60.059 64.5963 60.4774 64.1778L61.2211 63.4337C61.6549 62.9997 61.9132 62.4004 61.8873 61.7855C61.8564 61.0828 62.156 60.3699 62.7912 59.8946C63.5763 59.3107 64.7022 59.3314 65.4718 59.9359C66.5358 60.778 66.6029 62.3281 65.6732 63.2581C65.2084 63.7231 64.5886 63.9401 63.974 63.8987C63.3697 63.8626 62.7861 64.1364 62.3574 64.5652L61.6137 65.3093C61.185 65.7381 60.9112 66.3219 60.9473 66.9264C60.9473 66.9264 60.9473 66.9264 60.9473 66.9316C60.9473 66.9935 60.9473 67.0504 60.9473 67.1073C60.9473 67.1176 60.9473 67.1279 60.9473 67.1383C60.9216 67.7531 61.1746 68.3473 61.6137 68.7864L62.3574 69.5304C62.7912 69.9644 63.3904 70.2228 64.005 70.197C64.0308 70.197 64.0515 70.197 64.0773 70.197C64.1134 70.197 64.1496 70.197 64.1858 70.197C64.2735 70.197 64.3562 70.2073 64.444 70.2228C64.4647 70.2228 64.4802 70.2228 64.5008 70.2279C64.6093 70.2486 64.7126 70.2745 64.8158 70.3106C64.8417 70.3209 64.8623 70.3313 64.8882 70.3364C64.9656 70.3623 65.038 70.3985 65.1102 70.4346C65.1464 70.4501 65.1774 70.4707 65.2136 70.4914C65.2807 70.5328 65.3478 70.5741 65.415 70.6258C65.4304 70.6413 65.4512 70.6464 65.4718 70.662C65.4718 70.662 65.477 70.6722 65.4821 70.6722C65.5906 70.7601 65.6938 70.8635 65.792 70.9771C65.8075 70.9978 65.8282 71.0185 65.8436 71.0391C65.8591 71.0597 65.8799 71.0805 65.8953 71.1011C66.0502 71.3129 66.1587 71.5454 66.231 71.7935C66.2465 71.8451 66.2517 71.8916 66.2672 71.9433C66.2827 72.026 66.2981 72.1034 66.3085 72.1861C66.3136 72.2481 66.3188 72.3101 66.3188 72.3773C66.3188 72.4548 66.3188 72.5271 66.3085 72.6046C66.3033 72.6666 66.3033 72.7234 66.2931 72.7854C66.2723 72.9146 66.2414 73.0386 66.1949 73.1626C66.1845 73.1988 66.1639 73.2298 66.1484 73.266C66.107 73.3641 66.0606 73.4571 66.0038 73.5502C65.9831 73.5863 65.9573 73.6225 65.9315 73.6586C65.9056 73.6947 65.885 73.7361 65.854 73.7723C65.823 73.8085 65.792 73.8343 65.761 73.8705C65.7301 73.9066 65.7094 73.9428 65.6732 73.9789C65.6474 74.0048 65.6165 74.0255 65.5854 74.0513C65.5234 74.1081 65.4615 74.1546 65.3943 74.2063C65.3323 74.2528 65.2704 74.2941 65.2032 74.3303C65.1309 74.3716 65.0586 74.4078 64.9811 74.4388C64.9191 74.4646 64.852 74.4905 64.7849 74.5111C64.7022 74.5369 64.6144 74.5576 64.5266 74.5783C64.4698 74.5886 64.4078 74.599 64.351 74.6041C64.2529 74.6145 64.1547 74.6196 64.0566 74.6145C64.0308 74.6145 63.9998 74.6196 63.974 74.6145C63.3697 74.5783 62.7861 74.8521 62.3574 75.281L61.6137 76.025C61.185 76.4538 60.9112 77.0376 60.9473 77.6421C60.9473 77.668 60.9473 77.699 60.9473 77.7248C60.9473 77.823 60.9473 77.9211 60.9371 78.0193C60.9318 78.0762 60.9216 78.1381 60.9112 78.195C60.8957 78.2828 60.875 78.3654 60.844 78.4533C60.8234 78.5205 60.7976 78.5824 60.7718 78.6445C60.7408 78.722 60.7046 78.7942 60.6633 78.8669C60.6271 78.9339 60.5806 78.9958 60.5393 79.0578C60.4929 79.1248 60.4412 79.1868 60.3844 79.2492C60.3586 79.2746 60.3431 79.3112 60.3121 79.337C60.2811 79.368 60.2397 79.3934 60.2036 79.4244C60.1674 79.4559 60.1416 79.492 60.1055 79.5178C60.0693 79.5488 60.028 79.5692 59.9918 79.595C59.9557 79.6209 59.9195 79.6469 59.8834 79.6676C59.7904 79.7246 59.6974 79.7707 59.5993 79.8124C59.5632 79.8276 59.5321 79.8434 59.496 79.8586C59.3721 79.9003 59.2481 79.9363 59.119 79.9566C59.057 79.9672 59.0002 79.9672 58.9382 79.9724C58.8608 79.9774 58.7884 79.9825 58.711 79.9825C58.649 79.9825 58.587 79.9774 58.5198 79.9724C58.4372 79.9622 58.3546 79.9515 58.2771 79.9312C58.2254 79.9205 58.1738 79.9104 58.1273 79.8947C57.8794 79.8226 57.647 79.7139 57.4352 79.559C57.4146 79.5432 57.394 79.5229 57.3732 79.5072C57.3526 79.492 57.332 79.4711 57.3113 79.4559C57.1977 79.3574 57.0943 79.2593 57.0065 79.1456C57.0065 79.1456 56.9962 79.1405 56.9962 79.1355C56.9807 79.1197 56.9704 79.0989 56.9601 79.0786C56.9136 79.0116 56.8672 78.944 56.8258 78.877C56.8051 78.846 56.7896 78.8099 56.769 78.7734C56.7328 78.7013 56.7019 78.629 56.6709 78.5515C56.6605 78.5256 56.6502 78.505 56.645 78.4792C56.6088 78.3758 56.583 78.2725 56.5624 78.1639C56.5624 78.1433 56.5624 78.1278 56.5572 78.1072C56.5417 78.0193 56.5366 77.9366 56.5314 77.8488C56.5314 77.8126 56.5314 77.7764 56.5314 77.7403C56.5314 77.7145 56.5314 77.6938 56.5314 77.668C56.5572 77.0531 56.3041 76.459 55.8651 76.0198L55.1214 75.2758C54.6927 74.847 54.1091 74.5938 53.5048 74.6093C53.4841 74.6093 53.4583 74.6093 53.4376 74.6093C53.4273 74.6093 53.4118 74.6093 53.4014 74.6093C53.3653 74.6093 53.3292 74.6093 53.2931 74.6093C53.2878 74.6093 53.2775 74.6093 53.2723 74.6093C53.2672 74.6093 53.2569 74.6093 53.2517 74.6093C52.6474 74.5731 52.0638 74.847 51.6351 75.2758L50.8913 76.0198C50.4626 76.4486 50.1889 77.0325 50.2251 77.637C50.2251 77.6628 50.2251 77.6938 50.2251 77.7196C50.2251 77.8178 50.2251 77.916 50.2147 78.0141C50.2096 78.071 50.1992 78.133 50.1889 78.1898C50.1734 78.2777 50.1528 78.3603 50.1218 78.4481C50.1011 78.5153 50.0753 78.5773 50.0495 78.6445C50.0184 78.722 49.9824 78.7942 49.941 78.8669C49.941 78.8719 49.9307 78.882 49.9255 78.8872C53.7889 81.6049 58.494 83.2066 63.5763 83.2066C65.8591 83.2066 68.0646 82.876 70.1563 82.2768C76.4937 86.4668 83.2339 89.6188 88.5537 89.1638C91.038 88.9159 92.9698 86.906 93.0053 84.3949C93.0477 79.9155 89.7776 74.0565 85.5891 68.3834L85.584 68.399ZM42.9994 47.5771C41.5894 45.557 40.2723 43.4696 39.0792 41.3151C34.6427 32.7125 37.2768 30.6613 45.9124 33.9112C48.5878 35.0272 51.1547 36.3705 53.6339 37.8689C49.1663 39.9304 45.4476 43.3404 42.9943 47.5771H42.9994ZM53.2569 63.8987C52.0328 63.8987 51.036 62.9068 51.036 61.677C51.036 60.4474 52.0276 59.4554 53.2569 59.4554C54.4861 59.4554 55.4777 60.4474 55.4777 61.677C55.4777 62.9068 54.4861 63.8987 53.2569 63.8987ZM69.1492 58.0603C67.9251 58.0603 66.9283 57.0683 66.9283 55.8387C66.9283 54.609 67.9199 53.617 69.1492 53.617C70.3785 53.617 71.3701 54.609 71.3701 55.8387C71.3701 57.0683 70.3785 58.0603 69.1492 58.0603ZM81.7049 83.9714C79.5461 82.7831 77.4595 81.4603 75.4349 80.0445C79.6802 77.5905 83.0942 73.8705 85.1605 69.391C86.6631 71.871 88.0012 74.444 89.122 77.1203C92.4377 85.8985 90.1858 88.3578 81.7049 83.9765V83.9714Z" }), createElement("path", { fill: `url(#${iconId}-lanyunlight__g)`, d: "M51.1744 72.5064C51.1744 72.5064 51.1744 72.4598 51.1744 72.434C51.1744 72.3978 51.1744 72.3617 51.1744 72.3255C51.1744 72.3204 51.1744 72.3152 51.1744 72.31C51.1744 72.3049 51.1744 72.2946 51.1744 72.2894C51.2105 71.6849 50.9368 71.101 50.5081 70.6722L49.7644 69.9282C49.3357 69.4994 48.752 69.2255 48.1477 69.2617C48.1426 69.2617 48.1323 69.2617 48.1271 69.2617C48.0599 69.2617 47.9928 69.2669 47.9256 69.2617C47.3111 69.2358 46.7171 69.489 46.278 69.9282L45.5343 70.6722C45.1005 71.1062 44.8422 71.7055 44.8681 72.3204C44.8681 72.3876 44.8681 72.4548 44.8681 72.5219C44.8681 72.527 44.8681 72.5374 44.8681 72.5425C44.8319 73.147 45.1056 73.7309 45.5343 74.1597L46.278 74.9037C46.7067 75.3325 47.2904 75.6064 47.8946 75.5702C47.8998 75.5702 47.9101 75.5702 47.9153 75.5702C47.9825 75.5702 48.0496 75.5651 48.1168 75.5702C48.7314 75.5961 49.3253 75.3429 49.7644 74.9037L50.5081 74.1597C50.9419 73.7257 51.2002 73.1264 51.1744 72.5115V72.5064Z" })), createElement("defs", {}, createElement("linearGradient", {
        id: `${iconId}-lanyunlight__b`,
        x1: 71.866,
        x2: 33.483,
        y1: 27.06,
        y2: 53.563,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#58F3FF" }), createElement("stop", { offset: 1, stopColor: "#4264FE" })), createElement("linearGradient", {
        id: `${iconId}-lanyunlight__c`,
        x1: 95.413,
        x2: 57.029,
        y1: 61.166,
        y2: 87.668,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#58F3FF" }), createElement("stop", { offset: 1, stopColor: "#4264FE" })), createElement("linearGradient", {
        id: `${iconId}-lanyunlight__d`,
        x1: 80.155,
        x2: 41.772,
        y1: 39.068,
        y2: 65.57,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#58F3FF" }), createElement("stop", { offset: 1, stopColor: "#4264FE" })), createElement("linearGradient", {
        id: `${iconId}-lanyunlight__e`,
        x1: 88.832,
        x2: 50.449,
        y1: 51.633,
        y2: 78.136,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#58F3FF" }), createElement("stop", { offset: 1, stopColor: "#4264FE" })), createElement("linearGradient", {
        id: `${iconId}-lanyunlight__f`,
        x1: 84.344,
        x2: 45.961,
        y1: 45.133,
        y2: 71.636,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#58F3FF" }), createElement("stop", { offset: 1, stopColor: "#4264FE" })), createElement("linearGradient", {
        id: `${iconId}-lanyunlight__g`,
        x1: 85.361,
        x2: 46.977,
        y1: 46.606,
        y2: 73.109,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#58F3FF" }), createElement("stop", { offset: 1, stopColor: "#4264FE" })))));
}
/** @returns Brand icon for AI provider `longcat`. */
export function LongcatProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-longcatlight__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 27,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 27H27V92H92V27Z" })), createElement("g", { mask: `url(#${iconId}-longcatlight__a)` }, createElement("mask", {
        id: `${iconId}-longcatlight__b`,
        width: 65,
        height: 65,
        x: 27,
        y: 27,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 27H27V92H92V27Z" })), createElement("g", { mask: `url(#${iconId}-longcatlight__b)` }, createElement("path", {
        fill: "#29E154",
        fillRule: "evenodd",
        d: "M28.3718 80.8499C28.1602 80.8502 27.9515 80.8014 27.7618 80.7075C27.5722 80.6137 27.4068 80.4772 27.2786 80.3091C27.1504 80.1406 27.0628 79.9451 27.0227 79.7371C26.9826 79.5293 26.991 79.3151 27.0474 79.1112L38.6174 37.1429C38.7322 36.7257 38.9439 36.3416 39.2355 36.0219C39.527 35.7022 39.89 35.456 40.2948 35.3033C40.6997 35.1506 41.1349 35.0959 41.5649 35.1436C41.995 35.1912 42.4077 35.34 42.7693 35.5775L57.9955 45.5632C58.4423 45.8557 58.9645 46.0116 59.4986 46.0116C60.0327 46.0116 60.5551 45.8557 61.0018 45.5632L76.2903 35.5721C76.6521 35.3351 77.0651 35.1871 77.4949 35.14C77.925 35.093 78.3602 35.1484 78.7646 35.3015C79.1692 35.4547 79.5319 35.7013 79.823 36.0214C80.1139 36.3414 80.3251 36.7257 80.4394 37.1429L91.9501 79.1139C92.0061 79.3178 92.0144 79.5318 91.9736 79.7395C91.9328 79.947 91.8451 80.1422 91.7166 80.3101C91.5881 80.4778 91.4226 80.6137 91.2329 80.7069C91.0432 80.8 90.8346 80.8483 90.6229 80.8472H75.9382C78.6115 77.7497 80.0825 73.7942 80.0819 69.7024V69.223C80.0817 65.2195 78.6254 61.3527 75.9843 58.3437L74.0965 48.8782C74.0581 48.6805 73.97 48.4958 73.8405 48.3416C73.7111 48.1874 73.5446 48.0686 73.3566 47.9966C73.1686 47.9245 72.9652 47.9014 72.7659 47.9297C72.5665 47.9579 72.3775 48.0363 72.2169 48.1577L65.1048 53.4904C64.8549 53.678 64.565 53.8052 64.2577 53.862C63.9503 53.9188 63.6343 53.9038 63.3336 53.8182C60.8263 53.1017 58.1683 53.1017 55.6609 53.8182C55.3608 53.9038 55.045 53.9188 54.7382 53.8619C54.4313 53.8051 54.1418 53.678 53.8924 53.4904L46.7749 48.1523C46.6145 48.0325 46.4261 47.9555 46.2277 47.9287C46.0293 47.9018 45.8273 47.926 45.6408 47.9989C45.4544 48.0719 45.2895 48.1911 45.1619 48.3454C45.0343 48.4997 44.9482 48.684 44.9115 48.8808L43.0834 58.7715C40.4116 61.4878 38.9145 65.1451 38.9153 68.9549V69.8568C38.9153 73.8489 40.3426 77.711 42.9453 80.7443L43.032 80.8472L28.3718 80.8499Z",
        clipRule: "evenodd"
    }), createElement("path", { fill: "#000", d: "M51.95 72.6167H56.0666V63.013H52.5729L51.95 72.6167ZM67.0436 72.6167H62.9269V63.013H66.4206L67.0436 72.6167Z" })))));
}
/** @returns Brand icon for AI provider `mimo` (Cherry models/mimo light mark). */
export function MimoProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        "aria-hidden": true,
        ...props
    }, createElement("path", {
        fill: "#000",
        fillRule: "evenodd",
        clipRule: "evenodd",
        d: "M4.63866 15.2599C4.71767 15.2598 4.79364 15.2943 4.85068 15.3563C4.90771 15.4182 4.94139 15.5028 4.94466 15.5922V17.6533C4.93953 17.7413 4.90506 17.8238 4.84824 17.8841C4.79142 17.9443 4.7165 17.9779 4.63866 17.9779C4.56083 17.9779 4.48591 17.9443 4.42909 17.8841C4.37226 17.8238 4.33779 17.7413 4.33266 17.6533V15.5922C4.33594 15.5028 4.36961 15.4182 4.42665 15.3563C4.48368 15.2943 4.55965 15.2598 4.63866 15.2599ZM7.84798 13.7229C7.89254 13.7125 7.93859 13.7134 7.9828 13.7257C8.027 13.7379 8.06824 13.7611 8.10354 13.7937C8.13883 13.8262 8.16729 13.8672 8.18686 13.9138C8.20642 13.9603 8.21659 14.0112 8.21664 14.0628V17.6533C8.21664 17.7453 8.1844 17.8335 8.12702 17.8985C8.06963 17.9635 7.9918 18 7.91064 18C7.82949 18 7.75166 17.9635 7.69427 17.8985C7.63689 17.8335 7.60465 17.7453 7.60465 17.6533V14.9155L6.49332 16.216C6.46541 16.2494 6.43195 16.2763 6.39486 16.2949C6.35777 16.3136 6.31779 16.3238 6.27721 16.325C6.23663 16.3261 6.19625 16.3181 6.1584 16.3015C6.12055 16.2849 6.08597 16.2599 6.05666 16.2281C6.04019 16.2094 6.02565 16.1886 6.01332 16.1662L4.41866 14.3037C4.36871 14.2366 4.34311 14.1504 4.34704 14.0627C4.35096 13.975 4.38412 13.8923 4.43981 13.8312C4.4955 13.7701 4.56957 13.7353 4.64707 13.7337C4.72457 13.7321 4.79971 13.7639 4.85733 13.8226L6.27332 15.4744L7.69131 13.8218C7.73375 13.7722 7.7883 13.738 7.84798 13.7237V13.7229ZM9.22664 13.7259C9.30604 13.7263 9.38222 13.7615 9.43917 13.8242C9.49611 13.8868 9.52938 13.9721 9.53197 14.062V17.6533C9.53162 17.745 9.49934 17.8327 9.44215 17.8975C9.38497 17.9623 9.30751 17.9988 9.22664 17.9992C9.14571 17.999 9.06815 17.9625 9.01093 17.8977C8.95371 17.8329 8.92148 17.745 8.92131 17.6533V14.062C8.92373 13.972 8.95694 13.8867 9.01393 13.8239C9.07091 13.7612 9.14719 13.7261 9.22664 13.7259ZM10.542 15.247C10.623 15.247 10.7007 15.2833 10.7581 15.348C10.8156 15.4127 10.8481 15.5004 10.8486 15.5922V17.6533C10.8483 17.7218 10.8301 17.7886 10.7964 17.8454C10.7627 17.9021 10.7149 17.9464 10.6591 17.9725C10.6033 17.9986 10.5419 18.0055 10.4826 17.9923C10.4233 17.979 10.3688 17.9462 10.326 17.898C10.2688 17.833 10.2367 17.7451 10.2366 17.6533V15.5922C10.237 15.5006 10.2693 15.4128 10.3264 15.348C10.3836 15.2832 10.4611 15.2474 10.542 15.247ZM10.5433 13.7025C10.585 13.7043 10.6259 13.7158 10.6635 13.7362C10.7011 13.7565 10.7346 13.7854 10.762 13.8211L12.18 15.4751L13.5966 13.8211C13.6391 13.7728 13.6933 13.7397 13.7523 13.7261C13.8113 13.7125 13.8725 13.719 13.9283 13.7446C13.9841 13.7702 14.032 13.814 14.066 13.8703C14.0999 13.9266 14.1185 13.993 14.1193 14.0613V17.6533C14.1189 17.7446 14.0869 17.832 14.0302 17.8967C13.9734 17.9614 13.8965 17.9983 13.8159 17.9992C13.7351 17.9988 13.6576 17.9623 13.6004 17.8975C13.5432 17.8327 13.511 17.745 13.5106 17.6533V14.9155L12.3993 16.2168C12.3425 16.2826 12.265 16.3203 12.1837 16.3214C12.1025 16.3225 12.0242 16.2871 11.966 16.2228L11.9626 16.2191C11.9626 16.2176 11.9613 16.2176 11.96 16.2168L10.3233 14.3029C10.2928 14.2709 10.2684 14.2322 10.2515 14.1891C10.2346 14.146 10.2257 14.0995 10.2252 14.0524C10.2247 14.0052 10.2326 13.9585 10.2486 13.915C10.2645 13.8714 10.2881 13.832 10.318 13.7992C10.3478 13.7667 10.3832 13.7414 10.4219 13.7248C10.4606 13.7082 10.5019 13.7006 10.5433 13.7025ZM15.0746 14.6134C15.1317 14.596 15.1921 14.5978 15.2484 14.6184C15.3046 14.639 15.3544 14.6776 15.3918 14.7296C15.4291 14.7816 15.4524 14.8447 15.4588 14.9113C15.4652 14.9779 15.4545 15.0452 15.4279 15.105C15.2918 15.3867 15.2399 15.7107 15.2801 16.0285C15.3202 16.3464 15.4502 16.6409 15.6506 16.868C15.8509 17.095 16.1109 17.2424 16.3914 17.288C16.6719 17.3336 16.958 17.275 17.2066 17.1209C17.2777 17.0772 17.3611 17.067 17.4388 17.0924C17.5166 17.1179 17.5823 17.1769 17.6219 17.2568C17.661 17.3375 17.6702 17.4324 17.6476 17.5207C17.625 17.6091 17.5723 17.6837 17.5013 17.7281C17.2193 17.9034 16.9029 17.9951 16.5813 17.9947L16.4866 17.9917C16.1608 17.9748 15.8442 17.8642 15.5667 17.6703C15.2891 17.4765 15.0597 17.2057 14.9001 16.8835C14.7404 16.5614 14.6559 16.1985 14.6543 15.829C14.6528 15.4596 14.7343 15.0958 14.8913 14.772C14.9317 14.6943 14.9979 14.6374 15.0746 14.6134ZM15.6506 13.9102C16.0153 13.684 16.4348 13.5978 16.8463 13.6646C17.2579 13.7313 17.6392 13.9474 17.9332 14.2804C18.2272 14.6134 18.4181 15.0454 18.4771 15.5116C18.5361 15.9778 18.4601 16.4532 18.2606 16.8663C18.2343 16.921 18.1956 16.9666 18.1485 16.9985C18.1013 17.0304 18.0475 17.0473 17.9926 17.0476L17.9546 17.0446C17.9161 17.0387 17.879 17.0246 17.8453 17.003C17.7744 16.9587 17.7219 16.8845 17.6992 16.7965C17.6764 16.7085 17.6853 16.6139 17.7239 16.5333C17.8599 16.2515 17.9117 15.9275 17.8715 15.6096C17.8313 15.2917 17.7013 14.9971 17.5009 14.77C17.3005 14.5429 17.0405 14.3955 16.76 14.3498C16.4794 14.3041 16.1933 14.3627 15.9446 14.5167C15.9093 14.5421 15.8698 14.559 15.8285 14.5665C15.7871 14.5739 15.7449 14.5717 15.7044 14.5599C15.6639 14.5481 15.6259 14.527 15.5929 14.498C15.5598 14.4689 15.5324 14.4325 15.5123 14.391C15.4921 14.3494 15.4797 14.3037 15.4758 14.2565C15.4719 14.2093 15.4766 14.1617 15.4895 14.1167C15.5025 14.0716 15.5235 14.03 15.5512 13.9945C15.5789 13.959 15.6127 13.9303 15.6506 13.9102ZM10.3933 8.03343C11.3806 8.03343 11.524 8.94127 11.524 9.28265V11.2826H10.9126V10.9563C10.7393 11.2177 10.3846 11.3604 10.006 11.3604C9.9173 11.3604 9.14664 11.3377 9.0833 10.5024C9.02864 9.7985 9.5333 9.28643 10.452 9.28643H10.9126C10.9126 8.86121 10.668 8.61726 10.2573 8.61726C9.96397 8.62707 9.6813 8.74867 9.4573 8.96317L9.2173 8.46167C9.53997 8.17542 9.89197 8.03343 10.3933 8.03343ZM13.3446 8.10896C14.1866 8.10896 14.7326 8.84157 14.7333 9.73279C14.7333 10.6248 14.1839 11.3596 13.3446 11.3596C12.5046 11.3596 11.9553 10.6255 11.9553 9.7343C11.9553 8.84308 12.502 8.10896 13.3446 8.10896ZM17.8786 8.12029C18.3319 8.12029 18.6799 8.47149 18.6766 9.28945V11.2849H18.0666V9.48506C18.0666 9.24942 18.0653 8.7449 17.6466 8.7449C17.2279 8.7449 17.2279 9.24866 17.2279 9.37781V11.2841H16.6346V9.37781C16.6346 9.24942 16.6339 8.7449 16.2146 8.7449C15.7959 8.7449 15.7959 9.24942 15.7959 9.48506V11.2849H15.1846V8.24113H15.7959V8.51076C15.8678 8.39533 15.9621 8.30015 16.0715 8.23258C16.181 8.16501 16.3027 8.12684 16.4273 8.12104C16.6926 8.12104 16.9339 8.26681 17.0819 8.63916C17.1598 8.47811 17.2753 8.34452 17.4159 8.2531C17.5565 8.16169 17.7166 8.11599 17.8786 8.12104V8.12029ZM5.81666 8.77888L6.78798 7.44054H7.54665L6.20732 9.3189L7.63398 11.2841H6.82665L5.81666 9.86723L4.80666 11.2841H4L5.42533 9.3189L4.08667 7.44054H4.84533L5.81732 8.77888H5.81666ZM8.58264 11.2841H7.97198V8.24189H8.58264V11.2841ZM19.9092 11.2841H19.2986V8.24189H19.9092V11.2841ZM10.6166 9.80228C9.9133 9.80228 9.71063 10.1134 9.73263 10.3627C9.75397 10.6112 9.94863 10.7683 10.2373 10.7683C10.4114 10.7687 10.579 10.6928 10.705 10.5566C10.8309 10.4204 10.9056 10.2343 10.9133 10.0372L10.9146 9.80303H10.6166V9.80228ZM13.3453 8.73734C12.9033 8.73734 12.556 9.10516 12.556 9.7343C12.556 10.3627 12.9026 10.7313 13.3453 10.7313C13.7866 10.7313 14.1333 10.3612 14.1333 9.7343C14.1333 9.10592 13.7866 8.73734 13.3453 8.73734ZM8.27798 7.00097C8.32955 6.999 8.38094 7.00899 8.42899 7.03033C8.47704 7.05168 8.52072 7.08392 8.55737 7.12508C8.59402 7.16625 8.62285 7.21547 8.6421 7.26971C8.66135 7.32396 8.67061 7.38209 8.66931 7.44054C8.66514 7.55506 8.62205 7.66331 8.54905 7.74267C8.47606 7.82202 8.37881 7.86633 8.27764 7.86633C8.17648 7.86633 8.07923 7.82202 8.00623 7.74267C7.93324 7.66331 7.89015 7.55506 7.88598 7.44054C7.88477 7.38202 7.89411 7.32384 7.91343 7.26955C7.93275 7.21526 7.96163 7.16601 7.99832 7.1248C8.03501 7.08358 8.07874 7.05128 8.12682 7.02986C8.1749 7.00844 8.22634 6.99911 8.27798 7.00097ZM19.6052 7.00097C19.657 6.99869 19.7087 7.00844 19.7571 7.02963C19.8054 7.05081 19.8494 7.08298 19.8864 7.12416C19.9234 7.16533 19.9525 7.21464 19.972 7.26905C19.9916 7.32346 20.001 7.38182 19.9999 7.44054C19.9941 7.55365 19.9503 7.65996 19.8776 7.7377C19.8048 7.81545 19.7086 7.85875 19.6086 7.85875C19.5086 7.85875 19.4123 7.81545 19.3396 7.7377C19.2668 7.65996 19.2231 7.55365 19.2172 7.44054C19.2155 7.35298 19.2373 7.26688 19.2798 7.19374C19.3223 7.1206 19.3835 7.06389 19.4552 7.03118C19.5029 7.00979 19.554 6.99951 19.6052 7.00097Z"
    })));
}
/** @returns Brand icon for AI provider `minimax`. */
export function MinimaxProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", {
        fill: "#000",
        fillRule: "evenodd",
        d: "M71.0862 33C74.2171 33 76.7548 35.5029 76.7548 38.589V72.3417C76.7765 72.8588 76.9988 73.3473 77.3745 73.7044C77.7504 74.0615 78.2506 74.2592 78.7698 74.256C79.2885 74.2585 79.788 74.0604 80.1633 73.7034C80.5385 73.3464 80.7604 72.8583 80.7821 72.3417V52.1673C80.786 51.4368 80.9341 50.7144 81.2182 50.0411C81.5021 49.3677 81.9164 48.7568 82.4372 48.243C82.958 47.7293 83.5753 47.3229 84.2537 47.047C84.9321 46.7711 85.6583 46.6311 86.391 46.635C87.1239 46.6311 87.8504 46.7712 88.529 47.0473C89.2076 47.3233 89.8248 47.73 90.3455 48.244C90.867 48.758 91.2812 49.3693 91.5647 50.0429C91.8488 50.7166 91.9962 51.4393 92 52.17V69.8846C91.997 70.3489 91.8095 70.7931 91.4785 71.1196C91.1474 71.4461 90.7 71.6283 90.2344 71.6262C90.0031 71.6276 89.7741 71.5837 89.5607 71.4969C89.3469 71.4101 89.1523 71.2823 88.9881 71.1206C88.8238 70.9589 88.6932 70.7665 88.6035 70.5544C88.5139 70.3424 88.467 70.1147 88.4656 69.8846V52.17C88.4642 51.8998 88.4094 51.6325 88.3044 51.3835C88.1994 51.1344 88.0462 50.9084 87.8535 50.7183C87.6609 50.5283 87.4325 50.378 87.1816 50.2759C86.9307 50.1738 86.6621 50.1219 86.391 50.1234C86.12 50.1219 85.8514 50.1738 85.6004 50.2759C85.3495 50.378 85.1212 50.5283 84.9286 50.7183C84.7359 50.9084 84.5827 51.1344 84.4777 51.3835C84.3726 51.6325 84.3179 51.8998 84.3165 52.17V72.3444C84.3125 73.0666 84.166 73.781 83.8851 74.4468C83.6043 75.1126 83.1946 75.7168 82.6795 76.2247C82.1645 76.7326 81.5541 77.1345 80.8833 77.4073C80.2125 77.68 79.4943 77.8185 78.7698 77.8145C78.0453 77.8185 77.3272 77.68 76.6563 77.4073C75.9854 77.1345 75.3751 76.7326 74.86 76.2247C74.3449 75.7168 73.9353 75.1126 73.6544 74.4468C73.3736 73.781 73.227 73.0666 73.2231 72.3444V38.5944C73.2007 38.046 72.9657 37.5276 72.5676 37.1484C72.1696 36.7692 71.6395 36.5588 71.089 36.5613C70.5384 36.558 70.008 36.7678 69.6094 37.1465C69.2109 37.5252 68.9752 38.0433 68.9521 38.5917L68.9494 81.5324C68.9408 82.9906 68.3516 84.3857 67.3115 85.411C66.2714 86.4363 64.8654 87.0078 63.4027 86.9999C62.6782 87.0038 61.96 86.8654 61.2892 86.5927C60.6184 86.3198 60.008 85.918 59.493 85.4101C58.9779 84.9021 58.5682 84.298 58.2874 83.6322C58.0065 82.9664 57.86 82.252 57.856 81.5298V76.3079C57.856 75.3467 58.6469 74.5664 59.6219 74.5664C60.5968 74.5664 61.3877 75.3467 61.3877 76.3079V81.5298C61.3877 82.2398 61.7723 82.8959 62.3952 83.2523C63.0182 83.606 63.7873 83.606 64.4102 83.2523C64.7159 83.0796 64.9701 82.8291 65.1471 82.5265C65.3241 82.2239 65.4175 81.88 65.4177 81.5298V38.589C65.4177 35.5029 67.9554 33 71.0862 33ZM55.7192 33C58.85 33 61.3877 35.5029 61.3877 38.589V69.7011C61.3867 69.931 61.3401 70.1586 61.2508 70.3706C61.1614 70.5826 61.031 70.775 60.867 70.9368C60.703 71.0986 60.5086 71.2265 60.295 71.3132C60.0813 71.4 59.8526 71.444 59.6219 71.4425C59.3912 71.444 59.1625 71.4 58.9488 71.3132C58.7352 71.2265 58.5408 71.0986 58.3768 70.9368C58.2128 70.775 58.0823 70.5826 57.993 70.3706C57.9036 70.1586 57.8571 69.931 57.856 69.7011V38.589C57.8525 38.0273 57.6254 37.4901 57.2247 37.0952C56.824 36.7003 56.2826 36.4801 55.7192 36.483C55.1557 36.4801 54.6143 36.7003 54.2136 37.0952C53.813 37.4901 53.5859 38.0273 53.5823 38.589V76.4241C53.5737 77.8982 52.9784 79.3087 51.9271 80.3456C50.8759 81.3824 49.4548 81.9608 47.976 81.9536C46.4968 81.9615 45.075 81.3834 44.0232 80.3466C42.9713 79.3096 42.3757 77.8987 42.3671 76.4241V52.17C42.3657 51.8998 42.3109 51.6325 42.2058 51.3835C42.1009 51.1344 41.9476 50.9084 41.755 50.7183C41.5623 50.5283 41.334 50.378 41.0831 50.2759C40.8322 50.1738 40.5635 50.1219 40.2925 50.1234C40.0215 50.1219 39.7528 50.1738 39.5019 50.2759C39.251 50.378 39.0227 50.5283 38.83 50.7183C38.6374 50.9084 38.4841 51.1344 38.3792 51.3835C38.2741 51.6325 38.2193 51.8998 38.2179 52.17V62.43C38.214 63.1603 38.0659 63.8829 37.7818 64.5562C37.4979 65.2295 37.0836 65.8405 36.5628 66.3542C36.042 66.868 35.4247 67.2744 34.7463 67.5502C34.0679 67.8262 33.3417 67.9662 32.609 67.9622C31.8763 67.9662 31.15 67.8262 30.4716 67.5502C29.7933 67.2744 29.176 66.868 28.6552 66.3542C28.1343 65.8405 27.7201 65.2295 27.4361 64.5562C27.1521 63.8829 27.0039 63.1603 27 62.43V58.7094C27 57.7455 27.7908 56.9652 28.7658 56.9652C29.7408 56.9652 30.5343 57.7482 30.5343 58.7094V62.43C30.5343 63.5586 31.4633 64.4738 32.609 64.4738C33.7546 64.4738 34.6835 63.5586 34.6835 62.43V52.1673C34.6921 50.6931 35.2874 49.2826 36.3387 48.2458C37.3899 47.2089 38.811 46.6305 40.2898 46.6377C41.769 46.6298 43.1908 47.2078 44.2427 48.2448C45.2945 49.2817 45.8901 50.6926 45.8988 52.1673V76.4241C45.8988 77.5553 46.8277 78.4706 47.976 78.4706C49.1217 78.4706 50.0506 77.5553 50.0506 76.4241V38.589C50.0506 35.5029 52.5883 33 55.7192 33Z",
        clipRule: "evenodd"
    })));
}
/** @returns Brand icon for AI provider `minimax-global`. */
export function MinimaxGlobalProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", {
        fill: "#000",
        fillRule: "evenodd",
        d: "M71.0862 33C74.2171 33 76.7548 35.5029 76.7548 38.589V72.3417C76.7765 72.8588 76.9988 73.3473 77.3745 73.7044C77.7504 74.0615 78.2506 74.2592 78.7698 74.256C79.2885 74.2585 79.788 74.0604 80.1633 73.7034C80.5385 73.3464 80.7604 72.8583 80.7821 72.3417V52.1673C80.786 51.4368 80.9341 50.7144 81.2182 50.0411C81.5021 49.3677 81.9164 48.7568 82.4372 48.243C82.958 47.7293 83.5753 47.3229 84.2537 47.047C84.9321 46.7711 85.6583 46.6311 86.391 46.635C87.1239 46.6311 87.8504 46.7712 88.529 47.0473C89.2076 47.3233 89.8248 47.73 90.3455 48.244C90.867 48.758 91.2812 49.3693 91.5647 50.0429C91.8488 50.7166 91.9962 51.4393 92 52.17V69.8846C91.997 70.3489 91.8095 70.7931 91.4785 71.1196C91.1474 71.4461 90.7 71.6283 90.2344 71.6262C90.0031 71.6276 89.7741 71.5837 89.5607 71.4969C89.3469 71.4101 89.1523 71.2823 88.9881 71.1206C88.8238 70.9589 88.6932 70.7665 88.6035 70.5544C88.5139 70.3424 88.467 70.1147 88.4656 69.8846V52.17C88.4642 51.8998 88.4094 51.6325 88.3044 51.3835C88.1994 51.1344 88.0462 50.9084 87.8535 50.7183C87.6609 50.5283 87.4325 50.378 87.1816 50.2759C86.9307 50.1738 86.6621 50.1219 86.391 50.1234C86.12 50.1219 85.8514 50.1738 85.6004 50.2759C85.3495 50.378 85.1212 50.5283 84.9286 50.7183C84.7359 50.9084 84.5827 51.1344 84.4777 51.3835C84.3726 51.6325 84.3179 51.8998 84.3165 52.17V72.3444C84.3125 73.0666 84.166 73.781 83.8851 74.4468C83.6043 75.1126 83.1946 75.7168 82.6795 76.2247C82.1645 76.7326 81.5541 77.1345 80.8833 77.4073C80.2125 77.68 79.4943 77.8185 78.7698 77.8145C78.0453 77.8185 77.3272 77.68 76.6563 77.4073C75.9854 77.1345 75.3751 76.7326 74.86 76.2247C74.3449 75.7168 73.9353 75.1126 73.6544 74.4468C73.3736 73.781 73.227 73.0666 73.2231 72.3444V38.5944C73.2007 38.046 72.9657 37.5276 72.5676 37.1484C72.1696 36.7692 71.6395 36.5588 71.089 36.5613C70.5384 36.558 70.008 36.7678 69.6094 37.1465C69.2109 37.5252 68.9752 38.0433 68.9521 38.5917L68.9494 81.5324C68.9408 82.9906 68.3516 84.3857 67.3115 85.411C66.2714 86.4363 64.8654 87.0078 63.4027 86.9999C62.6782 87.0038 61.96 86.8654 61.2892 86.5927C60.6184 86.3198 60.008 85.918 59.493 85.4101C58.9779 84.9021 58.5682 84.298 58.2874 83.6322C58.0065 82.9664 57.86 82.252 57.856 81.5298V76.3079C57.856 75.3467 58.6469 74.5664 59.6219 74.5664C60.5968 74.5664 61.3877 75.3467 61.3877 76.3079V81.5298C61.3877 82.2398 61.7723 82.8959 62.3952 83.2523C63.0182 83.606 63.7873 83.606 64.4102 83.2523C64.7159 83.0796 64.9701 82.8291 65.1471 82.5265C65.3241 82.2239 65.4175 81.88 65.4177 81.5298V38.589C65.4177 35.5029 67.9554 33 71.0862 33ZM55.7192 33C58.85 33 61.3877 35.5029 61.3877 38.589V69.7011C61.3867 69.931 61.3401 70.1586 61.2508 70.3706C61.1614 70.5826 61.031 70.775 60.867 70.9368C60.703 71.0986 60.5086 71.2265 60.295 71.3132C60.0813 71.4 59.8526 71.444 59.6219 71.4425C59.3912 71.444 59.1625 71.4 58.9488 71.3132C58.7352 71.2265 58.5408 71.0986 58.3768 70.9368C58.2128 70.775 58.0823 70.5826 57.993 70.3706C57.9036 70.1586 57.8571 69.931 57.856 69.7011V38.589C57.8525 38.0273 57.6254 37.4901 57.2247 37.0952C56.824 36.7003 56.2826 36.4801 55.7192 36.483C55.1557 36.4801 54.6143 36.7003 54.2136 37.0952C53.813 37.4901 53.5859 38.0273 53.5823 38.589V76.4241C53.5737 77.8982 52.9784 79.3087 51.9271 80.3456C50.8759 81.3824 49.4548 81.9608 47.976 81.9536C46.4968 81.9615 45.075 81.3834 44.0232 80.3466C42.9713 79.3096 42.3757 77.8987 42.3671 76.4241V52.17C42.3657 51.8998 42.3109 51.6325 42.2058 51.3835C42.1009 51.1344 41.9476 50.9084 41.755 50.7183C41.5623 50.5283 41.334 50.378 41.0831 50.2759C40.8322 50.1738 40.5635 50.1219 40.2925 50.1234C40.0215 50.1219 39.7528 50.1738 39.5019 50.2759C39.251 50.378 39.0227 50.5283 38.83 50.7183C38.6374 50.9084 38.4841 51.1344 38.3792 51.3835C38.2741 51.6325 38.2193 51.8998 38.2179 52.17V62.43C38.214 63.1603 38.0659 63.8829 37.7818 64.5562C37.4979 65.2295 37.0836 65.8405 36.5628 66.3542C36.042 66.868 35.4247 67.2744 34.7463 67.5502C34.0679 67.8262 33.3417 67.9662 32.609 67.9622C31.8763 67.9662 31.15 67.8262 30.4716 67.5502C29.7933 67.2744 29.176 66.868 28.6552 66.3542C28.1343 65.8405 27.7201 65.2295 27.4361 64.5562C27.1521 63.8829 27.0039 63.1603 27 62.43V58.7094C27 57.7455 27.7908 56.9652 28.7658 56.9652C29.7408 56.9652 30.5343 57.7482 30.5343 58.7094V62.43C30.5343 63.5586 31.4633 64.4738 32.609 64.4738C33.7546 64.4738 34.6835 63.5586 34.6835 62.43V52.1673C34.6921 50.6931 35.2874 49.2826 36.3387 48.2458C37.3899 47.2089 38.811 46.6305 40.2898 46.6377C41.769 46.6298 43.1908 47.2078 44.2427 48.2448C45.2945 49.2817 45.8901 50.6926 45.8988 52.1673V76.4241C45.8988 77.5553 46.8277 78.4706 47.976 78.4706C49.1217 78.4706 50.0506 77.5553 50.0506 76.4241V38.589C50.0506 35.5029 52.5883 33 55.7192 33Z",
        clipRule: "evenodd"
    })));
}
/** @returns Brand icon for AI provider `mistral`. */
export function MistralProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-mistrallight__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 28H27V93H92V28Z" })), createElement("g", { mask: `url(#${iconId}-mistrallight__a)` }, createElement("path", { fill: "#FA500F", d: "M82.7104 65.1193H73.4236V74.3788H82.7104V65.1193Z" }), createElement("path", { fill: "#E10500", d: "M92.0008 74.3755H64.1438V83.6354H92.0008V74.3755Z" }), createElement("path", { fill: "#FA500F", d: "M64.1431 65.1193H54.8562V74.3788H64.1431V65.1193ZM45.5683 65.1193H36.2815V74.3788H45.5683V65.1193Z" }), createElement("path", { fill: "#E10500", d: "M54.8544 74.3755H27V83.6354H54.8544V74.3755Z" }), createElement("path", { fill: "#FFAF00", d: "M82.7143 46.6038H64.1438V55.8632H82.7143V46.6038ZM54.8521 46.6038H36.2815V55.8632H54.8521V46.6038Z" }), createElement("path", { fill: "#FF8205", d: "M82.7065 55.8591H36.2815V65.1186H82.7065V55.8591Z" }), createElement("path", { fill: "#FFD800", d: "M82.7104 37.3437H73.4236V46.6032H82.7104V37.3437ZM45.5683 37.3437H36.2815V46.6032H45.5683V37.3437Z" }))));
}
/** @returns Brand icon for AI provider `modelscope`. */
export function ModelscopeProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#624AFF", d: "M28 56.7835H35.4453V64.1737H28V56.7835ZM56.7768 64.1763H64.2222V71.5666H56.7768V64.1763ZM79.1124 71.5666H71.6671V77.9599H85.5536V64.1763H79.1124V71.5666Z" }), createElement("path", { fill: "#36CFD1", d: "M64.2222 56.7835H71.6671V64.1738H64.2222V56.7835ZM28 49.3935H35.4453V56.7835H28V49.3935Z" }), createElement("path", { fill: "#624AFF", d: "M85.5544 56.7835H93.0001V64.1737H85.5544V56.7835Z" }), createElement("path", { fill: "#36CFD1", d: "M85.5544 49.3935H93.0001V56.7835H85.5544V49.3935Z" }), createElement("path", { fill: "#624AFF", d: "M71.6697 43V49.3932H79.1149V56.7833H85.5561V43H71.6697Z" }), createElement("path", { fill: "#36CFD1", d: "M49.334 56.7835H56.7792V64.1737H49.334V56.7835Z" }), createElement("path", { fill: "#624AFF", d: "M41.8877 49.3932H49.333V43H35.4468V56.7833H41.8877V49.3932ZM41.8877 64.1766H35.4468V77.9598H49.333V71.5664H41.8877V64.1766Z" })));
}
/** @returns Brand icon for AI provider `moonshot`. */
export function MoonshotProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-moonshotlight__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 28H27V93H92V28Z" })), createElement("g", { mask: `url(#${iconId}-moonshotlight__a)` }, createElement("path", {
        fill: "#000",
        fillRule: "evenodd",
        d: "M29.8493 73.814L55.6842 80.7257C55.6494 82.5626 55.7036 84.4 55.8467 86.2317L71.9775 90.5461C67.1932 92.5207 62.0063 93.3242 56.8488 92.8888L56.3613 92.8457L56.2421 92.8348L56.0146 92.8105L55.76 92.7831C55.6182 92.7658 55.4764 92.7478 55.3348 92.729L55.045 92.6914L54.7471 92.6476C54.4576 92.6053 54.1687 92.5599 53.8804 92.5098L53.7667 92.4878L53.5635 92.4526L53.2738 92.3986L53.0842 92.3578L52.8323 92.3061L52.6292 92.2631L52.3718 92.209L52.1092 92.1464L51.8546 92.0869L51.6704 92.0414L51.4321 91.9811L51.1883 91.9161L50.931 91.8488L50.7089 91.7865L50.4138 91.7052L50.2458 91.6511L50.0183 91.5834L49.7664 91.5076L49.4821 91.4155L49.325 91.364L49.1083 91.2936L48.8646 91.2096L48.6858 91.1446C48.646 91.1312 48.6063 91.1177 48.5667 91.104L48.3825 91.0363L48.1089 90.9361L47.9546 90.8765L47.7379 90.7952L47.5023 90.7005L47.2639 90.6056L47.05 90.519L46.7927 90.4107L46.6221 90.3348L46.4514 90.2617C46.4144 90.2456 46.3774 90.2294 46.3404 90.213L46.1617 90.1317L45.8827 90.0044L45.7418 89.9394L45.4818 89.8148L45.3139 89.7336L45.0864 89.6252L44.8535 89.5061L44.6017 89.3788L44.4608 89.3057L44.1818 89.1567L44.0275 89.0755L43.8704 88.9888C43.8288 88.9655 43.7872 88.942 43.7458 88.9184L43.4913 88.7748L43.3287 88.6827L43.1906 88.6015L42.9956 88.4905L42.7735 88.3551L42.5217 88.2034L42.3808 88.1167L42.1533 87.9732L41.9881 87.8676L41.7742 87.7321L41.5846 87.6048L41.441 87.5101C41.3922 87.4777 41.3434 87.4452 41.2948 87.4126L41.1756 87.3313L41.0564 87.2501C41.0203 87.2249 40.9842 87.1996 40.9481 87.1742L40.7938 87.0659L40.5879 86.9196L40.401 86.7842L40.2006 86.638L40.0489 86.5242L39.8431 86.3698L39.6373 86.2101L39.4044 86.0286L39.2825 85.9338L39.1092 85.793L38.9087 85.6305L38.6677 85.4327L38.5431 85.3271L38.4185 85.2215C38.3796 85.1883 38.3408 85.1548 38.3021 85.1213L38.1802 85.013L38.015 84.8694L37.8254 84.7015L37.6412 84.539L37.4733 84.3819L37.2918 84.214L37.1483 84.0786L36.91 83.8511C36.8202 83.764 36.7308 83.6764 36.6418 83.5884L36.5633 83.5126L36.4523 83.3988L36.2654 83.2092L36.13 83.0711L35.9946 82.9276C35.8398 82.7688 35.6882 82.6072 35.5396 82.4427L35.3229 82.2044L35.155 82.0148L34.9627 81.7981L34.8489 81.6655L34.7054 81.4976L34.5483 81.3134L34.4237 81.1617C34.3993 81.132 34.3749 81.1022 34.3506 81.0723L34.2287 80.9234L34.05 80.7013L33.9389 80.5605L33.8035 80.3871L33.7494 80.3194C32.1997 78.3108 30.8908 76.1274 29.8493 73.814ZM27.0868 58.1219L57.8346 66.3471C57.3198 68.1401 56.8959 69.9579 56.5644 71.7936L85.8604 79.6315C84.4049 81.6243 82.7287 83.4459 80.8635 85.0617L28.7796 71.1246L28.7362 71.0001L28.6414 70.7184C28.5954 70.5806 28.5502 70.4424 28.506 70.304L28.4871 70.2417C28.2786 69.579 28.0916 68.9097 27.9264 68.2348L27.8452 67.8936L27.7964 67.6769L27.7396 67.4142L27.6908 67.1948L27.6421 66.9511L27.596 66.7236L27.5473 66.469C27.4768 66.0871 27.4118 65.7026 27.355 65.3152L27.3089 64.9957L27.2792 64.7709L27.2439 64.4946C27.2259 64.3494 27.2086 64.2041 27.1925 64.0586L27.1789 63.9313C26.9766 62.0013 26.9458 60.0573 27.0868 58.1219ZM31.4012 44.174L63.7604 52.8298C62.7637 54.4684 61.851 56.1638 61.025 57.908L91.6155 66.0926C91.231 68.3134 90.6189 70.4584 89.8064 72.4977L58.5252 64.129L27.336 55.7873L27.3767 55.5165L27.3983 55.3838L27.4254 55.2023L27.466 54.9667L27.5148 54.7013C27.5852 54.3005 27.6664 53.9023 27.7531 53.5042L27.8289 53.1684L27.8831 52.9382L27.9481 52.6755C28.0077 52.4317 28.07 52.188 28.1377 51.9496L28.2135 51.6734L28.2758 51.4486L28.3571 51.1777L28.4248 50.9556L28.506 50.6956L28.5764 50.4736L28.6604 50.2163C29.3618 48.1126 30.2784 46.0868 31.3958 44.1713L31.4012 44.174ZM43.4317 32.2573L73.9952 40.4311C72.3824 41.895 70.8559 43.4513 69.4235 45.0921L90.6108 50.7606C91.3343 53.0681 91.8081 55.484 92 57.9784L32.7039 42.1184L32.8258 41.9423L32.8989 41.834L33.0073 41.6851L33.1319 41.509L33.2808 41.3031L33.4271 41.1081L33.6004 40.8752L33.7358 40.6992L33.8902 40.5015L34.0392 40.3119L34.2017 40.1115L34.3506 39.9246L34.5267 39.7161L34.6729 39.5373L34.8517 39.3288L34.9952 39.1663L35.1902 38.9442L35.3337 38.7817L35.5152 38.5813L35.6614 38.4242L35.8592 38.213L36.0162 38.0505L36.1868 37.869L36.6418 37.4086L36.9127 37.1431L37.0725 36.9915L37.2783 36.7992C39.1449 35.05 41.2101 33.5256 43.4317 32.2573ZM59.5463 27.9998H59.8089L60.031 28.0026L60.2179 28.0052L60.3642 28.0106L60.5483 28.0161L60.6729 28.0188L60.8788 28.0269L61.006 28.0323L61.1685 28.0405L61.3148 28.0459L61.5504 28.0594L61.8348 28.0784L62.2248 28.1081L62.4631 28.1271L62.5823 28.138L62.7908 28.1596L63.0129 28.1813L63.1402 28.1948L63.4164 28.2273L63.5518 28.2436L63.8444 28.2815L64.0638 28.3086L64.1775 28.3248L64.3535 28.3519L64.9142 28.4386L65.1038 28.4711L65.2798 28.5009L65.6589 28.5713L65.9081 28.6201L66.206 28.6796L66.3306 28.7067L66.5338 28.7501L66.6448 28.7771L66.8127 28.8123L66.9264 28.8394L67.1025 28.8801L67.2352 28.9126L67.4275 28.9586L67.6875 29.0236L67.9908 29.1048L68.2969 29.1861L68.6029 29.2727L68.7383 29.3134L68.9279 29.3676L69.1392 29.4326L69.3368 29.4948L69.4723 29.5381L69.6077 29.5815L69.8135 29.6492L70.0817 29.7386L70.3579 29.8361L70.4879 29.8821L70.6613 29.9444L70.9131 30.0365L71.211 30.1476L71.5252 30.2694L71.796 30.3777L71.9233 30.4319L72.0858 30.4969L72.1968 30.5456L72.3675 30.6161L72.4758 30.6648L72.6302 30.7326L72.9281 30.8626L73.1989 30.9871L73.3993 31.0819L73.6025 31.1794L73.765 31.2552L74.0142 31.3798L74.2606 31.5017L74.5368 31.6426L74.6804 31.7184L74.8131 31.7888L74.9377 31.8538L75.1002 31.9432L75.2113 32.0027L75.3521 32.0813L75.5904 32.2167L75.8775 32.3792L76.1131 32.5173L76.2675 32.6094L76.411 32.6961L76.671 32.8559L76.9094 33.0048L77.1748 33.1727L77.2723 33.2377L77.4456 33.3488L77.6731 33.5005L77.7814 33.5736L77.9494 33.6873L78.1173 33.8038L78.1796 33.8498C78.3258 33.9501 78.4721 34.053 78.6156 34.1586L78.8404 34.3211L79.0164 34.4511L79.1681 34.5676L79.401 34.7436L79.6231 34.9169L79.7314 34.9981L79.8668 35.1092L80.0998 35.2961L80.3138 35.4721L80.5439 35.6644C82.4723 37.2894 84.2083 39.1392 85.7142 41.1651L46.5598 30.6919L46.7277 30.6188L46.9038 30.543L47.1231 30.4509L47.356 30.3561C47.6621 30.2342 47.9708 30.1123 48.2796 30.0013L48.5396 29.9065L48.7914 29.8171L49.0189 29.7359L49.2789 29.6519C49.5146 29.5706 49.7556 29.4948 49.9939 29.4217L50.2404 29.3486L50.4733 29.2809L50.7496 29.1996L50.9798 29.1373L51.2506 29.0669L51.4835 29.0019L51.7273 28.9396L51.9737 28.8801L52.231 28.8205L52.4748 28.7663L52.7402 28.7094L52.9867 28.6552L53.2439 28.6065L53.4931 28.5577L53.7639 28.509L54.0104 28.4656L54.2758 28.4196L54.525 28.3817L54.7877 28.3411L55.0368 28.3059L55.3131 28.2706L55.5596 28.2381L55.8439 28.2056L56.0877 28.1786L56.3721 28.1515C56.6239 28.1244 56.8758 28.1027 57.1304 28.0865L57.4175 28.0648L57.6613 28.0513L57.9592 28.0351L58.211 28.0242L58.4819 28.0134L58.7446 28.008L59.0127 28.0026L59.5463 27.9971V27.9998Z",
        clipRule: "evenodd"
    }))));
}
/** @returns Brand icon for AI provider `nvidia`. */
export function NvidiaProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#76B900", d: "M51.2344 51.124V47.1575C51.6172 47.133 52 47.1085 52.3828 47.1085C63.0047 46.7657 69.9665 56.4618 69.9665 56.4618C69.9665 56.4618 62.4545 67.1374 54.3925 67.1374C53.3158 67.1374 52.2632 66.9661 51.2584 66.6232V54.5765C55.397 55.0908 56.2343 56.9517 58.6984 61.1874L64.2249 56.4374C64.2249 56.4374 60.1819 51.0261 53.3876 51.0261C52.6699 51.0016 51.9521 51.0506 51.2344 51.124ZM51.2344 38V43.9254L52.3828 43.852C67.1434 43.3377 76.7847 56.2415 76.7847 56.2415C76.7847 56.2415 65.732 70.0024 54.225 70.0024C53.2201 70.0024 52.2392 69.9043 51.2584 69.7328V73.4056C52.0718 73.5036 52.9091 73.5769 53.7224 73.5769C64.4403 73.5769 72.1913 67.9698 79.7035 61.359C80.9473 62.3874 86.0431 64.8602 87.0958 65.9376C79.9664 72.0589 63.3397 76.9805 53.9139 76.9805C53.0048 76.9805 52.1436 76.9314 51.2823 76.8335V82H92V38H51.2344ZM51.2344 66.6232V69.7574C41.3302 67.9455 38.579 57.3922 38.579 57.3922C38.579 57.3922 43.3397 52.0055 51.2344 51.124V54.5519H51.2106C47.0718 54.0377 43.8182 58.0044 43.8182 58.0044C43.8182 58.0044 45.6603 64.6889 51.2344 66.6232ZM33.6507 56.9517C33.6507 56.9517 39.512 48.0879 51.2584 47.1575V43.9254C38.2441 45.0028 27 56.2658 27 56.2658C27 56.2658 33.3637 75.1196 51.2344 76.8335V73.4056C38.1244 71.7406 33.6507 56.9517 33.6507 56.9517Z" })));
}
/** @returns Brand icon for AI provider `ocoolai`. */
export function OcoolaiProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-ocoolailight__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 28H27V93H92V28Z" })), createElement("g", { mask: `url(#${iconId}-ocoolailight__a)` }, createElement("path", { fill: "#000", d: "M56.1236 92.9887L57.0865 92.9116L61.8344 92.6682L63.0408 92.9116C63.8377 93.0771 64.7231 92.8337 65.7745 92.5133L66.7374 92.192L68.8292 91.5504L70.0355 91.3841C70.8324 91.307 71.6403 91.1407 72.3597 90.7424L73.7321 90.0229L75.2594 89.06L76.6318 88.4955C77.1963 88.252 77.6722 88.097 78.0817 87.7761L79.8525 86.4148L81.8557 84.8875L82.8186 84.0795C83.217 83.681 83.6265 83.3601 83.9475 82.8732L84.9104 81.4233L85.9507 79.741L87.478 77.4943L88.12 76.2879C88.441 75.8009 88.5959 75.159 88.7619 74.6057L89.0054 73.4767L89.6473 71.872C89.802 71.4735 89.9683 71.1526 90.0454 70.6656L90.3666 68.8948L90.8534 66.648C90.9312 66.1611 91.0083 65.7627 91.0083 65.1982L90.8534 61.6566L90.6878 59.7308C90.61 59.0114 90.4445 58.3584 90.1232 57.639L89.7137 56.7536L88.8283 54.2634L88.2639 52.4151C88.0978 52.0167 87.9429 51.6183 87.6994 51.1313L87.0575 50.0024L86.1721 48.0766L84.7222 45.8299L83.2724 44.0591L81.2581 42.1334L79.2549 40.606L78.5354 39.9641C78.137 39.6431 77.8935 39.5546 77.4951 39.3222L75.2373 38.1933L74.3519 37.7174C74.0309 37.4738 73.6325 37.3079 73.223 37.1529L71.6957 36.5885C71.2972 36.4224 70.8102 36.3449 70.4118 36.2675L69.6925 38.6913L67.1358 39.8423C66.5714 39.4328 64.7009 37.7174 63.1736 37.8059L61.5688 34.9062L56.6659 34.6627L55.548 36.7213L54.6737 38.7245C54.1092 38.7245 53.9986 40.2297 53.4341 40.4732L48.8854 36.7323L46.2181 36.6881C45.4101 36.9315 44.6907 37.2525 43.9714 37.817L43.0859 38.4589L41.7246 39.3443L41.0052 39.9088L39.4779 41.3586L38.2715 41.7681C37.4747 42.0891 36.6667 42.731 35.9362 43.6939L35.6153 44.1809L34.4089 45.5421C34.2429 45.7856 34.0105 45.9406 33.8445 46.2615L32.7156 47.8663L31.5867 49.7921L30.7788 51.1534C30.2918 52.0388 29.9819 53.0017 29.8933 53.9646V54.6065L28.9304 57.0193L28.6095 57.9821C28.4435 58.5466 28.4435 59.0225 28.4435 59.6644V61.3467L27.9897 66.1389V67.5113C27.9897 68.2307 28.1557 68.9612 28.3992 69.6031L28.7976 70.732L29.0412 72.0158C29.1186 72.8238 29.4395 73.6206 29.849 74.3511L30.2475 75.0705L31.3764 77.5607L31.8634 78.8445C32.1069 79.5639 32.5828 80.2059 33.0697 80.7703L33.7892 81.5782L35.239 83.0281L37.1648 84.8764L38.5261 86.0827C39.002 86.5587 39.5664 86.8907 40.1308 87.1231L41.4147 87.6875L43.1081 89.0488L44.3919 89.8458C45.1113 90.3327 46.0742 90.6537 46.9596 90.7311L47.5241 90.8089L49.4498 91.4506C49.8483 91.6055 50.1692 91.694 50.4902 91.7718L52.1724 92.0152L53.3788 92.5798C54.0982 92.9002 55.061 93.0552 56.1125 92.9781L56.1236 92.9887ZM50.6562 61.236L51.94 58.6683L53.2239 57.141L54.5077 55.3701L56.677 54.4848L61.8234 54.1638L63.6716 55.7686L65.9958 57.141L68.0876 61.3245L68.0102 65.984L67.0473 68.3967L65.5199 70.8095L64.1586 72.3368L61.6684 73.3771L57.009 73.4547L55.1607 72.3257L53.0689 70.7984L51.3866 68.3082L51.0657 66.1389L50.6673 61.236H50.6562Z" }), createElement("path", { fill: "#000", d: "M67.5674 34.8397H65.7302V36.677H67.5674V34.8397Z" }), createElement("path", { fill: "#000", d: "M67.5674 34.8397H65.7302V36.677H67.5674V34.8397Z" }), createElement("mask", {
        id: `${iconId}-ocoolailight__b`,
        width: 3,
        height: 3,
        x: 65,
        y: 34,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M67.5674 34.8397H65.7302V36.677H67.5674V34.8397Z" })), createElement("g", { mask: `url(#${iconId}-ocoolailight__b)` }, createElement("path", { fill: "#000", d: "M66.6488 34.8397C67.1579 34.8397 67.5674 35.2492 67.5674 35.7584C67.5674 36.2675 67.1579 36.677 66.6488 36.677C66.1397 36.677 65.7302 36.2675 65.7302 35.7584C65.7302 35.2492 66.1397 34.8397 66.6488 34.8397Z" })), createElement("path", { fill: "#000", d: "M66.5055 37.164H66.5498L66.7601 37.1528H66.8154C66.8486 37.175 66.8818 37.1528 66.9372 37.1528H66.9814C66.9814 37.1418 67.07 37.1086 67.07 37.1086H67.1253C67.1585 37.1086 67.1917 37.0865 67.2249 37.0754L67.2803 37.0422L67.3467 36.9979L67.402 36.9758C67.4242 36.9758 67.4462 36.9536 67.4684 36.9426L67.5459 36.8873L67.6344 36.8208L67.6787 36.7876C67.7008 36.7655 67.7119 36.7545 67.7229 36.7323L67.7672 36.6659L67.8115 36.5884L67.8779 36.4888L67.9 36.4335C67.9111 36.4113 67.9222 36.3892 67.9222 36.356V36.3117L67.9554 36.2453C67.9554 36.2232 67.9665 36.2121 67.9775 36.1899V36.1125C67.9886 36.1125 68.0108 36.0129 68.0108 36.0129C68.0108 35.9908 68.0108 35.9797 68.0108 35.9465V35.7915L67.9996 35.703C67.9996 35.6698 67.9886 35.6476 67.9775 35.6145V35.5813C67.9665 35.5813 67.9222 35.4706 67.9222 35.4706L67.9 35.3931C67.9 35.3709 67.889 35.3599 67.8779 35.3378L67.8557 35.2935L67.8115 35.205L67.7451 35.1053L67.6787 35.0279L67.5901 34.9394L67.5016 34.8729L67.4684 34.8508C67.4573 34.8398 67.4462 34.8286 67.4242 34.8286L67.3245 34.7844L67.2803 34.7623C67.2692 34.7623 67.2471 34.7401 67.236 34.7401L67.1696 34.718C67.1585 34.718 67.1364 34.718 67.1142 34.7069H67.0367L67.0036 34.6737C66.9814 34.6516 66.9261 34.6516 66.8597 34.6516H66.738L66.5277 34.6405H66.4281H66.3948C66.3727 34.6405 66.3395 34.6405 66.3173 34.6516L66.251 34.6737L66.0849 34.718C66.0518 34.718 66.0186 34.7401 65.9853 34.7623L65.9411 34.7955L65.8857 34.8286L65.8525 34.8508L65.7862 34.9172L65.7308 34.9394C65.6976 34.9504 65.6644 34.9836 65.6311 35.0279V35.05C65.6201 35.05 65.5648 35.1053 65.5648 35.1053C65.5648 35.1053 65.5426 35.1275 65.5426 35.1385L65.4984 35.205L65.4541 35.2935L65.4209 35.3489C65.3987 35.382 65.3877 35.4263 65.3766 35.4706V35.4927L65.3324 35.5923V35.6366C65.3102 35.6588 65.3102 35.6809 65.3102 35.7141V35.7915L65.2881 36.0018V36.0571C65.2881 36.0904 65.2881 36.1236 65.3102 36.1457V36.1899C65.3213 36.1899 65.3324 36.2453 65.3324 36.2453C65.3324 36.2785 65.3434 36.3117 65.3656 36.345V36.3781C65.3767 36.3781 65.432 36.4888 65.432 36.4888L65.4541 36.5441C65.4652 36.5774 65.4873 36.5994 65.5095 36.6327L65.5426 36.6659L65.6091 36.7323L65.6976 36.8098L65.7529 36.8651C65.7751 36.8873 65.7972 36.8983 65.8193 36.9094L65.8747 36.9315L65.9411 36.9869L65.9964 37.02C66.0296 37.0422 66.0739 37.0532 66.1071 37.0532H66.1292L66.2177 37.0865C66.2399 37.0865 66.251 37.0865 66.262 37.0975H66.3285L66.3838 37.1307C66.417 37.1418 66.4613 37.1528 66.5055 37.1528V37.164ZM66.262 35.7915L66.3173 35.6809L66.3727 35.6145L66.4281 35.537L66.5277 35.5038H66.749C66.749 35.4927 66.8265 35.5591 66.8265 35.5591L66.9261 35.6145L67.0147 35.8026V36.0018L66.9704 36.1014L66.9039 36.201L66.8486 36.2675L66.738 36.3117H66.5387L66.4613 36.2675L66.3727 36.201L66.2952 36.0904V36.0018C66.2842 36.0018 66.262 35.7915 66.262 35.7915Z" }), createElement("path", { fill: "#000", d: "M65.7291 43.8156L65.9947 43.7934L67.2785 43.7271L67.6105 43.7934C67.8319 43.8377 68.0643 43.7714 68.3521 43.6828L68.6177 43.5943L69.1822 43.4172L69.5031 43.3729C69.7245 43.3507 69.9347 43.3065 70.134 43.1958L70.5103 42.9966L70.9308 42.731L71.296 42.576C71.451 42.5096 71.5838 42.4654 71.6834 42.3768L72.1593 42.0116L72.7016 41.6021L72.9673 41.3807C73.0779 41.2701 73.1886 41.1815 73.2772 41.0598L73.5428 40.6724L73.8195 40.2075L74.24 39.5988L74.4171 39.2779C74.5057 39.1451 74.55 38.968 74.5942 38.8131L74.6606 38.5032L74.8377 38.0715C74.8819 37.9608 74.9262 37.8723 74.9483 37.7395L75.0369 37.2636L75.1697 36.6548C75.1919 36.522 75.2139 36.4114 75.2139 36.2675L75.1697 35.3046L75.1254 34.7844C75.1033 34.5852 75.059 34.4192 74.9705 34.22L74.8598 33.9765L74.6163 33.3014L74.4614 32.8034C74.4171 32.6926 74.3729 32.582 74.3064 32.4492L74.1293 32.1393L73.8859 31.6191L73.4985 31.0104L73.1111 30.5345L72.5688 30.0143L72.0265 29.6048L71.8273 29.4277C71.7166 29.3392 71.6502 29.317 71.5395 29.2507L70.9308 28.9408L70.6873 28.8079C70.5988 28.7415 70.4881 28.6972 70.3774 28.653L69.9679 28.498C69.8573 28.4538 69.7245 28.4317 69.6248 28.4095L69.1489 28.3431L68.9055 28.166C68.7505 28.0553 68.4517 28.0332 68.0311 28.0553L67.2232 28.0332L65.8951 27.9668L65.2421 28.011H65.0207C64.8658 28.011 64.6887 28.0332 64.5448 28.0996L64.0911 28.2546L63.0728 28.5202C62.8515 28.5866 62.6633 28.6751 62.4641 28.83L62.2206 29.0071L61.8443 29.2507L61.6451 29.4056L61.2245 29.7929L60.9036 29.9036C60.6822 29.9922 60.4719 30.1693 60.2727 30.4238L60.1842 30.5566L59.8522 30.9218C59.8079 30.9883 59.7414 31.0325 59.6972 31.1211L59.3873 31.5527L59.0774 32.0729L58.8561 32.4381C58.7233 32.6816 58.6347 32.9362 58.6126 33.2017V33.3788L58.347 34.0319L58.2584 34.2864C58.2142 34.4414 58.2142 34.5742 58.2142 34.7512V35.205L58.0813 36.511V36.8762C58.0813 37.0754 58.1256 37.2636 58.192 37.4407L58.3027 37.7505L58.3691 38.1047C58.3913 38.3261 58.4798 38.5364 58.5904 38.7356L58.7011 38.9347L59.011 39.6099L59.1438 39.9641C59.2103 40.1633 59.3431 40.3293 59.4648 40.4842L59.664 40.7056L60.0514 41.104L60.5716 41.6021L60.9479 41.9341C61.0807 42.0669 61.2356 42.1554 61.3794 42.2108L61.7226 42.3658L62.1764 42.731L62.5194 42.9524C62.7187 43.0851 62.9732 43.1737 63.2167 43.1958L63.3716 43.2179L63.8918 43.395C64.0025 43.4393 64.091 43.4614 64.1796 43.4835L64.6334 43.55L64.9654 43.7049C65.1646 43.7934 65.4191 43.8377 65.7069 43.8156H65.7291ZM64.246 35.2161L64.5891 34.5188L64.9321 34.1093L65.2753 33.6334L65.8619 33.3899L67.2563 33.3014L67.7544 33.733L68.3852 34.0982L68.9498 35.2271L68.9276 36.4889L68.6619 37.1418L68.2414 37.7948L67.8651 38.2154L67.19 38.5032L65.9282 38.5252L65.4302 38.2154L64.8658 37.7948L64.412 37.1197L64.3235 36.5331L64.2128 35.205L64.246 35.2161Z" }), createElement("path", { fill: "#000", d: "M51.4416 43.8156L51.7072 43.7935L52.9911 43.7271L53.3231 43.7935C53.5444 43.8377 53.7769 43.7713 54.0646 43.6828L54.3302 43.5943L54.8947 43.4172L55.2157 43.3729C55.437 43.3507 55.6473 43.3065 55.8465 43.1958L56.2228 42.9966L56.6434 42.731L57.0086 42.576C57.1635 42.5096 57.2963 42.4654 57.396 42.3768L57.8719 42.0116L58.4142 41.6021L58.6798 41.3807C58.7905 41.2701 58.9012 41.1815 58.9897 41.0598L59.2553 40.6724L59.532 40.2075L59.9526 39.5989L60.1297 39.2779C60.2182 39.1451 60.2625 38.968 60.3067 38.8131L60.3732 38.5032L60.5502 38.0715C60.5945 37.9609 60.6388 37.8723 60.6609 37.7395L60.7494 37.2636L60.8822 36.6548C60.9044 36.522 60.9265 36.4114 60.9265 36.2675L60.8822 35.3046L60.838 34.7844C60.8159 34.5853 60.7716 34.4192 60.6831 34.22L60.5723 33.9765L60.3289 33.3014L60.1739 32.8033C60.1297 32.6927 60.0854 32.582 60.019 32.4492L59.8419 32.1393L59.5984 31.6191L59.211 31.0104L58.8237 30.5345L58.2814 30.0143L57.739 29.6048L57.5399 29.4277C57.4291 29.3392 57.3628 29.3171 57.252 29.2506L56.6434 28.9408L56.3999 28.808C56.3114 28.7415 56.2006 28.6972 56.09 28.653L55.6805 28.498C55.5698 28.4538 55.437 28.4316 55.3374 28.4095L54.8615 28.3431L54.618 28.166C54.463 28.0553 54.1642 28.0332 53.7436 28.0553L52.9357 28.0332L51.5855 28L50.9325 28.0443H50.7112C50.5562 28.0443 50.3791 28.0664 50.2352 28.1328L49.7814 28.2877L48.7632 28.5534C48.5419 28.6198 48.3537 28.7083 48.1545 28.8633L47.911 29.0404L47.5347 29.2838L47.3355 29.4388L46.9149 29.8261L46.594 29.9368C46.3726 30.0254 46.1624 30.2024 45.9631 30.457L45.8746 30.5898L45.5426 30.9551C45.4983 31.0214 45.4319 31.0657 45.3876 31.1542L45.0777 31.5859L44.7678 32.1061L44.5465 32.4713C44.4136 32.7148 44.3251 32.9693 44.303 33.235V33.4121L44.0374 34.065L43.9488 34.3196C43.9045 34.4745 43.9045 34.6073 43.9045 34.7844V35.2382L43.7717 36.5442V36.9094C43.7717 37.1086 43.816 37.2968 43.8825 37.4738L43.9931 37.7838L44.0595 38.1379C44.0816 38.3593 44.1702 38.5695 44.2808 38.7688L44.3916 38.968L44.7015 39.6431L44.8343 39.9973C44.9006 40.1965 45.0335 40.3625 45.1552 40.5175L45.3544 40.7388L45.7418 41.1373L46.262 41.6353L46.6382 41.9673C46.7711 42.1001 46.926 42.1887 47.0699 42.244L47.413 42.3989L47.8667 42.7641L48.2099 42.9855C48.4091 43.1183 48.6637 43.2069 48.9071 43.229L49.062 43.2511L49.5823 43.4282C49.6929 43.4725 49.7814 43.4946 49.87 43.5168L50.3238 43.5831L50.6558 43.7381C50.855 43.8267 51.1095 43.871 51.3974 43.8488L51.4416 43.8156ZM49.9585 35.2161L50.3017 34.5188L50.6447 34.1093L50.9879 33.6334L51.5744 33.3899L52.9689 33.3014L53.4669 33.733L54.0978 34.0982L54.6623 35.2272L54.6401 36.4888L54.3745 37.1419L53.954 37.7948L53.5777 38.2154L52.9025 38.5032L51.6408 38.5253L51.1428 38.2154L50.5783 37.7948L50.1246 37.1197L50.036 36.5331L49.9253 35.205L49.9585 35.2161Z" }), createElement("path", { fill: "#000", d: "M53.2674 34.8397H51.4302V36.677H53.2674V34.8397Z" }), createElement("path", { fill: "#000", d: "M53.2674 34.8397H51.4302V36.677H53.2674V34.8397Z" }), createElement("mask", {
        id: `${iconId}-ocoolailight__c`,
        width: 3,
        height: 3,
        x: 51,
        y: 34,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M53.2674 34.8397H51.4302V36.677H53.2674V34.8397Z" })), createElement("g", { mask: `url(#${iconId}-ocoolailight__c)` }, createElement("path", { fill: "#000", d: "M52.3488 34.8397C52.8579 34.8397 53.2674 35.2492 53.2674 35.7584C53.2674 36.2675 52.8579 36.677 52.3488 36.677C51.8397 36.677 51.4302 36.2675 51.4302 35.7584C51.4302 35.2492 51.8397 34.8397 52.3488 34.8397Z" })), createElement("path", { fill: "#000", d: "M52.2057 37.164H52.25L52.4602 37.1528H52.5156C52.5488 37.175 52.582 37.1528 52.6373 37.1528H52.6816C52.6816 37.1418 52.7701 37.1086 52.7701 37.1086H52.8255C52.8587 37.1086 52.8919 37.0865 52.9251 37.0754L52.9805 37.0422L53.0468 36.9979L53.1021 36.9758C53.1243 36.9758 53.1464 36.9536 53.1686 36.9426L53.246 36.8873L53.3346 36.8208L53.3788 36.7876C53.401 36.7655 53.4121 36.7545 53.4231 36.7323L53.4674 36.6659L53.5116 36.5884L53.5781 36.4888L53.6002 36.4335C53.6113 36.4113 53.6224 36.3892 53.6224 36.356V36.3117L53.6555 36.2453C53.6555 36.2232 53.6667 36.2121 53.6777 36.1899V36.1125C53.6887 36.1125 53.7109 36.0129 53.7109 36.0129C53.7109 35.9908 53.7109 35.9797 53.7109 35.9465V35.7915L53.6998 35.703C53.6998 35.6698 53.6887 35.6476 53.6777 35.6145V35.5813C53.6667 35.5813 53.6224 35.4706 53.6224 35.4706L53.6002 35.3931C53.6002 35.3709 53.5892 35.3599 53.5781 35.3378L53.5559 35.2935L53.5116 35.205L53.4453 35.1053L53.3788 35.0279L53.2903 34.9394L53.2018 34.8729L53.1686 34.8508C53.1575 34.8398 53.1464 34.8286 53.1243 34.8286L53.0247 34.7844L52.9805 34.7623C52.9693 34.7623 52.9472 34.7401 52.9362 34.7401L52.8697 34.718C52.8587 34.718 52.8365 34.718 52.8144 34.7069H52.7369L52.7038 34.6737C52.6816 34.6516 52.6263 34.6516 52.5598 34.6516H52.4381L52.2278 34.6405H52.1282H52.095C52.0729 34.6405 52.0397 34.6405 52.0175 34.6516L51.9511 34.6737L51.7851 34.718C51.752 34.718 51.7187 34.7401 51.6855 34.7623L51.6412 34.7955L51.5859 34.8286L51.5527 34.8508L51.4863 34.9172L51.431 34.9394C51.3978 34.9504 51.3646 34.9836 51.3313 35.0279V35.05C51.3203 35.05 51.265 35.1053 51.265 35.1053C51.265 35.1053 51.2428 35.1275 51.2428 35.1385L51.1985 35.205L51.1543 35.2935L51.1211 35.3489C51.0989 35.382 51.0879 35.4263 51.0768 35.4706V35.4927L51.0326 35.5923V35.6366C51.0104 35.6588 51.0104 35.6809 51.0104 35.7141V35.7915L50.9883 36.0018V36.0571C50.9883 36.0904 50.9883 36.1236 51.0104 36.1457V36.1899C51.0215 36.1899 51.0326 36.2453 51.0326 36.2453C51.0326 36.2785 51.0436 36.3117 51.0658 36.345V36.3781C51.0768 36.3781 51.1321 36.4888 51.1321 36.4888L51.1543 36.5441C51.1654 36.5774 51.1875 36.5994 51.2096 36.6327L51.2428 36.6659L51.3092 36.7323L51.3978 36.8098L51.4531 36.8651C51.4753 36.8873 51.4974 36.8983 51.5195 36.9094L51.5749 36.9315L51.6412 36.9869L51.6966 37.02C51.7298 37.0422 51.7741 37.0532 51.8073 37.0532H51.8294L51.9179 37.0865C51.9401 37.0865 51.9511 37.0865 51.9622 37.0975H52.0286L52.084 37.1307C52.1172 37.1418 52.1615 37.1528 52.2057 37.1528V37.164ZM51.9733 35.7915L52.0286 35.6809L52.084 35.6145L52.1393 35.537L52.2389 35.5038H52.4602C52.4602 35.4927 52.5377 35.5591 52.5377 35.5591L52.6373 35.6145L52.7259 35.8026V36.0018L52.6816 36.1014L52.6152 36.201L52.5598 36.2675L52.4492 36.3117H52.25L52.1725 36.2675L52.084 36.201L52.0065 36.0904V36.0018C51.9954 36.0018 51.9733 35.7915 51.9733 35.7915Z" }))));
}
/** @returns Brand icon for AI provider `opencode`. */
export function OpencodeProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "-8 -8 136 136",
        ...props
    }, createElement("g", { clipPath: `url(#${iconId}-opencode__a)` }, createElement("path", {
        fill: "currentColor",
        fillRule: "evenodd",
        d: "M77.2 34.2H42.8V85.8H77.2V34.2ZM94.4 103H25.6V17H94.4V103Z",
        clipRule: "evenodd"
    })), createElement("defs", {}, createElement("clipPath", { id: `${iconId}-opencode__a` }, createElement("path", {
        fill: "#fff",
        d: "M0 0H86V86H0z",
        transform: "translate(17 17)"
    })))));
}
/** @returns Brand icon for AI provider `openrouter`. */
export function OpenrouterProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "-80.28 -134.13 561.96 561.96",
        ...props
    }, createElement("path", { d: "M303.9475,17.19926c42.79734,0,77.48933,34.69327,77.48933,77.48933s-34.69199,77.48933-77.48933,77.48933l76.86166,76.86244c9.76367,9.76313,2.84903,26.45667-10.95697,26.45667h-220.88335c-71.32686,0-129.14889-57.82202-129.14889-129.14889S77.64197,17.19926,148.96884,17.19926h154.97866ZM148.96884,68.85881c-42.79607,0-77.48933,34.69327-77.48933,77.48933s34.69327,77.48933,77.48933,77.48933,77.48933-34.69327,77.48933-77.48933-34.69327-77.48933-77.48933-77.48933Z", style: {
            fill: '#7624f4'
        } })));
}
/** @returns Brand icon for AI provider `perplexity`. */
export function PerplexityProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", {
        fill: "#20808D",
        fillRule: "evenodd",
        d: "M39.6193 28L58.1451 45.0532V45.0493V28.0394H61.7512V45.1295L80.36 28V47.4432H88V75.4882H80.3836V92.8012L61.7512 76.4467V92.9894H58.1451V76.7161L39.6403 93V75.4882H32V47.4432H39.6193V28ZM55.4264 51.0021H35.6062V71.9292H39.6358V65.3281L55.4264 51.0021ZM43.2463 66.9071V85.0584L58.1451 71.9481V53.3873L43.2463 66.9071ZM61.855 71.7746V53.3697L76.7581 66.8906V75.4882H76.7773V84.8731L61.855 71.7746ZM80.3836 71.9292H84.3938V51.0021H64.7214L80.3836 65.1797V71.9292ZM76.7538 47.4432V36.1864L64.5249 47.4432H76.7538ZM55.4543 47.4432H43.2255V36.1864L55.4543 47.4432Z",
        clipRule: "evenodd"
    })));
}
/** @returns Brand icon for AI provider `ph8`. */
export function Ph8ProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#00F0FF", d: "M48.0761 54.726H43.1559V66.3234H45.7733V63.0091H48.0761C51.0255 63.0091 52.7148 61.4519 52.7148 58.7511C52.7148 56.1841 51.0255 54.726 48.0761 54.726ZM47.9423 60.8227H45.7716V56.8967H47.9423C49.4005 56.8967 50.2295 57.5432 50.2295 58.8345C50.2295 60.1606 49.4005 60.8227 47.9423 60.8227ZM62.2573 59.5645H57.0052V54.726H54.3878V66.3234H57.0052V61.7508H62.2573V66.3234H64.8765V54.726H62.2573V59.5645ZM73.7543 60.1096C74.6823 59.6125 75.2455 58.7175 75.2455 57.6903C75.2455 55.7855 73.7039 54.5915 71.2516 54.5915C68.8167 54.5915 67.2751 55.7507 67.2751 57.5913C67.2751 58.6358 67.8887 59.5621 68.8985 60.1096C67.5568 60.624 66.6791 61.7502 66.6791 63.0919C66.6791 65.1462 68.4691 66.4392 71.269 66.4392C74.0688 66.4392 75.8416 65.1306 75.8416 63.0433C75.8434 61.7172 75.0317 60.624 73.7543 60.1096ZM71.2708 56.399C72.4144 56.399 73.0608 56.9134 73.0608 57.8241C73.0608 58.7192 72.4144 59.2319 71.2708 59.2319C70.1116 59.2319 69.465 58.7175 69.465 57.8241C69.4632 56.9117 70.1098 56.399 71.2708 56.399ZM71.2708 64.4684C69.9117 64.4684 69.1504 63.8723 69.1504 62.8121C69.1504 61.785 69.9117 61.2045 71.2551 61.2045C72.6142 61.2045 73.3928 61.8006 73.3928 62.8277C73.391 63.8705 72.6125 64.4684 71.2708 64.4684Z" }), createElement("path", { fill: `url(#${iconId}-ph8light__a)`, d: "M88.2338 28H30.7662C28.6858 28 27 29.6858 27 31.7662V89.2356C27 91.3142 28.6858 93 30.7662 93H88.2356C90.3159 93 92.0017 91.3142 92.0017 89.2338V31.7662C92 29.6858 90.3142 28 88.2338 28ZM84.0001 63.8821C84.1043 63.6196 84.2849 63.3944 84.5186 63.2357C84.7522 63.0771 85.0281 62.9922 85.3106 62.9922C85.6847 62.9925 86.0436 63.1413 86.3081 63.4059C86.5727 63.6705 86.7214 64.0293 86.7218 64.4035C86.7214 64.7777 86.5727 65.1364 86.3081 65.401C86.0436 65.6656 85.6847 65.8144 85.3106 65.8147C85.0281 65.8146 84.7522 65.7298 84.5186 65.5711C84.2849 65.4125 84.1043 65.1873 84.0001 64.9249H79.7473V71.689L86.8313 71.7203C86.9369 71.4585 87.1185 71.2343 87.3527 71.0767C87.5869 70.919 87.8629 70.8351 88.1452 70.8357C88.5195 70.8377 88.8779 70.9881 89.1415 71.254C89.405 71.5198 89.5524 71.8794 89.5512 72.2539C89.5492 72.6282 89.3988 72.9865 89.1329 73.2502C88.867 73.5137 88.5074 73.6611 88.133 73.6599C87.8507 73.6582 87.5753 73.5721 87.3424 73.4126C87.1094 73.2531 86.9297 73.0274 86.8261 72.7648L79.7456 72.7336V78.7191C79.7456 79.8488 78.8297 80.7647 77.7 80.7647H71.7301L71.7614 87.8295C72.0242 87.9328 72.2501 88.1125 72.4096 88.3455C72.5693 88.5785 72.6552 88.8541 72.6564 89.1365C72.6579 89.5109 72.5106 89.8707 72.247 90.1366C71.9833 90.4025 71.6248 90.5529 71.2504 90.5547C70.876 90.5561 70.5162 90.4089 70.2503 90.1452C69.9844 89.8816 69.834 89.5231 69.8322 89.1487C69.8307 88.8662 69.9143 88.5897 70.0721 88.3554C70.2299 88.121 70.4545 87.9396 70.7168 87.8348L70.6856 80.7664H63.9214V85.0036C64.1839 85.1078 64.4091 85.2884 64.5677 85.522C64.7263 85.7557 64.8112 86.0316 64.8112 86.314C64.8109 86.6882 64.6621 87.0469 64.3975 87.3115C64.133 87.5762 63.7742 87.7249 63.4 87.7253C63.0258 87.7249 62.667 87.5762 62.4024 87.3115C62.1379 87.0469 61.989 86.6882 61.9888 86.314C61.9888 86.0316 62.0737 85.7557 62.2323 85.522C62.3909 85.2884 62.6161 85.1078 62.8786 85.0036V80.7664H56.0727L56.104 87.8313C56.3669 87.9345 56.5927 88.1142 56.7523 88.3473C56.9119 88.5803 56.9979 88.8558 56.9991 89.1382C57.0005 89.5127 56.8533 89.8724 56.5896 90.1383C56.326 90.4043 55.9675 90.5546 55.593 90.5564C55.2186 90.5579 54.8588 90.4106 54.5929 90.1469C54.327 89.8833 54.1766 89.5248 54.1749 89.1504C54.1737 88.8679 54.2573 88.5916 54.4151 88.3574C54.5729 88.1231 54.7973 87.9416 55.0595 87.8365L55.0282 80.7682H48.264V85.0054C48.5266 85.1095 48.7517 85.2901 48.9103 85.5238C49.069 85.7574 49.1538 86.0334 49.1539 86.3158C49.1535 86.69 49.0048 87.0487 48.7402 87.3133C48.4756 87.5779 48.1168 87.7267 47.7426 87.727C47.3685 87.7267 47.0097 87.5779 46.7451 87.3133C46.4805 87.0487 46.3317 86.69 46.3314 86.3158C46.3314 86.0334 46.4163 85.7574 46.5749 85.5238C46.7336 85.2901 46.9587 85.1095 47.2213 85.0054V80.7682H41.2948C40.7523 80.7682 40.2319 80.5527 39.8484 80.169C39.4647 79.7854 39.2492 79.2651 39.2492 78.7226V72.737L32.1687 72.7683C32.0655 73.0312 31.8858 73.257 31.6527 73.4166C31.4197 73.5761 31.1442 73.6622 30.8618 73.6634C30.4873 73.6648 30.1276 73.5176 29.8617 73.2539C29.5957 72.9903 29.4453 72.6318 29.4436 72.2573C29.4421 71.8829 29.5894 71.5231 29.853 71.2572C30.1167 70.9912 30.4752 70.8409 30.8496 70.8392C31.1321 70.8376 31.4085 70.9212 31.6429 71.079C31.8772 71.2368 32.0586 71.4614 32.1635 71.7238L39.2475 71.6925V64.9283H34.9947C34.8905 65.1908 34.7098 65.416 34.4762 65.5746C34.2425 65.7333 33.9666 65.8181 33.6842 65.8182C33.31 65.8178 32.9512 65.6691 32.6866 65.4045C32.4221 65.1398 32.2733 64.7811 32.273 64.407C32.2733 64.0328 32.4221 63.674 32.6866 63.4094C32.9512 63.1447 33.31 62.996 33.6842 62.9957C33.9666 62.9957 34.2425 63.0805 34.4762 63.2392C34.7098 63.3979 34.8905 63.623 34.9947 63.8856H39.2475V57.0779L32.167 57.1092C32.0637 57.3721 31.884 57.5979 31.651 57.7575C31.418 57.917 31.1424 58.0031 30.86 58.0043C30.4856 58.0058 30.1258 57.8585 29.8599 57.5948C29.594 57.3312 29.4436 56.9727 29.4418 56.5983C29.4404 56.2238 29.5877 55.8641 29.8513 55.5981C30.115 55.3321 30.4734 55.1818 30.8479 55.1801C31.1304 55.1785 31.4068 55.2621 31.6412 55.4199C31.8754 55.5776 32.0569 55.8024 32.1618 56.0647L39.2457 56.0334V49.2692H34.9929C34.8887 49.5317 34.7081 49.7569 34.4745 49.9155C34.2408 50.0742 33.9649 50.159 33.6825 50.1591C33.3082 50.1588 32.9494 50.0101 32.6847 49.7455C32.4201 49.4809 32.2713 49.122 32.271 48.7479C32.2713 48.3737 32.42 48.0149 32.6846 47.7503C32.9492 47.4857 33.308 47.3369 33.6822 47.3366C33.9646 47.3366 34.2405 47.4214 34.4741 47.5801C34.7078 47.7388 34.8884 47.964 34.9927 48.2265H39.2455V42.3156C39.2455 41.186 40.1614 40.2701 41.291 40.2701H47.2175V36.0016C46.955 35.8974 46.7298 35.7168 46.5712 35.4831C46.4125 35.2495 46.3277 34.9736 46.3277 34.6912C46.3279 34.317 46.4767 33.9582 46.7413 33.6936C47.0059 33.429 47.3647 33.2802 47.7389 33.2799C48.1131 33.2802 48.4718 33.429 48.7364 33.6936C49.001 33.9582 49.1498 34.317 49.1501 34.6912C49.1501 34.9736 49.0652 35.2495 48.9066 35.4831C48.7479 35.7168 48.5227 35.8974 48.2603 36.0016V40.2701H55.0245L55.0558 33.1705C54.7939 33.0648 54.5697 32.8832 54.4121 32.6491C54.2544 32.4149 54.1705 32.1388 54.1711 31.8566C54.1729 31.4821 54.3232 31.1236 54.5891 30.86C54.8551 30.5963 55.2148 30.4491 55.5893 30.4505C55.9638 30.4523 56.3222 30.6026 56.5859 30.8686C56.8495 31.1345 56.9967 31.4942 56.9953 31.8687C56.9937 32.151 56.9076 32.4263 56.748 32.6593C56.5885 32.8923 56.3629 33.0721 56.1003 33.1757L56.069 40.2701H62.8766V36.0016C62.6141 35.8974 62.3889 35.7168 62.2303 35.4831C62.0716 35.2495 61.9868 34.9736 61.9868 34.6912C61.987 34.317 62.1358 33.9582 62.4004 33.6936C62.665 33.429 63.0238 33.2802 63.398 33.2799C63.7722 33.2802 64.1309 33.429 64.3955 33.6936C64.6601 33.9582 64.8089 34.317 64.8092 34.6912C64.8091 34.9736 64.7243 35.2495 64.5657 35.4831C64.407 35.7168 64.1818 35.8974 63.9194 36.0016V40.2701H70.6836L70.7148 33.1705C70.453 33.0648 70.2288 32.8832 70.0712 32.6491C69.9135 32.4149 69.8296 32.1388 69.8302 31.8566C69.832 31.4821 69.9823 31.1236 70.2482 30.86C70.5142 30.5963 70.8739 30.4491 71.2484 30.4505C71.6228 30.4525 71.981 30.603 72.2447 30.8689C72.5083 31.1347 72.6556 31.4943 72.6544 31.8687C72.6528 32.151 72.5667 32.4263 72.4071 32.6593C72.2476 32.8923 72.022 33.0721 71.7594 33.1757L71.7281 40.2701H77.698C78.8277 40.2701 79.7436 41.186 79.7436 42.3156V48.2265H83.9964C84.1006 47.964 84.2812 47.7388 84.5148 47.5801C84.7484 47.4214 85.0244 47.3366 85.3068 47.3366C85.681 47.3369 86.0397 47.4857 86.3043 47.7503C86.5689 48.0149 86.7177 48.3737 86.7181 48.7479C86.7177 49.122 86.5689 49.4808 86.3043 49.7454C86.0397 50.01 85.681 50.1587 85.3068 50.1591C85.0244 50.159 84.7484 50.0742 84.5148 49.9155C84.2812 49.7569 84.1006 49.5317 83.9964 49.2692H79.7471V56.0334L86.831 56.0647C86.9366 55.8029 87.1182 55.5787 87.3524 55.421C87.5865 55.2634 87.8626 55.1795 88.1449 55.1801C88.5193 55.1821 88.8776 55.3325 89.1412 55.5984C89.4048 55.8642 89.5522 56.2238 89.5509 56.5983C89.5491 56.9727 89.3988 57.3312 89.1329 57.5948C88.8669 57.8585 88.5072 58.0058 88.1328 58.0043C87.8504 58.0026 87.575 57.9165 87.3421 57.757C87.1092 57.5975 86.9293 57.3718 86.8258 57.1092L79.7452 57.0779V63.8856H83.9999L84.0001 63.8821Z" }), createElement("defs", {}, createElement("linearGradient", {
        id: `${iconId}-ph8light__a`,
        x1: 59.501,
        x2: 59.501,
        y1: 28,
        y2: 93,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#00F0FF" }), createElement("stop", { offset: 1, stopColor: "#00FF38" })))));
}
/** @returns Brand icon for AI provider `poe`. */
export function PoeProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-poelight__a`,
        width: 65,
        height: 65,
        x: 28,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M93 28H28V93H93V28Z" })), createElement("g", {
        fillRule: "evenodd",
        clipRule: "evenodd",
        mask: `url(#${iconId}-poelight__a)`
    }, createElement("path", { fill: "#000", d: "M84.0843 46.6225C83.7197 46.2567 83.2848 45.9685 82.8058 45.7753C82.3268 45.5821 81.8137 45.488 81.2974 45.4985H81.2811C80.5619 45.4989 79.8497 45.3573 79.1852 45.0821C78.5208 44.8067 77.9172 44.4031 77.409 43.8941C76.9008 43.3851 76.498 42.7809 76.2236 42.1161C75.9494 41.4512 75.8089 40.7388 75.8103 40.0196C75.8185 39.5148 75.7269 39.0132 75.5407 38.5439C75.3545 38.0745 75.0774 37.6466 74.7253 37.2847C74.3733 36.9228 73.9531 36.634 73.489 36.435C73.025 36.236 72.5262 36.1307 72.0213 36.125H41.1923C40.6876 36.1289 40.1886 36.2326 39.7242 36.4303C39.2597 36.6279 38.839 36.9156 38.4863 37.2766C38.1336 37.6377 37.8558 38.0649 37.669 38.5339C37.4822 39.0028 37.3901 39.5041 37.398 40.0088C37.3973 41.4631 36.8192 42.8576 35.7908 43.886C34.7625 44.9144 33.3679 45.4924 31.9136 45.4932V45.4985C31.4018 45.4873 30.893 45.5788 30.4172 45.7676C29.9415 45.9563 29.5083 46.2386 29.1435 46.5976C28.7786 46.9566 28.4895 47.3852 28.2931 47.858C28.0967 48.3306 27.997 48.8379 28.0001 49.3498V59.2135C27.9978 59.7248 28.0979 60.2312 28.2944 60.7031C28.491 61.175 28.78 61.6027 29.1444 61.9611C29.509 62.3196 29.9415 62.6014 30.4166 62.79C30.8917 62.9786 31.3998 63.0702 31.9109 63.0593C33.3631 63.0593 34.756 63.6353 35.7841 64.6609C36.8123 65.6865 37.3917 67.078 37.3953 68.5302V78.5321C37.3952 78.8125 37.4822 79.0861 37.6443 79.315C37.8065 79.5439 38.0356 79.7168 38.3001 79.8098C38.5648 79.9029 38.8517 79.9115 39.1214 79.8345C39.3911 79.7575 39.6302 79.5986 39.8057 79.3798L45.3605 72.4275H72.0186C72.5231 72.4233 73.0218 72.3193 73.4859 72.1215C73.9501 71.9236 74.3705 71.6359 74.7229 71.275C75.0753 70.9139 75.3529 70.4867 75.5395 70.018C75.7261 69.5493 75.8181 69.0482 75.8103 68.5438V68.5383C75.8103 65.505 78.2586 63.054 81.2974 63.054C81.8091 63.0663 82.3181 62.9757 82.7942 62.7878C83.2703 62.5997 83.7037 62.318 84.069 61.9594C84.4342 61.6008 84.7237 61.1724 84.9203 60.6998C85.1169 60.2272 85.2166 59.72 85.2136 59.2082V49.3417C85.2136 48.3585 84.8344 47.3754 84.0843 46.6225ZM77.5301 59.3165C77.5158 60.7616 76.9317 62.1427 75.9047 63.1596C74.8777 64.1764 73.4909 64.7468 72.0457 64.7467H41.1653C39.72 64.7468 38.3333 64.1764 37.3063 63.1596C36.2793 62.1427 35.6952 60.7616 35.6809 59.3165V49.2415C35.6958 47.797 36.2799 46.4167 37.3061 45.4001C38.3323 44.3836 39.7181 43.8126 41.1626 43.8112H72.0376C73.4831 43.8112 74.8701 44.3814 75.8975 45.3982C76.925 46.415 77.5097 47.7961 77.5246 49.2415V59.3165H77.5301Z" }), createElement("path", { fill: "#000", d: "M48.0759 48.5021C47.055 48.5013 46.0755 48.906 45.3528 49.6272C44.6302 50.3483 44.2234 51.3269 44.222 52.3479V56.1991C44.222 57.2205 44.6277 58.2001 45.3499 58.9224C46.0722 59.6446 47.0518 60.0504 48.0732 60.0504C49.0946 60.0504 50.0742 59.6446 50.7965 58.9224C51.5187 58.2001 51.9245 57.2205 51.9245 56.1991V52.3479C51.9245 50.2246 50.202 48.4966 48.0732 48.4966L48.0759 48.5021ZM65.1303 48.5021C64.1093 48.5021 63.1302 48.9074 62.408 49.6291C61.6858 50.3507 61.2798 51.3296 61.279 52.3506V56.2018C61.279 57.2232 61.6848 58.2028 62.4071 58.925C63.1293 59.6473 64.1089 60.0531 65.1303 60.0531C66.1517 60.0531 67.1313 59.6473 67.8535 58.925C68.5758 58.2028 68.9815 57.2232 68.9815 56.2018V52.3479C68.9815 50.2246 67.259 48.4966 65.1303 48.4966V48.5021Z" }), createElement("path", { fill: `url(#${iconId}-poelight__b)`, d: "M47.7493 89.3247L53.147 82.5756H79.8078C80.3122 82.571 80.8108 82.4668 81.2747 82.2688C81.7387 82.0709 82.1589 81.7831 82.5114 81.4222C82.8637 81.0612 83.1413 80.6342 83.328 80.1657C83.5148 79.6971 83.607 79.1962 83.5995 78.6918C83.5981 77.2401 84.1723 75.847 85.1962 74.8179C86.2203 73.7889 87.6105 73.2077 89.0622 73.202H89.0893C89.6009 73.2148 90.1098 73.1244 90.5857 72.9365C91.0614 72.7486 91.4952 72.4668 91.8595 72.108C92.2245 71.7492 92.514 71.3207 92.7098 70.8479C92.9055 70.3752 93.0046 69.8679 93 69.3562V59.6224C93 58.6907 92.6939 57.7807 92.1225 57.0468L91.0477 55.6412V66.8185C91.0493 67.3295 90.9487 67.8359 90.7522 68.3076C90.5556 68.7793 90.2666 69.2069 89.9022 69.5653C89.5378 69.9236 89.1054 70.2055 88.6304 70.3942C88.1555 70.5829 87.6476 70.6748 87.1366 70.6643H87.1177C85.6666 70.67 84.2769 71.2503 83.2527 72.2781C82.2284 73.3059 81.6529 74.6977 81.6522 76.1487C81.6597 76.6538 81.5673 77.1553 81.3803 77.6246C81.1933 78.0938 80.9153 78.5215 80.5625 78.8829C80.2096 79.2443 79.7887 79.5325 79.3241 79.7306C78.8595 79.9289 78.3603 80.0333 77.8552 80.0379H51.197L45.3227 87.3829C45.0918 87.7067 44.9938 88.1067 45.0488 88.5006C45.1039 88.8945 45.3079 89.2523 45.6188 89.5004C45.9297 89.7485 46.3238 89.868 46.7202 89.8343C47.1164 89.8006 47.4847 89.6163 47.7493 89.3193V89.3247Z" }), createElement("path", { fill: `url(#${iconId}-poelight__c)`, d: "M41.5531 82.145L47.2948 74.9679H73.9556C74.4611 74.9637 74.9607 74.8595 75.4256 74.6612C75.8906 74.463 76.3117 74.1746 76.6647 73.8128C77.0177 73.451 77.2956 73.0229 77.4823 72.5532C77.669 72.0835 77.7609 71.5814 77.7527 71.0761C77.7527 68.0536 80.1902 65.6025 83.2073 65.5917H83.2398C83.7512 65.6026 84.2596 65.5108 84.7349 65.3218C85.2102 65.1328 85.6429 64.8505 86.0072 64.4914C86.3716 64.1324 86.6602 63.704 86.8561 63.2314C87.052 62.759 87.1513 62.252 87.1479 61.7404V50.555L88.5562 52.3967C89.125 53.1361 89.4337 54.0407 89.4337 54.9696V64.7034C89.4352 65.2141 89.3347 65.72 89.1381 66.1913C88.9415 66.6627 88.6527 67.0901 88.2886 67.4483C87.9246 67.8066 87.4927 68.0885 87.0182 68.2775C86.5437 68.4666 86.0363 68.5589 85.5256 68.5492H85.4985C84.048 68.5564 82.6592 69.1376 81.6361 70.1659C80.6129 71.1942 80.0385 72.5857 80.0385 74.0362C80.046 74.5412 79.9536 75.0427 79.7666 75.5117C79.5795 75.9809 79.3015 76.4083 78.9486 76.7695C78.5957 77.1308 78.1748 77.4186 77.7102 77.6165C77.2456 77.8144 76.7464 77.9185 76.2415 77.9227H49.586L44.3968 84.4227C44.0956 84.7995 43.6569 85.0411 43.1774 85.0944C42.6979 85.1478 42.2169 85.0085 41.8402 84.7071C41.4634 84.4058 41.2218 83.9671 41.1685 83.4877C41.1152 83.0082 41.2545 82.5272 41.5558 82.1504L41.5531 82.145Z" })), createElement("defs", {}, createElement("linearGradient", {
        id: `${iconId}-poelight__b`,
        x1: 120.11,
        x2: 30.941,
        y1: 47.779,
        y2: 103.061,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#46A6F7" }), createElement("stop", { offset: 1, stopColor: "#8364FF" })), createElement("linearGradient", {
        id: `${iconId}-poelight__c`,
        x1: 41.312,
        x2: 93.921,
        y1: 91.676,
        y2: 53.632,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#FF44D3" }), createElement("stop", { offset: 1, stopColor: "#CF4BFF" })))));
}
/** @returns Brand icon for AI provider `ppio`. */
export function PpioProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-ppiolight__a`,
        width: 65,
        height: 65,
        x: 28,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M93 28H28V93H93V28Z" })), createElement("g", { mask: `url(#${iconId}-ppiolight__a)` }, createElement("mask", {
        id: `${iconId}-ppiolight__b`,
        width: 65,
        height: 65,
        x: 28,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M93 28H28V93H93V28Z" })), createElement("g", { mask: `url(#${iconId}-ppiolight__b)` }, createElement("path", { fill: "#0062E2", d: "M60.2712 28.2341C42.4569 28.2341 28 42.6709 28 60.4851C28 69.2661 31.5185 77.2408 37.2247 83.0577V60.5152C37.2247 54.3655 39.624 48.5585 43.9692 44.2133C48.3346 39.8481 54.1213 37.4688 60.2812 37.4688H60.4729L60.2712 37.489C73.0041 37.489 83.3278 47.8125 83.3278 60.5355C83.3278 61.6445 83.247 62.7333 83.0959 63.812L70.0704 50.7463C67.4693 48.1452 63.9813 46.7035 60.2915 46.7035C56.6013 46.7035 53.1233 48.1452 50.5122 50.7463C47.8909 53.3674 46.4594 56.8356 46.4594 60.5355C46.4594 64.2353 47.901 67.7036 50.5122 70.3247C53.1132 72.9258 56.6013 74.3675 60.2915 74.3675C63.9813 74.3675 67.4593 72.9258 70.0704 70.3247C72.5001 67.8951 73.9014 64.7193 74.0931 61.3217L81.735 68.9938C78.3577 77.543 70.0301 83.6021 60.2812 83.6021C55.2304 83.6021 50.4114 81.989 46.4493 78.9949V89.6612C50.6432 91.6572 55.3211 92.7666 60.2611 92.7666C78.0752 92.7666 92.5325 78.3295 92.5325 60.5152C92.552 42.681 78.1055 28.2442 60.2812 28.2442L60.2712 28.2341Z" })))));
}
/** @returns Brand icon for AI provider `qiniu`. */
export function QiniuProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 120 120",
        ...props
    }, createElement("path", { fill: "#06AEEF", d: "M92 39.1305C91.5741 38.9928 91.1201 38.9635 90.6804 39.0452C90.2405 39.127 89.828 39.3172 89.4811 39.5984C84.4753 45.4737 77.8335 49.7488 70.3898 51.887C62.9465 54.0253 55.0328 53.9313 47.6428 51.6168L45.9842 45.6134C45.7336 44.9117 45.2391 44.3219 44.5897 43.9501C43.9404 43.5783 43.1787 43.4489 42.4419 43.5852L43.2317 49.9198C37.9196 47.5167 36.4658 47.1709 32.7391 42.8006C32.2185 42.4112 28.0911 38.7586 27 39.1305C30.1174 47.373 36.2809 54.1245 44.235 58.0096L46.3937 75.3573C46.3937 75.3573 47.359 82 53.6277 82H67.0422C73.3138 82 74.2791 75.3573 74.2791 75.3573L75.7943 62.9204C71.7196 62.6008 69.1601 65.4107 68.3469 68.1916C66.9867 72.8816 66.9867 73.178 66.7176 73.9974C66.1677 75.6682 64.3599 75.8687 64.3599 75.8687H56.3069C56.3069 75.8687 54.5022 75.6653 53.9493 73.9974C53.5984 72.9193 51.8228 66.6166 50.0443 60.2239C58.4262 62.5706 67.3895 61.7047 75.1593 57.7975C82.9288 53.8904 88.9382 47.2273 91.9969 39.1277L92 39.1305Z" })));
}
const RADEON_CLOUD_LOGO_DATA_URI = [
    'data:image/png;base64,',
    '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',
    'TkSuQmCC'
].join('');
/** @returns Brand icon for AI provider `radeon-cloud`. */
export function RadeonCloudProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 120 120",
        ...props
    }, createElement("rect", {
        width: 120,
        height: 120,
        fill: "#fff",
        rx: 24
    }), createElement("image", {
        href: RADEON_CLOUD_LOGO_DATA_URI,
        x: 14,
        y: 49,
        width: 92,
        height: 22,
        preserveAspectRatio: "xMidYMid meet"
    })));
}
/** @returns Brand icon for AI provider `silicon`. */
export function SiliconProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", {
        fill: "#6E29F6",
        fillRule: "evenodd",
        d: "M90.1725 45H61.9137C60.351 45 59.0863 46.2639 59.0863 47.8194V56.2723C59.0863 57.8305 57.8242 59.0917 56.2615 59.0917H30.8275C29.2648 59.0917 28 60.3528 28 61.9111V73.1833C28 74.7388 29.2648 76 30.8275 76H59.0863C60.649 76 61.9137 74.7388 61.9137 73.1833V64.7305C61.9137 63.1695 63.1758 61.9111 64.7385 61.9111H90.1725C91.7355 61.9111 93 60.6499 93 59.0917V47.8194C93 46.2639 91.7355 45 90.1725 45Z",
        clipRule: "evenodd"
    })));
}
/** @returns Brand icon for AI provider `sophnet`. */
export function SophnetProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#6200EE", d: "M31 35.4783C31 30.7958 34.7465 27 39.3682 27H79.8146C84.4362 27 88.1825 30.7958 88.1825 35.4783C88.1825 40.1608 84.4362 43.9566 79.8146 43.9566H39.3682C34.7465 43.9566 31 40.1608 31 35.4783Z" }), createElement("path", { fill: "#6200EE", d: "M34.4592 29.8092C37.9118 26.6964 43.2012 27.0087 46.2736 30.5066L69.0642 56.4545C72.1367 59.9523 71.8283 65.3115 68.376 68.4242C64.9233 71.5372 59.6339 71.2249 56.5617 67.7268L33.7709 41.779C30.6985 38.281 31.0067 32.922 34.4592 29.8092Z" }), createElement("path", { fill: "#6200EE", d: "M31 62.3274C31 57.6448 34.7465 53.849 39.3682 53.849H63.0781C67.6997 53.849 71.4463 57.6448 71.4463 62.3274C71.4463 67.0096 67.6997 70.8057 63.0781 70.8057H39.3682C34.7465 70.8057 31 67.0096 31 62.3274Z" }), createElement("path", { fill: "#BF7AFF", d: "M47.7364 83.5216C47.7364 88.2038 43.9898 92 39.3682 92C34.7465 92 31 88.2038 31 83.5216C31 78.8391 34.7465 75.0433 39.3682 75.0433C43.9898 75.0433 47.7364 78.8391 47.7364 83.5216Z" })));
}
/** @returns Brand icon for AI provider `stepfun`. */
export function StepfunProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-steplight__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 28H27V93H92V28Z" })), createElement("g", { mask: `url(#${iconId}-steplight__a)` }, createElement("mask", {
        id: `${iconId}-steplight__b`,
        width: 65,
        height: 65,
        x: 27,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 28H27V93H92V28Z" })), createElement("g", { mask: `url(#${iconId}-steplight__b)` }, createElement("path", {
        fill: `url(#${iconId}-steplight__c)`,
        fillRule: "evenodd",
        d: "M86.6158 28H89.4108V30.5107H92V33.1323H89.4108V38.2375H86.6158V33.135H81.5296V30.5079H86.6158V28ZM34.0417 61.5048V33.0646H36.666V61.5075H34.039L34.0417 61.5048ZM62.2706 63.2923H91.9267V65.7785H75.1135V91.7219H62.2706V63.2896V63.2923ZM42.2452 37.0269V70.491H27V82.7057H55.1287V49.6667H83.4931L83.485 37.0242L42.2452 37.0269Z",
        clipRule: "evenodd"
    }))), createElement("defs", {}, createElement("linearGradient", {
        id: `${iconId}-steplight__c`,
        x1: 31.458,
        x2: 76.676,
        y1: 33.189,
        y2: 87.83,
        gradientUnits: "userSpaceOnUse"
    }, createElement("stop", { stopColor: "#01A9FF" }), createElement("stop", { offset: 1, stopColor: "#0160FF" })))));
}
/** @returns Brand icon for AI provider `together`. */
export function TogetherProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#EF2CC1", d: "M90.8203 38.1072C86.3341 30.3592 76.3968 27.7047 68.6264 32.1774C63.6272 35.0552 60.7426 40.1438 60.5156 45.4981L76.7528 45.5187L76.7509 46.907H60.5146C60.6194 49.4375 61.3209 51.9592 62.6787 54.3047C67.1649 62.0527 77.1021 64.7074 84.8735 60.2337C92.6448 55.761 95.3072 45.8552 90.8203 38.1072Z" }), createElement("path", { fill: "#CAAEF5", d: "M30.1792 38.1021C25.693 45.8502 28.3555 55.7568 36.1258 60.2305C41.1251 63.1083 46.9878 63.0542 51.7522 60.5738L43.6523 46.5438L44.8592 45.8512L52.9768 59.8694C55.1223 58.5135 56.9628 56.6473 58.3205 54.3018C62.8067 46.5537 60.1442 36.647 52.374 32.1733C44.6017 27.6996 34.6653 30.3541 30.1792 38.1021Z" }), createElement("path", { fill: "#FC4C02", d: "M60.4962 90.4676C69.4693 90.4676 76.7433 83.2155 76.7433 74.2691C76.7433 68.5135 73.7651 63.4789 69.2286 60.605L61.0913 74.6144L59.8864 73.9189L68.0039 59.9005C65.7539 58.7257 63.212 58.0707 60.4952 58.0707C51.5219 58.0707 44.248 65.3227 44.248 74.2691C44.248 83.2155 51.5229 90.4676 60.4962 90.4676Z" })));
}
/** @returns Brand icon for AI provider `tokenhub`. */
export function TokenhubProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#00A3FF", d: "M90.1811 79.281C88.8544 80.5928 86.2012 82.5604 81.558 82.5604C79.5682 82.5604 77.2466 82.5604 76.2517 82.5604C74.925 82.5604 64.9755 82.5604 53.0362 82.5604C61.659 74.3618 68.9554 67.4745 69.6187 66.8187C70.2821 66.1628 71.9404 64.5229 73.5986 63.2112C76.9151 60.2595 79.5682 59.9314 81.8899 59.9314C85.2064 59.9314 87.8595 61.2435 90.1811 63.2112C94.824 67.4745 94.824 75.0177 90.1811 79.281ZM95.8192 57.9638C92.5027 54.3563 87.528 52.0606 82.2214 52.0606C77.5781 52.0606 73.5986 53.7004 69.9502 56.3239C68.6239 57.6357 66.6337 58.9478 64.9755 60.9154C63.6491 62.2272 35.127 89.7754 35.127 89.7754C36.7852 90.1035 38.7751 90.1035 40.4334 90.1035C42.0916 90.1035 75.2569 90.1035 76.5832 90.1035C79.2367 90.1035 81.2265 90.1035 83.2162 89.7754C87.528 89.4477 91.8394 87.8078 95.4874 84.5284C103.116 77.313 103.116 65.1788 95.8192 57.9638Z" }), createElement("path", { fill: "#00C8DC", d: "M49.3889 55.9962C45.7407 53.3723 42.0926 52.0606 37.7811 52.0606C32.4747 52.0606 27.4999 54.3563 24.1834 57.9638C16.8871 65.5069 16.8871 77.313 24.5151 84.8562C27.8316 87.8078 31.1481 89.4477 35.1279 89.7754L42.7559 82.5604C41.4293 82.5604 39.771 82.5604 38.4444 82.5604C34.133 82.2327 31.4798 80.9209 29.8215 79.281C25.1784 74.6895 25.1784 67.4745 29.4898 62.883C31.8114 60.5873 34.4646 59.6037 37.7811 59.6037C39.771 59.6037 42.7559 59.9314 45.7407 62.883C47.0673 64.1948 50.7155 66.8187 52.0421 68.1304H52.3738L57.3485 63.2112V62.883C55.0269 60.5873 51.3788 57.6357 49.3889 55.9962Z" }), createElement("path", { fill: "#006EFF", d: "M84.2109 47.7951C80.5629 37.9564 70.9449 31.0693 60.0005 31.0693C47.066 31.0693 36.7848 40.58 34.7949 52.3864C35.7899 52.3864 36.7848 52.0585 38.1114 52.0585C39.438 52.0585 41.0963 52.3864 42.4229 52.3864C44.0812 44.1876 51.3775 38.2843 60.0005 38.2843C67.2969 38.2843 73.598 42.5478 76.583 48.7789C76.583 48.7789 76.9145 49.1069 76.9145 48.7789C79.2361 48.451 81.8893 47.7951 84.2109 47.7951C84.2109 48.123 84.2109 48.123 84.2109 47.7951Z" })));
}
/** @returns Brand icon for AI provider `vertexai`. */
export function VertexaiProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-vertexailight__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 28H27V93H92V28Z" })), createElement("g", { mask: `url(#${iconId}-vertexailight__a)` }, createElement("mask", {
        id: `${iconId}-vertexailight__b`,
        width: 65,
        height: 65,
        x: 27,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 28H27V93H92V28Z" })), createElement("g", { mask: `url(#${iconId}-vertexailight__b)` }, createElement("path", { fill: "#4285F4", d: "M59.4861 82.752C58.1268 82.752 56.8233 83.292 55.8618 84.2532C54.9006 85.2144 54.3606 86.5179 54.3606 87.8775C54.3606 89.2368 54.9006 90.5406 55.8618 91.502C56.8233 92.4626 58.1268 93.003 59.4861 93.003C60.8457 93.003 62.1492 92.4626 63.1104 91.502C64.0719 90.5406 64.6116 89.2368 64.6116 87.8775C64.6116 86.5179 64.0719 85.2144 63.1104 84.2532C62.1492 83.292 60.8457 82.752 59.4861 82.752ZM59.4861 90.3516C58.9881 90.3513 58.5014 90.2031 58.0878 89.9258C57.6742 89.6482 57.3525 89.2541 57.1635 88.7932C56.9747 88.3325 56.927 87.8258 57.0267 87.338C57.1266 86.85 57.369 86.4028 57.7238 86.0532C58.0783 85.7035 58.529 85.4671 59.0184 85.3742C59.5078 85.2813 60.0134 85.3363 60.4717 85.5315C60.9297 85.7271 61.3194 86.0542 61.591 86.4719C61.8624 86.8893 62.0038 87.3781 61.9967 87.8761C61.997 88.2042 61.9317 88.5289 61.805 88.8316C61.6785 89.1342 61.493 89.4088 61.2595 89.639C61.0258 89.8692 60.7487 90.051 60.4443 90.1734C60.1399 90.2955 59.8144 90.3562 59.4861 90.3516Z" }), createElement("path", {
        fill: "#669DF6",
        fillRule: "evenodd",
        d: "M85.7362 66.307C86.3781 66.4098 86.9604 66.7403 87.3748 67.2386C87.7444 67.7813 87.8994 68.4424 87.8091 69.093C87.7193 69.7436 87.3905 70.3375 86.8873 70.7595L64.5706 87.2315C64.4574 86.3378 64.1107 85.4895 63.5655 84.7726C63.0201 84.0554 62.2954 83.4951 61.4641 83.1473L83.8891 66.6807C84.4395 66.337 85.0957 66.2043 85.7362 66.307Z",
        clipRule: "evenodd"
    }), createElement("path", {
        fill: "#AECBFA",
        fillRule: "evenodd",
        d: "M54.4134 87.1557L32.1591 70.7269C31.6403 70.3259 31.2938 69.7422 31.1902 69.0946C31.0865 68.4471 31.2335 67.7844 31.6012 67.2413C32.012 66.7362 32.5946 66.4001 33.2375 66.2972C33.8805 66.1943 34.5389 66.3316 35.0868 66.6834L57.5118 83.1501C56.6928 83.4924 55.9767 84.0414 55.4337 84.7436C54.8904 85.4459 54.5388 86.2769 54.4134 87.1557Z",
        clipRule: "evenodd"
    }), createElement("path", { fill: "#AECBFA", d: "M38.572 40.12C37.8816 40.1109 37.2222 39.8326 36.734 39.3445C36.2458 38.8563 35.9675 38.1968 35.9584 37.5065V30.9524C35.9154 30.5813 35.9514 30.2052 36.064 29.8491C36.1766 29.4929 36.3633 29.1646 36.6118 28.8856C36.8603 28.6066 37.1649 28.3834 37.5057 28.2306C37.8466 28.0777 38.216 27.9987 38.5895 27.9987C38.9631 27.9987 39.3325 28.0777 39.6733 28.2306C40.0142 28.3834 40.3189 28.6066 40.5674 28.8856C40.8158 29.1646 41.0025 29.4929 41.1151 29.8491C41.2277 30.2052 41.2637 30.5813 41.2207 30.9524V37.5065C41.2114 38.2029 40.9283 38.8675 40.4326 39.3567C39.9368 39.8459 39.2684 40.1201 38.572 40.12ZM38.5015 63.3007C39.204 63.3007 39.8777 63.0215 40.3744 62.5248C40.8712 62.0281 41.1503 61.3545 41.1503 60.652C41.1503 59.9494 40.8712 59.2756 40.3744 58.7789C39.8777 58.2822 39.204 58.0032 38.5015 58.0032C37.799 58.0032 37.1253 58.2822 36.6286 58.7789C36.1318 59.2756 35.8528 59.9494 35.8528 60.652C35.8528 61.3545 36.1318 62.0281 36.6286 62.5248C37.1253 63.0215 37.799 63.3007 38.5015 63.3007ZM38.5015 55.5982C38.8494 55.5982 39.1938 55.5297 39.5152 55.3964C39.8365 55.2635 40.1285 55.0683 40.3744 54.8224C40.6205 54.5764 40.8155 54.2844 40.9486 53.963C41.0818 53.6417 41.1503 53.2972 41.1503 52.9494C41.1503 52.6016 41.0818 52.2572 40.9486 51.9358C40.8155 51.6144 40.6205 51.3225 40.3744 51.0764C40.1285 50.8305 39.8365 50.6354 39.5152 50.5023C39.1938 50.3692 38.8494 50.3007 38.5015 50.3007C37.799 50.3007 37.1253 50.5797 36.6286 51.0764C36.1318 51.5732 35.8528 52.247 35.8528 52.9494C35.8528 53.6519 36.1318 54.3256 36.6286 54.8224C37.1253 55.319 37.799 55.5982 38.5015 55.5982ZM38.5015 47.8577C39.204 47.8577 39.8777 47.5787 40.3744 47.082C40.8712 46.5852 41.1503 45.9115 41.1503 45.209C41.1503 44.5065 40.8712 43.8328 40.3744 43.3361C39.8777 42.8394 39.204 42.5602 38.5015 42.5602C37.799 42.5602 37.1253 42.8394 36.6286 43.3361C36.1318 43.8328 35.8528 44.5065 35.8528 45.209C35.8528 45.9115 36.1318 46.5852 36.6286 47.082C37.1253 47.5787 37.799 47.8577 38.5015 47.8577Z" }), createElement("path", { fill: "#4285F4", d: "M80.4029 47.7899C79.7061 47.7807 79.0412 47.4972 78.5518 47.0009C78.0626 46.5045 77.7886 45.8354 77.7893 45.1385V38.5843C77.7893 37.8912 78.0648 37.2264 78.555 36.7363C79.0449 36.2461 79.7098 35.9708 80.4029 35.9708C81.0962 35.9708 81.7608 36.2461 82.251 36.7363C82.7413 37.2264 83.0164 37.8912 83.0164 38.5843V45.1385C83.0218 45.485 82.9582 45.8291 82.8293 46.1507C82.7004 46.4724 82.5086 46.7651 82.2654 47.0119C82.0222 47.2587 81.7322 47.4546 81.4123 47.5882C81.0927 47.7217 80.7495 47.7904 80.4029 47.7899ZM80.4706 63.3359C80.8186 63.3359 81.1629 63.2674 81.4843 63.1342C81.8058 63.0011 82.0978 62.8059 82.3437 62.56C82.5896 62.314 82.7846 62.0221 82.9178 61.7006C83.0508 61.3794 83.1193 61.0349 83.1193 60.6871C83.1193 60.3392 83.0508 59.9949 82.9178 59.6734C82.7846 59.3519 82.5896 59.0599 82.3437 58.8141C82.0978 58.5681 81.8058 58.3731 81.4843 58.2399C81.1629 58.1069 80.8186 58.0384 80.4706 58.0384C79.768 58.0384 79.0945 58.3174 78.5978 58.8141C78.1011 59.3108 77.8218 59.9846 77.8218 60.6871C77.8218 61.3894 78.1011 62.0632 78.5978 62.56C79.0945 63.0567 79.768 63.3359 80.4706 63.3359ZM80.4706 55.4926C81.1732 55.4926 81.847 55.2133 82.3437 54.7167C82.8404 54.2199 83.1193 53.5462 83.1193 52.8437C83.1193 52.1412 82.8404 51.4675 82.3437 50.9708C81.847 50.474 81.1732 50.1949 80.4706 50.1949C79.768 50.1949 79.0945 50.474 78.5978 50.9708C78.1011 51.4675 77.8218 52.1412 77.8218 52.8437C77.8218 53.5462 78.1011 54.2199 78.5978 54.7167C79.0945 55.2133 79.768 55.4926 80.4706 55.4926ZM80.4706 33.601C80.8186 33.601 81.1629 33.5325 81.4843 33.3994C81.8058 33.2663 82.0978 33.0711 82.3437 32.8252C82.5896 32.5792 82.7846 32.2872 82.9178 31.9658C83.0508 31.6445 83.1193 31.3001 83.1193 30.9522C83.1193 30.6044 83.0508 30.26 82.9178 29.9386C82.7846 29.6173 82.5896 29.3252 82.3437 29.0793C82.0978 28.8334 81.8058 28.6382 81.4843 28.5051C81.1629 28.372 80.8186 28.3035 80.4706 28.3035C79.768 28.3035 79.0945 28.5826 78.5978 29.0793C78.1011 29.576 77.8218 30.2497 77.8218 30.9522C77.8218 31.6547 78.1011 32.3285 78.5978 32.8252C79.0945 33.3219 79.768 33.601 80.4706 33.601Z" }), createElement("path", { fill: "#669DF6", d: "M59.4864 71.1082C58.796 71.099 58.1366 70.8209 57.6486 70.3326C57.1602 69.8445 56.8821 69.1851 56.8729 68.4947V61.8349C56.9476 61.1896 57.2569 60.5942 57.7423 60.1619C58.2273 59.7297 58.8543 59.4911 59.504 59.4911C60.1538 59.4911 60.7807 59.7297 61.2658 60.1619C61.7509 60.5942 62.0604 61.1896 62.1351 61.8349V68.4243C62.1406 68.7753 62.0759 69.1239 61.9453 69.4497C61.8145 69.7754 61.6201 70.0718 61.3736 70.3218C61.1269 70.5715 60.833 70.7697 60.5091 70.9049C60.1851 71.0397 59.8374 71.1091 59.4864 71.1082ZM59.4864 78.8135C60.189 78.8135 60.8625 78.5345 61.3592 78.0378C61.8563 77.5408 62.1351 76.8672 62.1351 76.1647C62.1351 75.4622 61.8563 74.7886 61.3592 74.2919C60.8625 73.7949 60.189 73.516 59.4864 73.516C58.7839 73.516 58.1101 73.7949 57.6133 74.2919C57.1166 74.7886 56.8376 75.4622 56.8376 76.1647C56.8376 76.8672 57.1166 77.5408 57.6133 78.0378C58.1101 78.5345 58.7839 78.8135 59.4864 78.8135ZM59.4864 56.8163C60.189 56.8163 60.8625 56.5374 61.3592 56.0407C61.8563 55.5437 62.1351 54.8701 62.1351 54.1676C62.1351 53.4651 61.8563 52.7914 61.3592 52.2947C60.8625 51.798 60.189 51.5188 59.4864 51.5188C58.7839 51.5188 58.1101 51.798 57.6133 52.2947C57.1166 52.7914 56.8376 53.4651 56.8376 54.1676C56.8376 54.8701 57.1166 55.5437 57.6133 56.0407C58.1101 56.5374 58.7839 56.8163 59.4864 56.8163ZM59.4864 49.0787C60.189 49.0787 60.8625 48.7996 61.3592 48.3028C61.8563 47.8061 62.1351 47.1324 62.1351 46.4299C62.1351 45.7274 61.8563 45.0537 61.3592 44.557C60.8625 44.0602 60.189 43.7812 59.4864 43.7812C58.7839 43.7812 58.1101 44.0602 57.6133 44.557C57.1166 45.0537 56.8376 45.7274 56.8376 46.4299C56.8376 47.1324 57.1166 47.8061 57.6133 48.3028C58.1101 48.7996 58.7839 49.0787 59.4864 49.0787Z" }), createElement("path", { fill: "#4285F4", d: "M69.9435 55.5627C69.2531 55.5538 68.5937 55.2753 68.1053 54.7872C67.6173 54.2991 67.3389 53.6396 67.33 52.9493V46.3951C67.2631 45.8351 67.3768 45.2684 67.6547 44.7775C67.9328 44.2868 68.3602 43.8977 68.8748 43.667C69.3894 43.4363 69.9643 43.376 70.5158 43.4951C71.0669 43.614 71.5658 43.9062 71.9395 44.3287C72.1877 44.6077 72.374 44.936 72.4867 45.2922C72.599 45.6482 72.635 46.0241 72.5922 46.3951V52.9493C72.5828 53.6457 72.2997 54.3103 71.8041 54.7995C71.3082 55.2887 70.6398 55.563 69.9435 55.5627ZM69.9787 41.3062C70.3265 41.3062 70.671 41.2376 70.9922 41.1045C71.3136 40.9714 71.6056 40.7763 71.8515 40.5303C72.0974 40.2844 72.2927 39.9924 72.4257 39.671C72.5589 39.3497 72.6275 39.0052 72.6275 38.6574C72.6275 38.3096 72.5589 37.9651 72.4257 37.6438C72.2927 37.3224 72.0974 37.0305 71.8515 36.7844C71.6056 36.5385 71.3136 36.3434 70.9922 36.2102C70.671 36.0771 70.3265 36.0087 69.9787 36.0087C69.2762 36.0087 68.6023 36.2877 68.1056 36.7844C67.6089 37.2812 67.33 37.9549 67.33 38.6574C67.33 39.3599 67.6089 40.0336 68.1056 40.5303C68.6023 41.027 69.2762 41.3062 69.9787 41.3062ZM69.9787 70.9352C70.6809 70.9352 71.3548 70.6562 71.8515 70.1596C72.3482 69.6629 72.6275 68.989 72.6275 68.2865C72.6275 67.5842 72.3482 66.9104 71.8515 66.4137C71.3548 65.917 70.6809 65.6377 69.9787 65.6377C69.2762 65.6377 68.6023 65.917 68.1056 66.4137C67.6089 66.9104 67.33 67.5842 67.33 68.2865C67.33 68.989 67.6089 69.6629 68.1056 70.1596C68.6023 70.6562 69.2762 70.9352 69.9787 70.9352ZM69.9787 63.1975C70.6809 63.1975 71.3548 62.9186 71.8515 62.4219C72.3482 61.9252 72.6275 61.2513 72.6275 60.5487C72.6275 59.8462 72.3482 59.1727 71.8515 58.676C71.3548 58.1793 70.6809 57.9 69.9787 57.9C69.2762 57.9 68.6023 58.1793 68.1056 58.676C67.6089 59.1727 67.33 59.8462 67.33 60.5487C67.33 61.2513 67.6089 61.9252 68.1056 62.4219C68.6023 62.9186 69.2762 63.1975 69.9787 63.1975Z" }), createElement("path", { fill: "#AECBFA", d: "M48.9943 70.9355C49.6968 70.9355 50.3705 70.6562 50.8673 70.1595C51.364 69.6628 51.643 68.989 51.643 68.2867C51.643 67.5841 51.364 66.9103 50.8673 66.4136C50.3705 65.9169 49.6968 65.638 48.9943 65.638C48.2918 65.638 47.6181 65.9169 47.1214 66.4136C46.6246 66.9103 46.3455 67.5841 46.3455 68.2867C46.3455 68.989 46.6246 69.6628 47.1214 70.1595C47.6181 70.6562 48.2918 70.9355 48.9943 70.9355ZM48.9943 49.0791C49.6968 49.0791 50.3705 48.8 50.8673 48.3032C51.364 47.8065 51.643 47.1329 51.643 46.4303C51.643 45.7278 51.364 45.0541 50.8673 44.5574C50.3705 44.0606 49.6968 43.7816 48.9943 43.7816C48.2918 43.7816 47.6181 44.0606 47.1214 44.5574C46.6246 45.0541 46.3455 45.7278 46.3455 46.4303C46.3455 47.1329 46.6246 47.8065 47.1214 48.3032C47.6181 48.8 48.2918 49.0791 48.9943 49.0791ZM48.9943 41.3061C49.6972 41.3061 50.3712 41.0269 50.8682 40.53C51.3652 40.033 51.6444 39.3589 51.6444 38.656C51.6444 37.9532 51.3652 37.2792 50.8682 36.7821C50.3712 36.2852 49.6972 36.0059 48.9943 36.0059C48.2914 36.0059 47.6174 36.2852 47.1204 36.7821C46.6234 37.2792 46.3442 37.9532 46.3442 38.656C46.3442 39.3589 46.6234 40.033 47.1204 40.53C47.6174 41.0269 48.2914 41.3061 48.9943 41.3061ZM49.0295 63.1978C48.3445 63.198 47.6859 62.9332 47.192 62.4587C46.6982 61.9839 46.4074 61.3363 46.3807 60.6519V54.0299C46.3807 53.3367 46.6561 52.672 47.1462 52.1818C47.6364 51.6917 48.3011 51.4164 48.9943 51.4164C49.6874 51.4164 50.3522 51.6917 50.8424 52.1818C51.3325 52.672 51.6079 53.3367 51.6079 54.0299V60.6519C51.5897 61.3268 51.3113 61.9687 50.8308 62.4432C50.3502 62.9177 49.7047 63.188 49.0295 63.1978Z" })))));
}
/** @returns Brand icon for AI provider `voyageai`. */
export function VoyageaiProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", { fill: "#012E33", d: "M40.8797 28V28.1787C40.8084 28.3934 40.7649 28.6164 40.7503 28.8423C40.7207 29.1402 40.7072 29.4057 40.7072 29.6412C40.7072 30.5593 40.8231 31.5777 41.0522 32.7017C41.3137 33.7985 41.7908 35.1717 42.4836 36.8292L61.6901 81.1538L80.2469 37.1812C80.6809 36.0871 81.1445 34.89 81.6351 33.5873C82.1258 32.2873 82.3711 30.971 82.3711 29.6385C82.3811 29.1387 82.2932 28.6418 82.1122 28.176V28H91V28.1787C90.4501 28.7393 89.7866 29.7442 89.005 31.1958C88.2233 32.6448 87.3714 34.4323 86.4469 36.5637L61.6038 93H58.1345L34.5934 38.7385C34.0435 37.4656 33.4667 36.2388 32.8575 35.0552C32.2806 33.8717 31.7307 32.8073 31.2131 31.8593C30.6902 30.8843 30.2292 30.0718 29.8249 29.4218C29.5704 28.9925 29.295 28.5758 29 28.1733V28H40.8797Z" })));
}
/** @returns Brand icon for AI provider `xirang`. */
export function XirangProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", {
        fill: "#DF0428",
        fillRule: "evenodd",
        d: "M70.0028 46.1243C75.0922 45.1415 80.2325 47.7457 82.1634 52.3106C88.3933 53.7967 93.0024 59.1164 93 65.453C92.9969 72.9361 86.5621 79.003 78.6152 79C72.6231 78.9977 67.4911 75.5429 65.3363 70.6333C64.673 69.1419 64.2928 67.5103 64.2564 65.8012L60.6188 65.7997C60.3665 65.7997 60.2403 65.5121 60.4185 65.3442L67.821 58.3724C67.9596 58.2421 68.1833 58.2421 68.3216 58.3724L75.725 65.3492C75.9035 65.5173 75.7771 65.8049 75.5248 65.8049L71.6824 65.8035C71.8088 66.6599 72.0913 67.5097 72.5596 68.3126C74.6564 71.9051 79.4962 73.1732 83.2704 71.0744C86.5665 69.2416 87.9602 65.27 86.4566 61.9532C84.8827 58.4818 80.8953 56.8454 77.2874 57.7738C78.0367 55.5105 77.0351 52.9855 74.753 51.7802C72.471 50.5748 69.6633 51.0885 68.0064 52.8721C66.1683 48.7455 61.6059 46.0802 56.6544 46.6305C51.3103 47.2243 47.3344 51.3702 47.0333 56.2635C44.3683 54.9118 41.0004 54.8744 38.1541 56.6054C34.9864 58.5318 33.4897 62.2809 34.5351 65.6948C35.6774 69.4249 39.2047 71.6607 42.9116 71.6628L62.286 71.6698C62.4338 71.6698 62.5658 71.7537 62.6237 71.882C63.5293 73.8799 64.8417 75.6747 66.4646 77.1716C66.6088 77.3043 66.514 77.5314 66.3125 77.5314L42.9216 77.5227L42.9123 77.5229L42.9031 77.5236C34.6725 77.5206 27.9969 71.2234 28 63.4662C28.0031 55.7019 34.6841 49.417 42.9146 49.4201H42.9372C45.715 44.4135 51.283 40.9977 57.6926 41C62.5729 41.0019 66.9598 42.9797 70.0028 46.1243Z",
        clipRule: "evenodd"
    })));
}
/** @returns Brand icon for AI provider `zai`. */
export function ZaiProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("path", {
        fill: "#000",
        fillRule: "evenodd",
        d: "M60.7843 33L54.8857 40.9731H29.7685L35.6646 33H60.7871H60.7843ZM90.9797 79.0296L85.0863 87H60.0558L65.9437 79.0296H90.9797ZM93 33L53.09 87H28L67.91 33H93Z",
        clipRule: "evenodd"
    })));
}
/** @returns Brand icon for AI provider `zhipu`. */
export function ZhipuProviderIcon(props: IconProps) {
    const iconId = useId();
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "18 18 84 84",
        ...props
    }, createElement("mask", {
        id: `${iconId}-zhipulight__a`,
        width: 65,
        height: 65,
        x: 27,
        y: 28,
        maskUnits: "userSpaceOnUse",
        style: {
            maskType: 'luminance'
        }
    }, createElement("path", { fill: "#fff", d: "M92 28H27V93H92V28Z" })), createElement("g", { mask: `url(#${iconId}-zhipulight__a)` }, createElement("path", { fill: "#3859FF", d: "M59.4747 91.6539C59.3866 91.6523 59.2991 91.669 59.2175 91.7022C59.1359 91.7355 59.062 91.7854 59.0002 91.8481C58.9383 91.9108 58.89 91.9857 58.858 92.0673C58.8259 92.1497 58.8109 92.2373 58.8138 92.3258C58.8105 92.4142 58.8253 92.5019 58.8572 92.5843C58.889 92.6666 58.9373 92.7422 58.9992 92.805C59.061 92.8685 59.1351 92.9176 59.2168 92.9516C59.2986 92.9848 59.3864 93.0015 59.4747 93C59.5633 93.0022 59.6514 92.9856 59.7334 92.9523C59.8155 92.9191 59.8899 92.8692 59.952 92.8057C60.0142 92.743 60.0628 92.6674 60.0948 92.585C60.1268 92.5026 60.1416 92.4142 60.1383 92.3258C60.1437 92.1587 60.0849 91.9962 59.974 91.8723C59.8631 91.7476 59.7086 91.6705 59.5425 91.6569L59.4747 91.6539ZM53.1913 42.5302C54.3514 42.9017 55.3165 43.7186 55.8746 44.8013C56.4327 45.884 56.5382 47.1439 56.1678 48.3043L55.9755 48.7702L55.9322 48.8785L55.8835 49.0247C55.6938 49.4581 55.6018 49.8914 55.6018 50.3735C55.507 52.2964 56.8747 53.8375 58.8138 53.9322H59.8051C63.3503 54.0758 66.1372 57.1092 65.9963 60.7654C65.8555 64.3729 62.8763 67.2112 59.2851 67.0677H58.8138C56.8775 67.1164 55.3635 68.801 55.4583 70.7727C55.4583 71.1085 55.507 71.3956 55.6018 71.6854C56.1678 72.6956 57.0643 73.4675 58.2018 73.852C60.233 74.475 62.3103 73.5135 63.3476 71.7342L63.3963 71.6394C64.4851 69.906 66.5651 69.0393 68.5963 69.7137C70.9093 70.4829 72.3285 73.0342 71.5728 75.5827C71.4 76.1483 71.1172 76.6743 70.7408 77.1305C70.3643 77.5868 69.9017 77.9643 69.3792 78.2416C68.8567 78.5188 68.2847 78.6902 67.6959 78.7461C67.107 78.802 66.5129 78.7412 65.9476 78.5672C64.9308 78.2288 64.0627 77.5483 63.4912 76.6417L63.4451 76.5468C62.9035 75.672 62.1912 74.976 61.1403 74.6212L60.9887 74.5725C60.0091 74.2438 58.9457 74.2655 57.9805 74.6341C57.0152 75.0026 56.2079 75.695 55.6966 76.5929C55.3814 77.1155 54.9631 77.5684 54.4672 77.9242C53.9713 78.28 53.4083 78.531 52.8122 78.662C51.6388 78.9134 50.4137 78.6902 49.4043 78.0411C48.395 77.3921 47.6835 76.37 47.4253 75.1981C46.8593 72.7443 48.3245 70.2418 50.8297 69.665C51.0931 69.607 51.3617 69.5753 51.6313 69.5702H51.6801C53.5218 69.3779 54.7975 67.8856 54.7026 65.96C54.6799 65.2887 54.4667 64.6377 54.0878 64.0831C53.3916 62.9412 53.0468 61.6197 53.0966 60.2833C53.1279 59.1236 53.4702 57.9937 54.0878 57.0117C54.467 56.4835 54.6566 55.8092 54.7026 55.1347C54.7513 53.2118 53.3322 51.7195 51.4905 51.5272L51.301 51.4785C51.025 51.4446 50.7535 51.381 50.4912 51.2889L50.3558 51.2375C49.2341 50.8355 48.312 50.0143 47.7832 48.9467C47.2544 47.8789 47.1601 46.6479 47.5201 45.512C47.8811 44.3676 48.6797 43.4121 49.7419 42.8536C50.8041 42.2951 52.0439 42.1789 53.1913 42.5302ZM38.0925 69.9114C38.7966 69.1964 39.823 68.9175 40.7845 69.1802C41.746 69.4402 42.4988 70.2067 42.7562 71.1843C43.0135 72.1647 42.7372 73.2102 42.033 73.9279C40.9443 75.0383 39.1812 75.0383 38.0925 73.9279C37.5693 73.3908 37.2766 72.6708 37.2766 71.921C37.2766 71.1713 37.5693 70.4485 38.0925 69.9114ZM78.2976 69.1152C79.2699 68.8714 80.2964 69.1802 80.9843 69.9195C81.6722 70.6617 81.916 71.7206 81.6262 72.6956C81.3363 73.6706 80.5537 74.4127 79.5787 74.6402C78.0863 74.9869 76.5995 74.0443 76.2475 72.525C76.0746 71.801 76.1925 71.0381 76.5758 70.4001C76.9591 69.7621 77.5773 69.3026 78.2976 69.1152ZM78.1243 57.2256C78.9747 58.0922 79.4514 59.265 79.4514 60.4918C79.4514 61.716 78.9747 62.8914 78.1243 63.7581C77.2712 64.6247 76.1201 65.1122 74.915 65.1122C73.7125 65.1122 72.5587 64.6247 71.7083 63.7581C70.8559 62.8845 70.3789 61.7123 70.3789 60.4918C70.3789 59.2713 70.8559 58.0992 71.7083 57.2256C72.1256 56.7974 72.6245 56.457 73.1754 56.2246C73.7264 55.9923 74.3183 55.8726 74.9163 55.8726C75.5142 55.8726 76.1062 55.9923 76.6571 56.2246C77.2081 56.457 77.7069 56.7974 78.1243 57.2256ZM47.6745 57.667C48.6603 58.9779 48.8851 60.722 48.265 62.2468C48.0442 62.8033 47.7148 63.3103 47.2961 63.7382C46.8774 64.166 46.3776 64.5062 45.826 64.7389C45.2744 64.9716 44.682 65.0921 44.0833 65.0934C43.4847 65.0948 42.8917 64.9769 42.3391 64.7467C40.0235 63.7717 38.9266 61.0687 39.8826 58.7125C40.1818 57.9678 40.6726 57.3156 41.3052 56.8219C41.9378 56.3282 42.6898 56.0105 43.4847 55.9012C45.0908 55.6845 46.6887 56.3589 47.6745 57.667ZM78.9422 46.2352C79.9389 46.2352 80.8597 46.7768 81.358 47.6543C81.8563 48.5318 81.8563 49.6152 81.358 50.4927C81.1172 50.922 80.7665 51.2796 80.3421 51.5291C79.9176 51.7784 79.4345 51.9105 78.9422 51.9118C77.4039 51.9118 76.1527 50.6389 76.1527 49.0735C76.1527 47.5054 77.4039 46.2352 78.9422 46.2352ZM40.056 46.2352C41.0526 46.2352 41.9708 46.7768 42.4691 47.6543C42.9675 48.5318 42.9675 49.6152 42.4691 50.4927C42.2284 50.9216 41.8782 51.279 41.4543 51.5284C41.0304 51.7776 40.5478 51.91 40.056 51.9118C38.515 51.9118 37.2663 50.6389 37.2663 49.0735C37.2663 47.5054 38.515 46.2352 40.056 46.2352ZM67.2233 42.2404C69.7285 42.2404 71.7597 44.3095 71.7597 46.8608C71.7597 49.412 69.7285 51.4785 67.2233 51.4785C64.718 51.4785 62.6895 49.412 62.6895 46.8608C62.6895 44.3095 64.7208 42.2404 67.2233 42.2404ZM60.1112 40.3879C61.0916 40.1658 61.8797 39.4237 62.1722 38.4433C62.3167 37.9633 62.3332 37.4538 62.2201 36.9655C62.1071 36.4771 61.8684 36.0268 61.5276 35.6592C61.191 35.2963 60.7629 35.0309 60.2881 34.8907C59.8135 34.7506 59.3098 34.741 58.8301 34.8629C57.3487 35.242 56.4441 36.7587 56.7935 38.2672C57.1455 39.7785 58.6216 40.7237 60.1112 40.3879ZM60.1112 86.0937C61.0835 85.8581 61.8553 85.1187 62.1425 84.1437C62.2827 83.6674 62.2974 83.1629 62.1849 82.6793C62.0724 82.1957 61.8366 81.7494 61.5005 81.3839C61.1685 81.0231 60.7463 80.7574 60.2774 80.6141C59.8085 80.4708 59.3098 80.4551 58.8328 80.5687C58.3476 80.6804 57.9007 80.919 57.5381 81.2603C57.1755 81.6015 56.91 82.033 56.7691 82.5105C56.4766 83.4883 56.723 84.5527 57.4163 85.2947C58.08 86.007 59.0576 86.3158 59.9975 86.1208L60.1138 86.0937H60.1112ZM73.5553 37.4792C73.7812 37.4781 74.0045 37.4323 74.2125 37.3444C74.4205 37.2565 74.6091 37.1283 74.7672 36.9671C74.9253 36.806 75.05 36.615 75.1339 36.4054C75.2179 36.1958 75.2594 35.9716 75.2562 35.7458C75.2562 34.7843 74.5005 34.0125 73.5553 34.0125C73.3296 34.0135 73.1062 34.0593 72.8981 34.1472C72.6901 34.2351 72.5016 34.3633 72.3435 34.5245C72.1853 34.6857 72.0607 34.8766 71.9768 35.0862C71.8928 35.2958 71.8513 35.52 71.8545 35.7458C71.8545 36.7072 72.6128 37.4792 73.5553 37.4792ZM45.4428 37.4792C45.6687 37.4781 45.892 37.4323 46.1 37.3444C46.308 37.2565 46.4965 37.1283 46.6547 36.9671C46.8128 36.806 46.9375 36.615 47.0214 36.4054C47.1053 36.1958 47.1469 35.9716 47.1437 35.7458C47.1437 34.7843 46.3853 34.0125 45.4428 34.0125C45.2171 34.0135 44.9937 34.0593 44.7856 34.1472C44.5776 34.2351 44.3891 34.3633 44.231 34.5245C44.0728 34.6857 43.9482 34.8766 43.8643 35.0862C43.7803 35.2958 43.7388 35.52 43.742 35.7458C43.742 36.7072 44.4976 37.4792 45.4428 37.4792ZM31.4083 58.745C31.1824 58.746 30.9591 58.7918 30.7511 58.8797C30.5431 58.9676 30.3546 59.0958 30.1964 59.257C30.0383 59.4182 29.9136 59.6091 29.8297 59.8187C29.7458 60.0283 29.7042 60.2525 29.7075 60.4783C29.7075 61.437 30.4658 62.2089 31.4083 62.2089C31.8484 62.2071 32.2707 62.0354 32.5872 61.7295C32.9036 61.4237 33.0896 61.0074 33.1063 60.5677L33.1091 60.4756C33.1164 60.2487 33.0777 60.0227 32.9952 59.8113C32.9128 59.5998 32.7883 59.4072 32.6294 59.2452C32.4703 59.0832 32.2802 58.9551 32.0704 58.8686C31.8605 58.7822 31.6352 58.7392 31.4083 58.7422V58.745ZM45.4428 83.472C45.2171 83.4731 44.9937 83.5189 44.7856 83.6068C44.5776 83.6947 44.3891 83.8229 44.231 83.9841C44.0728 84.1452 43.9482 84.3361 43.8643 84.5458C43.7803 84.7554 43.7388 84.9796 43.742 85.2054C43.742 86.1669 44.4976 86.9387 45.4428 86.9387C45.6687 86.9377 45.892 86.8919 46.1 86.804C46.308 86.7161 46.4965 86.5879 46.6547 86.4267C46.8128 86.2655 46.9375 86.0746 47.0214 85.865C47.1053 85.6553 47.1469 85.4312 47.1437 85.2054C47.1437 84.2439 46.3853 83.472 45.4428 83.472ZM73.5553 83.5208C73.3296 83.5218 73.1062 83.5676 72.8981 83.6555C72.6901 83.7434 72.5016 83.8716 72.3435 84.0328C72.1853 84.194 72.0607 84.3849 71.9768 84.5946C71.8928 84.8041 71.8513 85.0283 71.8545 85.2542C71.8545 86.2156 72.6128 86.9875 73.5553 86.9875C73.7812 86.9864 74.0045 86.9406 74.2125 86.8527C74.4205 86.7649 74.6091 86.6366 74.7672 86.4755C74.9253 86.3143 75.05 86.1233 75.1339 85.9138C75.2179 85.7041 75.2594 85.4799 75.2562 85.2542C75.2562 84.2927 74.5005 83.5208 73.5553 83.5208ZM87.5899 58.745C87.3641 58.746 87.1408 58.7918 86.9328 58.8797C86.7248 58.9676 86.5362 59.0958 86.3781 59.257C86.22 59.4182 86.0953 59.6091 86.0114 59.8187C85.9274 60.0283 85.8859 60.2525 85.8891 60.4783C85.8891 61.437 86.6447 62.2089 87.5899 62.2089C87.8157 62.2079 88.0391 62.1621 88.2471 62.0742C88.4551 61.9864 88.6436 61.8581 88.8017 61.6969C88.9599 61.5357 89.0846 61.3448 89.1685 61.1352C89.2524 60.9256 89.294 60.7014 89.2908 60.4756C89.2908 59.5142 88.5324 58.7422 87.5899 58.7422V58.745ZM86.5499 45.225C86.6383 45.2265 86.7261 45.21 86.8078 45.1764C86.8895 45.143 86.9636 45.0931 87.0255 45.03C87.0873 44.9669 87.1356 44.8918 87.1675 44.8094C87.1993 44.727 87.2141 44.6389 87.2108 44.5506C87.2141 44.4623 87.1993 44.3742 87.1675 44.2918C87.1356 44.2094 87.0873 44.1343 87.0255 44.0712C86.9636 44.008 86.8895 43.9582 86.8078 43.9247C86.7261 43.8912 86.6383 43.8747 86.5499 43.8762C86.4616 43.8747 86.3738 43.8912 86.2921 43.9247C86.2103 43.9582 86.1362 44.008 86.0744 44.0712C86.0125 44.1343 85.9642 44.2094 85.9324 44.2918C85.9005 44.3742 85.8857 44.4623 85.8891 44.5506C85.8891 44.9352 86.2195 45.225 86.5499 45.225ZM59.4747 29.346C59.5631 29.3479 59.6508 29.3318 59.7328 29.2985C59.8147 29.2654 59.8889 29.2158 59.951 29.153C60.0131 29.0901 60.0618 29.0153 60.094 28.9329C60.1262 28.8506 60.1412 28.7627 60.1383 28.6743C60.1416 28.5856 60.1268 28.4971 60.0946 28.4142C60.0624 28.3315 60.0136 28.2561 59.9511 28.1929C59.8887 28.1297 59.8139 28.08 59.7316 28.0468C59.6492 28.0136 59.5608 27.9977 59.472 28C59.3837 27.9985 59.2959 28.0149 59.2141 28.0484C59.1323 28.082 59.0583 28.1318 58.9965 28.195C58.9346 28.2581 58.8863 28.3331 58.8544 28.4155C58.8225 28.498 58.8079 28.586 58.8112 28.6743C58.8112 29.0345 59.1037 29.3135 59.4151 29.3433L59.472 29.346H59.4747ZM32.4455 45.225C32.5341 45.2269 32.6222 45.2107 32.7043 45.1773C32.7863 45.1439 32.8607 45.0941 32.9229 45.031C32.985 44.9678 33.0336 44.8926 33.0656 44.81C33.0977 44.7274 33.1125 44.6391 33.1091 44.5506C33.1124 44.4623 33.0977 44.3742 33.0658 44.2918C33.034 44.2094 32.9856 44.1343 32.9238 44.0712C32.862 44.008 32.7879 43.9582 32.7061 43.9247C32.6244 43.8912 32.5366 43.8747 32.4483 43.8762C32.3599 43.8747 32.2722 43.8912 32.1904 43.9247C32.1086 43.9582 32.0345 44.008 31.9727 44.0712C31.9109 44.1343 31.8625 44.2094 31.8307 44.2918C31.7988 44.3742 31.7841 44.4623 31.7875 44.5506C31.7841 44.6389 31.7988 44.727 31.8307 44.8094C31.8625 44.8918 31.9109 44.9669 31.9727 45.03C32.0345 45.0931 32.1086 45.143 32.1904 45.1764C32.2722 45.21 32.3599 45.2265 32.4483 45.225H32.4455ZM32.4455 75.7289C32.3576 75.7278 32.2704 75.7445 32.1892 75.778C32.1079 75.8115 32.0343 75.8612 31.9728 75.9239C31.9113 75.9867 31.8631 76.0613 31.8313 76.1433C31.7994 76.2252 31.7845 76.3127 31.7875 76.4006C31.7841 76.4889 31.7988 76.577 31.8307 76.6594C31.8625 76.7418 31.9109 76.8169 31.9727 76.88C32.0345 76.9431 32.1086 76.993 32.1904 77.0265C32.2722 77.06 32.3599 77.0765 32.4483 77.075C32.5366 77.0765 32.6244 77.06 32.7061 77.0265C32.7879 76.993 32.862 76.9431 32.9238 76.88C32.9856 76.8169 33.034 76.7418 33.0658 76.6594C33.0977 76.577 33.1124 76.4889 33.1091 76.4006C33.1064 76.2251 33.0362 76.0575 32.9132 75.9324C32.7901 75.8073 32.6236 75.7345 32.4483 75.7289H32.4455ZM86.5987 75.6802C86.5103 75.6783 86.4225 75.6944 86.3407 75.7277C86.2587 75.7608 86.1844 75.8103 86.1224 75.8732C86.0603 75.9361 86.0117 76.0109 85.9795 76.0932C85.9473 76.1755 85.9321 76.2635 85.9351 76.3519C85.9314 76.4406 85.9459 76.5292 85.9778 76.6121C86.0096 76.6951 86.0581 76.7706 86.1203 76.834C86.1825 76.8975 86.257 76.9475 86.3393 76.981C86.4216 77.0146 86.5099 77.0308 86.5987 77.0289C86.6873 77.0304 86.7753 77.0139 86.8572 76.9802C86.9391 76.9466 87.0133 76.8964 87.0752 76.833C87.1371 76.7696 87.1854 76.6942 87.2171 76.6115C87.2488 76.5287 87.2632 76.4404 87.2595 76.3519C87.2568 76.1764 87.1866 76.0087 87.0636 75.8837C86.9406 75.7586 86.774 75.6857 86.5987 75.6802Z" }))));
}
/**
 * Ollama local runtime mark (simplified llama silhouette).
 * @param props - SVG props.
 * @returns Icon element.
 */
export function OllamaProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        "aria-hidden": true,
        ...props
    }, createElement("path", {
        fill: "currentColor",
        d: "M7.5 4.5c.6 0 1.1.2 1.5.6.5-.5 1.1-.8 1.8-.9.7-.1 1.4.1 2 .5.5-.3 1.1-.5 1.7-.5.9 0 1.7.4 2.2 1.1.6.8.8 1.9.6 3.1 1.1.9 1.8 2.2 1.8 3.7 0 1.1-.4 2.1-1 2.9.3.7.4 1.5.3 2.3-.2 1.3-.9 2.5-1.9 3.3-.4.3-.9.2-1.2-.2-.3-.4-.2-.9.2-1.2.7-.5 1.1-1.3 1.2-2.1.1-.6 0-1.2-.3-1.7-.4.1-.8.2-1.2.2H10.8c-.5 0-.9-.1-1.3-.2-.2.5-.3 1.1-.2 1.7.1.8.5 1.6 1.2 2.1.4.3.5.8.2 1.2-.3.4-.8.5-1.2.2-1-.8-1.7-2-1.9-3.3-.1-.8 0-1.6.3-2.3-.6-.8-1-1.8-1-2.9 0-1.5.7-2.8 1.8-3.7-.2-1.2 0-2.3.6-3.1.5-.7 1.3-1.1 2.2-1.1Zm0 2c-.3 0-.6.2-.7.5-.2.4-.2 1 0 1.8l.3 1.1-.9.6c-.7.5-1.1 1.3-1.1 2.1 0 .9.5 1.7 1.3 2.1l.9.4v.4c0 .6.1 1.1.3 1.6.3-.4.8-.7 1.4-.8V10.8c0-.6.4-1 1-1h3.8c.6 0 1 .4 1 1v1.6c.6.1 1.1.4 1.4.8.2-.5.3-1 .3-1.6v-.4l.9-.4c.8-.4 1.3-1.2 1.3-2.1 0-.8-.4-1.6-1.1-2.1l-.9-.6.3-1.1c.2-.8.2-1.4 0-1.8-.2-.3-.5-.5-.8-.5-.4 0-.8.3-1 .8l-.3.8-.8-.2c-.5-.1-1 0-1.4.3l-.6.5-.6-.5c-.4-.3-.9-.4-1.4-.3l-.8.2-.3-.8c-.2-.5-.6-.8-1-.8Z"
    })));
}
/**
 * LM Studio local runtime mark.
 * @param props - SVG props.
 * @returns Icon element.
 */
export function LmstudioProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        "aria-hidden": true,
        ...props
    }, createElement("rect", {
        x: "3",
        y: "3",
        width: "18",
        height: "18",
        rx: "4",
        fill: "#6B57FF"
    }), createElement("path", {
        fill: "#fff",
        d: "M7 8h2.2v8H7V8Zm3.4 0H13c1.8 0 2.9 1.1 2.9 2.7 0 1.1-.5 1.9-1.4 2.3L16.2 16h-2.4l-1.5-2.7h-.7V16h-2.2V8Zm2.2 1.8v2.1h.7c.7 0 1.1-.4 1.1-1.1 0-.6-.4-1-1.1-1h-.7Z"
    })));
}
/**
 * llama.cpp / llama-server mark.
 * @param props - SVG props.
 * @returns Icon element.
 */
export function LlamacppProviderIcon(props: IconProps) {
    return (createElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        "aria-hidden": true,
        ...props
    }, createElement("path", {
        fill: "currentColor",
        d: "M6 4h12v3H9v3h8v3H9v7H6V4Zm11.2 10.2 2.3 2.3-1.4 1.4-2.3-2.3-2.3 2.3-1.4-1.4 2.3-2.3-2.3-2.3 1.4-1.4 2.3 2.3 2.3-2.3 1.4 1.4-2.3 2.3Z"
    })));
}
export const AI_PROVIDER_ICONS: Record<string, (props: IconProps) => ReactElement> = {
    '302ai': Ai302aiProviderIcon,
    'aihubmix': AihubmixProviderIcon,
    'aionly': AionlyProviderIcon,
    'alayanew': AlayanewProviderIcon,
    'aws-bedrock': AwsBedrockProviderIcon,
    'azure-openai': AzureOpenaiProviderIcon,
    'baichuan': BaichuanProviderIcon,
    'baidu-cloud': BaiduCloudProviderIcon,
    'burncloud': BurncloudProviderIcon,
    'cerebras': CerebrasProviderIcon,
    'cherryin': CherryinProviderIcon,
    'copilot': CopilotProviderIcon,
    'dashscope': DashscopeProviderIcon,
    'deepseek': DeepseekProviderIcon,
    'dmxapi': DmxapiProviderIcon,
    'doubao': DoubaoProviderIcon,
    'fireworks': FireworksProviderIcon,
    'gateway': GatewayProviderIcon,
    'github': GithubProviderIcon,
    'groq': GroqProviderIcon,
    'huggingface': HuggingfaceProviderIcon,
    'jina': JinaProviderIcon,
    'lanyun': LanyunProviderIcon,
    'llamacpp': LlamacppProviderIcon,
    'lmstudio': LmstudioProviderIcon,
    'longcat': LongcatProviderIcon,
    'mimo': MimoProviderIcon,
    'minimax': MinimaxProviderIcon,
    'minimax-global': MinimaxGlobalProviderIcon,
    'mistral': MistralProviderIcon,
    'modelscope': ModelscopeProviderIcon,
    'moonshot': MoonshotProviderIcon,
    'nvidia': NvidiaProviderIcon,
    'ocoolai': OcoolaiProviderIcon,
    'ollama': OllamaProviderIcon,
    'opencode': OpencodeProviderIcon,
    'openrouter': OpenrouterProviderIcon,
    'perplexity': PerplexityProviderIcon,
    'ph8': Ph8ProviderIcon,
    'poe': PoeProviderIcon,
    'ppio': PpioProviderIcon,
    'qiniu': QiniuProviderIcon,
    'radeon-cloud': RadeonCloudProviderIcon,
    'silicon': SiliconProviderIcon,
    'sophnet': SophnetProviderIcon,
    'stepfun': StepfunProviderIcon,
    'together': TogetherProviderIcon,
    'tokenhub': TokenhubProviderIcon,
    'vertexai': VertexaiProviderIcon,
    'voyageai': VoyageaiProviderIcon,
    'xirang': XirangProviderIcon,
    'zai': ZaiProviderIcon,
    'zhipu': ZhipuProviderIcon,
};
/**
 * Resolves a non-legacy AI Settings provider icon.
 * @param providerId - Provider id from GET /ai/providers.
 * @returns Icon component or undefined.
 */
export function getAiProviderIcon(providerId: string): ((props: IconProps) => ReactElement) | undefined {
    return AI_PROVIDER_ICONS[providerId];
}

/** Brand fill icons for customer channel platforms (web AllIcons parity). */
const brandFillProps = {
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    stroke: 'none',
} as const;

/** @returns YouTube brand mark. */
export function YoutubeIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...brandFillProps, ...props }, createElement('path', {
        d: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
    }));
}

/** @returns Facebook brand mark. */
export function FacebookIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...brandFillProps, ...props }, createElement('path', {
        d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
    }));
}

/** @returns Instagram brand mark. */
export function InstagramIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...brandFillProps, ...props }, createElement('path', {
        d: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z',
    }));
}

/** @returns Discord brand mark. */
export function DiscordIcon(props: IconProps) {
    return createElement('svg', {
        'aria-hidden': true,
        viewBox: '0 0 16 16',
        fill: 'currentColor',
        stroke: 'none',
        ...props,
    }, createElement('path', {
        d: 'M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612',
    }));
}

/** @returns LinkedIn brand mark. */
export function LinkedinIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...brandFillProps, ...props }, createElement('path', {
        d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    }));
}

/** @returns X (Twitter) brand mark. */
export function TwitterXIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...brandFillProps, ...props }, createElement('path', {
        d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
    }));
}

/** @returns LINE brand mark. */
export function LineBrandIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...brandFillProps, ...props }, createElement('path', {
        d: 'M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314',
    }));
}

/** @returns Reddit brand mark (simple alien circle). */
export function RedditIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...brandFillProps, ...props }, createElement('path', {
        d: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.769-3.209 5.002-7.182 5.002C7.176 19.13 4 16.898 4 14.126c0-.178.015-.353.041-.52A1.748 1.748 0 0 1 3.03 11.95c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z',
    }));
}

/** @returns TikTok brand mark (monochrome). */
export function TiktokIcon(props: IconProps) {
    return createElement('svg', { 'aria-hidden': true, ...brandFillProps, ...props }, createElement('path', {
        d: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.95-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
    }));
}

export {
    AlitmIcon,
    AngellistIcon,
    CrunchbaseIcon,
    EtsyIcon,
    KakaoTalkIcon,
    Link2Icon,
    MessengerIcon,
    PinterestIcon,
    QqIcon,
    ShopeeIcon,
    SkypeIcon,
    TelegramIcon,
    ViberIcon,
    VkIcon,
    WechatIcon,
    WecomIcon,
    WhatsappIcon,
    XiaohongshuIcon,
    ZaloIcon,
} from './lead-social-brand-icons';


// ---------------------------------------------------------------------------
// Clash UI icons (formerly src/assets/clash/image)
// ---------------------------------------------------------------------------
/** Clash match-case search toggle.
 * @param props - SVG props.
 * @returns Clash search-option icon.
 */
export function ClashMatchCaseIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    fill: "currentColor",
    xmlns: "http://www.w3.org/2000/svg",
    ...props,
    viewBox: "0 0 1024 1024"
  },
    createElement("path", { d: "M 175.755 768.851 L 334.113 343.826 L 394.912 343.826 L 554.501 768.851 L 494.851 768.851 L 453.989 653.897 L 275.036 653.897 L 234.583 768.851 L 175.755 768.851 Z M 293.332 604.339 L 436.102 604.339 L 366.441 406.757 L 362.994 406.757 L 293.332 604.339 Z M 703.344 780.174 C 670.415 780.174 644.541 771.518 625.724 754.205 C 606.907 736.892 597.499 713.412 597.499 683.764 C 597.499 653.898 608.575 629.61 630.729 610.902 C 652.882 592.195 681.682 582.842 717.129 582.842 C 732.663 582.842 747.433 584.223 761.437 586.985 C 775.44 589.747 787.419 593.973 797.375 599.662 L 797.375 580.626 C 797.375 557.323 790.66 539.299 777.231 526.554 C 763.802 513.808 744.753 507.435 720.082 507.435 C 705.423 507.435 691.652 510.293 678.769 516.01 C 665.887 521.726 654.004 530.218 643.118 541.486 L 607.099 512.687 C 621.43 495.948 637.95 483.422 656.657 475.107 C 675.365 466.793 696.726 462.636 720.739 462.636 C 762.639 462.636 794.365 472.988 815.918 493.693 C 837.469 514.397 848.245 544.797 848.245 584.893 L 848.245 770.574 L 798.031 770.574 L 798.031 731.025 L 794.421 731.025 C 784.903 746.889 772.39 759.046 756.882 767.498 C 741.375 775.948 723.529 780.174 703.344 780.174 Z M 709.087 736.688 C 734.031 736.688 754.981 727.594 771.939 709.406 C 788.896 691.218 797.375 668.694 797.375 641.836 C 787.693 636.147 776.315 631.812 763.242 628.831 C 750.168 625.849 737.751 624.358 725.99 624.358 C 701.594 624.358 682.735 629.555 669.415 639.949 C 656.096 650.342 649.436 664.947 649.436 683.764 C 649.436 699.628 654.906 712.414 665.846 722.124 C 676.786 731.833 691.2 736.688 709.087 736.688 Z" })
  );
}
/** Clash match-whole-word search toggle.
 * @param props - SVG props.
 * @returns Clash search-option icon.
 */
export function ClashMatchWholeWordIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    fill: "currentColor",
    xmlns: "http://www.w3.org/2000/svg",
    ...props,
    viewBox: "0 0 1024 1024"
  },
    createElement("path", { d: "M 64.002 831.066 L 64.002 649.735 L 128 649.735 L 128 767.067 L 896 767.067 L 896 649.735 L 959.999 649.735 L 959.999 831.066 L 64.001 831.066 L 64.002 831.066 Z M 414.031 680.257 L 414.031 640.708 L 410.421 640.708 C 400.903 656.571 388.39 668.729 372.882 677.18 C 357.375 685.631 339.529 689.857 319.344 689.857 C 286.688 689.857 260.883 681.2 241.929 663.887 C 222.975 646.575 213.499 623.095 213.499 593.447 C 213.499 563.58 224.575 539.293 246.729 520.585 C 268.883 501.878 297.546 492.524 332.719 492.524 C 348.254 492.524 363.023 493.905 377.026 496.667 C 391.029 499.43 403.146 503.656 413.375 509.345 L 413.375 490.309 C 413.375 467.006 406.729 448.982 393.437 436.236 C 380.144 423.49 361.299 417.117 336.902 417.117 C 321.969 417.117 307.993 419.976 294.975 425.692 C 281.956 431.408 270.004 439.9 259.118 451.169 L 223.099 422.37 C 237.43 405.631 253.95 393.104 272.657 384.79 C 291.365 376.476 312.862 372.318 337.149 372.318 C 379.05 372.318 410.708 382.671 432.123 403.375 C 453.538 424.079 464.245 454.479 464.245 494.575 L 464.245 680.257 L 414.031 680.257 Z M 341.99 534.041 C 317.867 534.041 299.077 539.238 285.62 549.631 C 272.164 560.024 265.436 574.493 265.436 593.036 C 265.436 609.174 270.974 622.097 282.051 631.806 C 293.128 641.516 307.61 646.371 325.498 646.371 C 350.441 646.371 371.323 637.277 388.144 619.089 C 404.965 600.9 413.375 578.377 413.375 551.518 C 403.693 545.83 392.315 541.495 379.242 538.514 C 366.168 535.532 353.751 534.041 341.99 534.041 Z M 541.375 680.667 L 541.375 252.934 L 593.558 252.934 L 593.558 384.545 L 590.358 427.211 L 593.148 427.211 C 598.564 418.733 608.943 408.435 624.287 396.319 C 639.631 384.203 660.977 378.145 688.327 378.145 C 729.735 378.145 762.638 393.27 787.035 423.519 C 811.431 453.769 823.629 491.047 823.629 535.355 C 823.629 579.116 811.609 615.874 787.568 645.631 C 763.527 675.389 730.31 690.267 687.917 690.267 C 662.044 690.267 641.258 684.688 625.558 673.529 C 609.859 662.37 599.056 651.594 593.148 641.201 L 590.358 641.201 L 590.358 680.667 L 541.375 680.667 Z M 681.6 426.801 C 653.702 426.801 631.521 437.563 615.056 459.087 C 598.591 480.613 590.358 505.816 590.358 534.698 C 590.358 564.018 598.591 589.263 615.056 610.433 C 631.521 631.602 653.702 642.186 681.6 642.186 C 709.497 642.186 731.309 631.807 747.036 611.048 C 762.762 590.289 770.625 564.839 770.625 534.698 C 770.625 504.558 762.762 479.04 747.036 458.145 C 731.309 437.249 709.497 426.801 681.6 426.801 Z" })
  );
}
/** Clash regular-expression search toggle.
 * @param props - SVG props.
 * @returns Clash search-option icon.
 */
export function ClashRegexIcon(props: IconProps) {
  return createElement("svg", {
    "aria-hidden": true,
    fill: "currentColor",
    xmlns: "http://www.w3.org/2000/svg",
    ...props,
    viewBox: "0 0 1024 1024"
  },
    createElement("path", { d: "M 838.757 427.686 L 808.603 338.337 L 633.84 409.02 L 645.314 217.721 L 549.541 217.721 L 561.015 409.02 L 386.252 338.337 L 356.098 427.686 L 539.205 477.619 L 413.277 620.027 L 487.146 678.203 L 597.428 519.119 L 706.666 678.203 L 780.535 620.027 L 654.607 477.619 L 838.757 427.686 Z" }),
    createElement("path", { d: "M 185.244 735.674 C 185.244 789.945 243.994 823.864 290.994 796.729 C 312.807 784.135 326.244 760.861 326.244 735.674 C 326.244 681.403 267.494 647.484 220.494 674.619 C 198.681 687.213 185.244 710.487 185.244 735.674 Z" })
  );
}
/** Default Apple latency-test icon markup. */
export const clashAppleTestIconSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"48\" height=\"48\"><path d=\"M16.125 1c-1.153.067-2.477.71-3.264 1.527-.71.744-1.272 1.85-1.043 2.918 1.253.033 2.511-.626 3.264-1.459.703-.779 1.236-1.866 1.043-2.986zm.068 4.443c-1.809 0-2.565 1.112-3.818 1.112-1.289 0-2.467-1.041-4.027-1.041C6.226 5.514 3 7.48 3 12.11 3 16.324 6.818 21 8.973 21c1.309.013 1.626-.823 3.402-.832 1.778-.013 2.162.843 3.473.832 1.476-.011 2.628-1.633 3.47-2.918.604-.92.853-1.39 1.32-2.43-3.472-.88-4.163-6.48 0-7.638-.785-1.341-3.08-2.57-4.445-2.57z\"/></svg>";
/** Default GitHub latency-test icon markup. */
export const clashGithubTestIconSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 30 30\" width=\"48\" height=\"48\"><path d=\"M15 3C8.373 3 3 8.373 3 15c0 5.623 3.872 10.328 9.092 11.63a1.751 1.751 0 0 1-.092-.583v-2.051h-1.508c-.821 0-1.551-.353-1.905-1.009-.393-.729-.461-1.844-1.435-2.526-.289-.227-.069-.486.264-.451.615.174 1.125.596 1.605 1.222.478.627.703.769 1.596.769.433 0 1.081-.025 1.691-.121.328-.833.895-1.6 1.588-1.962-3.996-.411-5.903-2.399-5.903-5.098 0-1.162.495-2.286 1.336-3.233-.276-.94-.623-2.857.106-3.587 1.798 0 2.885 1.166 3.146 1.481A8.993 8.993 0 0 1 15.495 9c1.036 0 2.024.174 2.922.483C18.675 9.17 19.763 8 21.565 8c.732.731.381 2.656.102 3.594.836.945 1.328 2.066 1.328 3.226 0 2.697-1.904 4.684-5.894 5.097C18.199 20.49 19 22.1 19 23.313v2.734c0 .104-.023.179-.035.268C23.641 24.676 27 20.236 27 15c0-6.627-5.373-12-12-12z\"/></svg>";
/** Default Google latency-test icon markup. */
export const clashGoogleTestIconSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\" width=\"48\" height=\"48\"><path fill=\"#FFC107\" d=\"M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z\"/><path fill=\"#FF3D00\" d=\"M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z\"/><path fill=\"#4CAF50\" d=\"M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z\"/><path fill=\"#1976D2\" d=\"M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z\"/></svg>";
/** Default YouTube latency-test icon markup. */
export const clashYoutubeTestIconSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\" width=\"48\" height=\"48\"><path fill=\"#FF3D00\" d=\"M43.2 33.9c-.4 2.1-2.1 3.7-4.2 4-3.3.5-8.8 1.1-15 1.1-6.1 0-11.6-.6-15-1.1-2.1-.3-3.8-1.9-4.2-4-.4-2.3-.8-5.7-.8-9.9s.4-7.6.8-9.9c.4-2.1 2.1-3.7 4.2-4C12.3 9.6 17.8 9 24 9c6.2 0 11.6.6 15 1.1 2.1.3 3.8 1.9 4.2 4 .4 2.3.9 5.7.9 9.9-.1 4.2-.5 7.6-.9 9.9z\"/><path fill=\"#FFF\" d=\"M20 31V17l12 7z\"/></svg>";
