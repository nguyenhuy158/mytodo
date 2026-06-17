import "server-only";

import { createTaskBackupService } from "@/application/task-backups/task-backup-service";
import { createWeekSummaryService } from "@/application/task-ai/week-summary-service";
import { createTaskService } from "@/application/tasks/task-service";
import { createGeminiWeeklyTaskSummarizer } from "@/infrastructure/gemini/gemini-weekly-task-summarizer";
import { createGoogleSheetTaskRepository } from "@/infrastructure/google-sheets/google-sheet-task-repository";
import { createFileTaskBackupRepository } from "@/infrastructure/task-backups/file-task-backup-repository";

export function createTaskApplicationService() {
  return createTaskService(createGoogleSheetTaskRepository());
}

export function createTaskBackupApplicationService() {
  return createTaskBackupService({
    backupRepository: createFileTaskBackupRepository(),
    taskRepository: createGoogleSheetTaskRepository(),
  });
}

export function createWeekSummaryApplicationService() {
  return createWeekSummaryService({
    taskRepository: createGoogleSheetTaskRepository(),
    weeklyTaskSummarizer: createGeminiWeeklyTaskSummarizer(),
  });
}
