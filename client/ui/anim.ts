/**
 * useFlashOnChange — 區域控制權變更時回傳 flash class（1 秒後自動清除）。
 */
import { useEffect, useRef, useState } from 'react';

export function useFlashOnChange(controller: string | null | undefined): string {
  const prev = useRef<string | null | undefined>(controller);
  const [cls, setCls] = useState('');

  useEffect(() => {
    if (prev.current !== undefined && controller && prev.current !== controller) {
      setCls(controller === 'blue' ? 'flash-blue' : 'flash-red');
      const t = setTimeout(() => setCls(''), 1000);
      prev.current = controller;
      return () => clearTimeout(t);
    }
    prev.current = controller;
  }, [controller]);

  return cls;
}

/**
 * useCountUp — 數字滾動：值變更時從舊值以 rAF 緩動到新值（300ms）。
 */
export function useCountUp(value: number, durationMs = 300): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return display;
}
