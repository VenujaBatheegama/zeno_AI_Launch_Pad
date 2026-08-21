"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Interactive 3D Lively Backdrop for the Home Screen using Three.js.
 * Renders smooth flowing ribbons, luminous ambient waves, and subtle floating particles
 * inspired by background.jpeg with gentle mouse parallax and idle drift.
 */
export function RibbonBackdrop() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 0, 15);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      container.appendChild(renderer.domElement);
    } catch {
      return;
    }

    // 1. Flowing Wave Ribbons
    const ribbonCount = 3;
    const ribbons: {
      mesh: THREE.Mesh;
      basePositions: Float32Array;
      speed: number;
      freq: number;
      amp: number;
    }[] = [];

    const ribbonColors = [
      { color: 0x4338ca, emissive: 0x312e81, opacity: 0.35 }, // Indigo/Sapphire
      { color: 0x6366f1, emissive: 0x4f46e5, opacity: 0.28 }, // Violet
      { color: 0xd97706, emissive: 0xb45309, opacity: 0.22 }, // Amber/Gold accent
    ];

    for (let r = 0; r < ribbonCount; r++) {
      const geo = new THREE.PlaneGeometry(28, 4.5, 45, 12);
      const pos = geo.attributes.position;
      const basePositions = new Float32Array(pos.array);

      const mat = new THREE.MeshPhysicalMaterial({
        color: ribbonColors[r]!.color,
        emissive: ribbonColors[r]!.emissive,
        emissiveIntensity: 0.6,
        roughness: 0.15,
        metalness: 0.2,
        transparent: true,
        opacity: ribbonColors[r]!.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (r - 1) * 2,
        -2.5 + r * 1.6,
        -2 - r * 1.5,
      );
      mesh.rotation.set(-0.35 + r * 0.15, 0.1, -0.15 + r * 0.08);

      scene.add(mesh);
      ribbons.push({
        mesh,
        basePositions,
        speed: 0.6 + r * 0.25,
        freq: 0.22 + r * 0.08,
        amp: 0.9 + r * 0.3,
      });
    }

    // 2. Floating Luminous Stardust Particles
    const particleCount = 45;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleScales = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 26;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 12;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 10;
      particleScales[i] = Math.random() * 0.8 + 0.3;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x818cf8,
      size: 0.2,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    // 3. Ambient & Accent Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const violetLight = new THREE.PointLight(0x6366f1, 4, 25);
    violetLight.position.set(-6, 4, 6);
    scene.add(violetLight);

    const amberLight = new THREE.PointLight(0xf59e0b, 3.5, 20);
    amberLight.position.set(8, -3, 5);
    scene.add(amberLight);

    // Mouse Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      targetMouseX = (e.clientX / innerWidth - 0.5) * 2;
      targetMouseY = (e.clientY / innerHeight - 0.5) * 2;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // Handle Resize
    const handleResize = () => {
      if (!container || !renderer) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || 500;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();
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

      const elapsed = clock.getElapsedTime();

      // Smooth mouse interpolation
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      camera.position.x = mouseX * 1.2;
      camera.position.y = -mouseY * 0.8;
      camera.lookAt(0, 0, 0);

      // Deform wave ribbon vertices
      ribbons.forEach(({ mesh, basePositions, speed, freq, amp }, rIndex) => {
        const posAttr = mesh.geometry.attributes.position;
        const array = posAttr.array as Float32Array;

        for (let i = 0; i < posAttr.count; i++) {
          const u = basePositions[i * 3]!;
          const v = basePositions[i * 3 + 1]!;

          // Harmonic wave distortion
          const wave1 = Math.sin(u * freq + elapsed * speed + rIndex) * amp;
          const wave2 = Math.cos(v * freq * 1.4 + elapsed * (speed * 0.8)) * (amp * 0.5);

          array[i * 3 + 2] = basePositions[i * 3 + 2]! + wave1 + wave2;
        }

        posAttr.needsUpdate = true;
        mesh.rotation.z = -0.15 + rIndex * 0.08 + Math.sin(elapsed * 0.2 + rIndex) * 0.04;
      });

      // Slowly rotate particle field
      particleSystem.rotation.y = elapsed * 0.03;
      particleSystem.rotation.x = Math.sin(elapsed * 0.02) * 0.05;

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

      ribbons.forEach(({ mesh }) => {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      });

      particleGeo.dispose();
      particleMat.dispose();
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* 1. Base Atmospheric Glow / Image */}
      <div className="absolute inset-0 opacity-35 mix-blend-lighten">
        <Image
          src="/background.jpeg"
          alt=""
          fill
          priority
          sizes="(max-width: 1200px) 100vw, 1200px"
          quality={75}
          className="object-cover object-center"
        />
      </div>

      {/* 2. Interactive Lively Three.js 3D Waves Canvas */}
      <div ref={canvasContainerRef} className="absolute inset-0 h-full w-full opacity-80" />

      {/* 3. Radial Vignette & Edge Fades to seamlessly blend with dark UI */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, transparent 20%, var(--zeno-bg) 80%), linear-gradient(to bottom, transparent 40%, var(--zeno-bg) 100%)",
        }}
      />
    </div>
  );
}
