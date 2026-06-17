"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { SheetTask } from "@/lib/tasks";

type SetSelectedTaskId = (taskId: string | null) => void;
const TASK_SELECTION_CHANGE_EVENT = "mytodo:task-selection-change";

export function usePersistedTaskSelection({
  isReady,
  storageKey,
  tasks,
}: {
  isReady: boolean;
  storageKey: string;
  tasks: SheetTask[];
}): [string | null, SetSelectedTaskId] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.key === storageKey) {
          onStoreChange();
        }
      };

      const handleTaskSelectionChange = (event: Event) => {
        const taskSelectionEvent = event as CustomEvent<{ storageKey?: string }>;

        if (taskSelectionEvent.detail?.storageKey === storageKey) {
          onStoreChange();
        }
      };

      window.addEventListener("storage", handleStorage);
      window.addEventListener(
        TASK_SELECTION_CHANGE_EVENT,
        handleTaskSelectionChange,
      );

      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(
          TASK_SELECTION_CHANGE_EVENT,
          handleTaskSelectionChange,
        );
      };
    },
    [storageKey],
  );

  const getSnapshot = useCallback(() => readStoredTaskId(storageKey), [storageKey]);
  const storedTaskId = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    if (!isReady || !storedTaskId) {
      return;
    }

    const taskStillExists = tasks.some((task) => task.id === storedTaskId);

    if (!taskStillExists) {
      writeStoredTaskId(storageKey, null);
      dispatchTaskSelectionChange(storageKey);
    }
  }, [isReady, storageKey, storedTaskId, tasks]);

  const selectedTaskId = useMemo(() => {
    if (!storedTaskId) {
      return null;
    }

    if (!isReady) {
      return storedTaskId;
    }

    return tasks.some((task) => task.id === storedTaskId) ? storedTaskId : null;
  }, [isReady, storedTaskId, tasks]);

  const setSelectedTaskId = useCallback<SetSelectedTaskId>(
    (taskId) => {
      writeStoredTaskId(storageKey, taskId);
      dispatchTaskSelectionChange(storageKey);
    },
    [storageKey],
  );

  return [selectedTaskId, setSelectedTaskId];
}

function readStoredTaskId(storageKey: string) {
  try {
    const taskId = window.localStorage.getItem(storageKey);

    return taskId?.trim() || null;
  } catch {
    return null;
  }
}

function writeStoredTaskId(storageKey: string, taskId: string | null) {
  try {
    if (taskId) {
      window.localStorage.setItem(storageKey, taskId);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Local storage may be unavailable in restricted browser modes.
  }
}

function getServerSnapshot() {
  return null;
}

function dispatchTaskSelectionChange(storageKey: string) {
  window.dispatchEvent(
    new CustomEvent(TASK_SELECTION_CHANGE_EVENT, {
      detail: { storageKey },
    }),
  );
}
