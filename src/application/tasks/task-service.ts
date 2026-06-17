import type { TaskRepository } from "@/domain/tasks/ports";
import type { TaskCreateInput, TaskUpdateInput } from "@/lib/tasks";

export function createTaskService(taskRepository: TaskRepository) {
  return {
    async createTask(input: TaskCreateInput) {
      await taskRepository.createTask(input);

      return taskRepository.listTasks({ forceRefresh: true });
    },
    listTasks(options?: { forceRefresh?: boolean }) {
      return taskRepository.listTasks(options);
    },
    async updateTask(input: TaskUpdateInput) {
      await taskRepository.updateTask(input);

      return taskRepository.listTasks({ forceRefresh: true });
    },
  };
}
