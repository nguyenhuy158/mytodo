import type {
  TaskQuestionAnswerer,
  TaskRepository,
} from "@/domain/tasks/ports";

export function createTaskChatService({
  taskQuestionAnswerer,
  taskRepository,
}: {
  taskQuestionAnswerer: TaskQuestionAnswerer;
  taskRepository: TaskRepository;
}) {
  return {
    async answerQuestion(question: string) {
      const tasksPayload = await taskRepository.listTasks();

      return taskQuestionAnswerer.answer(question, tasksPayload.tasks);
    },
  };
}
