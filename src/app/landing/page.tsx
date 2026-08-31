"use client";

import { useEffect, useRef, useState } from "react";
import { ZenoMark } from "@/modules/identity/presentation/zeno-mark";

// ─── Particle canvas ─────────────────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; r: number }[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    function init() {
      if (!canvas) return;
      particles.length = 0;
      for (let i = 0; i < 75; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          r: Math.random() * 1.4 + 0.4,
        });
      }
    }
    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(242,121,60,${0.055 * (1 - d / 130)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(242,121,60,0.16)";
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        if (!canvas) return;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      });
      animId = requestAnimationFrame(draw);
    }
    resize(); init(); draw();
    window.addEventListener("resize", () => { resize(); init(); });
    return () => { cancelAnimationFrame(animId); };
  }, []);
  return (
    <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }} />
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 2.5rem", height: "60px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(11,11,16,0.9)" : "transparent",
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: scrolled ? "1px solid rgba(42,43,52,0.7)" : "none",
      transition: "background 240ms ease, border-color 240ms ease",
    }}>
      <ZenoMark size={26} className="text-[var(--zeno-ink)] text-[1rem] font-semibold tracking-tight" />
      <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
        {[["Features", "#features"], ["How It Works", "#how-it-works"], ["Pricing", "#pricing"]].map(([label, href]) => (
          <a key={label} href={href} style={{ color: "#9a9aa3", textDecoration: "none", fontSize: "0.875rem", transition: "color 160ms" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#f5f5f2")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#9a9aa3")}>{label}</a>
        ))}
        <a href="/auth/sign-in" style={{
          background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)",
          color: "white", padding: "0.45rem 1.1rem", borderRadius: 9,
          textDecoration: "none", fontWeight: 600, fontSize: "0.875rem",
          boxShadow: "0 4px 16px rgba(242,121,60,0.3)",
          transition: "box-shadow 160ms, transform 160ms",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 22px rgba(242,121,60,0.48)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(242,121,60,0.3)"; e.currentTarget.style.transform = "translateY(0)"; }}>
          Sign In
        </a>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "7rem 2rem 5rem", textAlign: "center", position: "relative", zIndex: 1 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(242,121,60,0.1)", border: "1px solid rgba(242,121,60,0.22)", borderRadius: 100, padding: "0.3rem 1rem", marginBottom: "2.5rem", fontSize: "0.78rem", color: "#f2793c", fontWeight: 600, letterSpacing: "0.06em" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3ecf8e", display: "inline-block", animation: "pulse 2s ease infinite" }} />
        ASCENTIC AI LAUNCH PAD PROGRAM 2026
      </div>
      <h1 style={{ fontSize: "clamp(3rem, 6.5vw, 5.25rem)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.04em", color: "#f5f5f2", maxWidth: 880, marginBottom: "1.5rem" }}>
        Career intelligence that
        <br />
        <span style={{ background: "linear-gradient(92deg, #f5934a 20%, #ffb27a 80%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          works while you don&apos;t
        </span>
      </h1>
      <p style={{ fontSize: "clamp(1rem, 1.8vw, 1.2rem)", color: "#9a9aa3", maxWidth: 580, lineHeight: 1.75, marginBottom: "2.75rem", fontWeight: 400 }}>
        Zeno builds a verified profile from your real experience, discovers relevant jobs across multiple sources, and generates tailored application documents in seconds — without making anything up.
      </p>
      <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", justifyContent: "center" }}>
        <a href="/auth/sign-up" style={{ background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)", color: "white", padding: "0.85rem 2rem", borderRadius: 11, textDecoration: "none", fontWeight: 700, fontSize: "0.975rem", boxShadow: "0 8px 28px rgba(242,121,60,0.38)", transition: "transform 180ms, box-shadow 180ms" }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 36px rgba(242,121,60,0.52)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(242,121,60,0.38)"; }}>
          Get started for free
        </a>
        <a href="#how-it-works" style={{ color: "#f5f5f2", padding: "0.85rem 2rem", borderRadius: 11, textDecoration: "none", fontWeight: 600, fontSize: "0.975rem", border: "1px solid #2a2b34", background: "rgba(255,255,255,0.04)", transition: "border-color 180ms, background 180ms" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3d3e4a"; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2b34"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
          See how it works
        </a>
      </div>
      <div style={{ display: "flex", gap: "3.5rem", marginTop: "4.5rem", flexWrap: "wrap", justifyContent: "center" }}>
        {[["178+", "Jobs discovered"], ["< 10s", "CV generation"], ["0", "Hallucinations"], ["24/7", "Telegram access"]].map(([val, label]) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#f2793c", letterSpacing: "-0.03em" }}>{val}</div>
            <div style={{ fontSize: "0.78rem", color: "#6c6c76", marginTop: 5, letterSpacing: "0.02em" }}>{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Problem ──────────────────────────────────────────────────────────────────
function Problem() {
  const cards = [
    { title: "ATS rejection", desc: "Applicant Tracking Systems filter out the majority of CVs before a recruiter sees them. The most common reason is keyword mismatch, not lack of experience.", accent: "#e5484d" },
    { title: "No personalisation", desc: "Sending an identical CV to fifty different roles is the default approach for most job seekers. It rarely works, and it wastes a significant amount of time.", accent: "#e8b93f" },
    { title: "AI that fabricates", desc: "Most AI writing tools have no concept of what you've actually done. They fill gaps with plausible-sounding content that isn't true — a serious risk for candidates.", accent: "#f2793c" },
  ];
  return (
    <section style={{ padding: "5rem 2rem", position: "relative", zIndex: 1 }} id="features">
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <p style={{ color: "#f2793c", fontWeight: 600, fontSize: "0.78rem", letterSpacing: "0.12em", marginBottom: "0.75rem", textTransform: "uppercase" }}>The problem</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)", fontWeight: 800, color: "#f5f5f2", letterSpacing: "-0.03em", margin: 0 }}>Three problems every job seeker faces</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "1.25rem" }}>
          {cards.map((c) => (
            <div key={c.title} style={{ background: "#16161d", border: "1px solid #2a2b34", borderRadius: 18, padding: "1.75rem", transition: "border-color 220ms, transform 220ms" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = c.accent; (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#2a2b34"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}>
              <div style={{ width: 36, height: 4, background: c.accent, borderRadius: 4, marginBottom: "1.25rem" }} />
              <h3 style={{ fontWeight: 700, color: "#f5f5f2", marginBottom: "0.6rem", fontSize: "1.05rem" }}>{c.title}</h3>
              <p style={{ color: "#9a9aa3", lineHeight: 1.72, fontSize: "0.9rem", margin: 0 }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { num: "01", title: "Verified career profile", desc: "Upload your CV or speak to Zeno through Telegram. The system extracts your skills, projects, and experience under hard constraints — it cannot invent or embellish anything.", tag: "Evidence layer", tagColor: "#3ecf8e" },
    { num: "02", title: "Autonomous job discovery", desc: "Zeno runs continuous searches across live job boards and uses the ESCO occupational taxonomy to expand your target roles semantically, finding relevant opportunities regardless of how each company words the title.", tag: "ESCO-powered matching", tagColor: "#2dd4bf" },
    { num: "03", title: "Tailored documents on demand", desc: "Select any discovered role and Zeno generates a full ATS-optimised CV and cover letter in under ten seconds, drawing only from your verified profile data.", tag: "Groq inference", tagColor: "#f2793c" },
    { num: "04", title: "Delivered through Telegram", desc: "Search for jobs, request documents, and get proactive role alerts directly inside Telegram. No separate app required.", tag: "Telegram bot", tagColor: "#60a5fa" },
  ];
  return (
    <section style={{ padding: "5rem 2rem", position: "relative", zIndex: 1 }} id="how-it-works">
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <p style={{ color: "#f2793c", fontWeight: 600, fontSize: "0.78rem", letterSpacing: "0.12em", marginBottom: "0.75rem", textTransform: "uppercase" }}>How it works</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)", fontWeight: 800, color: "#f5f5f2", letterSpacing: "-0.03em", margin: 0 }}>From profile to application in four steps</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {steps.map((step) => (
            <div key={step.num} style={{ background: "#16161d", border: "1px solid #2a2b34", borderRadius: 18, padding: "1.75rem 2rem", display: "grid", gridTemplateColumns: "64px 1fr auto", gap: "1.5rem", alignItems: "center", transition: "border-color 220ms" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3d3e4a")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2b34")}>
              <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "rgba(242,121,60,0.18)", fontFamily: "monospace", lineHeight: 1, userSelect: "none" }}>{step.num}</div>
              <div>
                <h3 style={{ fontWeight: 700, color: "#f5f5f2", fontSize: "1.05rem", marginBottom: "0.4rem" }}>{step.title}</h3>
                <p style={{ color: "#9a9aa3", lineHeight: 1.7, fontSize: "0.875rem", maxWidth: 580, margin: 0 }}>{step.desc}</p>
              </div>
              <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${step.tagColor}28`, color: step.tagColor, borderRadius: 100, padding: "0.28rem 0.85rem", fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap", letterSpacing: "0.04em" }}>{step.tag}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Comparison table ─────────────────────────────────────────────────────────
function Comparison() {
  const rows: { feature: string; cols: (boolean | "partial")[] }[] = [
    { feature: "ATS-optimised CV generation", cols: [true, false, true, false, true] },
    { feature: "Live job discovery", cols: [false, true, false, false, true] },
    { feature: "Grounded in verified evidence", cols: [false, false, false, false, true] },
    { feature: "No hallucinated content", cols: [false, true, false, false, true] },
    { feature: "Telegram access", cols: [false, true, false, false, true] },
    { feature: "Proactive job alerts", cols: [false, "partial", false, false, true] },
    { feature: "ESCO semantic role expansion", cols: [false, false, false, false, true] },
  ];
  const heads = ["Feature", "Resume.io", "LinkedIn", "Rezi / Kickresume", "ChatGPT", "Zeno"];
  return (
    <section style={{ padding: "5rem 2rem", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <p style={{ color: "#f2793c", fontWeight: 600, fontSize: "0.78rem", letterSpacing: "0.12em", marginBottom: "0.75rem", textTransform: "uppercase" }}>Comparison</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)", fontWeight: 800, color: "#f5f5f2", letterSpacing: "-0.03em", margin: 0 }}>How Zeno sits in the market</h2>
        </div>
        <div style={{ overflowX: "auto", borderRadius: 16, border: "1px solid #2a2b34" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {heads.map((h, i) => (
                  <th key={h} style={{ padding: "0.85rem 1.2rem", textAlign: i === 0 ? "left" : "center", fontSize: "0.78rem", fontWeight: 700, color: i === 5 ? "#f2793c" : "#6c6c76", background: i === 5 ? "rgba(242,121,60,0.06)" : "#16161d", borderBottom: "1px solid #2a2b34", letterSpacing: "0.04em", textTransform: i > 0 ? "uppercase" : "none" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.feature} style={{ background: ri % 2 === 0 ? "#16161d" : "#17171f" }}>
                  <td style={{ padding: "0.8rem 1.2rem", color: "#f5f5f2", fontSize: "0.875rem", borderBottom: "1px solid #1e1f28" }}>{row.feature}</td>
                  {row.cols.map((val, ci) => (
                    <td key={ci} style={{ padding: "0.8rem 1.2rem", textAlign: "center", borderBottom: "1px solid #1e1f28", background: ci === 4 ? "rgba(242,121,60,0.04)" : undefined }}>
                      {val === true ? <span style={{ color: ci === 4 ? "#f2793c" : "#3ecf8e", fontWeight: 700, fontSize: "1rem" }}>&#10003;</span>
                        : val === "partial" ? <span style={{ color: "#e8b93f", fontWeight: 700, fontSize: "0.9rem" }}>&#126;</span>
                        : <span style={{ color: "#3a3b44", fontWeight: 700 }}>&#8212;</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ─────────────────────────────────────────────────────────────────
function Pricing() {
  const plans = [
    {
      name: "Free", price: "$0", period: "no time limit", style: "outline", color: "#9a9aa3", cta: "Create account",
      desc: "Suitable for exploring the platform and running occasional searches.",
      features: ["CV upload and evidence extraction", "Up to 3 CV generations per month", "Job discovery — 10 results per day", "Zeno AI chat (basic)", "Community support"],
    },
    {
      name: "Pro", price: "$12", period: "per month", style: "filled", color: "#f2793c", cta: "Start Pro", badge: "Most popular",
      desc: "For an active, structured job search running across multiple roles.",
      features: ["Unlimited CV and cover letter generation", "Full Telegram bot access", "Proactive job alerts and digests", "Unlimited job discovery", "Growth sprints and skill gap tracking", "Priority email support"],
    },
    {
      name: "Growth", price: "$29", period: "per month", style: "teal", color: "#3ecf8e", cta: "Start Growth",
      desc: "For a sustained campaign where every application needs to be optimised.",
      features: ["Everything in Pro", "Advanced application tracking and analytics", "ESCO role expansion — unlimited queries", "Interview preparation module", "Onboarding session with the team", "Dedicated support channel"],
    },
  ];
  return (
    <section style={{ padding: "5rem 2rem", position: "relative", zIndex: 1 }} id="pricing">
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <p style={{ color: "#f2793c", fontWeight: 600, fontSize: "0.78rem", letterSpacing: "0.12em", marginBottom: "0.75rem", textTransform: "uppercase" }}>Pricing</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)", fontWeight: 800, color: "#f5f5f2", letterSpacing: "-0.03em", margin: "0 0 0.5rem" }}>Transparent, straightforward pricing</h2>
          <p style={{ color: "#6c6c76", fontSize: "0.9rem", margin: 0 }}>No contracts. Cancel at any time.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "1.25rem", alignItems: "start" }}>
          {plans.map((plan) => (
            <div key={plan.name} style={{
              background: plan.style === "filled" ? "linear-gradient(170deg, #1c1914 0%, #16161d 100%)" : "#16161d",
              border: `1px solid ${plan.style === "filled" ? "rgba(242,121,60,0.35)" : "#2a2b34"}`,
              borderRadius: 22, padding: "2rem", position: "relative",
              transform: plan.style === "filled" ? "scale(1.025)" : "none",
              boxShadow: plan.style === "filled" ? "0 12px 44px rgba(242,121,60,0.16)" : "none",
            }}>
              {"badge" in plan && plan.badge && (
                <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)", color: "white", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.85rem", borderRadius: 100, whiteSpace: "nowrap", letterSpacing: "0.05em" }}>{plan.badge}</div>
              )}
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ color: plan.color, fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.5rem" }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "2.6rem", fontWeight: 900, color: "#f5f5f2", letterSpacing: "-0.04em" }}>{plan.price}</span>
                  <span style={{ color: "#6c6c76", fontSize: "0.82rem" }}>/ {plan.period}</span>
                </div>
                <p style={{ color: "#9a9aa3", fontSize: "0.85rem", lineHeight: 1.65, margin: 0 }}>{plan.desc}</p>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.75rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.85rem", color: "#c8c8c2" }}>
                    <span style={{ color: plan.color, flexShrink: 0, marginTop: "0.1rem", fontWeight: 700 }}>&#10003;</span>{f}
                  </li>
                ))}
              </ul>
              <a href="/auth/sign-up" style={{
                display: "block", textAlign: "center", textDecoration: "none",
                padding: "0.8rem", borderRadius: 11, fontWeight: 700, fontSize: "0.9rem",
                ...(plan.style === "filled"
                  ? { background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)", color: "white", boxShadow: "0 6px 22px rgba(242,121,60,0.35)" }
                  : plan.style === "teal"
                  ? { background: "rgba(62,207,142,0.09)", color: "#3ecf8e", border: "1px solid rgba(62,207,142,0.25)" }
                  : { background: "rgba(255,255,255,0.05)", color: "#f5f5f2", border: "1px solid #2a2b34" }),
                transition: "opacity 160ms",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.82")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <section style={{ padding: "6rem 2rem 3.5rem", position: "relative", zIndex: 1, textAlign: "center" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 3rem)", fontWeight: 800, color: "#f5f5f2", letterSpacing: "-0.04em", marginBottom: "1.1rem", lineHeight: 1.1 }}>
          Start building your verified career profile today
        </h2>
        <p style={{ color: "#9a9aa3", fontSize: "1rem", lineHeight: 1.72, marginBottom: "2.5rem" }}>
          Zeno works in the background so you don&apos;t have to spend your time manually tracking applications and rewriting the same CV over and over.
        </p>
        <a href="/auth/sign-up" style={{ background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)", color: "white", padding: "0.9rem 2.25rem", borderRadius: 12, textDecoration: "none", fontWeight: 700, fontSize: "1rem", boxShadow: "0 10px 36px rgba(242,121,60,0.4)", display: "inline-block", transition: "transform 180ms, box-shadow 180ms" }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 14px 46px rgba(242,121,60,0.56)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 10px 36px rgba(242,121,60,0.4)"; }}>
          Create a free account
        </a>
      </div>
      <div style={{ marginTop: "5rem", paddingTop: "2rem", borderTop: "1px solid #1e1f28", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", maxWidth: 1080, margin: "5rem auto 0" }}>
        <ZenoMark size={22} className="text-[var(--zeno-ink)] text-[0.9rem] font-semibold tracking-tight" />
        <p style={{ color: "#3a3b44", fontSize: "0.78rem", margin: 0 }}>Built for the Ascentic AI Launch Pad Program &middot; 2026</p>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0b0b10", color: "#f5f5f2", fontFamily: "'Avenir Next', 'Segoe UI', sans-serif", overflowX: "hidden" }}>
      <ParticleCanvas />
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <Comparison />
      <Pricing />
      <Footer />
    </div>
  );
}
