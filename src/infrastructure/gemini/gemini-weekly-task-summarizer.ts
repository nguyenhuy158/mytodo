import "server-only";

import type { WeeklyTaskSummarizer } from "@/domain/tasks/ports";
import { summarizeWeeklyTasks } from "@/lib/task-ai-summary";

export function createGeminiWeeklyTaskSummarizer(): WeeklyTaskSummarizer {
  return {
    summarize: summarizeWeeklyTasks,
  };
}
