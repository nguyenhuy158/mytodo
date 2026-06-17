import type {
  SheetTask,
  TaskBackupRecord,
  TaskBackupSnapshot,
  TaskBackupSummary,
  TaskCreateInput,
  TaskConfigCreateInput,
  TaskConfigDeleteInput,
  TaskConfigItem,
  TaskConfigUpdateInput,
  TaskHistoryCreateInput,
  TaskHistoryEntry,
  TaskUpdateInput,
  TasksPayload,
} from "@/lib/tasks";
import type { WeeklyAiSummaryPayload } from "@/lib/task-ai-types";
import type { TaskAiChatPayload } from "@/lib/task-ai-types";

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

export interface TaskHistoryRepository {
  appendEntry(input: TaskHistoryCreateInput): Promise<TaskHistoryEntry>;
  listEntries(options?: { limit?: number }): Promise<TaskHistoryEntry[]>;
}

export interface TaskConfigRepository {
  createConfig(input: TaskConfigCreateInput): Promise<TaskConfigItem>;
  deleteConfig(input: TaskConfigDeleteInput): Promise<TaskConfigItem>;
  listConfigs(): Promise<TaskConfigItem[]>;
  updateConfig(input: TaskConfigUpdateInput): Promise<TaskConfigItem>;
}

export interface WeeklyTaskSummarizer {
  summarize(tasks: SheetTask[]): Promise<WeeklyAiSummaryPayload>;
}

export interface TaskQuestionAnswerer {
  answer(question: string, tasks: SheetTask[]): Promise<TaskAiChatPayload>;
}
