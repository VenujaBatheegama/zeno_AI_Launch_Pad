"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function Glowing3dOrb() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 100;
    const height = container.clientHeight || 100;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 3.8;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
    } catch {
      return;
    }

    // Outer Sapphire / Cosmic Liquid Glass Sphere
    const outerGeo = new THREE.SphereGeometry(1.05, 64, 64);
    const outerMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x0f2b48),
      emissive: new THREE.Color(0x041322),
      emissiveIntensity: 0.3,
      roughness: 0.08,
      metalness: 0.15,
      transmission: 0.75,
      ior: 1.5,
      transparent: true,
      opacity: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    scene.add(outerMesh);

    // Inner Glowing Cyan/Deep Blue Core
    const innerGeo = new THREE.SphereGeometry(0.68, 48, 48);
    const innerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0ea5e9),
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 1.4,
      roughness: 0.3,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerMesh);

    // Iridescent Shimmer Torus
    const torusGeo = new THREE.TorusGeometry(1.22, 0.022, 16, 100);
    const torusMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x38bdf8),
      transparent: true,
      opacity: 0.45,
    });
    const torusMesh = new THREE.Mesh(torusGeo, torusMat);
    torusMesh.rotation.x = Math.PI / 3.2;
    scene.add(torusMesh);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const cyanLight = new THREE.PointLight(0x38bdf8, 4, 10);
    cyanLight.position.set(2, 2, 3);
    scene.add(cyanLight);

    const blueLight = new THREE.PointLight(0x1d4ed8, 3.5, 10);
    blueLight.position.set(-2, -2, 2);
    scene.add(blueLight);

    const whiteHighlight = new THREE.PointLight(0xffffff, 2, 8);
    whiteHighlight.position.set(0, 3, 2);
    scene.add(whiteHighlight);

    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      outerMesh.rotation.y = elapsedTime * 0.4;
      outerMesh.rotation.x = Math.sin(elapsedTime * 0.3) * 0.15;

      innerMesh.rotation.y = -elapsedTime * 0.5;
      innerMesh.rotation.z = Math.cos(elapsedTime * 0.25) * 0.2;

      torusMesh.rotation.z = elapsedTime * 0.35;
      torusMesh.rotation.y = Math.sin(elapsedTime * 0.3) * 0.35;

      const pulse = 1.2 + Math.sin(elapsedTime * 2.2) * 0.3;
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
    };
  }, []);

  return (
    <div className="relative flex items-center justify-center">
      {/* Subtle cyan/blue ambient glow */}
      <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-sky-400/20 via-blue-500/20 to-indigo-500/15 blur-xl pointer-events-none" />
      <div
        ref={containerRef}
        className="relative size-20 sm:size-24 flex items-center justify-center cursor-pointer transition-transform duration-500 hover:scale-105"
      />
    </div>
  );
}
