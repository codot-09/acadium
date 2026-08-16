import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronDown, FileText, GraduationCap, Layers3, LayoutDashboard, Menu, MessageCircle, MoreHorizontal, Play, Plus, Send, Sparkles, Users, WandSparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Role = "teacher" | "student";
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; time: string };
type TelegramWindow = Window & { Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } } };

const demoStudents = [
  { id: 1, name: "Dilnoza Karimova", handle: "@dilnoza_k", progress: 86, initials: "DK", tone: "rose" },
  { id: 2, name: "Azizbek Soliyev", handle: "@aziz_s", progress: 72, initials: "AS", tone: "blue" },
  { id: 3, name: "Madina Rustamova", handle: "@madina_r", progress: 64, initials: "MR", tone: "violet" },
  { id: 4, name: "Javohir Akmalov", handle: "@javohir_a", progress: 51, initials: "JA", tone: "amber" },
];

const initialMessages: ChatMessage[] = [
  { id: "hello", role: "assistant", text: "Assalomu alaykum, Mohira. Bugun qaysi bilimni shaklga keltiramiz? Men dars rejasi, test va taqdimot tuzilmasini bitta promptdan tayyorlab beraman.", time: "09:41" },
  { id: "tip", role: "assistant", text: "Masalan: “8-sinf uchun fotosintez mavzusida 45 daqiqalik interaktiv dars tayyorla.”", time: "09:41" },
];

function SacredMark({ small = false }: { small?: boolean }) {
  return <div className={small ? "sacred-mark small" : "sacred-mark"}><div className="mark-orbit orbit-one" /><div className="mark-orbit orbit-two" /><div className="mark-core">A</div></div>;
}
function Avatar({ initials, tone = "navy" }: { initials: string; tone?: string }) { return <div className={`avatar ${tone}`}>{initials}</div>; }

export default function Home() {
  const [role, setRole] = useState<Role>("teacher");
  const [activeNav, setActiveNav] = useState("Overview");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isGenerating, setIsGenerating] = useState(false);
  const [telegramInitData, setTelegramInitData] = useState("");
  const [profileName, setProfileName] = useState("Mohira");
  const [exported, setExported] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [individualText, setIndividualText] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<{ title: string; prompt: string; lessonPlan: string; quiz: string; slidesJson: string } | null>(null);

  const utils = trpc.useUtils();
  const bootstrap = trpc.telegram.bootstrap.useMutation();
  const dashboard = trpc.telegram.dashboard.useQuery({ initData: telegramInitData }, { enabled: Boolean(telegramInitData), retry: false });
  const roleMutation = trpc.telegram.selectRole.useMutation();
  const saveUserMessage = trpc.chat.saveUserMessage.useMutation();
  const saveAssistantMessage = trpc.chat.saveAssistantMessage.useMutation();
  const openStudentChat = trpc.teacher.openStudentChat.useMutation();
  const sendIndividualMessage = trpc.chat.sendIndividualMessage.useMutation({ onSuccess: () => { if (openStudentChat.data?.id) utils.chat.individualHistory.invalidate({ initData: telegramInitData, conversationId: openStudentChat.data.id }); } });
  const individualConversation = trpc.chat.individualHistory.useQuery({ initData: telegramInitData, conversationId: openStudentChat.data?.id ?? "pending" }, { enabled: Boolean(telegramInitData && openStudentChat.data?.id), retry: false });
  const individualResults = trpc.teacher.studentResults.useQuery({ initData: telegramInitData, studentProfileId: selectedStudent ?? 0 }, { enabled: Boolean(telegramInitData && selectedStudent), retry: false });

  useEffect(() => {
    const telegram = (window as TelegramWindow).Telegram?.WebApp;
    telegram?.ready?.(); telegram?.expand?.();
    const initData = telegram?.initData ?? "";
    setTelegramInitData(initData);
    if (initData) bootstrap.mutate({ initData }, { onSuccess: profile => setProfileName(profile.firstName || "Teacher") });
  }, []);
  useEffect(() => {
    if (dashboard.data?.profile?.role) setRole(dashboard.data.profile.role);
    if (dashboard.data?.history?.length) {
      setMessages(dashboard.data.history.map(message => ({ id: message.id, role: message.sender === "assistant" ? "assistant" : "user", text: message.content, time: new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })));
    }
  }, [dashboard.data]);

  const navItems = role === "teacher" ? ["Overview", "AI Studio", "Students", "Group sessions"] : ["My learning", "Assignments", "My progress", "Messages"];
  const teacherData = dashboard.data?.dashboard as { students?: Array<{ id: number; firstName: string; lastName: string | null; username: string | null; role: string }>; materials?: Array<{ id: string; title: string; prompt: string; lessonPlan: string; quiz: string; slidesJson: string; createdAt: string | Date }>; sessions?: Array<{ id: string; title: string; status: string; createdAt: string | Date }> } | undefined;
  const liveStudents = teacherData?.students?.length ? teacherData.students.map((student, index) => ({ id: student.id, name: `${student.firstName} ${student.lastName ?? ""}`.trim(), handle: student.username ? `@${student.username}` : "Telegram student", progress: 0, initials: student.firstName.slice(0, 2).toUpperCase(), tone: ["rose", "blue", "violet", "amber"][index % 4] })) : demoStudents;
  const stats = role === "teacher" ? [{ label: "Active students", value: teacherData?.students?.length ? String(teacherData.students.length) : "24", delta: "+12%", icon: Users }, { label: "Materials created", value: teacherData?.materials?.length ? String(teacherData.materials.length) : "38", delta: "+8", icon: WandSparkles }, { label: "Avg. engagement", value: "87%", delta: "+5.4%", icon: Sparkles }] : [{ label: "Completed lessons", value: "18", delta: "+3", icon: CheckCircle2 }, { label: "Current streak", value: "12 d", delta: "+1", icon: Sparkles }, { label: "Average score", value: "92%", delta: "+6.2%", icon: GraduationCap }];
  const welcome = useMemo(() => `Good morning, ${profileName}`, [profileName]);

  const sendPrompt = async (value = prompt) => {
    const text = value.trim(); if (!text || isGenerating) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages(current => [...current, { id: crypto.randomUUID(), role: "user", text, time: now }]); setPrompt(""); setIsGenerating(true);
    if (telegramInitData) saveUserMessage.mutate({ initData: telegramInitData, content: text });
    let streamed = "";
    try {
      const response = await fetch("/api/ai/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: text, role, initData: telegramInitData }) });
      if (!response.ok || !response.body) throw new Error("AI stream unavailable");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { value: chunk, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const frames = buffer.split("\\n\\n"); buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\\n").find(item => item.startsWith("data: ")); if (!line) continue;
          const payload = line.slice(6); if (payload === "[DONE]") continue;
          const parsed = JSON.parse(payload); streamed += parsed.text ?? "";
          setMessages(current => [...current.filter(message => message.id !== "streaming"), { id: "streaming", role: "assistant", text: streamed, time: now }]);
        }
      }
    } catch {
      const fallback = role === "teacher" ? `Ajoyib tanlov. “${text}” uchun dars rejasi, test va 10 slaydlik taqdimot tuzilmasini tayyorlashni boshladim.` : `Bu mavzuni birga ochamiz. ${text} bo‘yicha qisqa tushuntirish va mini-test tayyorlayman.`;
      streamed = fallback;
      for (let i = 1; i <= fallback.length; i += 5) { await new Promise(resolve => setTimeout(resolve, 18)); setMessages(current => [...current.filter(message => message.id !== "streaming"), { id: "streaming", role: "assistant", text: fallback.slice(0, i), time: now }]); }
    }
    if (telegramInitData && streamed) saveAssistantMessage.mutate({ initData: telegramInitData, content: streamed });
    setIsGenerating(false);
  };
  const chooseRole = (nextRole: Role) => { setRole(nextRole); if (telegramInitData) roleMutation.mutate({ initData: telegramInitData, role: nextRole }); };
  const exportMaterial = () => { const content = { title: prompt || "Fotosintez: hayot energiyasi", lessonPlan: "Kirish, tajriba, refleksiya", quiz: ["Fotosintez qayerda sodir bo‘ladi?", "Xlorofillning vazifasi nima?"], slides: 10 }; const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "acadium-material.json"; anchor.click(); URL.revokeObjectURL(url); setExported(true); setTimeout(() => setExported(false), 2200); };

  return <div className="app-shell"><div className="geometry geometry-large" /><div className="geometry geometry-small" />
    <aside className="sidebar"><div className="brand"><SacredMark small /><span>acadium</span></div><div className="workspace-switch"><div className="workspace-icon"><LayoutDashboard size={16} /></div><div><b>{role === "teacher" ? "Teacher studio" : "Learning space"}</b><span>Personal workspace</span></div><ChevronDown size={15} /></div><div className="nav-caption">Workspace</div><nav>{navItems.map((item, index) => { const icons = [LayoutDashboard, WandSparkles, Users, Play]; const Icon = icons[index] || BookOpen; return <button key={item} onClick={() => setActiveNav(item)} className={activeNav === item ? "active" : ""}><Icon size={17} /><span>{item}</span>{item === "Messages" && <em>3</em>}</button>; })}</nav><div className="nav-caption lower">Library</div><nav><button><FileText size={17} /><span>Saved materials</span></button><button><MessageCircle size={17} /><span>Messages</span><em>3</em></button></nav><div className="sidebar-bottom"><div className="help-card"><div className="help-spark"><Sparkles size={15} /></div><b>Need a little guidance?</b><span>Explore the Acadium guide</span><button>View guide <span>↗</span></button></div><div className="profile"><Avatar initials={profileName.slice(0, 2).toUpperCase()} tone="gold" /><div><b>{profileName}</b><span>{role === "teacher" ? "Teacher" : "Student"}</span></div><MoreHorizontal size={17} /></div></div></aside>
    <main className="main-area"><header className="topbar"><button className="mobile-menu"><Menu size={19} /></button><div className="breadcrumbs"><span>Acadium</span><i>/</i><b>{activeNav}</b></div><div className="top-actions"><div className="role-toggle"><button onClick={() => chooseRole("teacher")} className={role === "teacher" ? "selected" : ""}>Teacher</button><button onClick={() => chooseRole("student")} className={role === "student" ? "selected" : ""}>Student</button></div><button className="icon-button"><MessageCircle size={17} /><span className="notification-dot" /></button><Avatar initials={profileName.slice(0, 2).toUpperCase()} tone="gold" /></div></header>
      <section className="content"><div className="intro-row"><div><div className="eyebrow"><span className="eyebrow-line" /> {role === "teacher" ? "TEACHER COMMAND CENTER" : "YOUR LEARNING JOURNEY"}</div><h1>{welcome} <span className="wave">✦</span></h1><p>{role === "teacher" ? "Turn your ideas into meaningful learning experiences." : "Small steps, thoughtful questions, lasting understanding."}</p></div><div className="date-pill"><span className="status-pulse" /> Monday, 16 August 2026</div></div>
        <div className="stat-grid">{stats.map(({ label, value, delta, icon: Icon }) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={16} /></div></div><div className="stat-value">{value}</div><div className="stat-delta"><span>↗</span> {delta} <small>this month</small></div></div>)}</div>
        <div className="work-grid"><section className="chat-card card-surface"><div className="card-heading"><div><div className="heading-kicker"><span className="live-dot" /> AI COMPANION</div><h2>{role === "teacher" ? "What shall we create today?" : "Ask, explore, understand."}</h2></div><button className="more-button"><MoreHorizontal size={18} /></button></div><div className="chat-body">{messages.map(message => <div className={`chat-message ${message.role}`} key={message.id}><div className="message-avatar">{message.role === "assistant" ? <SacredMark small /> : <Avatar initials={profileName.slice(0, 2).toUpperCase()} tone="gold" />}</div><div className="message-content"><div className="message-meta"><b>{message.role === "assistant" ? "Acadium AI" : profileName}</b><span>{message.time}</span></div><p>{message.text}</p></div></div>)}{isGenerating && <div className="typing"><span /><span /><span /> Generating with care…</div>}</div><div className="prompt-area"><div className="prompt-tools"><span className="prompt-label"><Sparkles size={14} /> {role === "teacher" ? "One prompt. A complete lesson." : "Ask Acadium anything."}</span><span className="char-count">{prompt.length}/500</span></div><textarea value={prompt} onChange={event => setPrompt(event.target.value.slice(0, 500))} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendPrompt(); } }} placeholder={role === "teacher" ? "Describe the lesson you have in mind…" : "What would you like to learn today?"} /><div className="prompt-footer"><div className="prompt-chips"><button onClick={() => setPrompt("8-sinf uchun fotosintez mavzusida interaktiv dars tayyorla")}>+ Add context</button><span>⌘ Enter to generate</span></div><button className="send-button" onClick={() => sendPrompt()} disabled={isGenerating || !prompt.trim()}><Send size={16} /> Generate</button></div></div></section>
          <aside className="right-column">{role === "teacher" ? <><section className="studio-card card-surface"><div className="card-heading compact"><div><div className="heading-kicker gold-text">AI STUDIO</div><h3>From thought to teaching</h3></div><WandSparkles size={19} className="gold-icon" /></div><p>One thoughtful prompt creates a lesson plan, quiz and presentation outline.</p><button className="studio-template" onClick={() => setPrompt("8-sinf biologiya uchun fotosintez mavzusida 45 daqiqalik interaktiv dars tayyorla")}><div className="template-icon"><Layers3 size={18} /></div><div><b>Lesson material kit</b><span>Plan · Quiz · 10 slides</span></div><span className="template-arrow">↗</span></button><div className="studio-actions"><button onClick={() => sendPrompt("8-sinf biologiya uchun fotosintez mavzusida 45 daqiqalik interaktiv dars tayyorla")}><Play size={14} /> Try a prompt</button><button onClick={exportMaterial}><FileText size={14} /> {exported ? "Exported" : "Export JSON"}</button></div></section><section className="people-card card-surface"><div className="card-heading compact"><div><div className="heading-kicker">YOUR STUDENTS</div><h3>Keep the circle close</h3></div><button className="text-button">View all <span>↗</span></button></div><div className="student-list">{liveStudents.map(student => <div className="student-row" key={student.handle}><Avatar initials={student.initials} tone={student.tone} /><div className="student-info"><b>{student.name}</b><span>{student.handle}</span></div><div className="student-progress"><div className="progress-track"><div style={{ width: `${student.progress}%` }} /></div><span>{student.progress}%</span></div><button className="student-chat-button" onClick={() => { setSelectedStudent(student.id); if (telegramInitData) openStudentChat.mutate({ initData: telegramInitData, studentProfileId: student.id }); }}>{selectedStudent === student.id ? "Open" : "Chat"}</button></div>)}</div><button className="invite-button"><Plus size={15} /> Invite a student</button></section><section className="insights-card card-surface"><div className="card-heading compact"><div><div className="heading-kicker">TEACHING RHYTHM</div><h3>Materials & sessions</h3></div><Sparkles size={17} className="gold-icon" /></div><div className="insight-row"><span>AI materials saved</span><b>{teacherData?.materials?.length ?? 0}</b></div><div className="insight-row"><span>Group sessions</span><b>{teacherData?.sessions?.length ?? 0}</b></div><div className="insight-row"><span>Next action</span><b className="insight-accent">Start a session ↗</b></div><div className="history-list">{teacherData?.materials?.slice(0, 3).map(material => <div className="history-item" key={material.id}><div><b>{material.title}</b><span>{new Date(material.createdAt).toLocaleDateString()} · {material.prompt.slice(0, 42)}…</span></div><button onClick={() => setSelectedMaterial({ title: material.title, prompt: material.prompt, lessonPlan: material.lessonPlan, quiz: material.quiz, slidesJson: material.slidesJson })}>View</button><button onClick={exportMaterial}>Export</button></div>)}</div>{selectedMaterial && <div className="material-preview"><b>{selectedMaterial.title}</b><span>{selectedMaterial.prompt}</span><p><strong>Lesson plan:</strong> {selectedMaterial.lessonPlan}</p><p><strong>Quiz:</strong> {selectedMaterial.quiz}</p><p><strong>Slides:</strong> {JSON.parse(selectedMaterial.slidesJson).map((slide: { title: string }, index: number) => `${index + 1}. ${slide.title}`).join(" · ")}</p></div>}</section></> : <><section className="focus-card card-surface"><div className="focus-orbit" /><div className="heading-kicker gold-text">TODAY’S FOCUS</div><h3>Biology · Photosynthesis</h3><p>Continue your lesson from where you left off.</p><div className="focus-progress"><div><span>Lesson 4 of 6</span><b>68%</b></div><div className="progress-track"><div style={{ width: "68%" }} /></div></div><button className="primary-wide"><Play size={15} /> Continue learning</button></section><section className="assignment-card card-surface"><div className="card-heading compact"><div><div className="heading-kicker">UP NEXT</div><h3>Your assignments</h3></div><button className="text-button">See all <span>↗</span></button></div><div className="assignment-row"><div className="assignment-icon"><FileText size={17} /></div><div><b>Reflection: cell energy</b><span>Due tomorrow · 15 min</span></div><span className="assignment-status">Open</span></div><div className="assignment-row"><div className="assignment-icon green"><CheckCircle2 size={17} /></div><div><b>Lab notes review</b><span>Completed yesterday</span></div><span className="assignment-status done">Done</span></div></section></>}</aside></div>{selectedStudent && openStudentChat.data ? <section className="individual-panel card-surface"><div className="card-heading compact"><div><div className="heading-kicker gold-text">INDIVIDUAL SESSION</div><h3>Student workspace #{selectedStudent}</h3></div><button className="text-button" onClick={() => setSelectedStudent(null)}>Close</button></div><div className="individual-thread">{individualConversation.data?.length ? individualConversation.data.map(message => <div className={`individual-message ${message.sender === "teacher" ? "from-teacher" : "from-student"}`} key={message.id}><b>{message.sender === "teacher" ? "Teacher" : "Student"}</b><p>{message.content}</p></div>) : <p className="empty-thread">No messages yet. Start a focused conversation with this student.</p>}</div><div className="individual-compose"><input value={individualText} onChange={event => setIndividualText(event.target.value)} placeholder="Write feedback or a task…" onKeyDown={event => { if (event.key === "Enter" && individualText.trim() && telegramInitData) { sendIndividualMessage.mutate({ initData: telegramInitData, conversationId: openStudentChat.data!.id, content: individualText.trim() }); setIndividualText(""); } }} /><button className="send-button" onClick={() => { if (individualText.trim() && telegramInitData) { sendIndividualMessage.mutate({ initData: telegramInitData, conversationId: openStudentChat.data!.id, content: individualText.trim() }); setIndividualText(""); } }}><Send size={14} /> Send</button></div><div className="submission-review"><span>Assignment review</span>{individualResults.data?.length ? individualResults.data.map(result => <div className="result-row" key={result.submission.id}><b>{result.assignment.title}</b><span>{result.submission.status} · {new Date(result.submission.submittedAt).toLocaleDateString()}</span></div>) : <b>No submissions yet.</b>}</div></section> : null}<footer className="page-footer"><span><SacredMark small /> Crafted for meaningful learning</span><span>Acadium · 2026</span></footer></section></main></div>;
}
