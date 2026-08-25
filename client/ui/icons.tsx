/**
 * Icon — 內嵌 SVG 圖標系統（stroke 跟隨 currentColor），全面取代 emoji。
 */
import type { ReactElement } from 'react';

export type IconName =
  | 'mountain' | 'factory' | 'droplet' | 'castle'
  | 'warn' | 'snowflake' | 'chart' | 'coin' | 'sword'
  | 'dotBlue' | 'dotRed' | 'scale'
  | 'eye' | 'wifiOff'
  | 'cards' | 'cardSingle' | 'stack' | 'flag' | 'zap'
  | 'refresh' | 'sparkles' | 'hourglass'
  | 'trophy' | 'trendDown'
  | 'check' | 'xCircle' | 'doc' | 'swords' | 'medal';

const PATHS: Record<IconName, ReactElement> = {
  mountain: <path d="M3 20L9 6l4 8 3-5 5 11H3z" />,
  factory: <path d="M3 21V9l6 4V9l6 4V4h4v17H3z" />,
  droplet: <path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3z" />,
  castle: (
    <>
      <path d="M4 21h16" />
      <path d="M6 21V8l2 2V5h3v2h2V5h2v5l2-2v13" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3L2 20h20L12 3z" />
      <path d="M12 9v5" />
      <path d="M12 17.2v.1" />
    </>
  ),
  snowflake: <path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10" />,
  chart: <path d="M4 20V11M10 20V4M16 20v-6M2 20h20" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M14.8 9.2c-.7-1-5.6-1.4-5.6 1s5.6.9 5.6 3.3-4.9 1.9-5.6.8" />
    </>
  ),
  sword: (
    <>
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
    </>
  ),
  dotBlue: <circle cx="12" cy="12" r="8" fill="currentColor" stroke="none" />,
  dotRed: <circle cx="12" cy="12" r="8" fill="currentColor" stroke="none" />,
  scale: (
    <>
      <path d="M12 3v16M8 21h8" />
      <path d="M4 7h16" />
      <path d="M6 7l-3 6a3.2 3.2 0 0 0 6 0L6 7z" />
      <path d="M18 7l-3 6a3.2 3.2 0 0 0 6 0l-3-6z" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  wifiOff: (
    <>
      <path d="M2 2l20 20" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M5 12.5a10 10 0 0 1 3-2M19 12.5a10 10 0 0 0-4-2.3" />
      <path d="M2 8.8A15 15 0 0 1 7.5 6M22 8.8a15 15 0 0 0-6-2.6" />
      <circle cx="12" cy="20" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="5" width="12" height="16" rx="2" />
      <path d="M8 3h10a2 2 0 0 1 2 2v14" />
    </>
  ),
  cardSingle: <rect x="5" y="3" width="14" height="18" rx="2" />,
  stack: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
      <path d="M4 5.5v6c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9v-6" />
      <path d="M4 11.5v6c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9v-6" />
    </>
  ),
  flag: (
    <>
      <path d="M4 21V4" />
      <path d="M4 4h13l-2.5 4L17 12H4" />
    </>
  ),
  zap: <path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z" />,
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.9 4.9L19 9.5l-5.1 1.6L12 16l-1.9-4.9L5 9.5l5.1-1.6L12 3z" />
      <path d="M19 15l.8 2.1L22 18l-2.2.9L19 21l-.8-2.1L16 18l2.2-.9L19 15z" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3v3l5 6 5-6V3" />
      <path d="M7 21v-3l5-6 5 6v3" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4a2 2 0 0 0 2 4h1M17 6h3a2 2 0 0 1-2 4h-1" />
    </>
  ),
  trendDown: (
    <>
      <path d="M2 6l7 7 4-4 9 9" />
      <path d="M22 13v5h-5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </>
  ),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  doc: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  swords: (
    <>
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6M16 16l4 4M19 21l2-2" />
      <path d="M14.5 6.5L18 3h3v3l-3.5 3.5" />
      <path d="M5 14l4 4M7 17l-3 3M3 19l2 2" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14L7 22l5-3 5 3-1.5-8" />
    </>
  ),
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
