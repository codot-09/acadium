import { useEffect, useMemo, useState } from "react";
import { Menu, MessageSquarePlus, MoreHorizontal, PanelLeft, Plus, Send, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Role = "teacher" | "student";
type ChatMessage = { id: string; sender: string; content: string; createdAt: Date | string };
type TelegramWindow = Window & { Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } } };

function initials(name: string) { return name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase() || "A"; }

export default function Home() {
  const [role, setRole] = useState<Role>("teacher");
  const [initData, setInitData] = useState("");
  const [profileName, setProfileName] = useState("Acadium");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" ? true : window.innerWidth > 760);

  const utils = trpc.useUtils();
  const bootstrap = trpc.telegram.bootstrap.useMutation();
  const dashboard = trpc.telegram.dashboard.useQuery({ initData }, { enabled: Boolean(initData), retry: false });
  const conversations = trpc.chat.conversations.useQuery({ initData }, { enabled: Boolean(initData), retry: false });
  const thread = trpc.chat.thread.useQuery({ initData, conversationId: selectedConversationId ?? "pending" }, { enabled: Boolean(initData && selectedConversationId), retry: false });
  const roleMutation = trpc.telegram.selectRole.useMutation();
  const saveMessage = trpc.chat.saveMessageToConversation.useMutation();
  const newConversation = trpc.chat.newConversation.useMutation({ onSuccess: conversation => { setSelectedConversationId(conversation.id); utils.chat.conversations.invalidate(); setMessages([]); } });

  useEffect(() => {
    const telegram = (window as TelegramWindow).Telegram?.WebApp;
    telegram?.ready?.(); telegram?.expand?.();
    const value = telegram?.initData ?? "";
    setInitData(value);
    if (value) bootstrap.mutate({ initData: value });
  }, []);

  useEffect(() => {
    if (dashboard.data?.profile) {
      setProfileName(dashboard.data.profile.firstName || dashboard.data.profile.username || "Acadium");
      setRole(dashboard.data.profile.role === "student" ? "student" : "teacher");
      if (!selectedConversationId && dashboard.data.conversation?.id) setSelectedConversationId(dashboard.data.conversation.id);
    }
  }, [dashboard.data, selectedConversationId]);

  useEffect(() => {
    const source = thread.data?.messages ?? (selectedConversationId === dashboard.data?.conversation?.id ? dashboard.data?.history : undefined);
    if (source) setMessages(source as ChatMessage[]);
  }, [thread.data, dashboard.data, selectedConversationId]);

  useEffect(() => {
    if (bootstrap.data) setProfileName(bootstrap.data.firstName || bootstrap.data.username || "Acadium");
  }, [bootstrap.data]);

  const currentConversation = useMemo(() => conversations.data?.find(item => item.id === selectedConversationId), [conversations.data, selectedConversationId]);
  const displayName = dashboard.data?.profile?.firstName || profileName;

  const chooseRole = (nextRole: Role) => {
    setRole(nextRole);
    if (initData) roleMutation.mutate({ initData, role: nextRole });
  };

  const sendPrompt = async () => {
    const text = prompt.trim();
    if (!text || isGenerating) return;
    let conversationId = selectedConversationId;
    if (!conversationId && initData) {
      const created = await newConversation.mutateAsync({ initData, title: text.slice(0, 60) });
      conversationId = created.id;
      setSelectedConversationId(conversationId);
    }
    const localUser: ChatMessage = { id: crypto.randomUUID(), sender: "user", content: text, createdAt: new Date() };
    setMessages(current => [...current, localUser]); setPrompt(""); setIsGenerating(true);
    if (initData && conversationId) await saveMessage.mutateAsync({ initData, conversationId, content: text });
    let streamed = "";
    try {
      const response = await fetch("/api/ai/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: text, role, initData, conversationId }) });
      if (!response.ok || !response.body) throw new Error("AI stream unavailable");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find(item => item.startsWith("data: ")); if (!line) continue;
          const payload = line.slice(6); if (payload === "[DONE]") continue;
          streamed += JSON.parse(payload).text ?? "";
          setMessages(current => [...current.filter(message => message.id !== "streaming"), { id: "streaming", sender: "assistant", content: streamed, createdAt: new Date() }]);
        }
      }
    } catch {
      streamed = role === "teacher" ? "Dars rejasi, test va taqdimot outline’ini tayyorlash uchun AI ulanishi kerak. Telegram bot va LLM sozlamalarini tekshiring." : "Savolingizni qabul qildim. AI tutor ulanishi tiklangach batafsil javob beraman.";
      setMessages(current => [...current.filter(message => message.id !== "streaming"), { id: "streaming", sender: "assistant", content: streamed, createdAt: new Date() }]);
    }
    setIsGenerating(false);
    utils.chat.thread.invalidate(); utils.chat.conversations.invalidate();
  };

  const startNewChat = () => {
    if (!initData) { setMessages([]); setSelectedConversationId(null); return; }
    newConversation.mutate({ initData, title: "New chat" });
  };

  return <div className="chat-app">
    <aside className={`chat-sidebar ${sidebarOpen ? "open" : "closed"}`}>
      <div className="sidebar-top"><button className="brand-button" onClick={() => setSidebarOpen(true)}><div className="brand-mark">A</div>{sidebarOpen && <span>acadium</span>}</button>{sidebarOpen && <button className="square-button" onClick={startNewChat} aria-label="New chat"><MessageSquarePlus size={18} /></button>}</div>
      {sidebarOpen && <><button className="new-chat-button" onClick={startNewChat}><Plus size={16} /> New chat</button><div className="history-label">Your chats</div><div className="conversation-list">{conversations.data?.map(conversation => <button key={conversation.id} className={`conversation-item ${selectedConversationId === conversation.id ? "selected" : ""}`} onClick={() => setSelectedConversationId(conversation.id)}><MessageSquarePlus size={15} /><span>{conversation.title}</span></button>)}{!conversations.data?.length && <p className="empty-history">Open Acadium inside Telegram to save chats here.</p>}</div><div className="sidebar-footer"><div className="role-label">Workspace</div><div className="role-switch"><button className={role === "teacher" ? "active" : ""} onClick={() => chooseRole("teacher")}>Teacher</button><button className={role === "student" ? "active" : ""} onClick={() => chooseRole("student")}>Student</button></div><div className="account-row"><div className="account-avatar">{initials(displayName)}</div><div><b>{displayName}</b><span>{initData ? "Telegram connected" : "Preview mode"}</span></div><MoreHorizontal size={16} /></div></div></>}
    </aside>
    <main className="chat-main"><header className="chat-header"><button className="header-icon" onClick={() => setSidebarOpen(current => !current)}><PanelLeft size={18} /></button><div className="model-picker"><Sparkles size={15} /> Acadium <span>·</span> {role === "teacher" ? "Teaching assistant" : "Learning assistant"}</div><button className="header-icon"><MoreHorizontal size={18} /></button></header><section className="chat-thread"><div className="thread-inner">{!messages.length ? <div className="welcome-state"><div className="welcome-icon"><Sparkles size={24} /></div><h1>How can I help you today?</h1><p>{role === "teacher" ? "Create lessons, quizzes and presentation outlines from one clear prompt." : "Ask questions, practice concepts and learn at your own pace."}</p><div className="suggestion-grid"><button onClick={() => setPrompt(role === "teacher" ? "8-sinf biologiya uchun fotosintez mavzusida dars rejasi, test va taqdimot tayyorla" : "Fotosintez mavzusini sodda tushuntir")}> <b>{role === "teacher" ? "Create a lesson kit" : "Explain a concept"}</b><span>Start with a guided prompt</span></button><button onClick={() => setPrompt(role === "teacher" ? "Guruh uchun 10 savollik diagnostik test tuz" : "Menga mini-test tuz")}> <b>{role === "teacher" ? "Build a quick quiz" : "Practice with a quiz"}</b><span>Generate something useful</span></button></div></div> : <>{messages.map(message => <article className={`message-row ${message.sender === "user" ? "user-message" : "assistant-message"}`} key={message.id}><div className={`message-avatar ${message.sender === "user" ? "user-avatar" : "ai-avatar"}`}>{message.sender === "user" ? initials(displayName) : <Sparkles size={15} />}</div><div className="message-body"><div className="message-author">{message.sender === "user" ? displayName : "Acadium"}</div><div className="message-text">{message.content}</div></div></article>)}{isGenerating && <div className="generating"><span /><span /><span /> Acadium is thinking…</div>}</>}</div></section><form className="composer-wrap" onSubmit={event => { event.preventDefault(); void sendPrompt(); }}><div className="composer"><textarea value={prompt} onChange={event => setPrompt(event.target.value.slice(0, 12000))} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendPrompt(); } }} placeholder={initData ? (role === "teacher" ? "Message Acadium about a lesson, quiz or presentation…" : "Message Acadium about what you want to learn…") : "Open this app in Telegram to start a saved conversation…"} rows={1} /><button type="submit" disabled={!prompt.trim() || isGenerating} aria-label="Send message"><Send size={18} /></button></div><div className="composer-note">Acadium can make mistakes. Review important educational content.</div></form></main>
  </div>;
}
