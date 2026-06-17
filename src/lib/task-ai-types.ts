export type WeeklyAiSummaryItem = {
  action: string;
  deadline: string;
  priority: string;
  reason: string;
  status: string;
  taskId: string | null;
  title: string;
};

export type WeeklyAiSummary = {
  overview: string;
  overdue: WeeklyAiSummaryItem[];
  priorityOrder: WeeklyAiSummaryItem[];
  risks: WeeklyAiSummaryItem[];
  today: WeeklyAiSummaryItem[];
};

export type WeeklyAiSummaryPayload = {
  meta: {
    generatedAt: string;
    includedTaskCount: number;
    model: string;
    modelVersion?: string;
    responseId?: string;
    sourceTaskCount: number;
    todayISO: string;
    usageMetadata?: {
      candidatesTokenCount?: number;
      promptTokenCount?: number;
      totalTokenCount?: number;
    };
    weekEndISO: string;
    weekStartISO: string;
  };
  summary: WeeklyAiSummary;
};

export type TaskAiChatRelatedTask = {
  deadline: string;
  priority: string;
  reason: string;
  status: string;
  taskId: string | null;
  title: string;
};

export type TaskAiChatPayload = {
  answer: string;
  meta: {
    generatedAt: string;
    includedTaskCount: number;
    model: string;
    modelVersion?: string;
    responseId?: string;
    sourceTaskCount: number;
    usageMetadata?: {
      candidatesTokenCount?: number;
      promptTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  relatedTasks: TaskAiChatRelatedTask[];
  suggestedNextActions: string[];
};
