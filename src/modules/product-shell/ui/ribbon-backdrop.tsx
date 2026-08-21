"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Undulating 3D Particle Wave Backdrop (adapted to modern Three.js WebGL Points).
 * Contained strictly within the Home content area (does not cover side menu).
 */
export function RibbonBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const SEPARATION_X = 115;
    const SEPARATION_Y = 90;
    const AMOUNTX = 125;
    const AMOUNTY = 45;
    const totalParticles = AMOUNTX * AMOUNTY;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(65, width / height, 1, 10000);
    camera.position.set(0, 280, 750);
    camera.lookAt(0, -50, 0);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      container.appendChild(renderer.domElement);
    } catch {
      return;
    }

    // Create Circular Point Texture using Canvas
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(16, 16, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    const circleTexture = new THREE.CanvasTexture(canvas);

    // Build Particle Grid BufferGeometry
    const positions = new Float32Array(totalParticles * 3);
    const colors = new Float32Array(totalParticles * 3);

    const baseColor1 = new THREE.Color(0x6366f1); // Indigo
    const baseColor2 = new THREE.Color(0x38bdf8); // Cyan
    const mixedColor = new THREE.Color();

    let i = 0;
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        const x = ix * SEPARATION_X - (AMOUNTX * SEPARATION_X) / 2;
        const z = iy * SEPARATION_Y - (AMOUNTY * SEPARATION_Y) / 2;

        positions[i * 3] = x;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = z;

        const ratio = (ix / AMOUNTX + iy / AMOUNTY) * 0.5;
        mixedColor.lerpColors(baseColor1, baseColor2, ratio);
        colors[i * 3] = mixedColor.r;
        colors[i * 3 + 1] = mixedColor.g;
        colors[i * 3 + 2] = mixedColor.b;

        i++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 5.5,
      map: circleTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Mouse Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      targetMouseX = (event.clientX - window.innerWidth / 2) * 0.3;
      targetMouseY = (event.clientY - window.innerHeight / 2) * 0.3;
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // Animation Loop
    let animationFrameId: number;
    let count = 0;
    let isVisible = true;

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const animate = () => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      camera.position.x = mouseX * 0.6;
      camera.position.y = 280 + -mouseY * 0.4;
      camera.lookAt(0, -30, 0);

      const posArray = geometry.attributes.position.array as Float32Array;

      let idx = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          posArray[idx * 3 + 1] =
            Math.sin((ix + count) * 0.3) * 38 + Math.sin((iy + count) * 0.5) * 38;
          idx++;
        }
      }

      geometry.attributes.position.needsUpdate = true;
      count += 0.02;

      renderer?.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver.disconnect();

      if (renderer) {
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      }

      geometry.dispose();
      material.dispose();
      circleTexture.dispose();
    };
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 -top-16 -bottom-16 -left-36 -right-36 z-0 overflow-hidden"
      aria-hidden
    >
      <div ref={containerRef} className="h-full w-full opacity-80" />
      {/* Soft fade at bottom so it blends seamlessly */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 65%, var(--zeno-bg) 100%)",
        }}
      />
    </div>
  );
}
