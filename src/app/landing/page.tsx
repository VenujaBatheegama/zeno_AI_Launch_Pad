"use client";

import { useEffect, useRef, useState } from "react";

// ─── Particle canvas ────────────────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    const COUNT = 80;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function init() {
      if (!canvas) return;
      particles.length = 0;
      for (let i = 0; i < COUNT; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: Math.random() * 1.5 + 0.5,
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
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(242,121,60,${0.06 * (1 - dist / 140)})`;
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
        ctx.fillStyle = "rgba(242,121,60,0.18)";
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        if (!canvas) return;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      });
      animId = requestAnimationFrame(draw);
    }

    resize();
    init();
    draw();
    window.addEventListener("resize", () => { resize(); init(); });
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", () => {});
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    />
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 2rem", height: "64px", display: "flex",
      alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(11,11,16,0.92)" : "transparent",
      backdropFilter: scrolled ? "blur(18px)" : "none",
      borderBottom: scrolled ? "1px solid rgba(42,43,52,0.8)" : "none",
      transition: "all 220ms ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, color: "white", fontSize: 16,
        }}>Z</div>
        <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "#f5f5f2", letterSpacing: "-0.02em" }}>
          Zeno <span style={{ color: "#9a9aa3", fontWeight: 400 }}>AI</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
        {[["Features", "#features"], ["How It Works", "#how-it-works"], ["Pricing", "#pricing"]].map(([label, href]) => (
          <a key={label} href={href} style={{ color: "#9a9aa3", textDecoration: "none", fontSize: "0.9rem", transition: "color 160ms" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#f5f5f2")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#9a9aa3")}>{label}</a>
        ))}
        <a href="/auth/sign-in" style={{
          background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)",
          color: "white", padding: "0.5rem 1.25rem", borderRadius: 10,
          textDecoration: "none", fontWeight: 600, fontSize: "0.9rem",
          boxShadow: "0 4px 20px rgba(242,121,60,0.35)", transition: "transform 160ms, box-shadow 160ms",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(242,121,60,0.5)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(242,121,60,0.35)"; }}>
          Get Started →
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "7rem 2rem 4rem", textAlign: "center", position: "relative", zIndex: 1 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(242,121,60,0.12)", border: "1px solid rgba(242,121,60,0.25)", borderRadius: 100, padding: "0.35rem 1rem", marginBottom: "2rem", fontSize: "0.8rem", color: "#f2793c", fontWeight: 600, letterSpacing: "0.05em" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3ecf8e", display: "inline-block" }} />
        NOW LIVE — Ascentic AI Launch Pad Program 2026
      </div>
      <h1 style={{ fontSize: "clamp(2.8rem, 7vw, 5.5rem)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.04em", color: "#f5f5f2", maxWidth: 900, marginBottom: "1.5rem" }}>
        Your Autonomous{" "}
        <span style={{ background: "linear-gradient(90deg, #f5934a, #ffb27a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          AI Career Copilot
        </span>
      </h1>
      <p style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)", color: "#9a9aa3", maxWidth: 620, lineHeight: 1.7, marginBottom: "2.5rem" }}>
        Zeno discovers jobs for you, generates ATS-optimized CVs in seconds, and delivers career intelligence — without ever hallucinating skills you don&apos;t have.
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
        <a href="/auth/sign-in" style={{ background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)", color: "white", padding: "0.9rem 2rem", borderRadius: 12, textDecoration: "none", fontWeight: 700, fontSize: "1rem", boxShadow: "0 8px 32px rgba(242,121,60,0.4)", transition: "transform 180ms, box-shadow 180ms" }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(242,121,60,0.55)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(242,121,60,0.4)"; }}>
          Start for Free →
        </a>
        <a href="#how-it-works" style={{ color: "#f5f5f2", padding: "0.9rem 2rem", borderRadius: 12, textDecoration: "none", fontWeight: 600, fontSize: "1rem", border: "1px solid #2a2b34", background: "rgba(255,255,255,0.04)", transition: "border-color 180ms, background 180ms" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3d3e4a"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2b34"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
          See How It Works
        </a>
      </div>
      <div style={{ display: "flex", gap: "3rem", marginTop: "4rem", flexWrap: "wrap", justifyContent: "center" }}>
        {[["178+", "Jobs Discovered"], ["< 10s", "CV Generation"], ["0", "Hallucinations"], ["24/7", "Telegram Alerts"]].map(([val, label]) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f2793c" }}>{val}</div>
            <div style={{ fontSize: "0.8rem", color: "#9a9aa3", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section style={{ padding: "5rem 2rem", position: "relative", zIndex: 1 }} id="features">
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <p style={{ color: "#f2793c", fontWeight: 600, fontSize: "0.85rem", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>THE PROBLEM</p>
          <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, color: "#f5f5f2", letterSpacing: "-0.03em" }}>The modern job hunt is broken</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
          {[
            { icon: "🚫", title: "ATS Rejection", desc: "Applicant Tracking Systems reject 75% of CVs before a human sees them — purely due to keyword mismatches.", color: "#e5484d" },
            { icon: "🎯", title: "Spray & Pray", desc: "Candidates send the same generic CV to dozens of roles with zero personalization, burning time with little return.", color: "#e8b93f" },
            { icon: "🤖", title: "AI Hallucination", desc: "Existing AI CV tools fabricate experience you don't have — destroying trust and creating compliance risk.", color: "#f2793c" },
          ].map((c) => (
            <div key={c.title} style={{ background: "#16161d", border: "1px solid #2a2b34", borderRadius: 20, padding: "2rem", transition: "border-color 220ms, transform 220ms" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = c.color; (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#2a2b34"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>{c.icon}</div>
              <h3 style={{ fontWeight: 700, color: "#f5f5f2", marginBottom: "0.5rem", fontSize: "1.1rem" }}>{c.title}</h3>
              <p style={{ color: "#9a9aa3", lineHeight: 1.7, fontSize: "0.95rem" }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section style={{ padding: "5rem 2rem", position: "relative", zIndex: 1 }} id="how-it-works">
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <p style={{ color: "#f2793c", fontWeight: 600, fontSize: "0.85rem", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>HOW IT WORKS</p>
          <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, color: "#f5f5f2", letterSpacing: "-0.03em" }}>Your career agent, end to end</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {[
            { num: "01", title: "Build Your Verified Profile", desc: "Upload your CV or chat with Zeno on Telegram. Our AI extracts and verifies your real skills, projects, and experience — under strict evidence constraints so nothing is fabricated.", tag: "Career Evidence Layer", tagColor: "#3ecf8e" },
            { num: "02", title: "Autonomous Job Discovery", desc: "Zeno continuously searches live job boards and uses the ESCO occupation taxonomy to semantically expand your target roles — catching every equivalent job title across sources.", tag: "ESCO-Powered Matching", tagColor: "#2dd4bf" },
            { num: "03", title: "Instant Tailored Documents", desc: "One click generates a fully ATS-optimized CV and cover letter for any role — using only your verified evidence. No generic filler, no hallucinated skills. Ready in under 10 seconds.", tag: "Groq / Llama Inference", tagColor: "#f2793c" },
            { num: "04", title: "Delivered to Your Pocket", desc: "Get proactive job alerts, generate CVs, and chat with your career copilot directly in Telegram. No app switching required.", tag: "Telegram Bot", tagColor: "#60a5fa" },
          ].map((step) => (
            <div key={step.num} style={{ background: "#16161d", border: "1px solid #2a2b34", borderRadius: 20, padding: "2rem", display: "grid", gridTemplateColumns: "80px 1fr auto", gap: "1.5rem", alignItems: "start", transition: "border-color 220ms" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3d3e4a")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2b34")}>
              <div style={{ fontSize: "2.5rem", fontWeight: 900, color: "rgba(242,121,60,0.2)", fontFamily: "monospace", lineHeight: 1 }}>{step.num}</div>
              <div>
                <h3 style={{ fontWeight: 700, color: "#f5f5f2", fontSize: "1.15rem", marginBottom: "0.5rem" }}>{step.title}</h3>
                <p style={{ color: "#9a9aa3", lineHeight: 1.7, fontSize: "0.95rem", maxWidth: 600 }}>{step.desc}</p>
              </div>
              <div style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${step.tagColor}33`, color: step.tagColor, borderRadius: 100, padding: "0.3rem 0.9rem", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap" }}>{step.tag}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CompetitorTable() {
  const rows = [
    { feature: "ATS-Optimized CVs", cols: [true, false, true, false, true] },
    { feature: "Live Job Discovery", cols: [false, true, false, false, true] },
    { feature: "No Hallucinations", cols: [false, true, false, false, true] },
    { feature: "Career Evidence Layer", cols: [false, false, false, false, true] },
    { feature: "Telegram / Mobile", cols: [false, true, false, false, true] },
    { feature: "Autonomous Alerts", cols: [false, "partial", false, false, true] },
    { feature: "ESCO Semantic Matching", cols: [false, false, false, false, true] },
  ];

  return (
    <section style={{ padding: "5rem 2rem", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <p style={{ color: "#f2793c", fontWeight: 600, fontSize: "0.85rem", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>COMPETITOR ANALYSIS</p>
          <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, color: "#f5f5f2", letterSpacing: "-0.03em" }}>How Zeno compares</h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Feature", "Resume.io", "LinkedIn", "Rezi / Kickresume", "ChatGPT", "Zeno AI"].map((h, i) => (
                  <th key={h} style={{ padding: "0.85rem 1.25rem", textAlign: i === 0 ? "left" : "center", fontSize: "0.82rem", fontWeight: 600, color: i === 5 ? "#f2793c" : "#9a9aa3", background: i === 5 ? "rgba(242,121,60,0.08)" : "#16161d", borderBottom: "1px solid #2a2b34" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature}>
                  <td style={{ padding: "0.85rem 1.25rem", color: "#f5f5f2", fontSize: "0.9rem", borderBottom: "1px solid #2a2b34" }}>{row.feature}</td>
                  {row.cols.map((val, ci) => (
                    <td key={ci} style={{ padding: "0.85rem 1.25rem", textAlign: "center", borderBottom: "1px solid #2a2b34", background: ci === 4 ? "rgba(242,121,60,0.05)" : "#16161d" }}>
                      {val === true ? <span style={{ color: ci === 4 ? "#f2793c" : "#3ecf8e", fontWeight: 700 }}>✓</span> : val === false ? <span style={{ color: "#6c6c76" }}>—</span> : <span style={{ color: "#e8b93f" }}>~</span>}
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

function Pricing() {
  const plans = [
    {
      name: "Free", price: "$0", period: "forever", ctaStyle: "outline", color: "#9a9aa3", cta: "Start Free",
      desc: "Get started and experience the core of Zeno.",
      features: ["CV upload & evidence extraction", "Up to 3 CV generations/month", "Job discovery (10 results/day)", "Basic Zeno AI chat", "Community support"],
    },
    {
      name: "Pro", price: "$12", period: "per month", ctaStyle: "filled", color: "#f2793c", cta: "Start Pro", badge: "Most Popular",
      desc: "Everything you need for an active job search campaign.",
      features: ["Unlimited CV & cover letter generation", "Full Telegram bot access", "Proactive job alerts & digests", "Unlimited job discovery", "Growth sprints & skill gap analysis", "Priority email support"],
    },
    {
      name: "Growth", price: "$29", period: "per month", ctaStyle: "outline-green", color: "#3ecf8e", cta: "Start Growth",
      desc: "For serious job seekers who want every edge.",
      features: ["Everything in Pro", "Advanced application analytics", "ESCO-powered role expansion", "Interview preparation AI", "White-glove onboarding", "Dedicated Slack support"],
    },
  ];

  return (
    <section style={{ padding: "5rem 2rem", position: "relative", zIndex: 1 }} id="pricing">
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <p style={{ color: "#f2793c", fontWeight: 600, fontSize: "0.85rem", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>PRICING</p>
          <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, color: "#f5f5f2", letterSpacing: "-0.03em" }}>Simple, transparent pricing</h2>
          <p style={{ color: "#9a9aa3", marginTop: "0.75rem" }}>No surprise fees. Cancel anytime.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", alignItems: "start" }}>
          {plans.map((plan) => (
            <div key={plan.name} style={{
              background: plan.ctaStyle === "filled" ? "linear-gradient(160deg, #1e1a16 0%, #16161d 100%)" : "#16161d",
              border: `1px solid ${plan.ctaStyle === "filled" ? "rgba(242,121,60,0.4)" : "#2a2b34"}`,
              borderRadius: 24, padding: "2rem", position: "relative",
              transform: plan.ctaStyle === "filled" ? "scale(1.03)" : "none",
              boxShadow: plan.ctaStyle === "filled" ? "0 16px 48px rgba(242,121,60,0.2)" : "none",
            }}>
              {"badge" in plan && plan.badge && (
                <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)", color: "white", fontSize: "0.72rem", fontWeight: 700, padding: "0.25rem 0.9rem", borderRadius: 100, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{plan.badge}</div>
              )}
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ color: plan.color, fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.4rem" }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "2.75rem", fontWeight: 900, color: "#f5f5f2", letterSpacing: "-0.04em" }}>{plan.price}</span>
                  <span style={{ color: "#9a9aa3", fontSize: "0.85rem" }}>/ {plan.period}</span>
                </div>
                <p style={{ color: "#9a9aa3", fontSize: "0.875rem", lineHeight: 1.6 }}>{plan.desc}</p>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.875rem", color: "#f5f5f2" }}>
                    <span style={{ color: plan.color, flexShrink: 0, marginTop: 2 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <a href="/auth/sign-in" style={{
                display: "block", textAlign: "center", textDecoration: "none", padding: "0.85rem", borderRadius: 12, fontWeight: 700, fontSize: "0.95rem",
                ...(plan.ctaStyle === "filled" ? { background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)", color: "white", boxShadow: "0 6px 24px rgba(242,121,60,0.4)" }
                  : plan.ctaStyle === "outline-green" ? { background: "rgba(62,207,142,0.1)", color: "#3ecf8e", border: "1px solid rgba(62,207,142,0.3)" }
                  : { background: "rgba(255,255,255,0.06)", color: "#f5f5f2", border: "1px solid #2a2b34" }),
                transition: "opacity 160ms",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
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

function Footer() {
  return (
    <section style={{ padding: "6rem 2rem 4rem", position: "relative", zIndex: 1, textAlign: "center" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <h2 style={{ fontSize: "clamp(2rem, 4vw, 3.2rem)", fontWeight: 800, color: "#f5f5f2", letterSpacing: "-0.04em", marginBottom: "1.25rem" }}>
          Your career agent is{" "}
          <span style={{ background: "linear-gradient(90deg, #f5934a, #ffb27a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>ready.</span>
        </h2>
        <p style={{ color: "#9a9aa3", fontSize: "1.05rem", lineHeight: 1.7, marginBottom: "2.5rem" }}>
          Join the Ascentic AI Launch Pad program and see how Zeno transforms your job search — starting today, for free.
        </p>
        <a href="/auth/sign-in" style={{ background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)", color: "white", padding: "1rem 2.5rem", borderRadius: 14, textDecoration: "none", fontWeight: 700, fontSize: "1.05rem", boxShadow: "0 10px 40px rgba(242,121,60,0.45)", display: "inline-block", transition: "transform 180ms, box-shadow 180ms" }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 14px 52px rgba(242,121,60,0.6)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 10px 40px rgba(242,121,60,0.45)"; }}>
          Get Started — It&apos;s Free →
        </a>
      </div>
      <div style={{ marginTop: "5rem", paddingTop: "2rem", borderTop: "1px solid #2a2b34", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", maxWidth: 1100, margin: "5rem auto 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg, #f5934a 0%, #e1552a 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "white", fontSize: 14 }}>Z</div>
          <span style={{ fontWeight: 700, color: "#f5f5f2" }}>Zeno AI</span>
        </div>
        <p style={{ color: "#6c6c76", fontSize: "0.8rem" }}>© 2026 Zeno AI. Built for the Ascentic AI Launch Pad Program.</p>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0b0b10", color: "#f5f5f2", fontFamily: "'Avenir Next', 'Segoe UI', sans-serif", overflowX: "hidden" }}>
      <ParticleCanvas />
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <CompetitorTable />
      <Pricing />
      <Footer />
    </div>
  );
}
