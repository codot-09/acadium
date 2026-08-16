import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, ChevronLeft, Menu, MessageSquarePlus, MoreHorizontal, PanelLeft, Plus, Send, Sparkles, Trash2, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";

type ChatMessage = { id: string; sender: string; content: string; createdAt: Date | string };
type View = "chat" | "analyze";
type TelegramWindow = Window & { Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } } };

function initials(name: string) { return name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase() || "A"; }
function formatDate(value: Date | string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

export default function Home() {
  const [initData, setInitData] = useState("");
  const [profileName, setProfileName] = useState("Acadium");
  const [view, setView] = useState<View>("chat");
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
  const analytics = trpc.telegram.analytics.useQuery({ initData }, { enabled: Boolean(initData && view === "analyze"), retry: false });
  const saveMessage = trpc.chat.saveMessageToConversation.useMutation();
  const newConversation = trpc.chat.newConversation.useMutation({ onSuccess: conversation => { setSelectedConversationId(conversation.id); setMessages([]); void utils.chat.conversations.invalidate(); setView("chat"); } });
  const deleteConversation = trpc.chat.deleteConversation.useMutation({ onSuccess: ({ conversationId }) => { if (selectedConversationId === conversationId) { setSelectedConversationId(null); setMessages([]); } void utils.chat.thread.invalidate({ initData, conversationId }); void utils.chat.conversations.invalidate(); } });

  useEffect(() => {
    const telegram = (window as TelegramWindow).Telegram?.WebApp;
    telegram?.ready?.(); telegram?.expand?.();
    const value = telegram?.initData ?? "";
    setInitData(value);
    if (value) bootstrap.mutate({ initData: value });
  }, []);
  useEffect(() => { if (bootstrap.data) setProfileName(bootstrap.data.firstName || bootstrap.data.username || "Acadium"); }, [bootstrap.data]);
  useEffect(() => {
    if (dashboard.data?.profile) {
      setProfileName(dashboard.data.profile.firstName || dashboard.data.profile.username || "Acadium");
      if (!selectedConversationId && dashboard.data.conversation?.id) setSelectedConversationId(dashboard.data.conversation.id);
    }
  }, [dashboard.data, selectedConversationId]);
  useEffect(() => {
    const source = thread.data?.messages ?? (selectedConversationId === dashboard.data?.conversation?.id ? dashboard.data?.history : undefined);
    if (source) setMessages(source as ChatMessage[]);
  }, [thread.data, dashboard.data, selectedConversationId]);

  const currentConversation = useMemo(() => conversations.data?.find(item => item.id === selectedConversationId), [conversations.data, selectedConversationId]);

  const startNewChat = () => {
    if (!initData) { setSelectedConversationId(null); setMessages([]); setView("chat"); return; }
    newConversation.mutate({ initData, title: "New teaching chat" });
  };

  const sendPrompt = async () => {
    const text = prompt.trim(); if (!text || isGenerating) return;
    let conversationId = selectedConversationId;
    if (!conversationId && initData) { const created = await newConversation.mutateAsync({ initData, title: text.slice(0, 60) }); conversationId = created.id; setSelectedConversationId(conversationId); }
    const localUser: ChatMessage = { id: crypto.randomUUID(), sender: "user", content: text, createdAt: new Date() };
    setMessages(current => [...current, localUser]); setPrompt(""); setIsGenerating(true);
    if (initData && conversationId) await saveMessage.mutateAsync({ initData, conversationId, content: text });
    let streamed = "";
    try {
      const response = await fetch("/api/ai/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: text, role: "teacher", initData, conversationId }) });
      if (!response.ok || !response.body) throw new Error("AI stream unavailable");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop() ?? "";
        for (const frame of frames) { const line = frame.split("\n").find(item => item.startsWith("data: ")); if (!line) continue; const payload = line.slice(6); if (payload === "[DONE]") continue; streamed += JSON.parse(payload).text ?? ""; setMessages(current => [...current.filter(message => message.id !== "streaming"), { id: "streaming", sender: "assistant", content: streamed, createdAt: new Date() }]); }
      }
    } catch { streamed = "AI generator is not connected yet. Check the Telegram bot and LLM configuration."; setMessages(current => [...current.filter(message => message.id !== "streaming"), { id: "streaming", sender: "assistant", content: streamed, createdAt: new Date() }]); }
    setIsGenerating(false); void utils.chat.thread.invalidate(); void utils.chat.conversations.invalidate();
  };

  const data = analytics.data;
  const maxActivity = Math.max(...(data?.activity?.map(item => item.materials + item.sessions + item.assignments) ?? [1]), 1);

  return <div className="chat-app">
    <aside className={`chat-sidebar ${sidebarOpen ? "open" : "closed"}`}>
      <div className="sidebar-top"><button className="brand-button" onClick={() => setSidebarOpen(true)}><div className="brand-mark">A</div>{sidebarOpen && <span>acadium</span>}</button>{sidebarOpen && <button className="square-button" onClick={startNewChat} aria-label="New chat"><MessageSquarePlus size={18} /></button>}</div>
      {sidebarOpen && <><button className="new-chat-button" onClick={startNewChat}><Plus size={16} /> New teaching chat</button><div className="history-label">Workspace</div><nav className="teacher-nav"><button className={view === "chat" ? "nav-active" : ""} onClick={() => setView("chat")}><Sparkles size={16} /><span>AI teacher assistant</span></button><button className={view === "analyze" ? "nav-active" : ""} onClick={() => setView("analyze")}><BarChart3 size={16} /><span>Analyze students</span></button></nav><div className="history-label">Recent chats</div><div className="conversation-list">{conversations.data?.map(conversation => <div className={`conversation-row ${selectedConversationId === conversation.id && view === "chat" ? "selected" : ""}`} key={conversation.id}><button className="conversation-item" onClick={() => { setSelectedConversationId(conversation.id); setView("chat"); }}><MessageSquarePlus size={15} /><span>{conversation.title}</span></button><button className="delete-chat-button" aria-label={`Delete ${conversation.title}`} title="Delete chat" onClick={() => { if (window.confirm("Delete this chat permanently?")) deleteConversation.mutate({ initData, conversationId: conversation.id }); }} disabled={deleteConversation.isPending}><Trash2 size={14} /></button></div>)}{!conversations.data?.length && <p className="empty-history">Open Acadium inside Telegram to save real chats.</p>}</div><div className="sidebar-footer"><div className="account-row"><div className="account-avatar">{initials(profileName)}</div><div><b>{profileName}</b><span>{initData ? "Teacher workspace" : "Preview mode"}</span></div><MoreHorizontal size={16} /></div></div></>}
    </aside>
    <main className="chat-main"><header className="chat-header"><button className="header-icon" onClick={() => setSidebarOpen(current => !current)}><PanelLeft size={18} /></button><div className="model-picker"><Sparkles size={15} /> Acadium <span>·</span> {view === "chat" ? "Teacher assistant" : "Analyze"}</div><button className="header-icon"><MoreHorizontal size={18} /></button></header>
      {view === "chat" ? <><section className="chat-thread"><div className="thread-inner">{!messages.length ? <div className="welcome-state"><div className="welcome-icon"><Sparkles size={24} /></div><h1>What will you teach today?</h1><p>Turn one clear idea into a lesson plan, quiz and presentation outline.</p><div className="suggestion-grid"><button onClick={() => setPrompt("8-sinf biologiya uchun fotosintez mavzusida dars rejasi, test va taqdimot tayyorla")}><b>Create a lesson kit</b><span>Plan · quiz · presentation</span></button><button onClick={() => setPrompt("O‘quvchilarim uchun 10 savollik diagnostik test tuz") }><b>Understand your class</b><span>Prepare a quick assessment</span></button></div></div> : <>{messages.map(message => <article className={`message-row ${message.sender === "user" ? "user-message" : "assistant-message"}`} key={message.id}><div className={`message-avatar ${message.sender === "user" ? "user-avatar" : "ai-avatar"}`}>{message.sender === "user" ? initials(profileName) : <Sparkles size={15} />}</div><div className="message-body"><div className="message-author">{message.sender === "user" ? profileName : "Acadium"}</div><div className="message-text">{message.content}</div></div></article>)}{isGenerating && <div className="generating"><span /><span /><span /> Acadium is thinking…</div>}</>}</div></section><form className="composer-wrap" onSubmit={event => { event.preventDefault(); void sendPrompt(); }}><div className="composer"><textarea value={prompt} onChange={event => setPrompt(event.target.value.slice(0, 12000))} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendPrompt(); } }} placeholder={initData ? "Message Acadium about your students or next lesson…" : "Open this app in Telegram to save real teacher chats…"} rows={1} /><button type="submit" disabled={!prompt.trim() || isGenerating} aria-label="Send message"><Send size={18} /></button></div><div className="composer-note">{currentConversation ? `Saved in ${currentConversation.title}` : "Acadium can make mistakes. Review important educational content."}</div></form></> : <section className="analysis-page"><div className="analysis-heading"><div><div className="analysis-kicker"><BarChart3 size={15} /> TEACHER ANALYZE</div><h1>Understand your class</h1><p>Simple signals from your real Acadium activity. No estimates, only saved data.</p></div><button className="back-chat" onClick={() => setView("chat")}><ChevronLeft size={16} /> Back to chat</button></div>{!initData ? <div className="analysis-empty"><BarChart3 size={30} /><h3>Open Acadium in Telegram</h3><p>When you open the Mini App, we will load your real students, materials, assignments and sessions here.</p></div> : <><div className="kpi-grid"><div className="kpi-card"><Users size={18} /><span>Students connected</span><b>{data?.students ?? 0}</b><small>Linked to your teacher account</small></div><div className="kpi-card"><Users size={18} /><span>Group learners</span><b>{data?.groupStudents ?? 0}</b><small>Students seen in live lessons</small></div><div className="kpi-card"><MessageSquarePlus size={18} /><span>Group responses</span><b>{data?.groupAnswers ?? 0}</b><small>Answers recorded by the bot</small></div><div className="kpi-card"><Sparkles size={18} /><span>Materials created</span><b>{data?.materials ?? 0}</b><small>Lesson kits saved in database</small></div><div className="kpi-card"><BookOpen size={18} /><span>Tasks assigned</span><b>{data?.assignments ?? 0}</b><small>Assignments created for students</small></div><div className="kpi-card"><BarChart3 size={18} /><span>Review progress</span><b>{data?.reviewRate ?? 0}%</b><small>{data?.reviewedSubmissions ?? 0} of {data?.submissions ?? 0} submissions reviewed</small></div></div><div className="analysis-grid"><section className="chart-card"><div className="section-title"><div><h2>Teaching activity</h2><p>What you created in the last 7 days</p></div><span>Live database</span></div><div className="bar-chart">{data?.activity.map(item => { const total = item.materials + item.sessions + item.assignments; return <div className="bar-column" key={item.label}><div className="bar-value">{total || ""}</div><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(total ? (total / maxActivity) * 100 : 4, 4)}%` }} /></div><span>{item.label}</span></div>})}</div><div className="legend"><span><i className="legend-material" />Materials</span><span><i className="legend-session" />Sessions</span><span><i className="legend-task" />Tasks</span></div></section><section className="insight-card"><div className="section-title"><div><h2>What this means</h2><p>Plain-language guidance</p></div><Sparkles size={17} /></div><div className="insight-line"><b>{data?.students ? "Your class is connected." : "No students connected yet."}</b><span>{data?.students ? `${data.students} student${data.students === 1 ? " is" : "s are"} linked to your workspace.` : "Invite students or connect a Telegram group to begin."}</span></div><div className="insight-line"><b>{data?.materials ? "You are creating momentum." : "Start with one lesson kit."}</b><span>{data?.materials ? `${data.materials} material${data.materials === 1 ? " is" : "s are"} saved for reuse.` : "One prompt can produce a complete teaching kit."}</span></div><div className="insight-line"><b>{data?.reviewRate && data.reviewRate >= 70 ? "Feedback rhythm is healthy." : "Review student work regularly."}</b><span>{data?.reviewRate ?? 0}% of submitted work has a review status.</span></div></section></div><section className="student-table-card"><div className="section-title"><div><h2>Student participation</h2><p>Real activity recorded in group lessons</p></div><Users size={17} /></div>{data?.groupStudentBreakdown?.length ? <div className="student-table">{data.groupStudentBreakdown.map(student => <div className="student-row" key={student.profileId}><div className="student-name"><div className="student-mini-avatar">{initials(student.name)}</div><span><b>{student.name}</b><small>{student.username ? `@${student.username}` : "Telegram student"}</small><small className={student.needsTeacher ? "student-insight needs-review" : "student-insight"}>{student.lastClassification ? `${student.lastClassification} · ${student.averageConfidence ?? "—"}% confidence${student.needsTeacher ? " · teacher follow-up" : ""}` : "No AI response yet"}</small></span></div><div><b>{student.attendance}</b><small>lessons</small></div><div><b>{student.participation}</b><small>participation</small></div><div><b>{student.answers}</b><small>answers</small></div><div><b>{student.lastActivity ? formatDate(student.lastActivity) : "—"}</b><small>last active</small></div></div>)}</div> : <div className="student-table-empty">No group lesson participation has been recorded yet.</div>}</section><section className="student-table-card session-summary-card"><div className="section-title"><div><h2>Lesson sessions</h2><p>Attendance and responses by live group lesson</p></div><BarChart3 size={17} /></div>{data?.sessionAnalytics?.length ? <div className="student-table">{data.sessionAnalytics.map(session => <div className="student-row session-row" key={session.sessionId}><div className="student-name"><div className="student-mini-avatar"><BookOpen size={13} /></div><span><b>{session.title}</b><small>{session.groupTitle} · {session.status}</small></span></div><div><b>{session.attendance}</b><small>attendance</small></div><div><b>{session.responses}</b><small>responses</small></div><div><b>{session.participation}</b><small>activity</small></div></div>)}</div> : <div className="student-table-empty">No group sessions have been recorded yet.</div>}</section></>}</section>}
    </main>
  </div>;
}
