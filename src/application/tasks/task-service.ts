import type { TaskRepository } from "@/domain/tasks/ports";
import {
  applyTaskUpdate,
  type TaskCreateInput,
  type TaskUpdateInput,
  type TasksPayload,
} from "@/lib/tasks";

type TaskUpdateOptions = {
  currentPayload?: TasksPayload;
};

export function createTaskService(taskRepository: TaskRepository) {
  return {
    async createTask(input: TaskCreateInput) {
      await taskRepository.createTask(input);

      return taskRepository.listTasks({ forceRefresh: true });
    },
    listTasks(options?: { forceRefresh?: boolean }) {
      return taskRepository.listTasks(options);
    },
    async updateTask(input: TaskUpdateInput, options?: TaskUpdateOptions) {
      const currentPayload =
        options?.currentPayload ?? (await taskRepository.listTasks());

      await taskRepository.updateTask(input);

      return applyTaskUpdate(currentPayload, input) ?? currentPayload;
    },
  };
}
