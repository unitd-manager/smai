"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";

type Message = {
  id: string;
  text: string;
  createdAt: string | null;
  senderId: string | null;
  senderName: string | null;
  attachments: Array<{ type: string; url: string | null; name: string | null }>;
};
type Conversation = {
  id: string;
  updatedAt: string | null;
  participants: Array<{ id: string; name: string; isSelf: boolean }>;
  messages: Message[];
};
type InboxAccount = {
  id: string;
  provider: string;
  displayName: string;
  providerAccountId: string;
  conversations: Conversation[];
  error: string | null;
};
type InboxResponse = { accounts: InboxAccount[]; fetchedAt: string };

function formatTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function InboxClient() {
  const [accounts, setAccounts] = useState<InboxAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");

  const loadInbox = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await apiRequest<InboxResponse>("/api/inbox");
      setAccounts(response.accounts);
      setFetchedAt(response.fetchedAt);
      setSelectedAccountId((current) => response.accounts.some((account) => account.id === current)
        ? current
        : response.accounts[0]?.id ?? "");
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load your conversations.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInbox(), 0);
    return () => window.clearTimeout(timer);
  }, [loadInbox]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadInbox(true);
    }, 2 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadInbox]);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const conversations = useMemo(() => selectedAccount?.conversations ?? [], [selectedAccount]);
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0] ?? null;
  const sortedConversations = useMemo(() => [...conversations].sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  ), [conversations]);

  async function sendReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount || !selectedConversation || !messageText.trim()) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/inbox/${encodeURIComponent(selectedAccount.id)}/${encodeURIComponent(selectedConversation.id)}/reply`, {
        method: "POST",
        body: JSON.stringify({ text: messageText }),
      });
      setMessageText("");
      setNotice("Reply sent.");
      await loadInbox(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send your reply.");
    } finally {
      setSending(false);
    }
  }

  const anyAccountConnected = accounts.length > 0;
  const accountHasInboxError = selectedAccount?.error;

  return (
    <section className="dashboard-content inbox-page">
      <header className="inbox-page-heading">
        <div className="inbox-heading-copy"><p className="eyebrow">GROW · MESSAGES</p><h1>Inbox</h1><p className="dashboard-lead">Reply to Instagram and Facebook messages.</p></div>
        <button className="button button-gold inbox-refresh-button" type="button" onClick={() => void loadInbox(true)} disabled={loading || refreshing}>{refreshing ? "Refreshing…" : "Refresh inbox"}</button>
      </header>
      {error && accounts.length > 0 && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {loading ? <p className="loading-label">Loading conversations…</p> : !anyAccountConnected ? (
        <article className="inbox-empty">{error ? <><h2>Inbox could not load</h2><p>{error}</p><button className="button button-gold" type="button" onClick={() => void loadInbox()} disabled={refreshing}>Try again</button></> : <><h2>Connect a messaging account</h2><p>Connect an Instagram Professional account or a Facebook Page to load its conversations here.</p><Link className="button button-gold" href="/dashboard/social-accounts">Open Social Accounts</Link></>}</article>
      ) : (
        <>
          <div className="inbox-account-bar">
            <label>Connected account<select value={selectedAccountId} onChange={(event) => { setSelectedAccountId(event.target.value); setSelectedConversationId(""); setError(""); }}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.provider === "instagram" ? "Instagram" : "Facebook Page"} · {account.displayName}</option>)}
            </select></label>
            <small>{fetchedAt ? `Updated ${formatTime(fetchedAt)} · refreshes every 2 minutes while open` : ""}</small>
          </div>
          {accountHasInboxError ? <article className="inbox-empty inbox-permission-card"><h2>Meta did not allow Inbox access</h2><p>{accountHasInboxError}</p><p>Reconnect this account and approve its messaging permissions. Meta may require business verification and app review before customer conversations are available.</p><Link className="button button-gold" href={selectedAccount?.provider === "instagram" ? "/dashboard/social-accounts/instagram" : "/dashboard/social-accounts/facebook"}>Manage connection</Link></article> : (
            <div className="inbox-workspace">
              <aside className="inbox-conversation-list" aria-label="Conversations">
                <div className="inbox-list-heading"><strong>Conversations</strong><span>{sortedConversations.length}</span></div>
                {!sortedConversations.length ? <div className="inbox-no-conversations"><strong>No conversations returned</strong><p>Only conversations started by a customer appear here. If you expect messages, reconnect the account and approve messaging access in Meta.</p><Link href={selectedAccount?.provider === "instagram" ? "/dashboard/social-accounts/instagram" : "/dashboard/social-accounts/facebook"}>Check connection permissions</Link></div> : sortedConversations.map((conversation) => {
                  const latest = conversation.messages.at(-1);
                  const contact = conversation.participants.find((participant) => !participant.isSelf)?.name ?? "Instagram contact";
                  return <button type="button" key={conversation.id} className={`inbox-conversation ${selectedConversation?.id === conversation.id ? "is-selected" : ""}`} onClick={() => setSelectedConversationId(conversation.id)}>
                    <strong>{contact}</strong><span>{latest?.text || (latest?.attachments.length ? "Attachment" : "No message text")}</span><time>{formatTime(conversation.updatedAt)}</time>
                  </button>;
                })}
              </aside>
              <section className="inbox-thread" aria-label="Conversation messages">
                {selectedConversation ? <>
                  <header><div><h2>{selectedConversation.participants.find((participant) => !participant.isSelf)?.name ?? "Conversation"}</h2><p>{selectedAccount?.displayName}</p></div><span>{selectedAccount?.provider === "instagram" ? "Instagram Direct" : "Facebook Messenger"}</span></header>
                  <div className="inbox-message-list">
                    {selectedConversation.messages.length ? selectedConversation.messages.map((message) => {
                      const isOwn = message.senderId === selectedAccount?.providerAccountId;
                      return <article key={message.id} className={`inbox-message ${isOwn ? "is-own" : ""}`}>
                        {!isOwn && message.senderName && <strong>{message.senderName}</strong>}
                        {message.text && <p>{message.text}</p>}
                        {message.attachments.map((attachment, index) => attachment.url ? <a key={`${message.id}-${index}`} href={attachment.url} target="_blank" rel="noreferrer">Open {attachment.name ?? attachment.type}</a> : <span key={`${message.id}-${index}`}>{attachment.name ?? attachment.type}</span>)}
                        <time>{formatTime(message.createdAt)}</time>
                      </article>;
                    }) : <p className="inbox-no-conversations">No message history was returned.</p>}
                  </div>
                  <form className="inbox-reply-form" onSubmit={(event) => void sendReply(event)}>
                    <textarea aria-label="Write a reply" rows={3} maxLength={2000} placeholder="Write a reply…" value={messageText} onChange={(event) => setMessageText(event.target.value)} />
                    <div><small>Replies are subject to Meta’s messaging rules and reply window.</small><button className="button button-gold" type="submit" disabled={sending || !messageText.trim()}>{sending ? "Sending…" : "Send reply"}</button></div>
                  </form>
                </> : <div className="inbox-no-conversations">Choose a conversation to read its messages.</div>}
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
