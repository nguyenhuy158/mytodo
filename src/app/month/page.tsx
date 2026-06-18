import type { Metadata } from "next";
import { MonthlyTasksPage } from "@/components/monthly-tasks-page";

export const metadata: Metadata = {
  title: "Tổng quan tháng | 2026 To-do Cockpit",
  description: "Monthly task overview grouped by deadline month.",
};

export default function MonthPage() {
  return <MonthlyTasksPage />;
}
