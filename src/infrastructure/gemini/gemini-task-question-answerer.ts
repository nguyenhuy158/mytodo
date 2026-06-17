import "server-only";

import type { TaskQuestionAnswerer } from "@/domain/tasks/ports";
import { answerTaskQuestion } from "@/lib/task-ai-chat";

export function createGeminiTaskQuestionAnswerer(): TaskQuestionAnswerer {
  return {
    answer: answerTaskQuestion,
  };
}
