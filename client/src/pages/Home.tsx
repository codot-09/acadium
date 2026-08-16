import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronDown, FileText, GraduationCap, Layers3, LayoutDashboard, Menu, MessageCircle, MoreHorizontal, Play, Plus, Send, Sparkles, Users, WandSparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Role = "teacher" | "student";
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; time: string };
type TelegramWindow = Window & { Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } } };

const demoStudents = [
  { name: "Dilnoza Karimova", handle: "@dilnoza_k", progress: 86, initials: "DK", tone: "rose" },
  { name: "Azizbek Soliyev", handle: "@aziz_s", progress: 72, initials: "AS", tone: "blue" },
  { name: "Madina Rustamova", handle: "@madina_r", progress: 64, initials: "MR", tone: "violet" },
  { name: "Javohir Akmalov", handle: "@javohir_a", progress: 51, initials: "JA", tone: "amber" },
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

  const bootstrap = trpc.telegram.bootstrap.useMutation();
  const dashboard = trpc.telegram.dashboard.useQuery({ initData: telegramInitData }, { enabled: Boolean(telegramInitData), retry: false });
  const roleMutation = trpc.telegram.selectRole.useMutation();

  useEffect(() => {
    const telegram = (window as TelegramWindow).Telegram?.WebApp;
    telegram?.ready?.(); telegram?.expand?.();
    const initData = telegram?.initData ?? "";
    setTelegramInitData(initData);
    if (initData) bootstrap.mutate({ initData }, { onSuccess: profile => setProfileName(profile.firstName || "Teacher") });
  }, []);
  useEffect(() => { if (dashboard.data?.profile?.role) setRole(dashboard.data.profile.role); }, [dashboard.data]);

  const navItems = role === "teacher" ? ["Overview", "AI Studio", "Students", "Group sessions"] : ["My learning", "Assignments", "My progress", "Messages"];
  const stats = role === "teacher" ? [{ label: "Active students", value: "24", delta: "+12%", icon: Users }, { label: "Materials created", value: "38", delta: "+8", icon: WandSparkles }, { label: "Avg. engagement", value: "87%", delta: "+5.4%", icon: Sparkles }] : [{ label: "Completed lessons", value: "18", delta: "+3", icon: CheckCircle2 }, { label: "Current streak", value: "12 d", delta: "+1", icon: Sparkles }, { label: "Average score", value: "92%", delta: "+6.2%", icon: GraduationCap }];
  const welcome = useMemo(() => `Good morning, ${profileName}`, [profileName]);

  const sendPrompt = async (value = prompt) => {
    const text = value.trim(); if (!text || isGenerating) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages(current => [...current, { id: crypto.randomUUID(), role: "user", text, time: now }]); setPrompt(""); setIsGenerating(true);
    const answer = role === "teacher" ? `Ajoyib tanlov. “${text}” mavzusi uchun darsni uch qatlamda shakllantiryapman: 1) 45 daqiqalik maqsad va faoliyatlar, 2) 8 ta darajali test savoli, 3) 10 slaydlik hikoya va har bir slayd uchun vizual yo‘nalish.\n\nNatija tayyor bo‘lgach, uni o‘quvchilar bilan ulashish yoki taqdimot sifatida eksport qilish mumkin.` : `Bu mavzuni birga ochamiz. Men senga qisqa tushuntirish, misol va o‘zingni tekshirish uchun mini-test tayyorlayman. Avval ${text.toLowerCase()} bo‘yicha nimani bilishingni aytib ber.`;
    for (let i = 1; i <= answer.length; i += 5) { await new Promise(resolve => setTimeout(resolve, 22)); setMessages(current => [...current.filter(message => message.id !== "streaming"), { id: "streaming", role: "assistant", text: answer.slice(0, i), time: now }]); }
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
          <aside className="right-column">{role === "teacher" ? <><section className="studio-card card-surface"><div className="card-heading compact"><div><div className="heading-kicker gold-text">AI STUDIO</div><h3>From thought to teaching</h3></div><WandSparkles size={19} className="gold-icon" /></div><p>One thoughtful prompt creates a lesson plan, quiz and presentation outline.</p><button className="studio-template" onClick={() => setPrompt("8-sinf biologiya uchun fotosintez mavzusida 45 daqiqalik interaktiv dars tayyorla")}><div className="template-icon"><Layers3 size={18} /></div><div><b>Lesson material kit</b><span>Plan · Quiz · 10 slides</span></div><span className="template-arrow">↗</span></button><div className="studio-actions"><button onClick={() => sendPrompt("8-sinf biologiya uchun fotosintez mavzusida 45 daqiqalik interaktiv dars tayyorla")}><Play size={14} /> Try a prompt</button><button onClick={exportMaterial}><FileText size={14} /> {exported ? "Exported" : "Export JSON"}</button></div></section><section className="people-card card-surface"><div className="card-heading compact"><div><div className="heading-kicker">YOUR STUDENTS</div><h3>Keep the circle close</h3></div><button className="text-button">View all <span>↗</span></button></div><div className="student-list">{demoStudents.map(student => <div className="student-row" key={student.handle}><Avatar initials={student.initials} tone={student.tone} /><div className="student-info"><b>{student.name}</b><span>{student.handle}</span></div><div className="student-progress"><div className="progress-track"><div style={{ width: `${student.progress}%` }} /></div><span>{student.progress}%</span></div></div>)}</div><button className="invite-button"><Plus size={15} /> Invite a student</button></section></> : <><section className="focus-card card-surface"><div className="focus-orbit" /><div className="heading-kicker gold-text">TODAY’S FOCUS</div><h3>Biology · Photosynthesis</h3><p>Continue your lesson from where you left off.</p><div className="focus-progress"><div><span>Lesson 4 of 6</span><b>68%</b></div><div className="progress-track"><div style={{ width: "68%" }} /></div></div><button className="primary-wide"><Play size={15} /> Continue learning</button></section><section className="assignment-card card-surface"><div className="card-heading compact"><div><div className="heading-kicker">UP NEXT</div><h3>Your assignments</h3></div><button className="text-button">See all <span>↗</span></button></div><div className="assignment-row"><div className="assignment-icon"><FileText size={17} /></div><div><b>Reflection: cell energy</b><span>Due tomorrow · 15 min</span></div><span className="assignment-status">Open</span></div><div className="assignment-row"><div className="assignment-icon green"><CheckCircle2 size={17} /></div><div><b>Lab notes review</b><span>Completed yesterday</span></div><span className="assignment-status done">Done</span></div></section></>}</aside></div><footer className="page-footer"><span><SacredMark small /> Crafted for meaningful learning</span><span>Acadium · 2026</span></footer></section></main></div>;
}
