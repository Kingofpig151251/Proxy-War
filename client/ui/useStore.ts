/**
 * useAppStore — 強制重繪版 store 訂閱（版本計數器做 snapshot）。
 * 直接返回 store 物件會令 React 判定「快照冇變」而罷工不重繪。
 */
import { useCallback, useEffect, useState } from 'react';
import { store, type Store } from '../store.js';

export function useStore(): Store {
  const [, setVersion] = useState(0);
  useEffect(() => {
    return store.subscribe(() => setVersion((v) => v + 1));
  }, []);
  return store;
}
