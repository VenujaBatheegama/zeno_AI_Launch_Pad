"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function Glowing3dOrb() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 140;
    const height = container.clientHeight || 140;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.2;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
    } catch {
      return;
    }

    // Outer Glass Bubble
    const outerGeo = new THREE.SphereGeometry(1.15, 64, 64);
    const outerMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x9d5bfe),
      emissive: new THREE.Color(0x3a106b),
      emissiveIntensity: 0.4,
      roughness: 0.12,
      metalness: 0.1,
      transmission: 0.7,
      ior: 1.4,
      transparent: true,
      opacity: 0.9,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    scene.add(outerMesh);

    // Inner Glowing Core
    const innerGeo = new THREE.SphereGeometry(0.75, 48, 48);
    const innerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xe066ff),
      emissive: new THREE.Color(0xd946ef),
      emissiveIntensity: 1.6,
      roughness: 0.4,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerMesh);

    // Floating Orbiting Ring / Swirl
    const torusGeo = new THREE.TorusGeometry(1.4, 0.03, 16, 100);
    const torusMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xc084fc),
      transparent: true,
      opacity: 0.5,
    });
    const torusMesh = new THREE.Mesh(torusGeo, torusMat);
    torusMesh.rotation.x = Math.PI / 3;
    scene.add(torusMesh);

    // Star / Sparkle Particles around the orb
    const particleCount = 45;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 1.3 + Math.random() * 0.7;
      particlePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      particlePositions[i * 3 + 2] = r * Math.cos(phi);
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xf5d0fe,
      size: 0.04,
      transparent: true,
      opacity: 0.8,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const pinkLight = new THREE.PointLight(0xf43f5e, 4, 10);
    pinkLight.position.set(2, 2, 3);
    scene.add(pinkLight);

    const purpleLight = new THREE.PointLight(0x8b5cf6, 4, 10);
    purpleLight.position.set(-2, -2, 2);
    scene.add(purpleLight);

    const cyanLight = new THREE.PointLight(0x38bdf8, 2.5, 10);
    cyanLight.position.set(0, 3, -1);
    scene.add(cyanLight);

    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      // Fluid rotations
      outerMesh.rotation.y = elapsedTime * 0.35;
      outerMesh.rotation.x = Math.sin(elapsedTime * 0.25) * 0.15;

      innerMesh.rotation.y = -elapsedTime * 0.5;
      innerMesh.rotation.z = Math.cos(elapsedTime * 0.3) * 0.2;

      torusMesh.rotation.z = elapsedTime * 0.4;
      torusMesh.rotation.y = Math.sin(elapsedTime * 0.3) * 0.4;

      particles.rotation.y = elapsedTime * 0.15;
      particles.rotation.x = elapsedTime * 0.08;

      // Pulse emissive intensity
      const pulse = 1.4 + Math.sin(elapsedTime * 2.5) * 0.3;
      innerMat.emissiveIntensity = pulse;

      renderer?.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (renderer) {
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      }
      outerGeo.dispose();
      outerMat.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      torusGeo.dispose();
      torusMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
    };
  }, []);

  return (
    <div className="relative flex items-center justify-center">
      {/* Background glow halo */}
      <div className="absolute -inset-4 rounded-full bg-gradient-to-tr from-purple-600/40 via-fuchsia-500/30 to-pink-500/20 blur-2xl pointer-events-none" />
      <div
        ref={containerRef}
        className="relative size-28 sm:size-32 flex items-center justify-center cursor-pointer transition-transform duration-500 hover:scale-105"
      />
    </div>
  );
}
