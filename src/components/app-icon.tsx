import {
  AlertCircle,
  Bot,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  DatabaseBackup,
  FileText,
  ExternalLink,
  Filter,
  GripVertical,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Loader2,
  MessageCircle,
  Settings,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  SquareKanban,
  Table2,
  TimerReset,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const icons = {
  alertCircle: AlertCircle,
  bot: Bot,
  calendarClock: CalendarClock,
  calendarDays: CalendarDays,
  chart: ChartColumn,
  checkCircle: CheckCircle2,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  clock: Clock3,
  dashboard: LayoutDashboard,
  databaseBackup: DatabaseBackup,
  externalLink: ExternalLink,
  fileText: FileText,
  filter: Filter,
  grip: GripVertical,
  kanban: SquareKanban,
  listTodo: ListTodo,
  loader: Loader2,
  logOut: LogOut,
  messageCircle: MessageCircle,
  pencil: PencilLine,
  plus: Plus,
  refresh: RefreshCw,
  settings: Settings,
  restore: RotateCcw,
  save: Save,
  search: Search,
  send: Send,
  sliders: SlidersHorizontal,
  sparkles: Sparkles,
  table: Table2,
  timerReset: TimerReset,
  trash: Trash2,
  x: X,
} satisfies Record<string, LucideIcon>;

export type AppIconName = keyof typeof icons;

type AppIconProps = Omit<React.ComponentPropsWithoutRef<LucideIcon>, "name"> & {
  name: AppIconName;
};

export function AppIcon({
  name,
  className,
  strokeWidth = 2,
  ...props
}: AppIconProps) {
  const Icon = icons[name];

  return (
    <Icon
      aria-hidden="true"
      className={cn("shrink-0", className)}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
