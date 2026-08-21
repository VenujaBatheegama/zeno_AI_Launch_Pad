import Image from "next/image";

/**
 * Hero backdrop for the Home screen using background.jpeg.
 * Layered with subtle gradient fades so text remains crisp and readable.
 */
export function RibbonBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Background image */}
      <div className="absolute inset-0 opacity-40 mix-blend-lighten">
        <Image
          src="/background.jpeg"
          alt=""
          fill
          priority
          sizes="(max-width: 1200px) 100vw, 1200px"
          quality={80}
          className="object-cover object-center"
        />
      </div>

      {/* Radial vignette overlay to smoothly blend edges into page background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, transparent 15%, var(--zeno-bg) 75%), linear-gradient(to bottom, transparent 50%, var(--zeno-bg) 100%)",
        }}
      />
    </div>
  );
}
