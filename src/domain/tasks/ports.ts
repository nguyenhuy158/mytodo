import type {
  SheetTask,
  TaskBackupRecord,
  TaskBackupSnapshot,
  TaskBackupSummary,
  TaskCreateInput,
  TaskUpdateInput,
  TasksPayload,
} from "@/lib/tasks";
import type { WeeklyAiSummaryPayload } from "@/lib/task-ai-types";

export type TaskListOptions = {
  forceRefresh?: boolean;
};

export interface TaskRepository {
  createTask(input: TaskCreateInput): Promise<void>;
  createBackupSnapshot(): Promise<TaskBackupSnapshot>;
  listTasks(options?: TaskListOptions): Promise<TasksPayload>;
  restoreBackupSnapshot(backup: TaskBackupRecord): Promise<void>;
  updateTask(input: TaskUpdateInput): Promise<void>;
}

export interface TaskBackupRepository {
  listBackups(): Promise<TaskBackupSummary[]>;
  readBackup(id: string): Promise<TaskBackupRecord>;
  saveBackup(
    snapshot: TaskBackupSnapshot,
    note?: string,
  ): Promise<TaskBackupSummary>;
  toBackupSummary(record: TaskBackupRecord): TaskBackupSummary;
}

export interface WeeklyTaskSummarizer {
  summarize(tasks: SheetTask[]): Promise<WeeklyAiSummaryPayload>;
}
