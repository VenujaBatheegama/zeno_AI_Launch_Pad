"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Lively Three.js 3D Cosmic Ribbon & Particle Backdrop.
 * Renders smooth flowing ribbons with amber/sapphire luminosity and floating stardust,
 * seamlessly layered over background.jpeg.
 */
export function RibbonBackdrop() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 0, 14);

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

    // 1. Flowing 3D Harmonic Wave Ribbons
    const ribbonCount = 3;
    const ribbons: {
      mesh: THREE.Mesh;
      basePositions: Float32Array;
      speed: number;
      freq: number;
      amp: number;
    }[] = [];

    const ribbonConfigs = [
      { color: 0x4f46e5, emissive: 0x3730a3, opacity: 0.6, y: -1.5, z: -2 }, // Rich Indigo/Sapphire
      { color: 0x06b6d4, emissive: 0x0891b2, opacity: 0.45, y: 1.2, z: -4 },  // Luminous Cyan
      { color: 0xf59e0b, emissive: 0xd97706, opacity: 0.38, y: -3.2, z: -1 }, // Warm Amber Gold
    ];

    for (let r = 0; r < ribbonCount; r++) {
      const cfg = ribbonConfigs[r]!;
      const geo = new THREE.PlaneGeometry(36, 6, 50, 16);
      const pos = geo.attributes.position;
      const basePositions = new Float32Array(pos.array);

      const mat = new THREE.MeshPhysicalMaterial({
        color: cfg.color,
        emissive: cfg.emissive,
        emissiveIntensity: 1.2,
        roughness: 0.1,
        metalness: 0.3,
        transparent: true,
        opacity: cfg.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (r - 1) * 3,
        cfg.y,
        cfg.z,
      );
      mesh.rotation.set(-0.35 + r * 0.12, 0.08, -0.18 + r * 0.1);

      scene.add(mesh);
      ribbons.push({
        mesh,
        basePositions,
        speed: 0.7 + r * 0.3,
        freq: 0.18 + r * 0.06,
        amp: 1.2 + r * 0.35,
      });
    }

    // 2. Floating Luminous Stardust Particles
    const particleCount = 55;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 32;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 16;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.35,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    // 3. Ambient & Accent Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const violetLight = new THREE.PointLight(0x6366f1, 5, 30);
    violetLight.position.set(-8, 6, 8);
    scene.add(violetLight);

    const amberLight = new THREE.PointLight(0xf59e0b, 4.5, 25);
    amberLight.position.set(10, -4, 6);
    scene.add(amberLight);

    // Mouse Parallax Interaction
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

    // Handle Window Resize
    const handleResize = () => {
      if (!renderer) return;
      width = window.innerWidth;
      height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

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

      // Smooth mouse parallax interpolation
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      camera.position.x = mouseX * 1.5;
      camera.position.y = -mouseY * 1.0;
      camera.lookAt(0, 0, 0);

      // Deform wave ribbon vertices
      ribbons.forEach(({ mesh, basePositions, speed, freq, amp }, rIndex) => {
        const posAttr = mesh.geometry.attributes.position;
        const array = posAttr.array as Float32Array;

        for (let i = 0; i < posAttr.count; i++) {
          const u = basePositions[i * 3]!;
          const v = basePositions[i * 3 + 1]!;

          const wave1 = Math.sin(u * freq + elapsed * speed + rIndex * 1.2) * amp;
          const wave2 = Math.cos(v * freq * 1.5 + elapsed * (speed * 0.8)) * (amp * 0.45);

          array[i * 3 + 2] = basePositions[i * 3 + 2]! + wave1 + wave2;
        }

        posAttr.needsUpdate = true;
        mesh.rotation.z = -0.18 + rIndex * 0.1 + Math.sin(elapsed * 0.25 + rIndex) * 0.05;
      });

      // Slowly rotate particle field
      particleSystem.rotation.y = elapsed * 0.04;
      particleSystem.rotation.x = Math.sin(elapsed * 0.02) * 0.06;

      renderer?.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

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
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* 1. Base Atmospheric Image from background.jpeg */}
      <div className="absolute inset-0 opacity-70">
        <Image
          src="/background.jpeg"
          alt=""
          fill
          priority
          sizes="100vw"
          quality={85}
          className="object-cover object-center"
        />
      </div>

      {/* 2. Interactive Lively Three.js 3D Wave Ribbons & Particle Canvas */}
      <div ref={canvasContainerRef} className="absolute inset-0 h-full w-full opacity-90 mix-blend-screen" />

      {/* 3. Soft vignette overlay to ensure text contrast while letting luminous background shine */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, rgba(11,11,16,0.2) 0%, rgba(11,11,16,0.6) 70%, rgba(11,11,16,0.92) 100%)",
        }}
      />
    </div>
  );
}
