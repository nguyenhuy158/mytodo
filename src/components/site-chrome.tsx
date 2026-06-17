"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import type { TaskCreateInput, TasksPayload } from "@/lib/tasks";
import { AppIcon, type AppIconName } from "@/components/app-icon";
import { TaskBackupDialog } from "@/components/task-backup-dialog";
import { TaskConfigDialog } from "@/components/task-config-dialog";
import { TaskCreateDialog } from "@/components/task-create-dialog";
import { cn } from "@/lib/utils";

const TASKS_API_URL = "/api/tasks";
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Sv86oc9zXbvwSsD956uT4opSU8JqP04s/edit?gid=689856921#gid=689856921";
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
              isSigningOut={isSigningOut}
              menuRef={desktopSettingsMenuRef}
              placement="desktop"
              showDataActions={false}
              onBackup={() => undefined}
              onConfig={() => undefined}
              onRefresh={() => undefined}
              onSignOut={handleSignOut}
              onToggle={() => setIsSettingsOpen((current) => !current)}
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
          <nav className="grid grid-cols-6 gap-1.5 sm:flex sm:gap-2 lg:justify-center">
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
                isSigningOut={isSigningOut}
                menuRef={desktopSettingsMenuRef}
                placement="desktop"
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
                onToggle={() => setIsSettingsOpen((current) => !current)}
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
            isSigningOut={isSigningOut}
            menuRef={mobileSettingsMenuRef}
            placement="mobile"
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
            onToggle={() => setIsSettingsOpen((current) => !current)}
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
  isSigningOut,
  menuRef,
  onBackup,
  onConfig,
  onRefresh,
  onSignOut,
  onToggle,
  placement,
  showDataActions = true,
  userEmail,
}: {
  isOpen: boolean;
  isRefreshing: boolean;
  isSigningOut: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onBackup: () => void;
  onConfig: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onToggle: () => void;
  placement: "desktop" | "mobile";
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
                <SettingsMenuExternalLink
                  href={SHEET_URL}
                  icon="externalLink"
                  label="Mở Google Sheet"
                />
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
