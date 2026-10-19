/**
 * Tiny pub/sub for "local data changed". Services (reminder scheduling, cloud
 * sync, widgets) subscribe here instead of being imported by the data layer,
 * which keeps the dependency graph acyclic.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onLocalDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitLocalDataChanged(): void {
  for (const l of listeners) {
    try {
      l();
    } catch (error) {
      console.warn('[events] listener failed', error);
    }
  }
}

/** Trailing-edge debounce for listeners that do expensive work. */
export function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn();
    }, ms);
  };
}
