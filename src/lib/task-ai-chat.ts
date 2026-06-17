import "server-only";

import {
  generateGeminiJson,
  type GeminiJsonSchema,
} from "@/lib/gemini";
import type { SheetTask } from "@/lib/tasks";
import type {
  TaskAiChatPayload,
  TaskAiChatRelatedTask,
} from "@/lib/task-ai-types";

const MAX_AI_CHAT_TASKS = 180;
const MAX_RELATED_TASKS = 8;
const MAX_NEXT_ACTIONS = 6;

type PreparedChatTask = {
  dateReceived: string;
  daysLeft: number | null;
  deadline: string;
  deadlineISO: string | null;
  details: string;
  id: string;
  isOverdue: boolean;
  note: string;
  priority: string;
  rowNumber: number;
  status: string;
  system: string;
  tags: string;
  task: string;
  timelineDays: number | null;
};

const TASK_CHAT_SCHEMA: GeminiJsonSchema = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "Vietnamese answer to the user's question.",
    },
    relatedTasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          deadline: { type: "string" },
          priority: { type: "string" },
          reason: { type: "string" },
          status: { type: "string" },
          taskId: { type: "string" },
          title: { type: "string" },
        },
        required: ["deadline", "priority", "reason", "status", "taskId", "title"],
      },
    },
    suggestedNextActions: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
  required: ["answer", "relatedTasks", "suggestedNextActions"],
};

export async function answerTaskQuestion(
  question: string,
  tasks: SheetTask[],
): Promise<TaskAiChatPayload> {
  const preparedTasks = prepareTasksForChat(tasks);
  const generatedAt = new Date().toISOString();
  const result = await generateGeminiJson<unknown>({
    maxOutputTokens: 1800,
    prompt: buildTaskChatPrompt(question, preparedTasks),
    responseSchema: TASK_CHAT_SCHEMA,
    systemInstruction: [
      "Bạn là trợ lý hỏi đáp task nội bộ.",
      "Trả lời bằng tiếng Việt, rõ việc nào cần làm, không markdown dài dòng.",
      "Chỉ dùng dữ liệu task được gửi lên; không bịa task, deadline, status, priority.",
      "Khi nhắc task cụ thể, ưu tiên nêu taskId dạng R119 nếu có.",
      "Nếu câu hỏi không đủ dữ liệu để trả lời, nói rõ thiếu dữ liệu nào.",
    ].join(" "),
    temperature: 0.2,
  });
  const normalized = normalizeChatAnswer(result.data, preparedTasks);

  return {
    ...normalized,
    meta: {
      generatedAt,
      includedTaskCount: preparedTasks.length,
      model: result.model,
      modelVersion: result.modelVersion,
      responseId: result.responseId,
      sourceTaskCount: tasks.length,
      usageMetadata: result.usageMetadata,
    },
  };
}

function prepareTasksForChat(tasks: SheetTask[]) {
  return [...tasks]
    .sort(compareChatTasks)
    .slice(0, MAX_AI_CHAT_TASKS)
    .map((task) => ({
      dateReceived: task.dateReceived,
      daysLeft: task.daysLeft,
      deadline: task.deadline,
      deadlineISO: task.deadlineISO,
      details: truncateText(task.details, 260),
      id: task.id,
      isOverdue: task.isOverdue,
      note: truncateText(task.note, 320),
      priority: task.priority,
      rowNumber: task.rowNumber,
      status: task.status,
      system: task.system,
      tags: task.tags,
      task: task.task,
      timelineDays: task.timelineDays,
    }));
}

function buildTaskChatPrompt(question: string, tasks: PreparedChatTask[]) {
  return [
    "Hãy trả lời câu hỏi của user dựa trên danh sách task hiện tại.",
    "Câu hỏi:",
    question,
    "",
    "Yêu cầu trả lời:",
    "- Trả lời thẳng vào câu hỏi, ngắn gọn.",
    "- Nếu hỏi nên làm gì trước, ưu tiên overdue, blocked, high priority, deadline gần.",
    "- Nếu hỏi liên quan khách/system/tag, tìm trong task, details, note, system, tags.",
    "- relatedTasks tối đa 8 task liên quan nhất.",
    "- suggestedNextActions tối đa 6 hành động ngắn.",
    "",
    "Dữ liệu task:",
    JSON.stringify(
      {
        tasks,
      },
      null,
      2,
    ),
  ].join("\n");
}

function normalizeChatAnswer(
  value: unknown,
  inputTasks: PreparedChatTask[],
): Omit<TaskAiChatPayload, "meta"> {
  const record = isRecord(value) ? value : {};
  const taskIds = new Set(inputTasks.map((task) => task.id));
  const relatedTasks = Array.isArray(record.relatedTasks)
    ? record.relatedTasks
        .map((task) => normalizeRelatedTask(task, taskIds))
        .filter((task): task is TaskAiChatRelatedTask => Boolean(task))
        .slice(0, MAX_RELATED_TASKS)
    : [];
  const suggestedNextActions = Array.isArray(record.suggestedNextActions)
    ? record.suggestedNextActions
        .map(getString)
        .filter(Boolean)
        .slice(0, MAX_NEXT_ACTIONS)
    : [];

  return {
    answer:
      getString(record.answer) ||
      "Gemini đã đọc task nhưng chưa trả được câu trả lời rõ ràng.",
    relatedTasks,
    suggestedNextActions,
  };
}

function normalizeRelatedTask(
  value: unknown,
  taskIds: Set<string>,
): TaskAiChatRelatedTask | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = getString(value.title);
  const taskId = getString(value.taskId);

  if (!title && !taskId) {
    return null;
  }

  return {
    deadline: getString(value.deadline),
    priority: getString(value.priority),
    reason: getString(value.reason),
    status: getString(value.status),
    taskId: taskId && taskIds.has(taskId) ? taskId : null,
    title: title || taskId,
  };
}

function compareChatTasks(left: SheetTask, right: SheetTask) {
  if (left.status === "Done" && right.status !== "Done") {
    return 1;
  }

  if (left.status !== "Done" && right.status === "Done") {
    return -1;
  }

  if (left.isOverdue !== right.isOverdue) {
    return left.isOverdue ? -1 : 1;
  }

  if (left.priority !== right.priority) {
    return getPriorityRank(left.priority) - getPriorityRank(right.priority);
  }

  return getDeadlineTime(left) - getDeadlineTime(right);
}

function getPriorityRank(priority: string) {
  if (priority === "High") {
    return 0;
  }

  if (priority === "Medium") {
    return 1;
  }

  if (priority === "Low") {
    return 2;
  }

  return 3;
}

function getDeadlineTime(task: SheetTask) {
  return task.deadlineISO ? Date.parse(`${task.deadlineISO}T00:00:00Z`) : Infinity;
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
