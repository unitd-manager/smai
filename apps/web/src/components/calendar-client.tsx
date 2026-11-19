"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { apiRequest, postsUpdatedEvent } from "@/lib/api";
import { getDateTimeInputValue, localDateTimeToIso } from "@/lib/timezone";

type CalendarPost = {
  id: string;
  title: string | null;
  status: string;
  scheduledAt: string | null;
  timezone: string;
  createdAt: string;
  targets: Array<{ platform: string; status: string; publishedAt: string | null }>;
};

const calendarDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});
const calendarFullDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "full",
  timeZone: "UTC",
});

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCalendarDate(date: Date, formatter = calendarDateFormatter) {
  const calendarDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
  return formatter.format(calendarDate);
}

function postDayKey(post: CalendarPost) {
  const timestamp = post.scheduledAt ?? post.targets.find((target) => target.publishedAt)?.publishedAt ?? post.createdAt;
  const timezone = post.scheduledAt ? post.timezone : undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function postTimeLabel(post: CalendarPost) {
  if (post.scheduledAt) {
    return new Date(post.scheduledAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: post.timezone,
    });
  }
  const publishedAt = post.targets.find((target) => target.publishedAt)?.publishedAt;
  return publishedAt
    ? `Published ${new Date(publishedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : "Draft";
}

export function CalendarClient() {
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [month, setMonth] = useState(() => new Date(2000, 0, 1));
  const [today, setToday] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day">("month");
  const [focusDate, setFocusDate] = useState("");
  const [draggedPostId, setDraggedPostId] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const allPosts: CalendarPost[] = [];
      let offset = 0;
      while (true) {
        const response = await apiRequest<{ posts: CalendarPost[] }>(`/api/posts?brandId=all&limit=500&offset=${offset}`);
        allPosts.push(...response.posts);
        if (response.posts.length < 500) break;
        offset += response.posts.length;
      }
      setPosts(allPosts);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load calendar posts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = new Date();
      setToday(now);
      setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      setFocusDate(dayKey(now));
      void loadPosts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPosts]);

  useEffect(() => {
    const refreshPosts = () => void loadPosts();
    window.addEventListener(postsUpdatedEvent, refreshPosts);
    return () => window.removeEventListener(postsUpdatedEvent, refreshPosts);
  }, [loadPosts]);

  const platformOptions = useMemo(() => [...new Set(posts.flatMap((post) => post.targets.map((target) => target.platform)))].sort(), [posts]);
  const statusOptions = useMemo(() => [...new Set(posts.map((post) => post.status))].sort(), [posts]);
  const filteredPosts = useMemo(() => posts
    .filter((post) => statusFilter === "all" || post.status === statusFilter)
    .map((post) => platformFilter === "all"
      ? post
      : { ...post, targets: post.targets.filter((target) => target.platform === platformFilter) })
    .filter((post) => platformFilter === "all" || post.targets.length > 0),
  [platformFilter, posts, statusFilter]);

  const postsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarPost[]>();
    for (const post of filteredPosts) {
      const key = postDayKey(post);
      const list = grouped.get(key) ?? [];
      list.push(post);
      grouped.set(key, list);
    }
    return grouped;
  }, [filteredPosts]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const visibleDays = useMemo(() => {
    if (!focusDate || calendarView === "month") return days;
    const focus = new Date(`${focusDate}T12:00:00`);
    if (calendarView === "day") return [focus];
    const start = new Date(focus);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [calendarView, days, focusDate]);

  const monthLabel = calendarView === "month"
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1, 12)))
    : calendarView === "day" && focusDate
      ? formatCalendarDate(new Date(`${focusDate}T12:00:00`), calendarFullDateFormatter)
      : focusDate
        ? `${formatCalendarDate(visibleDays[0])} – ${formatCalendarDate(visibleDays[6])}`
        : "This week";
  const todayKey = today ? dayKey(today) : "";
  const selectedDate = selectedDay ? new Date(`${selectedDay}T12:00:00Z`) : null;
  const selectedPosts = selectedDay ? postsByDay.get(selectedDay) ?? [] : [];

  function moveCalendar(direction: -1 | 1) {
    if (calendarView === "month") {
      setMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
      return;
    }
    const current = new Date(`${focusDate || todayKey}T12:00:00`);
    current.setDate(current.getDate() + direction * (calendarView === "week" ? 7 : 1));
    setFocusDate(dayKey(current));
    setMonth(new Date(current.getFullYear(), current.getMonth(), 1));
  }

  async function reschedulePost(postId: string, targetDate: string) {
    const post = posts.find((item) => item.id === postId);
    setDraggedPostId("");
    if (!post?.scheduledAt || post.status !== "SCHEDULED") {
      setError("Only scheduled posts can be moved on the calendar.");
      return;
    }
    const currentLocal = getDateTimeInputValue(new Date(post.scheduledAt), post.timezone);
    const scheduledAt = localDateTimeToIso(`${targetDate}T${currentLocal.slice(11, 16)}`, post.timezone);
    if (!scheduledAt) {
      setError("That local time does not exist in the post's time zone because of a daylight-saving change.");
      return;
    }
    try {
      await apiRequest(`/api/posts/${encodeURIComponent(post.id)}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({ scheduledAt, timezone: post.timezone }),
      });
      setError("");
      await loadPosts();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not reschedule this post.");
    }
  }

  useEffect(() => {
    if (!selectedDay) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedDay(null);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedDay]);

  return (
    <section className="dashboard-content calendar-page">
      <p className="eyebrow">YOUR STUDIO · PUBLISH</p>
      <h1>Publishing calendar</h1>
      <p className="dashboard-lead">See scheduled posts and publishing history by date. Choose a day to start a post with its date prefilled.</p>
      <div className="calendar-toolbar">
        <div className="calendar-month-controls">
          <button type="button" aria-label="Previous calendar period" onClick={() => moveCalendar(-1)}><ChevronLeft size={19} /></button>
          <h2>{monthLabel}</h2>
          <button type="button" aria-label="Next calendar period" onClick={() => moveCalendar(1)}><ChevronRight size={19} /></button>
          <button type="button" className="calendar-today-button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setFocusDate(dayKey(now)); }}>Today</button>
        </div>
        <div className="calendar-view-switch" role="group" aria-label="Calendar view">
          {(["month", "week", "day"] as const).map((view) => <button key={view} type="button" aria-pressed={calendarView === view} className={calendarView === view ? "is-active" : ""} onClick={() => setCalendarView(view)}>{view[0]!.toUpperCase() + view.slice(1)}</button>)}
        </div>
        <Link className="button button-gold" href={`/dashboard/create?date=${todayKey}`}><Plus size={17} />Create a post</Link>
      </div>
      <div className="calendar-filters">
        <label>Platform
          <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
            <option value="all">All platforms</option>
            {platformOptions.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
          </select>
        </label>
        <label>Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status.toLowerCase().replaceAll("_", " ")}</option>)}
          </select>
        </label>
        {(platformFilter !== "all" || statusFilter !== "all") && <button type="button" onClick={() => { setPlatformFilter("all"); setStatusFilter("all"); }}>Clear filters</button>}
        <span className="calendar-filter-count">{filteredPosts.length} {filteredPosts.length === 1 ? "post" : "posts"}</span>
      </div>
      <p className="calendar-drag-hint">Drag a scheduled post to another day to update its queued publishing time. Its current local time and business time zone are kept.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="calendar-board-scroll">
        <div className={`calendar-board calendar-board-${calendarView}`} aria-label={monthLabel}>
          {(calendarView === "day" ? [new Intl.DateTimeFormat("en", { weekday: "long" }).format(visibleDays[0]!)] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((weekday) => <div className="calendar-weekday" key={weekday}>{weekday}</div>)}
          {visibleDays.map((date) => {
          const key = dayKey(date);
          const dayPosts = postsByDay.get(key) ?? [];
          const inMonth = calendarView !== "month" || date.getMonth() === month.getMonth();
          return (
            <article className={`calendar-day${inMonth ? "" : " calendar-day-outside"}${key === todayKey ? " calendar-day-today" : ""}${draggedPostId ? " calendar-day-drop-target" : ""}`} key={key} onDragOver={(event) => { if (draggedPostId) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (draggedPostId) void reschedulePost(draggedPostId, key); }}>
              <div className="calendar-day-heading">
                <button type="button" className="calendar-day-date" aria-label={`Focus ${formatCalendarDate(date)}`} onClick={() => setFocusDate(key)}>{date.getDate()}</button>
                <Link className="calendar-add-day" href={`/dashboard/create?date=${key}`} aria-label={`Create a post for ${formatCalendarDate(date)}`}><Plus size={14} aria-hidden="true" /><span>Add</span></Link>
              </div>
              <div className="calendar-day-events">
                {dayPosts.slice(0, 3).map((post) => (
                  <Link draggable={post.status === "SCHEDULED"} onDragStart={() => setDraggedPostId(post.id)} onDragEnd={() => setDraggedPostId("")} className={`calendar-event calendar-event-${post.status.toLowerCase().replaceAll("_", "-")}`} href="/dashboard/posts" key={post.id}>
                    <span className="calendar-event-time">{post.scheduledAt ? new Date(post.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: post.timezone }) : "Published"}</span>
                    <strong>{post.title ?? "Untitled post"}</strong>
                    <small>{post.targets.map((target) => target.platform).join(", ")}</small>
                  </Link>
                ))}
                {dayPosts.length > 3 && <button type="button" className="calendar-more-events" onClick={() => setSelectedDay(key)} aria-label={`View all ${dayPosts.length} posts on ${formatCalendarDate(date)}`}>+{dayPosts.length - 3} more</button>}
              </div>
            </article>
          );
          })}
        </div>
      </div>
      {loading && <p className="loading-label" role="status">Loading scheduled posts…</p>}
      {!loading && posts.length === 0 && <p className="calendar-empty-note">No posts yet. The calendar is ready—choose any date above to draft and schedule your first post.</p>}
      {!loading && posts.length > 0 && filteredPosts.length === 0 && <p className="calendar-empty-note">No posts match these filters. Clear the filters to see all calendar activity.</p>}
      {selectedDay && selectedDate && (
        <div className="design-lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDay(null); }}>
          <section className="calendar-day-detail" role="dialog" aria-modal="true" aria-labelledby="calendar-day-detail-title">
            <header>
              <div>
                <h2 id="calendar-day-detail-title">{formatCalendarDate(selectedDate, calendarFullDateFormatter)}</h2>
                <p>{selectedPosts.length} {selectedPosts.length === 1 ? "post" : "posts"}</p>
              </div>
              <button type="button" aria-label="Close day details" onClick={() => setSelectedDay(null)}><X size={20} /></button>
            </header>
            <div className="calendar-day-detail-list">
              {selectedPosts.map((post) => (
                <Link className="calendar-day-detail-post" href="/dashboard/posts" key={post.id} onClick={() => setSelectedDay(null)}>
                  <strong>{post.title ?? "Untitled post"}</strong>
                  <span>
                    <time dateTime={post.scheduledAt ?? post.targets.find((target) => target.publishedAt)?.publishedAt ?? post.createdAt}>{postTimeLabel(post)}</time>
                    <span>{post.status.toLowerCase().replaceAll("_", " ")}</span>
                  </span>
                  <small>{post.targets.map((target) => `${target.platform} · ${target.status.toLowerCase().replaceAll("_", " ")}`).join(" · ") || "No platforms selected"}</small>
                </Link>
              ))}
            </div>
            <footer className="calendar-day-detail-actions">
              <button type="button" onClick={() => setSelectedDay(null)}>Close</button>
              <Link className="button button-gold" href={`/dashboard/create?date=${selectedDay}`} onClick={() => setSelectedDay(null)}><Plus size={16} />Create for this day</Link>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
