import type {
  TaskRepository,
  WeeklyTaskSummarizer,
} from "@/domain/tasks/ports";

export function createWeekSummaryService({
  taskRepository,
  weeklyTaskSummarizer,
}: {
  taskRepository: TaskRepository;
  weeklyTaskSummarizer: WeeklyTaskSummarizer;
}) {
  return {
    async summarizeCurrentWeek() {
      const tasksPayload = await taskRepository.listTasks();

      return weeklyTaskSummarizer.summarize(tasksPayload.tasks);
    },
  };
}
