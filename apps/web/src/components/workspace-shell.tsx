"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  ChevronDown,
  Menu,
  Search,
  SunMoon,
  X,
} from "lucide-react";
import { appNavigation, appNavItems, workspaceNavigation } from "@/config/navigation";
import { ApiError, apiConnectionEvent, apiRequest, postsUpdatedEvent } from "@/lib/api";
import {
  applyThemeSettings,
  defaultThemeSettings,
  normalizeThemeSettings,
  type ThemeSettings,
} from "@/lib/theme-settings";

const themeChangeEvent = "united-technologies-theme-change";
const pendingThemeStorageKey = "united-technologies.theme-settings-pending";
const pendingThemeScopeStorageKey = "united-technologies.theme-settings-pending-scope";

function subscribeToTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(themeChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(themeChangeEvent, onChange);
  };
}

function getThemeSnapshot(): "light" | "dark" {
  return window.localStorage.getItem("united-technologies.theme") === "dark" ? "dark" : "light";
}

function getServerThemeSnapshot(): "light" | "dark" {
  return "light";
}

type Workspace = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "EDITOR" | "CONTRIBUTOR" | "VIEWER";
  trialEndsAt: string;
  trialDaysRemaining: number;
  subscriptionStatus: string | null;
  brands: Array<{ id: string; name: string }>;
};

type WorkspaceResponse = {
  workspaces: Workspace[];
  user: { name: string; email: string } | null;
  isSuperAdmin: boolean;
};

type NotificationItem = { id: string; kind: string; title: string; body: string; readAt: string | null; createdAt: string };

export function WorkspaceShell({
  logo,
  children,
}: {
  logo: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [user, setUser] = useState<WorkspaceResponse["user"]>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileGateChecking, setProfileGateChecking] = useState(pathname !== "/onboarding");
  const [error, setError] = useState("");
  const [instagramSyncMessage, setInstagramSyncMessage] = useState("");
  const [instagramSyncError, setInstagramSyncError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(274);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarTooltip, setSidebarTooltip] = useState<{ label: string; top: number } | null>(null);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [connectionOffline, setConnectionOffline] = useState(false);
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const verifiedProfileWorkspaceId = useRef("");
  const navigationRef = useRef<HTMLElement>(null);
  const navigationThumbRef = useRef<HTMLDivElement>(null);
  const navigationDragStart = useRef<{ pointerY: number; scrollTop: number } | null>(null);
  const [navigationMetrics, setNavigationMetrics] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedWidth = Number(window.localStorage.getItem("united-technologies.sidebar-width"));
      if (Number.isFinite(savedWidth) && savedWidth >= 220 && savedWidth <= 360) setSidebarWidth(savedWidth);
      setSidebarCollapsed(window.localStorage.getItem("united-technologies.sidebar-collapsed") === "true");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const navigation = navigationRef.current;
    const activeItem = navigation?.querySelector<HTMLElement>('.nav-item[aria-current="page"]');
    if (!navigation || !activeItem) return;
    const navigationBounds = navigation.getBoundingClientRect();
    const activeBounds = activeItem.getBoundingClientRect();
    if (activeBounds.top < navigationBounds.top) {
      navigation.scrollBy({ top: activeBounds.top - navigationBounds.top - 8, behavior: "smooth" });
    } else if (activeBounds.bottom > navigationBounds.bottom) {
      navigation.scrollBy({ top: activeBounds.bottom - navigationBounds.bottom + 8, behavior: "smooth" });
    }
  }, [pathname]);

  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const measure = () => setNavigationMetrics({
      scrollTop: navigation.scrollTop,
      scrollHeight: navigation.scrollHeight,
      clientHeight: navigation.clientHeight,
    });
    measure();
    navigation.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    if (navigation.firstElementChild) observer.observe(navigation.firstElementChild);
    const mutations = new MutationObserver(measure);
    mutations.observe(navigation, { childList: true, subtree: true });
    return () => {
      navigation.removeEventListener("scroll", measure);
      observer.disconnect();
      mutations.disconnect();
    };
  }, [pathname]);

  const navigationOverflow = Math.max(0, navigationMetrics.scrollHeight - navigationMetrics.clientHeight);
  const navigationThumbSize = navigationOverflow > 0
    ? Math.min(100, Math.max(12, navigationMetrics.clientHeight / navigationMetrics.scrollHeight * 100))
    : 34;
  const navigationThumbTop = navigationOverflow > 0
    ? navigationMetrics.scrollTop / navigationOverflow * (100 - navigationThumbSize)
    : 0;

  function moveNavigationThumb(clientY: number) {
    const navigation = navigationRef.current;
    const track = navigationThumbRef.current?.parentElement;
    const start = navigationDragStart.current;
    if (!navigation || !track || !start || navigationOverflow <= 0) return;
    const thumbTravel = Math.max(1, track.clientHeight - (navigationThumbSize / 100 * track.clientHeight));
    navigation.scrollTop = start.scrollTop + ((clientY - start.pointerY) / thumbTravel) * navigationOverflow;
  }

  function resizeSidebar(clientX: number) {
    const maxWidth = Math.max(240, Math.min(360, window.innerWidth - 560));
    setSidebarWidth(Math.min(maxWidth, Math.max(220, clientX)));
  }

  function saveSidebarWidth() {
    setSidebarResizing(false);
    window.localStorage.setItem("united-technologies.sidebar-width", String(sidebarWidth));
  }

  function showSidebarTooltip(label: string, target: HTMLElement) {
    if (!sidebarCollapsed) return;
    const bounds = target.getBoundingClientRect();
    setSidebarTooltip({ label, top: bounds.top + bounds.height / 2 });
  }

  useEffect(() => {
    apiRequest<WorkspaceResponse>("/api/workspaces")
      .then(({ workspaces: loaded, isSuperAdmin: admin, user: signedInUser }) => {
        const savedWorkspaceId = window.localStorage.getItem("united-technologies.workspaceId");
        const selected = loaded.find((workspace) => workspace.id === savedWorkspaceId) ?? loaded[0];
        setWorkspaces(loaded);
        setUser(signedInUser);
        setActiveWorkspaceId(selected?.id ?? "");
        const savedBrandId = window.localStorage.getItem("united-technologies.brandId");
        const selectedBrandId = selected?.brands.some((item) => item.id === savedBrandId)
          ? savedBrandId
          : selected?.brands[0]?.id;
        if (selectedBrandId) window.localStorage.setItem("united-technologies.brandId", selectedBrandId);
        else window.localStorage.removeItem("united-technologies.brandId");
        setIsSuperAdmin(admin);
        if (selected) window.localStorage.setItem("united-technologies.workspaceId", selected.id);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof ApiError && requestError.status === 401) {
          window.localStorage.removeItem("united-technologies.workspaceId");
          window.localStorage.removeItem("united-technologies.brandId");
          router.replace("/login");
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Could not load your workspace.");
      })
      .finally(() => setLoading(false));

  }, [router]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let active = true;
    const loadNotifications = () => apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>("/api/notifications")
      .then((result) => {
        if (!active) return;
        setNotifications(result.notifications);
        setUnreadNotifications(result.unreadCount);
      })
      .catch(() => undefined);
    void loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [activeWorkspaceId]);

  async function markNotificationRead(item: NotificationItem) {
    if (item.readAt) return;
    try {
      await apiRequest(`/api/notifications/${encodeURIComponent(item.id)}/read`, { method: "PATCH" });
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt } : entry));
      setUnreadNotifications((count) => Math.max(0, count - 1));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not mark this notification as read.");
    }
  }

  useEffect(() => {
    if (!activeWorkspaceId) return;
    if (pathname === "/onboarding") return;
    if (verifiedProfileWorkspaceId.current === activeWorkspaceId) {
      return;
    }
    let active = true;
    setProfileGateChecking(true);
    apiRequest<{ brand: {
      name: string;
      profile: {
        industry?: string | null;
        products?: string | null;
        audience?: string | null;
        tone?: string | null;
        goals?: string[] | null;
        preferredPlatforms?: string[] | null;
      } | null;
      kit: { colors?: unknown; fonts?: unknown } | null;
    } }>("/api/brand-profile")
      .then(({ brand }) => {
        if (!active) return;
        const profile = brand.profile;
        const nonEmpty = (value: string | null | undefined) => Boolean(value?.trim());
        const hasColors = Array.isArray(brand.kit?.colors) && brand.kit.colors.some((color) => typeof color === "string" && /^#[\da-f]{6}$/i.test(color));
        const hasFonts = Array.isArray(brand.kit?.fonts) && brand.kit.fonts.some((font) => typeof font === "string" && font.trim());
        const complete = nonEmpty(brand.name) &&
          nonEmpty(profile?.industry) &&
          nonEmpty(profile?.products) &&
          nonEmpty(profile?.audience) &&
          nonEmpty(profile?.tone) &&
          Boolean(profile?.goals?.length) &&
          Boolean(profile?.preferredPlatforms?.length) &&
          hasColors &&
          hasFonts;
        if (!complete) router.replace("/onboarding");
        else {
          verifiedProfileWorkspaceId.current = activeWorkspaceId;
          setError("");
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(`Could not verify your brand setup: ${requestError instanceof Error ? requestError.message : "Unknown error."}`);
          router.replace("/onboarding");
        }
      })
      .finally(() => {
        if (active) setProfileGateChecking(false);
      });
    return () => { active = false; };
  }, [activeWorkspaceId, pathname, router]);

  useEffect(() => {
    const updateConnection = () => setConnectionOffline(!navigator.onLine);
    const handleApiConnection = (event: Event) => {
      setConnectionOffline(!(event as CustomEvent<{ online: boolean }>).detail.online);
    };
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener(apiConnectionEvent, handleApiConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener(apiConnectionEvent, handleApiConnection);
    };
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId || pathname === "/onboarding" || profileGateChecking) return;
    let active = true;
    let syncing = false;
    async function syncInstagramMedia() {
      if (syncing) return;
      syncing = true;
      try {
        const result = await apiRequest<{ deletedTargets: number }>("/api/posts/sync-instagram", { method: "POST" });
        if (!active) return;
        setInstagramSyncError("");
        if (result.deletedTargets === 0) return;
        const label = result.deletedTargets === 1 ? "Instagram post was" : "Instagram posts were";
        setInstagramSyncMessage(`${result.deletedTargets} ${label} deleted on Instagram. Other channel posts and local history are unchanged.`);
        window.dispatchEvent(new Event(postsUpdatedEvent));
      } catch (requestError) {
        if (active) {
          setInstagramSyncError(requestError instanceof Error ? requestError.message : "Could not sync Instagram post deletions.");
        }
      } finally {
        syncing = false;
      }
    }

    void syncInstagramMedia();
    const timer = window.setInterval(() => void syncInstagramMedia(), 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeWorkspaceId, pathname, profileGateChecking]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let active = true;
    apiRequest<{
      userSettings: unknown;
      workspaceSettings: unknown;
    }>("/api/theme-settings")
      .then(({ userSettings, workspaceSettings }) => {
        if (!active) return;
        if (window.localStorage.getItem(pendingThemeStorageKey) === "true") return;
        const settings = normalizeThemeSettings(userSettings ?? workspaceSettings ?? defaultThemeSettings);
        const resolvedMode = applyThemeSettings(settings);
        window.localStorage.setItem("united-technologies.theme-settings", JSON.stringify(settings));
        window.localStorage.setItem("united-technologies.theme", resolvedMode);
        window.dispatchEvent(new Event(themeChangeEvent));
      })
      .catch((requestError: unknown) => {
        if (active) setError(`Could not load appearance preferences: ${requestError instanceof Error ? requestError.message : "Unknown error."}`);
      });
    return () => { active = false; };
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.dataset.appTheme = "dark";
    } else {
      delete document.documentElement.dataset.appTheme;
    }
  }, [theme]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
        setToolSearch("");
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const visibleNavigation = useMemo(
    () => workspaceNavigation.filter((group) =>
      (group.label !== "ADMIN" || isSuperAdmin) &&
      (group.label !== "WORKSPACE ADMIN" || activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "ADMIN"),
    ),
    [activeWorkspace?.role, isSuperAdmin],
  );
  const matchingTools = useMemo(() => {
    const query = toolSearch.trim().toLocaleLowerCase();
    if (!query) return [];
    return visibleNavigation.flatMap((group) =>
      group.items
        .filter((item) => `${item.label} ${group.label} ${item.description}`.toLocaleLowerCase().includes(query))
        .map((item) => ({ ...item, group: group.label })),
    ).slice(0, 8);
  }, [toolSearch, visibleNavigation]);
  const activePage = visibleNavigation.flatMap((group) => group.items)
    .find((item) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)));
  function toggleTheme() {
    const cached = window.localStorage.getItem("united-technologies.theme-settings");
    let parsed: unknown = defaultThemeSettings;
    try {
      if (cached) parsed = JSON.parse(cached);
    } catch {
      setError("Saved appearance preferences are not valid JSON.");
      return;
    }
    const settings = normalizeThemeSettings(parsed);
    const nextSettings: ThemeSettings = { ...settings, mode: theme === "dark" ? "light" : "dark" };
    const resolvedMode = applyThemeSettings(nextSettings);
    window.localStorage.setItem("united-technologies.theme-settings", JSON.stringify(nextSettings));
    window.localStorage.setItem("united-technologies.theme", resolvedMode);
    window.localStorage.setItem(pendingThemeStorageKey, "true");
    window.localStorage.setItem(pendingThemeScopeStorageKey, "user");
    window.dispatchEvent(new Event(themeChangeEvent));
    apiRequest("/api/theme-settings", {
      method: "PUT",
      body: JSON.stringify({ scope: "user", settings: nextSettings }),
    }).then(() => {
      window.localStorage.removeItem(pendingThemeStorageKey);
      window.localStorage.removeItem(pendingThemeScopeStorageKey);
    }).catch((requestError: unknown) => {
      setError(`Could not save your theme preference: ${requestError instanceof Error ? requestError.message : "Unknown error."}`);
    });
  }

  async function logout() {
    setSigningOut(true);
    setError("");
    try {
      await apiRequest<void>("/api/auth/logout", { method: "POST" });
      window.localStorage.removeItem("united-technologies.workspaceId");
      window.localStorage.removeItem("united-technologies.brandId");
      router.replace("/login");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not sign out.");
      setSigningOut(false);
    }
  }

  return (
    <div className={`app-shell${sidebarResizing ? " sidebar-resizing" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`} style={{ "--sidebar-width": `${sidebarCollapsed ? 58 : sidebarWidth}px` } as CSSProperties}>
      {mobileOpen && <button type="button" className="mobile-sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar${mobileOpen ? " sidebar-open" : ""}`}>
        <div className="sidebar-brand-row">
          <button className="sidebar-brand sidebar-collapse-button" type="button" aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} aria-pressed={sidebarCollapsed}
            onMouseEnter={(event) => showSidebarTooltip("Expand navigation", event.currentTarget)}
            onMouseLeave={() => setSidebarTooltip(null)}
            onFocus={(event) => showSidebarTooltip("Expand navigation", event.currentTarget)}
            onBlur={() => setSidebarTooltip(null)}
            onClick={() => {
            const next = !sidebarCollapsed;
            setSidebarCollapsed(next);
            setSidebarTooltip(null);
            if (!next) {
              setSidebarWidth(274);
              window.localStorage.setItem("united-technologies.sidebar-width", "274");
            }
            window.localStorage.setItem("united-technologies.sidebar-collapsed", String(next));
          }}>{logo}</button>
          <button className="mobile-close-button" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={21} strokeWidth={2.2} /></button>
        </div>
        <div className="workspace-tool-search-wrap">
          <label className="workspace-tool-search">
            <Search size={16} strokeWidth={2} aria-hidden="true" />
            <input type="search" value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} placeholder="Find a tool" aria-label="Find a workspace tool" aria-controls="workspace-tool-results" />
          </label>
          {toolSearch.trim() && <nav className="workspace-tool-results" id="workspace-tool-results" aria-label="Matching workspace tools">
            {matchingTools.length ? matchingTools.map((item) => <Link key={item.href} href={item.href} onClick={() => { setToolSearch(""); setMobileOpen(false); }}><item.icon size={16} aria-hidden="true" /><span>{item.label}</span><small>{item.group}</small></Link>) : <p>No matching tools</p>}
          </nav>}
        </div>
        <div className="sidebar-navigation-wrap">
          <nav ref={navigationRef} id="workspace-navigation" className="app-navigation" aria-label="Workspace navigation">
            {visibleNavigation.map((group) => (
              <div className="nav-group" key={group.label}>
                <p className="sidebar-label">{group.label}</p>
                {group.items.map((item) => {
                  const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                  return (
                    <Link key={item.href} className={`nav-item${active ? " active" : ""}`} href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined}
                      onMouseEnter={(event) => showSidebarTooltip(item.label, event.currentTarget)}
                      onMouseLeave={() => setSidebarTooltip(null)}
                      onFocus={(event) => showSidebarTooltip(item.label, event.currentTarget)}
                      onBlur={() => setSidebarTooltip(null)}
                      onClick={() => { setMobileOpen(false); setSidebarTooltip(null); }}>
                      <item.icon className="nav-icon" size={20} strokeWidth={2.1} aria-hidden="true" /><span className="nav-item-label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-scroll-track">
            <div
              ref={navigationThumbRef}
              className="sidebar-scroll-thumb"
              role="scrollbar"
              aria-label="Workspace navigation scroll"
              aria-controls="workspace-navigation"
              aria-orientation="vertical"
              aria-valuemin={0}
              aria-valuemax={navigationOverflow}
              aria-valuenow={Math.round(navigationMetrics.scrollTop)}
              tabIndex={0}
              style={{ height: `${navigationThumbSize}%`, top: `${navigationThumbTop}%` }}
              onPointerDown={(event) => {
                event.preventDefault();
                navigationDragStart.current = { pointerY: event.clientY, scrollTop: navigationRef.current?.scrollTop ?? 0 };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => { if (navigationDragStart.current) moveNavigationThumb(event.clientY); }}
              onPointerUp={() => { navigationDragStart.current = null; }}
              onPointerCancel={() => { navigationDragStart.current = null; }}
              onKeyDown={(event) => {
                const navigation = navigationRef.current;
                if (!navigation) return;
                const step = event.key === "PageDown" || event.key === "PageUp" ? navigation.clientHeight * 0.8 : 40;
                if (event.key === "ArrowDown" || event.key === "PageDown") navigation.scrollBy({ top: step });
                else if (event.key === "ArrowUp" || event.key === "PageUp") navigation.scrollBy({ top: -step });
                else if (event.key === "Home") navigation.scrollTo({ top: 0 });
                else if (event.key === "End") navigation.scrollTo({ top: navigation.scrollHeight });
                else return;
                event.preventDefault();
              }}
            />
          </div>
        </div>
        {sidebarCollapsed && sidebarTooltip && <span className="sidebar-hover-tooltip" role="tooltip" style={{ top: sidebarTooltip.top }}>{sidebarTooltip.label}</span>}
        <button className="sidebar-theme-toggle" type="button" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} aria-pressed={theme === "dark"} onClick={toggleTheme}>
          <SunMoon size={20} strokeWidth={2.1} aria-hidden="true" />
          <span>Theme</span>
          <span className="theme-mode">{theme === "dark" ? "Dark" : "Light"}</span>
          <span className="theme-switch" aria-hidden="true"><span /></span>
        </button>
      </aside>
      <button
        type="button"
        className="sidebar-resize-handle"
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={220}
        aria-valuemax={360}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={(event) => { event.preventDefault(); setSidebarResizing(true); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (sidebarResizing && event.buttons > 0) resizeSidebar(event.clientX); }}
        onPointerUp={saveSidebarWidth}
        onPointerCancel={saveSidebarWidth}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const next = Math.min(360, Math.max(220, sidebarWidth + (event.key === "ArrowRight" ? 12 : -12)));
          setSidebarWidth(next);
          window.localStorage.setItem("united-technologies.sidebar-width", String(next));
        }}
      />
      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="topbar-context">
            <button type="button" className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={21} strokeWidth={2.2} /></button>
            <span className="topbar-page-title">{activePage?.label ?? "Workspace"}</span>
          </div>
          <div className="topbar-actions">
            <div className="topbar-popover-wrap">
              <button type="button" className="icon-button notification-button" title="Publishing and workspace notifications" aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ""}`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}>
                <Bell size={19} strokeWidth={2} aria-hidden="true" />
                {unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
              </button>
              {notificationsOpen && <section className="topbar-popover notification-popover" aria-label="Notifications">
                <div className="notification-popover-heading"><strong>Notifications</strong><span>{unreadNotifications} unread</span></div>
                {notifications.length ? <div className="notification-list">{notifications.map((item) => (
                  <button type="button" key={item.id} className={`notification-item${item.readAt ? "" : " notification-unread"}`} onClick={() => void markNotificationRead(item)}>
                    <strong>{item.title}</strong><span>{item.body}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                  </button>
                ))}</div> : <p className="notification-empty">Publishing and workspace updates will appear here.</p>}
              </section>}
            </div>
            <div className="topbar-popover-wrap">
              <button type="button" className="user-menu-button" aria-expanded={userMenuOpen} onClick={() => {
                setUserMenuOpen((current) => !current);
                setToolSearch("");
              }}>
                <span className="user-avatar">{user?.name.slice(0, 1).toUpperCase() ?? "P"}</span>
                <span className="user-menu-label">
                  <strong>{user?.email ?? "Account email"}</strong>
                  <small>{user?.name ?? "Account name"}</small>
                </span>
                <ChevronDown size={17} strokeWidth={2.1} aria-hidden="true" />
              </button>
              {userMenuOpen && <div className="topbar-popover user-popover">
                <Link href="/dashboard/settings" onClick={() => setUserMenuOpen(false)}>Account & appearance</Link>
                <button type="button" onClick={logout} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
              </div>}
            </div>
          </div>
        </header>
        {pathname === "/dashboard/billing" && activeWorkspace?.subscriptionStatus === "trialing" && <section className="billing-trial-card">
          <span><strong>{activeWorkspace.trialDaysRemaining} {activeWorkspace.trialDaysRemaining === 1 ? "day" : "days"} left in your trial</strong><small>Your workspace trial ends {new Date(activeWorkspace.trialEndsAt).toLocaleDateString()}.</small></span>
          <Link className="button button-primary" href="/pricing">Compare plans <ArrowRight size={15} aria-hidden="true" /></Link>
        </section>}
        {connectionOffline && <div className="notice notice-error" role="status">
          <span>You appear to be offline or the API is temporarily unavailable.</span>
          <button type="button" onClick={() => window.location.reload()}>Retry connection</button>
        </div>}
        {instagramSyncMessage && <div className="notice notice-gold" role="status">{instagramSyncMessage}</div>}
        {instagramSyncError && (pathname === "/dashboard/posts" || pathname === "/dashboard/social-accounts") && <div className="shell-error" role="alert">Instagram deletion sync failed: {instagramSyncError}</div>}
        {error && <div className="shell-error" role="alert">{error}</div>}
        {loading || (pathname !== "/onboarding" && profileGateChecking) ? (
          <section className="dashboard-content"><p className="loading-label">Preparing your workspace…</p></section>
        ) : pathname.startsWith("/dashboard/admin-") && !isSuperAdmin ? (
          <section className="dashboard-content"><div className="notice notice-error" role="alert">You do not have permission to access this area.</div></section>
        ) : children}
      </main>
    </div>
  );
}

export function AppSectionPage() {
  const pathname = usePathname();
  const item = appNavItems.find((navItem) => navItem.href === pathname);
  if (!item) {
    return (
      <section className="dashboard-content section-page-content">
        <p className="eyebrow">WORKSPACE</p>
        <h1>Page not found</h1>
        <p className="dashboard-lead">This workspace page does not exist. Check the address or return to your dashboard.</p>
        <Link className="button button-primary" href="/dashboard">Open dashboard</Link>
      </section>
    );
  }
  const pageContent = item.pageContent;
  const group = appNavigation.find((navigationGroup) =>
    navigationGroup.items.some((navigationItem) => navigationItem.href === item.href),
  );
  return (
    <section className="dashboard-content section-page-content">
      <header className="section-page-header">
        <div className="section-page-title">
          <span className="section-page-icon"><item.icon size={25} strokeWidth={2} aria-hidden="true" /></span>
          <div>
            <p className="eyebrow">{group?.label ?? "WORKSPACE"}</p>
            <h1>{item.label}</h1>
          </div>
        </div>
        <p className="dashboard-lead">{item.description}</p>
        {pageContent && (
          <Link className="button button-gold" href={pageContent.actionHref}>
            {pageContent.actionLabel}
          </Link>
        )}
      </header>
      {pageContent ? (
        <div className="section-page-grid">
          {pageContent.panels.map((panel, index) => (
            <article className="section-page-card" key={panel.title}>
              <span className="section-page-card-index">{String(index + 1).padStart(2, "0")}</span>
              <h2>{panel.title}</h2>
              <p>{panel.description}</p>
              {panel.linkHref && panel.linkLabel && (
                <Link className="section-page-card-link" href={panel.linkHref}>
                  {panel.linkLabel}<ArrowRight size={14} aria-hidden="true" />
                </Link>
              )}
            </article>
          ))}
        </div>
      ) : (
        <article className="section-empty-state">
          <h2>{item.label} workspace</h2>
          <p>{item.description ?? "This workspace section is being prepared."}</p>
        </article>
      )}
      {pageContent?.availabilityNote && (
        <aside className="section-page-note" role="note">
          <span aria-hidden="true">i</span>
          <p>{pageContent.availabilityNote}</p>
        </aside>
      )}
    </section>
  );
}
