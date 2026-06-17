import "server-only";

import type { TaskHistoryRepository } from "@/domain/tasks/ports";
import {
  appendTaskHistoryEntry,
  listTaskHistoryEntries,
} from "@/lib/task-history";

export function createGoogleSheetTaskHistoryRepository(): TaskHistoryRepository {
  return {
    appendEntry: appendTaskHistoryEntry,
    listEntries: listTaskHistoryEntries,
  };
}
