"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The signature: a drifting field of task-nodes. As sample tasks
 * "complete", an amber edge links two nearby nodes and a pulse travels
 * it before fading — the hero echo of the in-app live-sync dot.
 *
 * Every imperative object (simulation state, geometries, helpers) lives
 * in one lazily-initialized container that only useFrame touches —
 * nothing hook-provided is ever mutated, nothing mutates during render.
 */

const NODE_COUNT = 48;
const MAX_EDGES = 8;
const LINK_DIST = 2.1;
const EDGE_TRAVEL_S = 1.9;
const BOUNDS = [4.6, 2.6, 1.8] as const;

interface Sim {
  positions: Float32Array;
  velocities: Float32Array;
  edges: Array<{ a: number; b: number; t: number }>;
  spawnClock: number;
  pointsGeom: THREE.BufferGeometry;
  linesGeom: THREE.BufferGeometry;
  dummy: THREE.Object3D;
}

const AMBER = new THREE.Color("#f5a623");
const INK = new THREE.Color("#edf1f7");

function dist(p: Float32Array, a: number, b: number) {
  return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1]);
}

function Cloud() {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const pulsesRef = useRef<THREE.InstancedMesh>(null);
  const simRef = useRef<Sim | null>(null);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);

    // First frame: build everything imperative.
    if (!simRef.current) {
      const positions = new Float32Array(NODE_COUNT * 3);
      const velocities = new Float32Array(NODE_COUNT * 3);
      for (let i = 0; i < NODE_COUNT; i++) {
        for (let axis = 0; axis < 3; axis++) {
          const idx = i * 3 + axis;
          positions[idx] = (Math.random() - 0.5) * 2 * BOUNDS[axis];
          velocities[idx] = (Math.random() - 0.5) * (axis === 2 ? 0.08 : 0.16);
        }
      }

      const pointsGeom = new THREE.BufferGeometry();
      pointsGeom.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );

      const linesGeom = new THREE.BufferGeometry();
      linesGeom.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(MAX_EDGES * 2 * 3), 3)
      );
      linesGeom.setAttribute(
        "color",
        new THREE.BufferAttribute(new Float32Array(MAX_EDGES * 2 * 3), 3)
      );
      linesGeom.setDrawRange(0, 0);

      if (pointsRef.current) pointsRef.current.geometry = pointsGeom;
      if (linesRef.current) linesRef.current.geometry = linesGeom;

      simRef.current = {
        positions,
        velocities,
        edges: [],
        spawnClock: 0,
        pointsGeom,
        linesGeom,
        dummy: new THREE.Object3D(),
      };
    }
    const sim = simRef.current;

    // Drift + soft bounce
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const idx = i * 3 + axis;
        sim.positions[idx] += sim.velocities[idx] * dt;
        if (Math.abs(sim.positions[idx]) > BOUNDS[axis]) {
          sim.velocities[idx] *= -1;
          sim.positions[idx] = Math.sign(sim.positions[idx]) * BOUNDS[axis];
        }
      }
    }
    (sim.pointsGeom.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;

    // Spawn completion links when there is room
    sim.spawnClock += dt;
    if (sim.spawnClock > 0.5 && sim.edges.length < MAX_EDGES) {
      sim.spawnClock = 0;
      for (let tries = 0; tries < 12; tries++) {
        const a = Math.floor(Math.random() * NODE_COUNT);
        const b = Math.floor(Math.random() * NODE_COUNT);
        if (a !== b && dist(sim.positions, a, b) < LINK_DIST) {
          sim.edges.push({ a: Math.min(a, b), b: Math.max(a, b), t: 0 });
          break;
        }
      }
    }

    // Advance edges; write segments + travelling pulses
    const linePos = sim.linesGeom.attributes.position.array as Float32Array;
    const lineCol = sim.linesGeom.attributes.color.array as Float32Array;
    let segment = 0;
    sim.edges = sim.edges.filter((edge) => edge.t <= 1);
    for (const edge of sim.edges) {
      edge.t += dt / EDGE_TRAVEL_S;
      const brightness = Math.sin(Math.PI * Math.min(edge.t, 1));
      const ax = sim.positions[edge.a * 3];
      const ay = sim.positions[edge.a * 3 + 1];
      const az = sim.positions[edge.a * 3 + 2];
      const bx = sim.positions[edge.b * 3];
      const by = sim.positions[edge.b * 3 + 1];
      const bz = sim.positions[edge.b * 3 + 2];

      linePos.set([ax, ay, az], segment * 6);
      linePos.set([bx, by, bz], segment * 6 + 3);
      lineCol.set(
        [INK.r * brightness, INK.g * brightness, INK.b * brightness],
        segment * 6
      );
      lineCol.set(
        [AMBER.r * brightness, AMBER.g * brightness, AMBER.b * brightness],
        segment * 6 + 3
      );

      sim.dummy.position.set(
        ax + (bx - ax) * edge.t,
        ay + (by - ay) * edge.t,
        az + (bz - az) * edge.t
      );
      sim.dummy.scale.setScalar(0.055 * brightness);
      sim.dummy.updateMatrix();
      if (pulsesRef.current) {
        pulsesRef.current.setMatrixAt(segment, sim.dummy.matrix);
      }
      segment++;
    }

    (sim.linesGeom.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
    (sim.linesGeom.attributes.color as THREE.BufferAttribute).needsUpdate =
      true;
    sim.linesGeom.setDrawRange(0, segment * 2);
    if (pulsesRef.current) {
      pulsesRef.current.count = segment;
      pulsesRef.current.instanceMatrix.needsUpdate = true;
    }

    // Pointer parallax, critically damped
    if (groupRef.current) {
      const g = groupRef.current;
      g.rotation.y = THREE.MathUtils.damp(
        g.rotation.y,
        state.pointer.x * 0.16,
        2.5,
        dt
      );
      g.rotation.x = THREE.MathUtils.damp(
        g.rotation.x,
        -state.pointer.y * 0.1,
        2.5,
        dt
      );
    }
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <pointsMaterial
          size={0.05}
          sizeAttenuation
          color={INK}
          transparent
          opacity={0.65}
          depthWrite={false}
        />
      </points>

      <lineSegments ref={linesRef}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </lineSegments>

      <instancedMesh args={[undefined, undefined, MAX_EDGES]} ref={pulsesRef}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={AMBER} transparent opacity={0.95} />
      </instancedMesh>
    </group>
  );
}

export default function Constellation() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 8.6], fov: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <Cloud />
    </Canvas>
  );
}
