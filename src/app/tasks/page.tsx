import type { Metadata } from "next";
import { TaskDashboard } from "@/components/task-dashboard";

export const metadata: Metadata = {
  title: "Task board | 2026 To-do Cockpit",
  description: "Paginated task board from Google Sheet.",
};

export default function TasksPage() {
  return <TaskDashboard view="tasks" />;
}
