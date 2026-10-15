"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  ChevronDown,
  LoaderCircle,
  MessageCircle,
  Plus,
  RotateCcw,
  Send,
  Smile,
  Users,
  X,
} from "lucide-react";
import {
  Member,
  requestJson,
  useSpace,
} from "@/components/space/SpaceProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Mascot } from "@/components/ui/Mascot";

type Conversation = {
  id: string;
  kind: "group" | "direct";
  otherMember?: Member | null;
  unreadCount?: number;
};
type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_message_id: string;
  body: string;
  server_created_at: string;
  status?: "sending" | "failed";
  readByOthers?: boolean;
};
const CHAT_EMOJIS = ["😊", "😂", "😍", "🥳", "👍", "👏", "💪", "🌈", "☀️", "🌱", "🎉", "❤️"];
function mergeMessages(current: Message[], incoming: Message[]) {
  const merged = [...current];
  for (const message of incoming) {
    const index = merged.findIndex(
      (item) =>
        item.id === message.id ||
        (item.sender_id === message.sender_id &&
          item.client_message_id === message.client_message_id),
    );
    if (index >= 0) merged[index] = message;
    else merged.push(message);
  }
  return merged.sort(
    (a, b) =>
      a.server_created_at.localeCompare(b.server_created_at) ||
      a.id.localeCompare(b.id),
  );
}

export function ChatRoom() {
  const { spaceId, data, connection } = useSpace();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState("");
  const [messageMap, setMessageMap] = useState<Record<string, Message[]>>({});
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [opening, setOpening] = useState("");
  const [mobileList, setMobileList] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const known = useRef<Record<string, Set<string>>>({});
  const selectedRef = useRef("");
  const pendingIds = useRef(new Set<string>());
  const markRead = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    try {
      await requestJson(`/api/conversations/${conversationId}/read`, {
        method: "POST",
        body: "{}",
      });
      setConversations((items) =>
        items.map((item) =>
          item.id === conversationId ? { ...item, unreadCount: 0 } : item,
        ),
      );
    } catch {}
  }, []);
  const loadConversations = useCallback(async () => {
    try {
      const result = await requestJson<{ conversations: Conversation[] }>(
        `/api/spaces/${spaceId}/conversations`,
      );
      setConversations(result.conversations);
      setSelected(
        (current) =>
          current ||
          result.conversations.find((item) => item.kind === "group")?.id ||
          result.conversations[0]?.id ||
          "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "会话加载失败");
    }
  }, [spaceId]);
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
      atBottom.current = true;
      setNewCount(0);
    });
  }, []);
  const loadLatest = useCallback(
    async (conversationId: string) => {
      if (!conversationId) return;
      try {
        const result = await requestJson<{
          messages: Message[];
          nextCursor: string | null;
        }>(`/api/conversations/${conversationId}/messages`);
        const previous = known.current[conversationId];
        const added = previous
          ? result.messages.filter((message) => !previous.has(message.id))
              .length
          : 0;
        known.current[conversationId] = new Set([
          ...(previous || []),
          ...result.messages.map((message) => message.id),
        ]);
        setMessageMap((current) => ({
          ...current,
          [conversationId]: mergeMessages(
            current[conversationId] || [],
            result.messages,
          ),
        }));
        setCursors((current) =>
          conversationId in current
            ? current
            : { ...current, [conversationId]: result.nextCursor },
        );
        if (selectedRef.current === conversationId) {
          if (atBottom.current || !previous) {
            scrollToBottom();
            void markRead(conversationId);
          } else if (added) setNewCount((count) => count + added);
        }
        setError("");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "消息加载失败，将在连接恢复后重试",
        );
      }
    },
    [markRead, scrollToBottom],
  );
  const openDirect = useCallback(
    async (memberId: string) => {
      setOpening(memberId);
      setError("");
      try {
        const result = await requestJson<{ conversation: Conversation }>(
          `/api/spaces/${spaceId}/conversations`,
          { method: "POST", body: JSON.stringify({ memberId }) },
        );
        await loadConversations();
        setSelected(result.conversation.id);
        setMobileList(false);
        setShowMembers(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "暂时无法发起私聊");
      } finally {
        setOpening("");
      }
    },
    [spaceId, loadConversations],
  );
  useEffect(() => {
    void loadConversations();
    const memberId = new URL(window.location.href).searchParams.get("member");
    if (memberId) void openDirect(memberId);
    const timer = setInterval(() => void loadConversations(), 5000);
    return () => clearInterval(timer);
  }, [loadConversations, openDirect]);
  useEffect(() => {
    selectedRef.current = selected;
    atBottom.current = true;
    const reset = requestAnimationFrame(() => setNewCount(0));
    if (selected) {
      void loadLatest(selected);
      void markRead(selected);
    }
    return () => cancelAnimationFrame(reset);
  }, [markRead, selected, loadLatest]);
  useEffect(() => {
    if (selected) void loadLatest(selected);
  }, [data, selected, loadLatest]);
  async function loadHistory() {
    if (!selected || !cursors[selected] || loadingHistory) return;
    setLoadingHistory(true);
    const conversationId = selected;
    const oldHeight = scrollRef.current?.scrollHeight || 0;
    const oldTop = scrollRef.current?.scrollTop || 0;
    try {
      const result = await requestJson<{
        messages: Message[];
        nextCursor: string | null;
      }>(
        `/api/conversations/${conversationId}/messages?cursor=${encodeURIComponent(cursors[conversationId] || "")}`,
      );
      setMessageMap((current) => ({
        ...current,
        [conversationId]: mergeMessages(
          current[conversationId] || [],
          result.messages,
        ),
      }));
      setCursors((current) => ({
        ...current,
        [conversationId]: result.nextCursor,
      }));
      result.messages.forEach((message) =>
        known.current[conversationId]?.add(message.id),
      );
      requestAnimationFrame(() => {
        if (selectedRef.current === conversationId && scrollRef.current)
          scrollRef.current.scrollTop =
            scrollRef.current.scrollHeight - oldHeight + oldTop;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "历史消息加载失败");
    } finally {
      setLoadingHistory(false);
    }
  }
  async function send(message: Message) {
    if (pendingIds.current.has(message.client_message_id)) return;
    pendingIds.current.add(message.client_message_id);
    setMessageMap((current) => ({
      ...current,
      [message.conversation_id]: mergeMessages(
        current[message.conversation_id] || [],
        [{ ...message, status: "sending" }],
      ),
    }));
    try {
      const result = await requestJson<{ message: Message }>(
        `/api/conversations/${message.conversation_id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            body: message.body,
            clientMessageId: message.client_message_id,
          }),
        },
      );
      known.current[message.conversation_id]?.add(result.message.id);
      setMessageMap((current) => ({
        ...current,
        [message.conversation_id]: mergeMessages(
          current[message.conversation_id] || [],
          [result.message],
        ),
      }));
    } catch {
      setMessageMap((current) => ({
        ...current,
        [message.conversation_id]: (current[message.conversation_id] || []).map(
          (item) =>
            item.client_message_id === message.client_message_id
              ? { ...item, status: "failed" }
              : item,
        ),
      }));
    } finally {
      pendingIds.current.delete(message.client_message_id);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const text = drafts[selected]?.trim();
    if (!text || !data || !selected) return;
    const id = crypto.randomUUID();
    const message: Message = {
      id,
      conversation_id: selected,
      sender_id: data.member.id,
      client_message_id: id,
      body: text,
      server_created_at: new Date().toISOString(),
      status: "sending",
    };
    setDrafts((current) => ({ ...current, [selected]: "" }));
    void send(message);
    scrollToBottom();
  }
  function insertEmoji(emoji: string) {
    const input = textareaRef.current;
    const currentDraft = drafts[selected] || "";
    const start = input?.selectionStart ?? currentDraft.length;
    const end = input?.selectionEnd ?? start;
    const next = `${currentDraft.slice(0, start)}${emoji}${currentDraft.slice(end)}`;
    setDrafts((current) => ({ ...current, [selected]: next }));
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }
  if (!data) return null;
  const current = conversations.find((item) => item.id === selected);
  const messages = messageMap[selected] || [];
  const currentName =
    current?.kind === "group"
      ? "小组大客厅"
      : current?.otherMember?.nickname || "与伙伴的私聊";
  return (
    <div className="chat-page">
      <div className="page-heading chat-page-heading">
        <div>
          <p className="eyebrow">
            <MessageCircle size={14} /> 日常和心情，都可以放在这里
          </p>
          <h1>
            聊天小屋<span className="hello-spark">✳</span>
          </h1>
        </div>
        <span className="chat-heading-note">给彼此加一点成长的能量。</span>
      </div>
      <div className={`chat-layout ${mobileList ? "show-conversations" : ""}`}>
        <aside className="conversation-sidebar">
          <div className="conversation-sidebar-heading">
            <h2>小屋里的对话</h2>
            <button
              className="icon-button"
              aria-label="发起私聊"
              onClick={() => setShowMembers(true)}
            >
              <Plus size={19} />
            </button>
          </div>
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <button
                className={`conversation-item ${conversation.unreadCount ? "has-unread" : ""} ${selected === conversation.id ? "selected" : ""}`}
                key={conversation.id}
                onClick={() => {
                  setSelected(conversation.id);
                  setMobileList(false);
                }}
              >
                {conversation.kind === "group" ? (
                  <span className="group-avatar">
                    <Users size={22} />
                  </span>
                ) : (
                  <Avatar
                    member={
                      conversation.otherMember || {
                        id: conversation.id,
                        nickname: "伙伴",
                      }
                    }
                  />
                )}
                <span>
                  <strong>
                    {conversation.kind === "group"
                      ? "小组大客厅"
                      : conversation.otherMember?.nickname || "小伙伴"}
                  </strong>
                  <small>
                    {conversation.kind === "group"
                      ? `${data.members.length} 位伙伴的日常`
                      : "你们的悄悄话"}
                  </small>
                </span>
                {conversation.unreadCount ? (
                  <b className="conversation-unread">
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </b>
                ) : conversation.kind === "group" ? (
                  <span className="group-label">群聊</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="chat-sidebar-note">
            <Mascot variant="bunny" />
            <strong>小事也值得分享。</strong>
            <p>一句加油，就是今天的小太阳。</p>
          </div>
        </aside>
        <section className="chat-conversation" aria-label={currentName}>
          <header className="chat-header">
            <button
              className="icon-button mobile-chat-back"
              aria-label="选择会话"
              onClick={() => setMobileList(true)}
            >
              <ArrowLeft size={19} />
            </button>
            {current?.kind === "group" ? (
              <span className="group-avatar">
                <Users size={21} />
              </span>
            ) : current?.otherMember ? (
              <Avatar member={current.otherMember} />
            ) : (
              <MessageCircle size={23} />
            )}
            <div>
              <h2>{currentName}</h2>
              <p>
                {current?.kind === "group"
                  ? "有空就来坐坐，分享今天的小日常"
                  : "给小伙伴送去一点鼓励"}
              </p>
            </div>
            <span
              className={`chat-connection ${connection === "connected" ? "connected" : ""}`}
            >
              <i />
              {connection === "connected" ? "已连接" : "重连中"}
            </span>
          </header>
          {error && (
            <div role="alert" className="chat-error">
              {error}
              <button
                onClick={() => {
                  void loadConversations();
                  void loadLatest(selected);
                }}
              >
                重试
              </button>
            </div>
          )}
          <div
            className="message-scroll"
            ref={scrollRef}
            onScroll={() => {
              const node = scrollRef.current;
              if (!node) return;
              atBottom.current =
                node.scrollHeight - node.scrollTop - node.clientHeight < 70;
              if (atBottom.current) {
                setNewCount(0);
                void markRead(selected);
              }
              if (node.scrollTop < 35 && cursors[selected]) void loadHistory();
            }}
            aria-live="polite"
            aria-relevant="additions"
          >
            {cursors[selected] && (
              <button
                className="history-button"
                disabled={loadingHistory}
                onClick={() => void loadHistory()}
              >
                {loadingHistory ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
                {loadingHistory ? "正在翻找旧时光…" : "查看更早的消息"}
              </button>
            )}
            {!messages.length ? (
              <div className="chat-empty">
                <span>
                  <MessageCircle size={32} />
                </span>
                <h3>
                  {selected && messageMap[selected]
                    ? "从一句“你好”开始"
                    : "正在打开对话…"}
                </h3>
                <p>分享今天的小进步，或给伙伴送一句加油。</p>
              </div>
            ) : (
              messages.map((message, index) => {
                const own = message.sender_id === data.member.id;
                const sender = data.members.find(
                  (member) => member.id === message.sender_id,
                ) || { id: message.sender_id, nickname: "已离开的伙伴" };
                const time = new Date(message.server_created_at);
                const prior = messages[index - 1];
                const showDate =
                  !prior ||
                  new Date(prior.server_created_at).toLocaleDateString(
                    "zh-CN",
                    { timeZone: data.space.timezone },
                  ) !==
                    time.toLocaleDateString("zh-CN", {
                      timeZone: data.space.timezone,
                    });
                return (
                  <div key={message.id}>
                    {showDate && (
                      <div className="message-date">
                        <span>
                          {time.toLocaleDateString("zh-CN", {
                            month: "long",
                            day: "numeric",
                            timeZone: data.space.timezone,
                          })}
                        </span>
                      </div>
                    )}
                    <article className={`message-row ${own ? "own" : ""}`}>
                      <Avatar member={sender} size="sm" />
                      <div className="message-content">
                        <span className="message-author">
                          {own ? "我" : sender.nickname}
                          <time>
                            {time.toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: data.space.timezone,
                            })}
                          </time>
                        </span>
                        <div className="message-bubble">{message.body}</div>
                        {message.status === "failed" ? (
                          <button
                            className="message-retry"
                            onClick={() => void send(message)}
                          >
                            <RotateCcw size={12} />
                            发送失败，点击重试
                          </button>
                        ) : message.status === "sending" ? (
                          <span className="message-status">发送中…</span>
                        ) : own ? (
                          <span className="message-status">
                            <Check size={11} />
                            {message.readByOthers ? "已读" : "已发送"}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  </div>
                );
              })
            )}
          </div>
          {newCount > 0 && (
            <button className="new-message-button" onClick={scrollToBottom}>
              <ArrowDown size={14} />
              {newCount} 条新消息
            </button>
          )}
          <form className="chat-composer" onSubmit={submit}>
            <div className="composer-toolbar">
              <button
                type="button"
                className="emoji-trigger"
                aria-label="打开表情"
                aria-expanded={emojiOpen}
                onClick={() => setEmojiOpen((open) => !open)}
              >
                <Smile size={18} />
              </button>
              <span>说点什么吧，伙伴们在这里。</span>
              {emojiOpen && (
                <div className="emoji-picker" role="group" aria-label="表情符号">
                  {CHAT_EMOJIS.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      aria-label={emoji}
                      onClick={() => insertEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <textarea
              ref={textareaRef}
              aria-label="聊天消息"
              value={drafts[selected] || ""}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [selected]: e.target.value }))
              }
              placeholder={
                current?.otherMember?.removed_at
                  ? "该伙伴已离开空间"
                  : "分享今天的小事，或说一句加油…"
              }
              maxLength={5000}
              disabled={!selected || !!current?.otherMember?.removed_at}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  window.matchMedia("(min-width: 768px)").matches
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-bottom">
              <span>Enter 发送 · Shift + Enter 换行</span>
              <button
                type="submit"
                className="button button-primary"
                disabled={
                  !selected ||
                  !drafts[selected]?.trim() ||
                  !!current?.otherMember?.removed_at
                }
              >
                发送 <Send size={15} />
              </button>
            </div>
          </form>
        </section>
      </div>
      {showMembers && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="direct-title"
            className="modal small-modal"
          >
            <div className="modal-heading">
              <h2 id="direct-title">找个伙伴聊一聊</h2>
              <button
                aria-label="关闭"
                className="icon-button"
                disabled={!!opening}
                onClick={() => setShowMembers(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="direct-member-list">
              {data.members
                .filter((member) => member.id !== data.member.id)
                .map((member) => (
                  <button
                    key={member.id}
                    disabled={!!opening}
                    onClick={() => void openDirect(member.id)}
                  >
                    <Avatar member={member} />
                    <strong>{member.nickname}</strong>
                    {opening === member.id ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <MessageCircle size={17} />
                    )}
                  </button>
                ))}
              {data.members.length <= 1 && (
                <p className="muted">邀请一位伙伴加入后，就可以开始私聊啦。</p>
              )}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
