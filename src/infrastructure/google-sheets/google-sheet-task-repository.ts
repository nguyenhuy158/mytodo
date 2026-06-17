import "server-only";

import type { TaskRepository } from "@/domain/tasks/ports";
import {
  createSheetBackupSnapshot,
  createSheetTask,
  getSheetTasks,
  restoreSheetBackupSnapshot,
  updateSheetTask,
} from "@/lib/google-sheets";

export function createGoogleSheetTaskRepository(): TaskRepository {
  return {
    createBackupSnapshot: createSheetBackupSnapshot,
    createTask: createSheetTask,
    listTasks: getSheetTasks,
    restoreBackupSnapshot: restoreSheetBackupSnapshot,
    updateTask: updateSheetTask,
  };
}
