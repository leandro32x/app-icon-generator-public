import { useCallback, useEffect, useRef, useState } from 'react';

export interface HistoryControls {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface HistoryOptions<T> {
  /** Equality used to skip no-op snapshots. Defaults to `Object.is`. */
  isEqual?: (a: T, b: T) => boolean;
  /** Rapid changes (slider drags, typing) within this window collapse into one entry. */
  debounceMs?: number;
  /** Maximum number of undo steps kept. */
  limit?: number;
  /**
   * Changes within this many ms after mount are absorbed into the baseline
   * instead of becoming undo steps (app bootstrap effects, not user edits).
   */
  ignoreInitialMs?: number;
}

/**
 * Undo/redo over an externally-owned snapshot.
 *
 * The hook watches `snapshot`; whenever it changes it schedules a history
 * commit after `debounceMs` of quiet, so a slider drag becomes a single
 * undo step. `undo`/`redo` hand a previous snapshot back through `restore`.
 * Restored states are recognised by equality, so they never create entries.
 */
export function useHistory<T>(
  snapshot: T,
  restore: (snapshot: T) => void,
  options: HistoryOptions<T> = {},
): HistoryControls {
  // 300 ms still merges a slider drag or a burst of typing into one step,
  // while two deliberate clicks stay separate.
  const { isEqual = Object.is, debounceMs = 300, limit = 60, ignoreInitialMs = 0 } = options;
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const committedRef = useRef<T>(snapshot);
  const pendingRef = useRef<T | null>(null);
  const timerRef = useRef<number | null>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const commitPending = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null || isEqual(pending, committedRef.current)) return;
    pastRef.current.push(committedRef.current);
    if (pastRef.current.length > limit) pastRef.current.shift();
    futureRef.current = [];
    committedRef.current = pending;
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEqual, limit]);

  useEffect(() => {
    if (isEqual(snapshot, committedRef.current)) return;
    if (Date.now() - mountedAtRef.current < ignoreInitialMs) {
      // Bootstrap change: move the baseline, don't record a step.
      committedRef.current = snapshot;
      pendingRef.current = null;
      return;
    }
    pendingRef.current = snapshot;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(commitPending, debounceMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const undo = useCallback(() => {
    commitPending();
    const previous = pastRef.current.pop();
    if (previous === undefined) return;
    futureRef.current.push(committedRef.current);
    committedRef.current = previous;
    restore(previous);
    bump();
  }, [commitPending, restore]);

  const redo = useCallback(() => {
    commitPending();
    const next = futureRef.current.pop();
    if (next === undefined) return;
    pastRef.current.push(committedRef.current);
    committedRef.current = next;
    restore(next);
    bump();
  }, [commitPending, restore]);

  // `version` is read so the flags re-evaluate after each stack change.
  void version;
  return {
    undo,
    redo,
    canUndo: pastRef.current.length > 0 || pendingRef.current !== null,
    canRedo: futureRef.current.length > 0,
  };
}
