import "server-only";

import { createTaskBackupService } from "@/application/task-backups/task-backup-service";
import { createTaskConfigService } from "@/application/task-config/task-config-service";
import { createTaskChatService } from "@/application/task-ai/task-chat-service";
import { createWeekSummaryService } from "@/application/task-ai/week-summary-service";
import { createTaskHistoryService } from "@/application/task-history/task-history-service";
import { createTaskService } from "@/application/tasks/task-service";
import { createGeminiWeeklyTaskSummarizer } from "@/infrastructure/gemini/gemini-weekly-task-summarizer";
import { createGeminiTaskQuestionAnswerer } from "@/infrastructure/gemini/gemini-task-question-answerer";
import { createGoogleSheetTaskRepository } from "@/infrastructure/google-sheets/google-sheet-task-repository";
import { createFileTaskBackupRepository } from "@/infrastructure/task-backups/file-task-backup-repository";
import { createGoogleSheetTaskConfigRepository } from "@/infrastructure/task-config/google-sheet-task-config-repository";
import { createGoogleSheetTaskHistoryRepository } from "@/infrastructure/task-history/google-sheet-task-history-repository";

export function createTaskApplicationService() {
  return createTaskService(createGoogleSheetTaskRepository());
}

export function createTaskBackupApplicationService() {
  return createTaskBackupService({
    backupRepository: createFileTaskBackupRepository(),
    taskRepository: createGoogleSheetTaskRepository(),
  });
}

export function createTaskHistoryApplicationService() {
  return createTaskHistoryService(createGoogleSheetTaskHistoryRepository());
}

export function createTaskConfigApplicationService() {
  return createTaskConfigService(createGoogleSheetTaskConfigRepository());
}

export function createWeekSummaryApplicationService() {
  return createWeekSummaryService({
    taskRepository: createGoogleSheetTaskRepository(),
    weeklyTaskSummarizer: createGeminiWeeklyTaskSummarizer(),
  });
}

export function createTaskChatApplicationService() {
  return createTaskChatService({
    taskQuestionAnswerer: createGeminiTaskQuestionAnswerer(),
    taskRepository: createGoogleSheetTaskRepository(),
  });
}
