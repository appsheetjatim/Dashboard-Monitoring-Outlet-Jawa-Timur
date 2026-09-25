import { useState, useEffect } from 'react';

// Returns `value`, but delayed by `delayMs` after the last change — so a
// useMemo filtering a large dataset against this instead of the raw input
// only re-runs once the person pauses typing, rather than on every single
// keystroke. The input itself still updates instantly (it's bound to the
// raw state, not this), only the expensive filtering waits.
export function useDebouncedValue<T>(value: T, delayMs: number = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}