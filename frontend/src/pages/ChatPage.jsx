import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCheck,
  Clock3,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import api, { getAccessToken } from "../api/axios";
import { useAuth } from "../context/AuthContext";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8010/api/v1"
).replace(/\/+$/, "");
const PAGE_SIZE = 50;

function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    return detail.message || JSON.stringify(detail);
  }
  return error?.message || fallback;
}

function displayTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function displayDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function mergeMessages(existing, incoming) {
  const byId = new Map(existing.map((item) => [Number(item.id), item]));
  for (const item of incoming) {
    const id = Number(item.id);
    const previous = byId.get(id);
    byId.set(id, previous ? { ...previous, ...item } : item);
  }
  return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

function normalizeUser(user) {
  return {
    id: Number(user?.id),
    name: user?.full_name || user?.name || user?.label || user?.email || `User #${user?.id}`,
    email: user?.email || user?.fields?.email || "",
    role: user?.role || user?.fields?.role || "",
    is_active: user?.is_active ?? user?.fields?.is_active ?? true,
  };
}

function Avatar({ name, active = false }) {
  const initials = String(name || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/10 text-sm font-bold text-cyan-200">
      {initials || "U"}
      {active && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
      )}
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const currentUserId = Number(user?.id);
  const role = String(user?.role || "").toUpperCase();
  const canBrowseDirectory = role === "ADMIN" || role === "HR";

  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(role === "ADMIN");
  const [contactsError, setContactsError] = useState("");
  const [contactRefreshKey, setContactRefreshKey] = useState(0);
  const [manualUserId, setManualUserId] = useState("");
  const [manualError, setManualError] = useState("");

  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const [conversationError, setConversationError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [socketStatus, setSocketStatus] = useState(() =>
    getAccessToken() && user?.id ? "connecting" : "disconnected",
  );

  const socketRef = useRef(null);
  const activeContactRef = useRef(null);
  const currentUserIdRef = useRef(currentUserId);
  const messagesEndRef = useRef(null);
  const shouldScrollRef = useRef(false);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  // ADMIN has a dedicated user directory. HR can search active users through
  // the permitted advanced-search endpoint. Other roles enter a known user ID
  // because the backend intentionally does not expose a general user directory.
  useEffect(() => {
    let cancelled = false;
    const query = contactQuery.trim();

    if (!canBrowseDirectory) return undefined;

    if (role === "HR" && query.length < 2) return undefined;

    const timer = window.setTimeout(async () => {
      setContactsLoading(true);
      setContactsError("");
      try {
        let results = [];
        if (role === "ADMIN") {
          const response = await api.get("/users", {
            params: {
              is_active: true,
              limit: 100,
              ...(query ? { search: query } : {}),
            },
          });
          results = Array.isArray(response.data) ? response.data.map(normalizeUser) : [];
        } else {
          const response = await api.get("/search", {
            params: {
              q: query,
              entities: "users",
              limit_per_type: 25,
            },
          });
          results = (response.data?.results || [])
            .map(normalizeUser)
            .filter((item) => item.is_active !== false);
        }

        if (!cancelled) {
          setContacts(
            results.filter(
              (contact) => contact.id && contact.id !== currentUserId,
            ),
          );
        }
      } catch (error) {
        if (!cancelled) {
          setContacts([]);
          setContactsError(getErrorMessage(error, "Could not load users."));
        }
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    }, query ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canBrowseDirectory, contactQuery, contactRefreshKey, currentUserId, role]);

  const selectedContact = useMemo(() => {
    if (!activeContact) return null;
    return (
      contacts.find((item) => item.id === Number(activeContact.id)) ||
      activeContact
    );
  }, [activeContact, contacts]);

  // Load the latest messages, then mark incoming messages as read for this
  // conversation. The API returns the selected page in oldest-first order.
  useEffect(() => {
    if (!selectedContact?.id) return undefined;

    let cancelled = false;
    const requestId = ++loadRequestRef.current;

    async function loadConversation() {
      try {
        const response = await api.get(
          `/chat/conversations/${Number(selectedContact.id)}`,
          { params: { limit: PAGE_SIZE } },
        );
        if (cancelled || requestId !== loadRequestRef.current) return;
        const rows = Array.isArray(response.data) ? response.data : [];
        shouldScrollRef.current = true;
        setMessages(rows);
        setHasMore(rows.length === PAGE_SIZE);

        try {
          const readResponse = await api.post(
            `/chat/conversations/${Number(selectedContact.id)}/read`,
          );
          const updatedCount = Number(readResponse.data?.updated_count || 0);
          if (!cancelled && updatedCount > 0) {
            const readAt = new Date().toISOString();
            setMessages((current) =>
              current.map((message) =>
                Number(message.sender_id) === Number(selectedContact.id) &&
                Number(message.recipient_id) === currentUserId &&
                !message.read_at
                  ? { ...message, read_at: readAt }
                  : message,
              ),
            );
          }
        } catch {
          // Keep the conversation readable if the read receipt request fails.
        }
      } catch (error) {
        if (!cancelled && requestId === loadRequestRef.current) {
          setConversationError(getErrorMessage(error, "Could not load this conversation."));
        }
      } finally {
        if (!cancelled && requestId === loadRequestRef.current) {
          setConversationLoading(false);
        }
      }
    }

    loadConversation();
    return () => {
      cancelled = true;
    };
  }, [selectedContact?.id, currentUserId, conversationRefreshKey]);

  // Realtime delivery uses the backend's authenticated chat WebSocket.
  // Access tokens are only sent to the configured API origin.
  useEffect(() => {
    const token = getAccessToken();
    if (!token || !user?.id) return undefined;

    let cancelled = false;
    let reconnectTimer = null;
    let attempts = 0;
    let currentSocket = null;

    const connect = () => {
      if (cancelled) return;
      const socketUrl = `${API_BASE_URL.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}/chat/ws?token=${encodeURIComponent(token)}`;

      try {
        currentSocket = new WebSocket(socketUrl);
        socketRef.current = currentSocket;
      } catch {
        setSocketStatus("disconnected");
        return;
      }

      currentSocket.onopen = () => {
        attempts = 0;
        setSocketStatus("connected");
      };

      currentSocket.onmessage = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (payload?.event === "message" && payload.data) {
          const incoming = payload.data;
          const me = currentUserIdRef.current;
          const selected = activeContactRef.current;
          const isSelectedConversation = selected && (
            (Number(incoming.sender_id) === Number(selected.id) && Number(incoming.recipient_id) === me) ||
            (Number(incoming.sender_id) === me && Number(incoming.recipient_id) === Number(selected.id))
          );

          if (isSelectedConversation) {
            shouldScrollRef.current = true;
            setMessages((current) => mergeMessages(current, [incoming]));
            if (
              Number(incoming.recipient_id) === me &&
              Number(incoming.sender_id) === Number(selected.id)
            ) {
              api.post(`/chat/conversations/${Number(selected.id)}/read`)
                .then(() => {
                  setMessages((current) =>
                    current.map((message) =>
                      Number(message.id) === Number(incoming.id)
                        ? { ...message, read_at: new Date().toISOString() }
                        : message,
                    ),
                  );
                })
                .catch(() => {});
            }
          }
          return;
        }

        if (payload?.event === "read_receipt" && payload.data) {
          const receipt = payload.data;
          const selected = activeContactRef.current;
          if (
            selected &&
            Number(receipt.reader_id) === Number(selected.id)
          ) {
            setMessages((current) =>
              current.map((message) =>
                Number(message.sender_id) === currentUserIdRef.current && !message.read_at
                  ? { ...message, read_at: receipt.read_at || new Date().toISOString() }
                  : message,
              ),
            );
          }
          return;
        }

        if (payload?.event === "error") {
          setConversationError(payload.message || "Chat connection returned an error.");
        }
      };

      currentSocket.onerror = () => {
        // onclose handles retrying; close explicitly for consistent behavior.
        try {
          currentSocket?.close();
        } catch {
          // Ignore socket teardown errors.
        }
      };

      currentSocket.onclose = () => {
        if (cancelled) return;
        setSocketStatus("connecting");
        attempts += 1;
        const delay = Math.min(15000, 1000 * (2 ** Math.min(attempts, 4)));
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (currentSocket) {
        currentSocket.onclose = null;
        currentSocket.onmessage = null;
        currentSocket.onerror = null;
        currentSocket.onopen = null;
        currentSocket.close();
      }
      if (socketRef.current === currentSocket) socketRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    if (shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      shouldScrollRef.current = false;
    }
  }, [messages]);

  const selectContact = (contact) => {
    setManualError("");
    setMessages([]);
    setHasMore(false);
    setConversationError("");
    setConversationLoading(true);
    setActiveContact(contact);
    setConversationRefreshKey((value) => value + 1);
  };

  const openManualConversation = (event) => {
    event.preventDefault();
    setManualError("");
    const id = Number(manualUserId);
    if (!Number.isInteger(id) || id < 1) {
      setManualError("Enter a valid positive User ID.");
      return;
    }
    if (id === currentUserId) {
      setManualError("You cannot open a conversation with your own account.");
      return;
    }
    const contact = contacts.find((item) => item.id === id) || {
      id,
      name: `User #${id}`,
      email: "",
      role: "",
      is_active: true,
    };
    selectContact(contact);
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!selectedContact?.id || !text || sending) return;
    if (text.length > 4000) {
      setConversationError("Messages can contain up to 4,000 characters.");
      return;
    }

    setSending(true);
    setConversationError("");
    try {
      const response = await api.post("/chat/messages", {
        recipient_id: Number(selectedContact.id),
        message: text,
      });
      shouldScrollRef.current = true;
      setMessages((current) => mergeMessages(current, [response.data]));
      setDraft("");
    } catch (error) {
      setConversationError(getErrorMessage(error, "Message could not be sent."));
    } finally {
      setSending(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!selectedContact?.id || !messages.length || loadingOlder) return;
    setLoadingOlder(true);
    setConversationError("");
    try {
      const response = await api.get(
        `/chat/conversations/${Number(selectedContact.id)}`,
        {
          params: {
            limit: PAGE_SIZE,
            before_id: Number(messages[0].id),
          },
        },
      );
      const rows = Array.isArray(response.data) ? response.data : [];
      setMessages((current) => mergeMessages(rows, current));
      setHasMore(rows.length === PAGE_SIZE);
    } catch (error) {
      setConversationError(getErrorMessage(error, "Could not load older messages."));
    } finally {
      setLoadingOlder(false);
    }
  };

  const visibleContacts = useMemo(
    () => (role === "HR" && contactQuery.trim().length < 2
      ? []
      : contacts.filter((contact) => contact.is_active !== false)),
    [contacts, contactQuery, role],
  );
  const socketConnected = socketStatus === "connected";

  return (
    <div className="space-y-6 text-slate-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">People operations</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Team Chat</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Send direct messages to active WorkForce AI Pro users. Messages are saved by the backend and delivered live when the recipient is connected.
          </p>
        </div>
        <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${socketConnected ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300"}`}>
          {socketConnected ? <Wifi size={15} /> : <WifiOff size={15} />}
          {socketConnected ? "Live connection" : socketStatus === "connecting" ? "Connecting to chat…" : "Reconnecting…"}
        </div>
      </div>

      <div className="grid min-h-[680px] overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-black/20 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="flex min-h-[360px] flex-col border-b border-white/10 xl:border-b-0 xl:border-r">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Conversations</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {role === "ADMIN" ? "Active user directory" : role === "HR" ? "Search the user directory" : "Open a conversation by User ID"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-cyan-200">
                <MessageSquare size={18} />
              </div>
            </div>

            {canBrowseDirectory && (
              <label className="relative block">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={contactQuery}
                  onChange={(event) => {
                    const value = event.target.value;
                    setContactQuery(value);
                    setContactsLoading(role === "ADMIN" || (role === "HR" && value.trim().length >= 2));
                    setContactsError("");
                    if (role === "HR" && value.trim().length < 2) setContacts([]);
                  }}
                  placeholder={role === "ADMIN" ? "Search name or email…" : "Type at least 2 characters…"}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 py-3 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                />
              </label>
            )}

            <form onSubmit={openManualConversation} className="mt-3 flex gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={manualUserId}
                onChange={(event) => {
                  setManualUserId(event.target.value);
                  setManualError("");
                }}
                placeholder="Recipient User ID"
                aria-label="Recipient User ID"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
              />
              <button type="submit" className="rounded-xl bg-cyan-300 px-3 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-200">
                Open
              </button>
            </form>
            {manualError && <p className="mt-2 text-xs text-rose-300">{manualError}</p>}
            {role !== "ADMIN" && role !== "HR" && (
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                Your role does not have a general user-directory API. Ask HR/Admin for the recipient’s User ID; the backend will validate the account before showing messages.
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {contactsLoading && (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-slate-400">
                <LoaderCircle size={16} className="animate-spin" /> Loading users…
              </div>
            )}
            {!contactsLoading && contactsError && (
              <div className="m-1 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs leading-5 text-rose-200">
                <div className="mb-2 flex items-center gap-2 font-semibold"><AlertCircle size={15} /> Could not load users</div>
                {contactsError}
                <button type="button" onClick={() => setContactRefreshKey((value) => value + 1)} className="mt-2 flex items-center gap-1 text-rose-100 underline">
                  <RefreshCw size={12} /> Try again by updating search
                </button>
              </div>
            )}
            {!contactsLoading && !contactsError && canBrowseDirectory && visibleContacts.length === 0 && (
              <div className="px-4 py-10 text-center">
                <Users size={24} className="mx-auto text-slate-600" />
                <p className="mt-3 text-sm font-medium text-slate-300">No matching users</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {role === "HR" && contactQuery.trim().length < 2 ? "Enter at least two characters to search users." : "Try another name or email, or open a conversation using the User ID."}
                </p>
              </div>
            )}
            {visibleContacts.map((contact) => {
              const active = Number(selectedContact?.id) === Number(contact.id);
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => selectContact(contact)}
                  className={`mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${active ? "border border-cyan-300/20 bg-cyan-300/[0.08]" : "border border-transparent hover:bg-white/[0.04]"}`}
                >
                  <Avatar name={contact.name} active={contact.is_active !== false} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${active ? "text-cyan-100" : "text-slate-200"}`}>{contact.name}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{contact.email || `User ID: ${contact.id}`}</span>
                    <span className="mt-1 block text-[10px] uppercase tracking-wide text-slate-600">{contact.role || "Workforce user"}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {role === "ADMIN" && (
            <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-5 text-slate-500">
              Showing up to 100 active users returned by the backend. Use search to narrow the list.
            </div>
          )}
        </aside>

        <section className="flex min-h-[520px] min-w-0 flex-col bg-slate-950/30">
          {!selectedContact ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200">
                <MessageSquare size={28} />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-white">Start a conversation</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Select a user from the directory or enter their User ID. Your messages are stored by the backend and shared only with the selected recipient.
              </p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
                <Avatar name={selectedContact.name} active={selectedContact.is_active !== false} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-white">{selectedContact.name}</h2>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {selectedContact.email || `User ID: ${selectedContact.id}`}
                    {selectedContact.role ? ` · ${selectedContact.role}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setHasMore(false);
                    setConversationError("");
                    setConversationLoading(true);
                    setConversationRefreshKey((value) => value + 1);
                  }}
                  title="Refresh conversation"
                  aria-label="Refresh conversation"
                  className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <RefreshCw size={16} />
                </button>
              </header>

              <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5 text-[11px] text-slate-500 sm:px-6">
                <span>Direct conversation · Messages are stored securely by the API</span>
                <span className="shrink-0">Last {PAGE_SIZE} messages</span>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
                {hasMore && !conversationLoading && (
                  <div className="flex justify-center">
                    <button type="button" disabled={loadingOlder} onClick={loadOlderMessages} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50">
                      {loadingOlder ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={13} />}
                      Load older messages
                    </button>
                  </div>
                )}
                {conversationLoading && messages.length === 0 && (
                  <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-400">
                    <LoaderCircle size={17} className="animate-spin" /> Loading conversation…
                  </div>
                )}
                {!conversationLoading && !conversationError && messages.length === 0 && (
                  <div className="py-16 text-center">
                    <MessageSquare size={23} className="mx-auto text-slate-600" />
                    <p className="mt-3 text-sm font-medium text-slate-300">No messages yet</p>
                    <p className="mt-1 text-xs text-slate-500">Send the first message to start the conversation.</p>
                  </div>
                )}
                {messages.map((message, index) => {
                  const own = Number(message.sender_id) === currentUserId;
                  const previous = messages[index - 1];
                  const showDate = !previous || displayDate(previous.sent_at) !== displayDate(message.sent_at);
                  return (
                    <div key={message.id}>
                      {showDate && (
                        <div className="my-4 flex justify-center">
                          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[10px] font-medium text-slate-500">{displayDate(message.sent_at)}</span>
                        </div>
                      )}
                      <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] sm:max-w-[75%] ${own ? "items-end" : "items-start"} flex flex-col`}>
                          <div className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 ${own ? "rounded-br-md bg-cyan-300 text-slate-950" : "rounded-bl-md border border-white/[0.07] bg-slate-800 text-slate-100"}`}>
                            {message.message}
                          </div>
                          <div className={`mt-1.5 flex items-center gap-1.5 px-1 text-[10px] ${own ? "text-slate-500" : "text-slate-600"}`}>
                            <span>{displayTime(message.sent_at)}</span>
                            {own && (message.read_at ? <CheckCheck size={13} className="text-cyan-300" title="Read" /> : <Clock3 size={12} title="Sent" />)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {conversationError && (
                  <div className="mx-auto max-w-xl rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3 text-xs leading-5 text-rose-200">
                    <div className="mb-1 flex items-center gap-2 font-semibold"><AlertCircle size={14} /> Chat notice</div>
                    {conversationError}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={sendMessage} className="border-t border-white/10 bg-slate-900/70 p-3 sm:p-5">
                <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-2 focus-within:border-cyan-300/35">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value.slice(0, 4000))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={2}
                    maxLength={4000}
                    placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
                    aria-label="Message text"
                    className="max-h-36 min-h-[48px] min-w-0 flex-1 resize-y bg-transparent px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim() || conversationLoading}
                    className="mb-0.5 inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[10px] text-slate-600">
                  <span>Up to 4,000 characters</span>
                  <span>{draft.length}/4000</span>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Contact discovery follows backend permissions: Admin can browse active users, HR can search users, and Manager/Employee accounts must use a known User ID. There is no separate backend API for global unread counts, so no artificial count is displayed.
      </p>
    </div>
  );
}
