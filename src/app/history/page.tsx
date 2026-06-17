import type { Metadata } from "next";
import { TaskHistoryPage } from "@/components/task-history-page";

export const metadata: Metadata = {
  title: "History | 2026 To-do Cockpit",
  description: "Audit history for task create, update, backup, and restore actions.",
};

export default function HistoryPage() {
  return <TaskHistoryPage />;
}
