import "server-only";

import {
  generateGeminiJson,
  type GeminiJsonSchema,
} from "@/lib/gemini";
import type { SheetTask, TaskPriority, TaskStatus } from "@/lib/tasks";
import type {
  WeeklyAiSummary,
  WeeklyAiSummaryItem,
  WeeklyAiSummaryPayload,
} from "@/lib/task-ai-types";

const MAX_AI_TASKS = 90;
const MAX_SUMMARY_ITEMS = 6;
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  Unknown: 3,
};
const STATUS_ORDER: Record<TaskStatus, number> = {
  Blocked: 0,
  "In Progress": 1,
  "Not Started": 2,
  Unknown: 3,
  Done: 4,
};

type WeekWindow = {
  todayISO: string;
  weekEndISO: string;
  weekStartISO: string;
};

type PreparedAiTask = {
  dateReceived: string;
  daysLeft: number | null;
  deadline: string;
  deadlineISO: string | null;
  details: string;
  flags: string[];
  id: string;
  isOverdue: boolean;
  note: string;
  priority: TaskPriority;
  rowNumber: number;
  status: TaskStatus;
  system: string;
  task: string;
  timelineDays: number | null;
};

type PreparedSummaryInput = {
  blockedCount: number;
  highPriorityCount: number;
  overdueCount: number;
  tasks: PreparedAiTask[];
  weekTaskCount: number;
};

const WEEKLY_SUMMARY_SCHEMA: GeminiJsonSchema = {
  type: "object",
  properties: {
    overview: {
      type: "string",
      description: "One short Vietnamese overview of today's task situation.",
    },
    today: {
      type: "array",
      items: summaryItemSchema("Task that should be handled today."),
    },
    overdue: {
      type: "array",
      items: summaryItemSchema("Overdue task that is not done."),
    },
    risks: {
      type: "array",
      items: summaryItemSchema("Risk from blocked, high priority, overdue, or unclear task."),
    },
    priorityOrder: {
      type: "array",
      items: summaryItemSchema("Task ordered by recommended execution priority."),
    },
  },
  required: ["overview", "today", "overdue", "risks", "priorityOrder"],
};

export async function summarizeWeeklyTasks(
  tasks: SheetTask[],
): Promise<WeeklyAiSummaryPayload> {
  const weekWindow = getCurrentWeekWindow();
  const preparedInput = prepareSummaryInput(tasks, weekWindow);
  const generatedAt = new Date().toISOString();

  if (!preparedInput.tasks.length) {
    return {
      meta: {
        generatedAt,
        includedTaskCount: 0,
        model: "gemini-not-called",
        sourceTaskCount: tasks.length,
        todayISO: weekWindow.todayISO,
        weekEndISO: weekWindow.weekEndISO,
        weekStartISO: weekWindow.weekStartISO,
      },
      summary: {
        overview: "Không có task active nào thuộc tuần này, overdue, high priority hoặc blocked.",
        overdue: [],
        priorityOrder: [],
        risks: [],
        today: [],
      },
    };
  }

  const result = await generateGeminiJson<unknown>({
    maxOutputTokens: 1800,
    prompt: buildWeeklySummaryPrompt(preparedInput, weekWindow),
    responseSchema: WEEKLY_SUMMARY_SCHEMA,
    systemInstruction: [
      "Bạn là trợ lý vận hành task nội bộ.",
      "Trả lời bằng tiếng Việt, ngắn gọn, ưu tiên hành động cụ thể.",
      "Chỉ dùng task trong dữ liệu đầu vào; không bịa deadline, status hoặc task mới.",
      "Nếu một danh mục không có task phù hợp, trả mảng rỗng cho danh mục đó.",
    ].join(" "),
    temperature: 0.2,
  });

  return {
    meta: {
      generatedAt,
      includedTaskCount: preparedInput.tasks.length,
      model: result.model,
      modelVersion: result.modelVersion,
      responseId: result.responseId,
      sourceTaskCount: tasks.length,
      todayISO: weekWindow.todayISO,
      usageMetadata: result.usageMetadata,
      weekEndISO: weekWindow.weekEndISO,
      weekStartISO: weekWindow.weekStartISO,
    },
    summary: normalizeWeeklySummary(result.data, preparedInput.tasks),
  };
}

function prepareSummaryInput(
  tasks: SheetTask[],
  weekWindow: WeekWindow,
): PreparedSummaryInput {
  const activeTasks = tasks.filter((task) => task.status !== "Done");
  const weekTasks = activeTasks.filter((task) => isTaskInWeek(task, weekWindow));
  const overdueTasks = activeTasks.filter((task) => task.isOverdue);
  const highPriorityTasks = activeTasks.filter((task) => task.priority === "High");
  const blockedTasks = activeTasks.filter((task) => task.status === "Blocked");
  const summaryTasks = dedupeTasks([
    ...weekTasks,
    ...overdueTasks,
    ...highPriorityTasks,
    ...blockedTasks,
  ])
    .sort(compareSummaryTasks)
    .slice(0, MAX_AI_TASKS)
    .map((task) => prepareTaskForAi(task, weekWindow));

  return {
    blockedCount: blockedTasks.length,
    highPriorityCount: highPriorityTasks.length,
    overdueCount: overdueTasks.length,
    tasks: summaryTasks,
    weekTaskCount: weekTasks.length,
  };
}

function prepareTaskForAi(
  task: SheetTask,
  weekWindow: WeekWindow,
): PreparedAiTask {
  return {
    dateReceived: task.dateReceived,
    daysLeft: task.daysLeft,
    deadline: task.deadline,
    deadlineISO: task.deadlineISO,
    details: truncateText(task.details, 360),
    flags: getTaskFlags(task, weekWindow),
    id: task.id,
    isOverdue: task.isOverdue,
    note: truncateText(task.note, 420),
    priority: task.priority,
    rowNumber: task.rowNumber,
    status: task.status,
    system: task.system,
    task: task.task,
    timelineDays: task.timelineDays,
  };
}

function getTaskFlags(task: SheetTask, weekWindow: WeekWindow) {
  const flags: string[] = [];

  if (task.deadlineISO === weekWindow.todayISO) {
    flags.push("today");
  }

  if (isTaskInWeek(task, weekWindow)) {
    flags.push("this-week");
  }

  if (task.isOverdue) {
    flags.push("overdue");
  }

  if (task.priority === "High") {
    flags.push("high-priority");
  }

  if (task.status === "Blocked") {
    flags.push("blocked");
  }

  return flags;
}

function buildWeeklySummaryPrompt(
  input: PreparedSummaryInput,
  weekWindow: WeekWindow,
) {
  return [
    "Hãy tóm tắt tình hình task cho hôm nay.",
    "Cần trả về đúng JSON theo schema, không markdown.",
    "Quy tắc ưu tiên:",
    "1. Việc hôm nay gồm task due hôm nay và task overdue cần xử lý ngay.",
    "2. Việc trễ hạn chỉ gồm task active có isOverdue=true.",
    "3. Rủi ro ưu tiên blocked, high priority, overdue lâu ngày, thiếu deadline rõ ràng hoặc note cho thấy đang vướng.",
    "4. Thứ tự ưu tiên là danh sách task nên làm trước, tối đa 6 task.",
    "5. Mỗi item cần action cụ thể, ngắn, có thể làm ngay.",
    "",
    "Dữ liệu:",
    JSON.stringify(
      {
        counts: {
          blocked: input.blockedCount,
          highPriority: input.highPriorityCount,
          overdue: input.overdueCount,
          thisWeek: input.weekTaskCount,
        },
        todayISO: weekWindow.todayISO,
        weekEndISO: weekWindow.weekEndISO,
        weekStartISO: weekWindow.weekStartISO,
        tasks: input.tasks,
      },
      null,
      2,
    ),
  ].join("\n");
}

function normalizeWeeklySummary(
  value: unknown,
  inputTasks: PreparedAiTask[],
): WeeklyAiSummary {
  const record = isRecord(value) ? value : {};
  const taskIds = new Set(inputTasks.map((task) => task.id));

  return {
    overview:
      getString(record.overview) ||
      "Gemini đã đọc task nhưng không trả overview rõ ràng.",
    overdue: normalizeItems(record.overdue, taskIds),
    priorityOrder: normalizeItems(record.priorityOrder, taskIds),
    risks: normalizeItems(record.risks, taskIds),
    today: normalizeItems(record.today, taskIds),
  };
}

function normalizeItems(
  value: unknown,
  taskIds: Set<string>,
): WeeklyAiSummaryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeItem(item, taskIds))
    .filter((item): item is WeeklyAiSummaryItem => item !== null)
    .slice(0, MAX_SUMMARY_ITEMS);
}

function normalizeItem(
  value: unknown,
  taskIds: Set<string>,
): WeeklyAiSummaryItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = getString(value.title);
  const action = getString(value.action);

  if (!title && !action) {
    return null;
  }

  const taskId = getString(value.taskId);

  return {
    action: action || "Kiểm tra lại task này.",
    deadline: getString(value.deadline),
    priority: getString(value.priority),
    reason: getString(value.reason),
    status: getString(value.status),
    taskId: taskId && taskIds.has(taskId) ? taskId : null,
    title: title || action,
  };
}

function summaryItemSchema(description: string): GeminiJsonSchema {
  return {
    type: "object",
    description,
    properties: {
      action: {
        type: "string",
        description: "Specific short action the user should do.",
      },
      deadline: {
        type: "string",
        description: "Deadline from input, or empty string if absent.",
      },
      priority: {
        type: "string",
        description: "Priority from input.",
      },
      reason: {
        type: "string",
        description: "Short reason for this recommendation.",
      },
      status: {
        type: "string",
        description: "Status from input.",
      },
      taskId: {
        type: "string",
        description: "Task id from input, or empty string only if no task applies.",
      },
      title: {
        type: "string",
        description: "Task title from input.",
      },
    },
    required: [
      "action",
      "deadline",
      "priority",
      "reason",
      "status",
      "taskId",
      "title",
    ],
  };
}

function dedupeTasks(tasks: SheetTask[]) {
  const seenIds = new Set<string>();

  return tasks.filter((task) => {
    if (seenIds.has(task.id)) {
      return false;
    }

    seenIds.add(task.id);

    return true;
  });
}

function compareSummaryTasks(left: SheetTask, right: SheetTask) {
  const leftBlocked = left.status === "Blocked" ? 0 : 1;
  const rightBlocked = right.status === "Blocked" ? 0 : 1;

  if (leftBlocked !== rightBlocked) {
    return leftBlocked - rightBlocked;
  }

  if (left.isOverdue !== right.isOverdue) {
    return left.isOverdue ? -1 : 1;
  }

  const priorityDiff =
    PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const statusDiff = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];

  if (statusDiff !== 0) {
    return statusDiff;
  }

  return getDeadlineTime(left) - getDeadlineTime(right);
}

function getDeadlineTime(task: SheetTask) {
  return task.deadlineISO ? Date.parse(`${task.deadlineISO}T00:00:00Z`) : Infinity;
}

function isTaskInWeek(task: SheetTask, weekWindow: WeekWindow) {
  return Boolean(
    task.deadlineISO &&
      task.deadlineISO >= weekWindow.weekStartISO &&
      task.deadlineISO <= weekWindow.weekEndISO,
  );
}

function getCurrentWeekWindow(): WeekWindow {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(today, mondayOffset);
  const sunday = addDays(monday, 6);

  return {
    todayISO: getLocalISODate(today),
    weekEndISO: getLocalISODate(sunday),
    weekStartISO: getLocalISODate(monday),
  };
}

function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);

  nextDate.setDate(nextDate.getDate() + amount);

  return nextDate;
}

function getLocalISODate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
