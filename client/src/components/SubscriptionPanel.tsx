import React, { useState } from "react";
import { CheckCircle2, CreditCard, ExternalLink, Loader2, MessageCircle, ShieldCheck, UploadCloud } from "lucide-react";
import { trpc } from "@/lib/trpc";

function formatUzs(value: number) { return `${new Intl.NumberFormat("uz-UZ").format(value)} UZS`; }

export default function SubscriptionPanel({ initData }: { initData: string }) {
  const statusQuery = trpc.subscription.status.useQuery({ initData }, { enabled: Boolean(initData), retry: false });
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");

  const uploadReceipt = async (file: File) => {
    setUploading(true); setUploadMessage(""); setUploadError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...Array.from(bytes.subarray(index, index + 0x8000)));
      const response = await fetch("/api/subscription/receipts/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData, fileName: file.name, mimeType: file.type || "application/octet-stream", dataBase64: btoa(binary) }) });
      const payload = await response.json() as { error?: string; approved?: boolean; message?: string };
      if (!response.ok) throw new Error(payload.error ?? "Receipt verification failed");
      setUploadMessage(payload.message ?? (payload.approved ? "Subscription activated." : "Receipt submitted."));
      await statusQuery.refetch();
    } catch (error) { setUploadError(error instanceof Error ? error.message : "Receipt verification failed"); }
    finally { setUploading(false); }
  };

  const data = statusQuery.data;
  if (statusQuery.isLoading) return <section className="subscription-panel subscription-loading"><Loader2 size={18} className="spin" /> Loading subscription status…</section>;
  return <section className="subscription-panel">
    <div className="subscription-heading"><div><div className="analysis-kicker"><CreditCard size={15} /> SUBSCRIPTION</div><h1>Keep your teaching momentum</h1><p>{data?.hasActiveSubscription ? `Individual plan is active until ${new Date(data.activeSubscription?.endsAt ?? Date.now()).toLocaleDateString()}.` : `${data?.sessionsRemaining ?? 3} free group session${data?.sessionsRemaining === 1 ? "" : "s"} remaining.`}</p></div><div className="subscription-status-badge"><CheckCircle2 size={15} />{data?.hasActiveSubscription ? "Active" : "Free plan"}</div></div>
    <div className="subscription-grid">
      <article className="subscription-card individual-plan"><div className="subscription-card-top"><div className="subscription-icon"><CreditCard size={19} /></div><span>INDIVIDUAL</span></div><h2>{formatUzs(data?.individualPrice ?? 99_000)} <small>/ month</small></h2><p>For one teacher who wants uninterrupted group lessons, analytics and source-grounded AI.</p><ul><li><ShieldCheck size={15} /> 31 days of access</li><li><ShieldCheck size={15} /> Unlimited new group sessions</li><li><ShieldCheck size={15} /> Web and Local AI modes</li></ul><a className="subscription-primary-button" href={data?.clickPaymentUrl} target="_blank" rel="noreferrer"><CreditCard size={16} /> Pay with Click <ExternalLink size={14} /></a><label className={`receipt-upload-button ${uploading ? "is-uploading" : ""}`}><UploadCloud size={16} />{uploading ? "Analyzing receipt…" : "Upload Click receipt"}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadReceipt(file); event.currentTarget.value = ""; }} /></label>{uploadMessage && <p className="subscription-success">{uploadMessage}</p>}{uploadError && <p className="subscription-error">{uploadError}</p>}</article>
      <article className="subscription-card enterprise-plan"><div className="subscription-card-top"><div className="subscription-icon enterprise-icon"><MessageCircle size={19} /></div><span>ENTERPRISE</span></div><h2>For learning centers</h2><p>Bring Acadium to a teaching center or team with a plan designed around your groups and staff.</p><div className="enterprise-note"><b>Need a team plan?</b><span>Contact us directly in Telegram for pricing, seats and onboarding.</span></div><a className="subscription-secondary-button" href={data?.enterpriseContact ?? "https://t.me/otabek_nabiyev1"} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Contact @otabek_nabiyev1 <ExternalLink size={14} /></a></article>
    </div>
    {data?.latestReceipt?.status === "pending" && <div className="receipt-pending"><Loader2 size={15} className="spin" /> Your latest receipt is being reviewed.</div>}
  </section>;
}
