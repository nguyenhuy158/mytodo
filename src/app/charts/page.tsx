import type { Metadata } from "next";
import { TaskDashboard } from "@/components/task-dashboard";

export const metadata: Metadata = {
  title: "Biểu đồ | 2026 To-do Cockpit",
  description: "Charts for Google Sheet task status, priority, and deadlines.",
};

export default function ChartsPage() {
  return <TaskDashboard view="charts" />;
}
