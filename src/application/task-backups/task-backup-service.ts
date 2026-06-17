import type {
  TaskBackupRepository,
  TaskRepository,
} from "@/domain/tasks/ports";

export const RESTORE_CONFIRMATION = "RESTORE";

export type RestoreTaskBackupInput = {
  backupId: string;
  confirmation: string;
};

export class TaskBackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskBackupValidationError";
  }
}

export function createTaskBackupService({
  backupRepository,
  taskRepository,
}: {
  backupRepository: TaskBackupRepository;
  taskRepository: TaskRepository;
}) {
  return {
    async createBackup(note?: string) {
      const snapshot = await taskRepository.createBackupSnapshot();
      const backup = await backupRepository.saveBackup(snapshot, note);

      return {
        backup,
        backups: await backupRepository.listBackups(),
      };
    },
    listBackups() {
      return backupRepository.listBackups();
    },
    async restoreBackup({ backupId, confirmation }: RestoreTaskBackupInput) {
      if (confirmation !== RESTORE_CONFIRMATION) {
        throw new TaskBackupValidationError("Nhập RESTORE để xác nhận restore.");
      }

      const backup = await backupRepository.readBackup(backupId);
      const safetySnapshot = await taskRepository.createBackupSnapshot();
      const safetyBackup = await backupRepository.saveBackup(
        safetySnapshot,
        `Auto backup before restoring ${backup.id}`,
      );

      await taskRepository.restoreBackupSnapshot(backup);

      return {
        backup: backupRepository.toBackupSummary(backup),
        backups: await backupRepository.listBackups(),
        safetyBackup,
        tasksPayload: await taskRepository.listTasks({ forceRefresh: true }),
      };
    },
  };
}
