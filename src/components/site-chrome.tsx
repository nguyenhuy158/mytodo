"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import type {
  SheetRuntimeInfoPayload,
  TaskCreateInput,
  TasksPayload,
} from "@/lib/tasks";
import { AppIcon, type AppIconName } from "@/components/app-icon";
import { TaskBackupDialog } from "@/components/task-backup-dialog";
import { TaskConfigDialog } from "@/components/task-config-dialog";
import { TaskCreateDialog } from "@/components/task-create-dialog";
import { cn } from "@/lib/utils";

const TASKS_API_URL = "/api/tasks";
const SHEET_INFO_API_URL = "/api/sheet-info";
const LAST_NAV_STORAGE_KEY = "mytodo:last-nav";

type SiteHeaderProps = {
  userEmail?: string | null;
};

type NavItem = {
  href: string;
  icon: AppIconName;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: "dashboard", label: "Tổng quan" },
  { href: "/charts", icon: "chart", label: "Biểu đồ" },
  { href: "/tasks", icon: "listTodo", label: "Task board" },
  { href: "/kanban", icon: "kanban", label: "Kanban" },
  { href: "/week", icon: "calendarDays", label: "Task tuần này" },
  { href: "/month", icon: "calendarClock", label: "Tháng" },
  { href: "/history", icon: "clock", label: "History" },
];

const getActiveNavHref = (pathname: string) =>
  NAV_ITEMS.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  )?.href;

const readLastNavHref = () => {
  try {
    return window.localStorage.getItem(LAST_NAV_STORAGE_KEY);
  } catch {
    return null;
  }
};

const saveLastNavHref = (href: string) => {
  try {
    window.localStorage.setItem(LAST_NAV_STORAGE_KEY, href);
  } catch {
    // Local storage may be unavailable in restricted browser modes.
  }
};

const clearLastNavHref = () => {
  try {
    window.localStorage.removeItem(LAST_NAV_STORAGE_KEY);
  } catch {
    // Local storage may be unavailable in restricted browser modes.
  }
};

const fetchTasks = async (url: string): Promise<TasksPayload> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok) {
    const message = payload.error?.message ?? "Không reload được Google Sheet.";

    throw Object.assign(new Error(message), { payload });
  }

  return payload;
};

const fetchSheetInfo = async (): Promise<SheetRuntimeInfoPayload> => {
  const response = await fetch(SHEET_INFO_API_URL, { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok) {
    const message =
      payload.error?.message ?? "Không đọc được cấu hình Google Sheet.";

    throw Object.assign(new Error(message), { payload });
  }

  return payload as SheetRuntimeInfoPayload;
};

export function SiteHeader({ userEmail }: SiteHeaderProps) {
  const pathname = usePathname();
  const navLinkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const desktopSettingsMenuRef = useRef<HTMLDivElement>(null);
  const mobileSettingsMenuRef = useRef<HTMLDivElement>(null);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSheetInfoLoading, setIsSheetInfoLoading] = useState(false);
  const [sheetInfo, setSheetInfo] = useState<SheetRuntimeInfoPayload | null>(
    null,
  );
  const [sheetInfoError, setSheetInfoError] = useState<string | null>(null);
  const activeNavHref = getActiveNavHref(pathname);
  const isAuthPage = pathname === "/login";

  useEffect(() => {
    const currentNavHref = activeNavHref ?? readLastNavHref();

    if (!currentNavHref) {
      return;
    }

    saveLastNavHref(currentNavHref);
    navLinkRefs.current.get(currentNavHref)?.focus({ preventScroll: true });
  }, [activeNavHref]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        desktopSettingsMenuRef.current?.contains(event.target)
      ) {
        return;
      }

      if (
        event.target instanceof Node &&
        mobileSettingsMenuRef.current?.contains(event.target)
      ) {
        return;
      }

      setIsSettingsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  const loadSheetInfo = () => {
    if (sheetInfo || isSheetInfoLoading) {
      return;
    }

    const loadInfo = async () => {
      setIsSheetInfoLoading(true);
      setSheetInfoError(null);

      try {
        setSheetInfo(await fetchSheetInfo());
      } catch (infoError) {
        setSheetInfoError(
          infoError instanceof Error
            ? infoError.message
            : "Không đọc được cấu hình Google Sheet.",
        );
      } finally {
        setIsSheetInfoLoading(false);
      }
    };

    void loadInfo();
  };

  const handleSettingsToggle = () => {
    if (!isSettingsOpen && !isAuthPage) {
      loadSheetInfo();
    }

    setIsSettingsOpen((current) => !current);
  };

  const handleRefresh = () => {
    const refreshTasks = async () => {
      setIsRefreshing(true);

      try {
        const payload = await fetchTasks(`${TASKS_API_URL}?force=1&ts=${Date.now()}`);

        await mutate(TASKS_API_URL, payload, { revalidate: false });

        return payload;
      } finally {
        setIsRefreshing(false);
      }
    };

    toast.promise(refreshTasks(), {
      loading: "Đang reload Google Sheet...",
      success: (payload) =>
        `Đã reload ${payload?.tasks.length ?? 0} task từ Sheet.`,
      error: (refreshError) =>
        refreshError instanceof Error
          ? refreshError.message
          : "Không reload được Google Sheet.",
    });
  };

  const handleCreateTask = async (input: TaskCreateInput) => {
    const createTask = async () => {
      setIsCreating(true);

      try {
        const response = await fetch(TASKS_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        });
        const payload = await response.json();

        if (!response.ok) {
          const message =
            payload.error?.message ?? "Không tạo được task trên Google Sheet.";

          throw Object.assign(new Error(message), { payload });
        }

        await mutate(TASKS_API_URL, payload as TasksPayload, {
          revalidate: false,
        });
        setIsCreateOpen(false);

        return payload as TasksPayload;
      } finally {
        setIsCreating(false);
      }
    };

    const createPromise = createTask();

    toast.promise(createPromise, {
      loading: "Đang tạo task trên Google Sheet...",
      success: (payload) =>
        `Đã tạo task. Sheet hiện có ${payload?.tasks.length ?? 0} task.`,
      error: (createError) =>
        createError instanceof Error
          ? createError.message
          : "Không tạo được task trên Google Sheet.",
    });

    await createPromise;
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    clearLastNavHref();
    await mutate(TASKS_API_URL, undefined, { revalidate: false });
    await signOut({ callbackUrl: "/login" });
  };

  if (isAuthPage) {
    return (
      <header className="sticky top-0 z-50 border-b border-white/70 bg-[#f7f1e8]/90 px-4 py-3 shadow-sm shadow-slate-900/5 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-[95rem] items-center justify-between gap-3">
          <Link
            href="/"
            className="text-lg font-black tracking-[-0.06em] text-slate-950 sm:text-xl"
          >
            2026 Tasks
          </Link>
          {userEmail ? (
            <SettingsMenu
              userEmail={userEmail}
              isOpen={isSettingsOpen}
              isRefreshing={isRefreshing}
              isSheetInfoLoading={isSheetInfoLoading}
              isSigningOut={isSigningOut}
              menuRef={desktopSettingsMenuRef}
              placement="desktop"
              sheetInfo={sheetInfo}
              sheetInfoError={sheetInfoError}
              showDataActions={false}
              onBackup={() => undefined}
              onConfig={() => undefined}
              onRefresh={() => undefined}
              onSignOut={handleSignOut}
              onToggle={handleSettingsToggle}
            />
          ) : null}
        </div>
      </header>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/70 bg-[#f7f1e8]/90 px-4 py-3 shadow-sm shadow-slate-900/5 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="mx-auto grid w-full max-w-[95rem] gap-3 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="text-lg font-black tracking-[-0.06em] text-slate-950 sm:text-xl"
            >
              2026 Tasks
            </Link>
          </div>
          <nav className="grid grid-cols-7 gap-1.5 sm:flex sm:gap-2 lg:justify-center">
            {NAV_ITEMS.map((item) => {
              const isActive =
                activeNavHref === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => saveLastNavHref(item.href)}
                  ref={(element) => {
                    if (element) {
                      navLinkRefs.current.set(item.href, element);
                    } else {
                      navLinkRefs.current.delete(item.href);
                    }
                  }}
                  className={cn(
                    "inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-2xl border px-2 text-center text-xs font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 sm:h-auto sm:rounded-full sm:px-4 sm:py-2 sm:text-sm lg:shrink-0",
                    isActive
                      ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/15"
                      : "border-white bg-white/70 text-slate-600 hover:border-teal-200 hover:text-teal-800",
                  )}
                >
                  <AppIcon name={item.icon} className="size-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {userEmail ? (
              <SettingsMenu
                userEmail={userEmail}
                isOpen={isSettingsOpen}
                isRefreshing={isRefreshing}
                isSheetInfoLoading={isSheetInfoLoading}
                isSigningOut={isSigningOut}
                menuRef={desktopSettingsMenuRef}
                placement="desktop"
                sheetInfo={sheetInfo}
                sheetInfoError={sheetInfoError}
                onBackup={() => {
                  setIsSettingsOpen(false);
                  setIsBackupOpen(true);
                }}
                onConfig={() => {
                  setIsSettingsOpen(false);
                  setIsConfigOpen(true);
                }}
                onRefresh={() => {
                  setIsSettingsOpen(false);
                  handleRefresh();
                }}
                onSignOut={handleSignOut}
                onToggle={handleSettingsToggle}
              />
            ) : null}
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-teal-700 px-4 text-sm font-black text-white shadow-lg shadow-teal-900/15 transition hover:-translate-y-0.5 hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
            >
              <AppIcon name="plus" className="size-4" />
              Tạo task
            </button>
          </div>
        </div>
      </header>
      {isCreateOpen ? (
        <TaskCreateDialog
          isSaving={isCreating}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={handleCreateTask}
        />
      ) : null}
      {isBackupOpen ? (
        <TaskBackupDialog onClose={() => setIsBackupOpen(false)} />
      ) : null}
      {isConfigOpen ? (
        <TaskConfigDialog onClose={() => setIsConfigOpen(false)} />
      ) : null}
      <div className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex items-end gap-2 lg:hidden">
        {userEmail ? (
          <SettingsMenu
            userEmail={userEmail}
            isOpen={isSettingsOpen}
            isRefreshing={isRefreshing}
            isSheetInfoLoading={isSheetInfoLoading}
            isSigningOut={isSigningOut}
            menuRef={mobileSettingsMenuRef}
            placement="mobile"
            sheetInfo={sheetInfo}
            sheetInfoError={sheetInfoError}
            onBackup={() => {
              setIsSettingsOpen(false);
              setIsBackupOpen(true);
            }}
            onConfig={() => {
              setIsSettingsOpen(false);
              setIsConfigOpen(true);
            }}
            onRefresh={() => {
              setIsSettingsOpen(false);
              handleRefresh();
            }}
            onSignOut={handleSignOut}
            onToggle={handleSettingsToggle}
          />
        ) : null}
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-black text-white shadow-2xl shadow-slate-900/25 transition hover:-translate-y-0.5 hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
          aria-label="Tạo task mới"
        >
          <AppIcon name="plus" className="size-5" />
          <span>Tạo task</span>
        </button>
      </div>
    </>
  );
}

function SettingsMenu({
  isOpen,
  isRefreshing,
  isSheetInfoLoading,
  isSigningOut,
  menuRef,
  onBackup,
  onConfig,
  onRefresh,
  onSignOut,
  onToggle,
  placement,
  sheetInfo,
  sheetInfoError,
  showDataActions = true,
  userEmail,
}: {
  isOpen: boolean;
  isRefreshing: boolean;
  isSheetInfoLoading: boolean;
  isSigningOut: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onBackup: () => void;
  onConfig: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onToggle: () => void;
  placement: "desktop" | "mobile";
  sheetInfo: SheetRuntimeInfoPayload | null;
  sheetInfoError: string | null;
  showDataActions?: boolean;
  userEmail: string;
}) {
  const isMobile = placement === "mobile";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={cn(
          "inline-flex items-center justify-center border border-white bg-white/80 text-slate-700 shadow-lg shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-teal-200 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200",
          isMobile
            ? "size-12 rounded-full backdrop-blur-xl"
            : "h-10 max-w-72 gap-2 rounded-full px-3 text-sm font-black",
        )}
        aria-label="Mở settings"
      >
        <AppIcon name="settings" className={isMobile ? "size-5" : "size-4"} />
        {isMobile ? null : (
          <span className="block max-w-44 truncate">{userEmail}</span>
        )}
      </button>

      {isOpen ? (
        <div
          role="menu"
          className={cn(
            "absolute z-[60] w-[min(calc(100vw-2rem),22rem)] rounded-[1.25rem] border border-white/80 bg-white/95 p-3 text-left shadow-2xl shadow-slate-900/20 backdrop-blur-xl",
            isMobile ? "right-0 bottom-14" : "right-0 top-12",
          )}
        >
          <div className="border-b border-slate-100 px-2 pb-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Settings
            </p>
            <p className="mt-1 truncate text-sm font-black text-slate-900">
              {userEmail}
            </p>
          </div>

          {showDataActions ? (
            <div className="py-3">
              <p className="px-2 text-xs font-black uppercase tracking-[0.16em] text-teal-700">
                Dữ liệu
              </p>
              <SheetSourceInfo
                error={sheetInfoError}
                info={sheetInfo}
                isLoading={isSheetInfoLoading}
              />
              <div className="mt-2 grid gap-1">
                <SettingsMenuItem
                  icon={isRefreshing ? "loader" : "refresh"}
                  isLoading={isRefreshing}
                  label={isRefreshing ? "Đang reload..." : "Reload dữ liệu"}
                  onClick={onRefresh}
                  disabled={isRefreshing}
                />
                <SettingsMenuItem
                  icon="databaseBackup"
                  label="Backup / Restore"
                  onClick={onBackup}
                />
                <SettingsMenuItem
                  icon="sliders"
                  label="Config dữ liệu"
                  onClick={onConfig}
                />
                <SettingsMenuLink
                  href="/history"
                  icon="clock"
                  label="History hoạt động"
                />
                {sheetInfo ? (
                  <SettingsMenuExternalLink
                    href={sheetInfo.sheet.googleSheetUrl}
                    icon="externalLink"
                    label="Mở Google Sheet"
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "pt-3",
              showDataActions ? "border-t border-slate-100" : "",
            )}
          >
            <p className="px-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Tài khoản
            </p>
            <div className="mt-2">
              <SettingsMenuItem
                icon={isSigningOut ? "loader" : "logOut"}
                isDanger
                isLoading={isSigningOut}
                label={isSigningOut ? "Đang đăng xuất..." : "Đăng xuất"}
                onClick={onSignOut}
                disabled={isSigningOut}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SheetSourceInfo({
  error,
  info,
  isLoading,
}: {
  error: string | null;
  info: SheetRuntimeInfoPayload | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
        <p className="inline-flex items-center gap-2 text-xs font-black text-slate-500">
          <AppIcon name="loader" className="size-3.5 animate-spin" />
          Đang đọc nguồn dữ liệu...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-black leading-5 text-amber-900">{error}</p>
      </div>
    );
  }

  if (!info) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl border border-teal-100 bg-teal-50/70 p-3">
      <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-teal-700">
        Nguồn CRUD hiện tại
      </p>
      <div className="mt-2 grid gap-2">
        <SheetSourceRow label="GOOGLE_SHEET_ID" value={info.sheet.spreadsheetId} />
        <SheetSourceRow label="GOOGLE_SHEET_GID" value={info.sheet.sheetGid} />
        <SheetSourceRow
          label="Range"
          value={info.sheet.range || "Auto theo tab từ GID"}
        />
        <SheetSourceRow
          label="XLSX tab"
          value={info.sheet.xlsxSheetName || "Default sheet"}
        />
      </div>
    </div>
  );
}

function SheetSourceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-400">
        {label}
      </span>
      <span className="break-all font-mono text-xs font-black leading-5 text-slate-800">
        {value}
      </span>
    </div>
  );
}

function SettingsMenuItem({
  disabled = false,
  icon,
  isDanger = false,
  isLoading = false,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: AppIconName;
  isDanger?: boolean;
  isLoading?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-wait disabled:opacity-70",
        isDanger
          ? "text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-100"
          : "text-slate-700 hover:bg-teal-50 hover:text-teal-800 focus-visible:ring-teal-100",
      )}
    >
      <AppIcon
        name={icon}
        className={cn("size-4", isLoading ? "animate-spin" : "")}
      />
      {label}
    </button>
  );
}

function SettingsMenuLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: AppIconName;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-black text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
    >
      <AppIcon name={icon} className="size-4" />
      {label}
    </Link>
  );
}

function SettingsMenuExternalLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: AppIconName;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      role="menuitem"
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-black text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
    >
      <AppIcon name={icon} className="size-4" />
      {label}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/70 bg-[#f7f1e8]/85 px-5 py-5 text-sm font-semibold text-slate-500 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-[95rem] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>2026 Tasks</span>
        <span>Private Sheet data stays server-side.</span>
      </div>
    </footer>
  );
}
