import "server-only";

import type { TaskBackupRepository } from "@/domain/tasks/ports";
import {
  listTaskBackups,
  readTaskBackup,
  saveTaskBackup,
  toTaskBackupSummary,
} from "@/lib/task-backups";

export function createFileTaskBackupRepository(): TaskBackupRepository {
  return {
    listBackups: listTaskBackups,
    readBackup: readTaskBackup,
    saveBackup: saveTaskBackup,
    toBackupSummary: toTaskBackupSummary,
  };
}
