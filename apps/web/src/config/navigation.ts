import {
  Building2,
  CalendarDays,
  CalendarRange,
  ChartNoAxesColumnIncreasing,
  CircleCheck,
  Activity,
  Ear,
  FileText,
  FolderOpen,
  Images,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Mail,
  Brain,
  Megaphone,
  Palette,
  Send,
  Settings,
  Search,
  Share2,
  Sparkles,
  Store,
  Upload,
  UserRound,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

export type AppNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  pageContent?: {
    actionLabel: string;
    actionHref: string;
    panels: Array<{
      title: string;
      description: string;
      linkLabel?: string;
      linkHref?: string;
    }>;
    availabilityNote?: string;
  };
};

export type AppNavGroup = {
  label: string;
  items: AppNavItem[];
};

export const appNavigation: AppNavGroup[] = [
  {
    label: "CREATE",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "See publishing totals, upcoming work, competitor signals, and your product shortcuts." },
      { label: "Create", href: "/dashboard/create", icon: Sparkles, description: "Turn a brief into on-brand social content and creative assets." },
      {
        label: "Content Plans",
        href: "/dashboard/content-plans",
        icon: CalendarRange,
        description: "Shape campaign ideas into a clear, reviewable publishing plan.",
        pageContent: {
          actionLabel: "Start a content brief",
          actionHref: "/dashboard/create",
          panels: [
            { title: "Set a campaign goal", description: "Start with what the campaign should achieve and who it needs to reach." },
            { title: "Choose your content mix", description: "Build a practical mix of posts, carousels, stories and video concepts." },
            { title: "Review before scheduling", description: "Keep ideas as drafts while you refine the message and publishing rhythm.", linkLabel: "Open posts and queue", linkHref: "/dashboard/posts" },
          ],
          availabilityNote: "Create and save content briefs today. A separate calendar-based plan builder is not connected yet.",
        },
      },
      { label: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone, description: "Generate coordinated content sets and save a reviewable campaign plan." },
    ],
  },
  {
    label: "LIBRARY",
    items: [
      { label: "Gallery", href: "/dashboard/gallery", icon: FolderOpen, description: "Collect the designs, content, and videos you have moved out of Media Library." },
      { label: "Content", href: "/dashboard/content", icon: FileText, description: "Browse and manage generated ideas, captions and scripts." },
      { label: "Content Sets", href: "/dashboard/content-sets", icon: ListChecks, description: "Reuse saved multi-format and platform-specific content groups." },
      { label: "Autopilot", href: "/dashboard/instagram-autopilot", icon: Sparkles, description: "Generate weekly posts from your brand profile and send them for email approval." },
      { label: "Saved designs", href: "/dashboard/designs", icon: Images, description: "Review each visual beside its original post brief; edit the artwork text, compare styles, and restore versions." },
      {
        label: "Video Studio",
        href: "/dashboard/videos",
        icon: Video,
        description: "Create product promotions and avatar videos with Magic Hour, or use the optional local animation workflow.",
        pageContent: {
          actionLabel: "Create a product or avatar video",
          actionHref: "/dashboard/videos",
          panels: [
            { title: "Choose a video type", description: "Create a product promotion or use a face photo and script for an avatar video." },
            { title: "Review the result", description: "Preview the generated video, save it to your Gallery, and prepare it for Instagram." },
            { title: "Use the local alternative", description: "Create a separate animated-scene video without an external video-generation provider." },
          ],
          availabilityNote: "Magic Hour generation requires MAGIC_HOUR_API_KEY. The optional local animation flow uses configured script generation and local Piper narration.",
        },
      },
      {
        label: "Media Library",
        href: "/dashboard/media-library",
        icon: Images,
        description: "Find and organize the creative work saved for your brand.",
        pageContent: {
          actionLabel: "Browse saved designs",
          actionHref: "/dashboard/designs",
          panels: [
            { title: "Saved designs", description: "Review design variations created from your content briefs.", linkLabel: "Open designs", linkHref: "/dashboard/designs" },
            { title: "Content drafts", description: "Find captions, concepts and scripts in your content library.", linkLabel: "Open content", linkHref: "/dashboard/content" },
            { title: "Reusable starting points", description: "Use a template to give your next campaign a consistent visual direction.", linkLabel: "Browse templates", linkHref: "/dashboard/templates" },
          ],
          availabilityNote: "Browse generated designs, scripts and rendered videos alongside files imported from your device.",
        },
      },
      { label: "Import files", href: "/dashboard/import-files", icon: Upload, description: "Bring images, videos, and PDFs from your device into this workspace." },
      { label: "Templates", href: "/dashboard/templates", icon: Palette, description: "Explore reusable layouts for every campaign." },
    ],
  },
  {
    label: "PUBLISH",
    items: [
      { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays, description: "See your publishing schedule in one place." },
      { label: "Publishing", href: "/dashboard/posts", icon: Send, description: "Review drafts, approvals, scheduled posts and publishing activity." },
      { label: "Social Accounts", href: "/dashboard/social-accounts", icon: Share2, description: "Connect and manage your social channels." },
      {
        label: "Post Approvals",
        href: "/dashboard/approvals",
        icon: CircleCheck,
        description: "Review scheduled content and captions across your selected social channels.",
        pageContent: {
          actionLabel: "Review the post queue",
          actionHref: "/dashboard/posts",
          panels: [
            { title: "Prepare a draft", description: "Create content and save it as a draft while the team reviews the message.", linkLabel: "Create content", linkHref: "/dashboard/create" },
            { title: "Check publishing details", description: "Review the caption, channel, timing and status in the posts queue.", linkLabel: "Open posts and queue", linkHref: "/dashboard/posts" },
            { title: "Keep approval explicit", description: "Only mark work ready after the people responsible have reviewed it." },
          ],
          availabilityNote: "Review posts here across your selected channels. Live publishing availability depends on each connected platform.",
        },
      },
    ],
  },
  {
    label: "GROW",
    items: [
      { label: "Marketing Brain", href: "/dashboard/marketing-brain", icon: Brain, description: "See clear, evidence-based ideas for your next marketing action." },
      { label: "Competitor Intelligence", href: "/dashboard/competitors", icon: Search, description: "Compare competitors using sourced observations and turn evidence into differentiated content and campaign actions." },
      {
        label: "Inbox",
        href: "/dashboard/inbox",
        icon: Inbox,
        description: "Read and reply to Instagram Direct and Facebook Page messages in one workspace inbox.",
        pageContent: {
          actionLabel: "Open Inbox",
          actionHref: "/dashboard/inbox",
          panels: [
            { title: "Read conversations", description: "Review recent Instagram Direct and Facebook Messenger threads for connected accounts." },
            { title: "Reply from the workspace", description: "Send replies where Meta has granted messaging access and the conversation is eligible." },
            { title: "Reconnect for messaging access", description: "Approve messaging permissions when reconnecting each Instagram account or Facebook Page.", linkLabel: "Manage social accounts", linkHref: "/dashboard/social-accounts" },
          ],
          availabilityNote: "Inbox loads messages from Meta when opened and refreshes every two minutes while open. Meta app review and business verification may be required for customer accounts.",
        },
      },
      {
        label: "Analytics",
        href: "/dashboard/analytics",
        icon: ChartNoAxesColumnIncreasing,
        description: "Understand what is working across your content and publishing activity.",
        pageContent: {
          actionLabel: "Review publishing activity",
          actionHref: "/dashboard/posts",
          panels: [
            { title: "Start with published work", description: "Review post statuses and publishing results before comparing performance.", linkLabel: "Open posts and queue", linkHref: "/dashboard/posts" },
            { title: "Compare by channel", description: "Use the platform and format of each post to make useful comparisons." },
            { title: "Keep the source clear", description: "Only platform-connected metrics should be used for performance reporting." },
          ],
          availabilityNote: "Live social performance data is not connected. This page does not display simulated metrics.",
        },
      },
      {
        label: "Listening",
        href: "/dashboard/listening",
        icon: Ear,
        description: "Monitor your connected Instagram account’s recent posts, likes, and comments.",
        pageContent: {
          actionLabel: "Open Instagram listening",
          actionHref: "/dashboard/listening",
          panels: [
            { title: "Review recent posts", description: "See post dates, formats, captions, and available likes and comments." },
            { title: "Read post comments", description: "Review comments on posts from the connected Instagram Professional account." },
            { title: "Reconnect for access", description: "Approve comment access during Instagram connection to load comment threads.", linkLabel: "Manage Instagram", linkHref: "/dashboard/social-accounts/instagram" },
          ],
          availabilityNote: "Instagram account activity refreshes every five minutes while Listening is open. Facebook monitoring and public competitor monitoring are not enabled.",
        },
      },
    ],
  },
  {
    label: "SETTINGS",
    items: [
      { label: "Brand Kit & Profile", href: "/onboarding", icon: Building2, description: "Save your services, audience, brand voice, colors, logo, country, and publishing preferences." },
      {
        label: "Team",
        href: "/dashboard/team",
        icon: Users,
        description: "Keep workspace collaboration and responsibilities organized.",
      },
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
        description: "Manage publishing, appearance, brand, and account preferences.",
        pageContent: {
          actionLabel: "Open workspace settings",
          actionHref: "/dashboard/settings",
          panels: [
            { title: "Publishing", description: "Choose the time zone used for future scheduled posts and videos.", linkLabel: "Set your time zone", linkHref: "/dashboard/settings/publishing" },
            { title: "Appearance", description: "Set a readable color theme, layout, and font pairing.", linkLabel: "Choose an appearance", linkHref: "/dashboard/settings/appearance" },
            { title: "Account", description: "Review account details and update sign-in security.", linkLabel: "Manage account", linkHref: "/dashboard/settings/account" },
          ],
          availabilityNote: "Notification delivery is not configured for this installation.",
        },
      },
    ],
  },
  {
    label: "WORKSPACE ADMIN",
    items: [
      { label: "System Status", href: "/dashboard/system-status", icon: Activity, description: "Check service health and workspace publishing connections." },
    ],
  },
  {
    label: "ADMIN",
    items: [
      {
        label: "Customers",
        href: "/dashboard/admin-customers",
        icon: UserRound,
        description: "Review customer workspaces and account lifecycle information.",
        pageContent: {
          actionLabel: "Review product plans",
          actionHref: "/dashboard/admin-plans",
          panels: [
            { title: "Workspace directory", description: "Customer workspace records and their account status belong in this view." },
            { title: "Plan assignment", description: "Plan definitions can be reviewed from the administration plans page.", linkLabel: "Open plans", linkHref: "/dashboard/admin-plans" },
            { title: "Support requests", description: "Website enquiries and demo requests are handled in their own queue.", linkLabel: "Open requests", linkHref: "/dashboard/admin-requests" },
          ],
          availabilityNote: "Customer administration data is not connected to this installation yet.",
        },
      },
      {
        label: "Plans",
        href: "/dashboard/admin-plans",
        icon: ListChecks,
        description: "Review the product plan structure and service limits.",
        pageContent: {
          actionLabel: "View public pricing",
          actionHref: "/pricing",
          panels: [
            { title: "Plan catalog", description: "Keep plan names, included features and limits consistent with the public pricing page.", linkLabel: "Open pricing page", linkHref: "/pricing" },
            { title: "Customer subscriptions", description: "Subscription assignment and changes require a configured billing provider." },
            { title: "Usage limits", description: "Document limits clearly before they are applied to customer workspaces." },
          ],
          availabilityNote: "Administrative plan editing and billing-provider controls are not configured.",
        },
      },
      {
        label: "Contact and Demo Requests",
        href: "/dashboard/admin-requests",
        icon: Mail,
        description: "Review enquiries submitted through the public contact experience.",
        pageContent: {
          actionLabel: "View public contact page",
          actionHref: "/contact",
          panels: [
            { title: "Contact enquiries", description: "Capture the message, contact details and follow-up status for each request." },
            { title: "Demo requests", description: "Keep demo scheduling and customer questions together for a clear response process." },
            { title: "Public form", description: "Review the information visitors are asked to provide.", linkLabel: "Open contact page", linkHref: "/contact" },
          ],
          availabilityNote: "The admin request inbox is not connected to a request-management API yet.",
        },
      },
      {
        label: "Resellers",
        href: "/dashboard/admin-resellers",
        icon: Store,
        description: "Organize reseller relationships and the workspaces they support.",
        pageContent: {
          actionLabel: "Review customer workspaces",
          actionHref: "/dashboard/admin-customers",
          panels: [
            { title: "Partner directory", description: "A reseller record should identify the partner, contact and relationship status." },
            { title: "Workspace ownership", description: "Track which customer workspaces are supported by each partner." },
            { title: "Plan alignment", description: "Keep partner offerings consistent with the available product plans.", linkLabel: "Review plans", linkHref: "/dashboard/admin-plans" },
          ],
          availabilityNote: "Reseller records and partner administration are not configured yet.",
        },
      },
    ],
  },
];

export const appNavItems = appNavigation.flatMap((group) => group.items);

function workspaceGroup(label: string, hrefs: string[]): AppNavGroup {
  const items = hrefs.map((href) => {
    const item = appNavItems.find((candidate) => candidate.href === href);
    if (!item) throw new Error(`Missing navigation item for ${href}.`);
    return item;
  });
  return { label, items };
}

export const workspaceNavigation: AppNavGroup[] = [
  workspaceGroup("WORKSPACE", ["/dashboard"]),
  {
    label: "AGENCY",
    items: [{
      label: "Client workspaces",
      href: "/dashboard/agency",
      icon: Users,
      description: "Manage separate client brands and switch into each client workspace.",
    }],
  },
  workspaceGroup("CREATE", ["/dashboard/create", "/dashboard/campaigns", "/dashboard/videos"]),
  workspaceGroup("LIBRARY", ["/dashboard/templates", "/dashboard/gallery", "/dashboard/designs", "/dashboard/content", "/dashboard/instagram-autopilot"]),
  workspaceGroup("PUBLISH", ["/dashboard/posts", "/dashboard/calendar", "/dashboard/social-accounts"]),
  workspaceGroup("GROW", ["/dashboard/marketing-brain", "/dashboard/competitors", "/dashboard/analytics", "/dashboard/inbox", "/dashboard/listening"]),
  workspaceGroup("SETTINGS", ["/onboarding", "/dashboard/team", "/dashboard/settings"]),
  ...appNavigation.filter((group) => group.label === "WORKSPACE ADMIN" || group.label === "ADMIN"),
];

export function getNavItemByPath(path: string): AppNavItem | undefined {
  return appNavItems.find((item) => item.href === path);
}
