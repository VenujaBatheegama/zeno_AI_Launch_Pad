/**
 * Glass orb brand mark — the one deliberate "hero" moment on Home,
 * inspired by the reference's central glowing sphere but re-colored for
 * a light theme (soft periwinkle glow + white glass highlight, not a
 * dark neon sphere). Pure CSS gradients — no image asset was available
 * to generate. Kept to this single screen so it reads as a signature
 * touch rather than a decoration repeated everywhere. Gentle breathing
 * animation via .zeno-breathe (respects prefers-reduced-motion).
 */

export function GlowOrb() {
  return (
    <div className="relative mx-auto flex size-16 items-center justify-center" aria-hidden>
      <span
        className="absolute inset-[-36px] rounded-full opacity-70 blur-2xl"
        style={{
          background: "radial-gradient(circle, var(--zeno-violet-soft) 0%, transparent 70%)",
        }}
      />
      <span
        className="zeno-breathe relative size-16 rounded-full border border-white/70 shadow-[var(--zeno-shadow-lg)]"
        style={{
          background:
            "radial-gradient(circle at 32% 26%, #ffffff 0%, #cfc9ff 35%, var(--zeno-primary) 70%, var(--zeno-primary-deep) 100%)",
        }}
      />
    </div>
  );
}
