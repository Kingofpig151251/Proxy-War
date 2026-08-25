/**
 * Icon 組件 — emoji → SVG icon
 */
import { Icon } from './icons.tsx';
import { ICON_MAP } from './icons.js';

export function EmojiIcon({ emoji, size = 16 }: { emoji: string; size?: number }) {
  const iconName = ICON_MAP[emoji as keyof typeof ICON_MAP] || 'dotBlue';
  return <Icon name={iconName as any} size={size} />;
}