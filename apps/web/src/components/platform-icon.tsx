const platformColors: Record<string, string> = {
  Instagram: "#E4405F",
  "Facebook Pages": "#0866FF",
  YouTube: "#FF0033",
  TikTok: "#111111",
  X: "#111111",
  LinkedIn: "#0A66C2",
  Pinterest: "#BD081C",
  Threads: "#111111",
  Reddit: "#FF4500",
  Telegram: "#24A1DE",
  Tumblr: "#35465C",
  "Google Business Profile": "#4285F4",
  ShareChat: "#00A9A5",
  Moj: "#E52B50",
};

function PlatformMark({ platform }: { platform: string }) {
  switch (platform) {
    case "Instagram":
      return <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.8" r=".8" fill="currentColor" stroke="none" /></>;
    case "Facebook Pages":
      return <path fill="currentColor" stroke="none" d="M13.5 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.3H7.6V13h2.7v8z" />;
    case "YouTube":
      return <><rect x="2.5" y="5" width="19" height="14" rx="4" fill="currentColor" stroke="none" /><path d="m10 9 5 3-5 3z" fill="white" stroke="none" /></>;
    case "TikTok":
      return <path fill="currentColor" stroke="none" d="M14.2 3h3.1c.2 1.8 1.2 3.3 3.2 4v3.2a9.2 9.2 0 0 1-3.2-1.1v5.5a6.1 6.1 0 1 1-6.1-6.1c.4 0 .8 0 1.2.1v3.3a2.9 2.9 0 1 0 1.8 2.7z" />;
    case "X":
      return <path fill="currentColor" stroke="none" d="M18.9 3h2.8l-6.1 7 7.2 11h-5.6l-4.4-6.8L6.9 21H4.1l6.5-7.5L3.7 3h5.8l4 6.2zm-1 16h1.5L8.3 4.9H6.7z" />;
    case "LinkedIn":
      return <><rect x="3" y="8.5" width="4" height="12.5" rx=".7" fill="currentColor" stroke="none" /><circle cx="5" cy="4.8" r="2" fill="currentColor" stroke="none" /><path d="M11 21V8.5h3.8v1.7c.8-1.3 2-2 3.6-2 2.8 0 3.8 1.8 3.8 4.8V21h-4v-7.1c0-1.5-.3-2.5-1.7-2.5s-1.8 1.1-1.8 2.7V21z" fill="currentColor" stroke="none" /></>;
    case "Pinterest":
      return <path fill="currentColor" stroke="none" d="M12.1 2a10 10 0 0 0-3.7 19.3c0-.8 0-1.8.2-2.7l1.3-5.6s-.3-.6-.3-1.5c0-1.4.8-2.5 1.9-2.5.9 0 1.3.7 1.3 1.5 0 .9-.6 2.2-.9 3.4-.3 1 .5 1.8 1.5 1.8 1.8 0 3-2.3 3-5 0-2.1-1.4-3.7-4-3.7-2.9 0-4.7 2.2-4.7 4.6 0 .8.2 1.4.6 1.9.2.2.2.3.1.6l-.2.8c-.1.3-.3.4-.6.3-1.3-.5-1.9-1.9-1.9-3.4 0-2.6 2.2-5.7 6.8-5.7 3.6 0 6 2.6 6 5.4 0 3.7-2 6.5-5 6.5-1 0-2-.6-2.4-1.2l-.7 2.8c-.2 1-.8 1.9-1.2 2.7A10 10 0 1 0 12.1 2" />;
    case "Threads":
      return <path d="M19 11.2c-.3-4.5-2.7-7.1-6.6-7.1-4.1 0-6.5 3-6.5 7.9 0 4.8 2.4 7.9 6.5 7.9 3.1 0 5.2-1.7 5.2-4.3 0-2-1.3-3.4-3.3-3.4-1.7 0-2.8.9-2.8 2.3 0 1.1.8 1.8 1.9 1.8 1.6 0 2.8-1.4 2.8-3.5 0-2.5-1.5-4.3-3.9-4.3-2.2 0-3.7 1.6-4 4.1" />;
    case "Reddit":
      return <><path d="M5 10.2 6.5 7l4.3 1a7 7 0 0 1 2.4 0l1-3 3.1.7" /><circle cx="5" cy="8" r="1.5" fill="currentColor" stroke="none" /><circle cx="18" cy="6" r="1.5" fill="currentColor" stroke="none" /><path d="M4.5 12.5c0-2.2 3.4-4 7.5-4s7.5 1.8 7.5 4v2c0 3-3.4 5-7.5 5s-7.5-2-7.5-5z" /><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" /><path d="M9.5 16c1.4 1 3.6 1 5 0" /></>;
    case "Telegram":
      return <path fill="currentColor" stroke="none" d="m21.5 3.7-3.2 16.1c-.2 1.1-.8 1.4-1.7.9l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.4-.1-.6-.6-.2L6.2 13.7 1.5 12.2c-1-.3-1-1 .2-1.5L20 3.6c.8-.3 1.7.2 1.5.1" />;
    case "Tumblr":
      return <path fill="currentColor" stroke="none" d="M14.5 21c-3.5 0-5.2-2-5.2-5.3v-5H7V7.5c3-.8 4.2-3.1 4.4-5.5h3.2v5.1h4.1v3.6h-4.1v4.7c0 1.3.6 2 1.7 2 .8 0 1.6-.3 2.3-.7v3.6c-1 .5-2.4.7-4.1.7" />;
    case "Google Business Profile":
      return <><path d="M20.5 12.2a8.6 8.6 0 0 0-.1-1.7H12v3.2h4.8a4.2 4.2 0 0 1-1.8 2.7v2.1h2.9c1.7-1.6 2.6-3.8 2.6-6.3" stroke="#4285F4" /><path d="M12 21c2.4 0 4.4-.8 5.9-2.2L15 16.7c-.8.5-1.8.9-3 .9-2.3 0-4.2-1.5-4.9-3.6H4.1v2.2A9 9 0 0 0 12 21" stroke="#34A853" /><path d="M7.1 14a5.4 5.4 0 0 1 0-3.9V7.9H4.1a9 9 0 0 0 0 8.2z" stroke="#FBBC05" /><path d="M12 6.5c1.3 0 2.5.4 3.4 1.3l2.5-2.5A8.4 8.4 0 0 0 12 3a9 9 0 0 0-7.9 4.9l3 2.2c.7-2.1 2.6-3.6 4.9-3.6" stroke="#EA4335" /></>;
    case "ShareChat":
      return <><path d="M4 5.5h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H9l-4 3v-3.4a3 3 0 0 1-2-2.8v-4.8a3 3 0 0 1 3-3" /><path d="M10 3h7a4 4 0 0 1 4 4v5a3.5 3.5 0 0 1-2 3.2" /></>;
    case "Moj":
      return <><path d="M8 5.5v13M16 5.5v13M8 12h8" /><path d="M5 8.5v7M19 8.5v7" /></>;
    default:
      return null;
  }
}

export function PlatformIcon({ platform }: { platform: string }) {
  const instagram = platform === "Instagram";
  return (
    <span className={`social-provider-mark${instagram ? " instagram-provider-mark" : ""}`} style={instagram ? undefined : { color: platformColors[platform] ?? "#526578" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={`${platform} icon`}>
        <PlatformMark platform={platform} />
      </svg>
    </span>
  );
}
