"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";

/**
 * Interactive globe hero for the landing page.
 *
 * Pure Three.js (no map tiles, no Mapbox token required for the homepage).
 * The sphere is a shader-shaded violet→cyan globe; cities orbit it as
 * glowing markers with pulse rings. Auto-rotates; the user can grab to drag
 * and scroll-zoom. Built to feel like the product the brief promises —
 * Spotify Wrapped meets Polarsteps, in motion.
 */

type City = {
  name: string;
  lat: number;
  lng: number;
  /** Tier 0 = small dot, 2 = signature glow. Drives marker scale. */
  weight: 0 | 1 | 2;
};

// A modest spread across the world — enough to make the globe look populated,
// not so many that it crowds. Hand-curated for a great visual when spinning.
const CITIES: City[] = [
  { name: "London", lat: 51.5074, lng: -0.1278, weight: 2 },
  { name: "Dublin", lat: 53.3498, lng: -6.2603, weight: 2 },
  { name: "Manchester", lat: 53.4808, lng: -2.2426, weight: 1 },
  { name: "Glasgow", lat: 55.8642, lng: -4.2518, weight: 1 },
  { name: "Berlin", lat: 52.52, lng: 13.405, weight: 2 },
  { name: "Amsterdam", lat: 52.3676, lng: 4.9041, weight: 1 },
  { name: "Paris", lat: 48.8566, lng: 2.3522, weight: 2 },
  { name: "Barcelona", lat: 41.3851, lng: 2.1734, weight: 1 },
  { name: "Lisbon", lat: 38.7223, lng: -9.1393, weight: 1 },
  { name: "Madrid", lat: 40.4168, lng: -3.7038, weight: 1 },
  { name: "Reykjavík", lat: 64.1466, lng: -21.9426, weight: 0 },
  { name: "Stockholm", lat: 59.3293, lng: 18.0686, weight: 1 },
  { name: "Copenhagen", lat: 55.6761, lng: 12.5683, weight: 1 },
  { name: "Prague", lat: 50.0755, lng: 14.4378, weight: 0 },
  { name: "Vienna", lat: 48.2082, lng: 16.3738, weight: 0 },
  { name: "Rome", lat: 41.9028, lng: 12.4964, weight: 1 },
  { name: "Athens", lat: 37.9838, lng: 23.7275, weight: 0 },
  { name: "Istanbul", lat: 41.0082, lng: 28.9784, weight: 1 },
  { name: "Tel Aviv", lat: 32.0853, lng: 34.7818, weight: 0 },
  { name: "Marrakesh", lat: 31.6295, lng: -7.9811, weight: 0 },
  { name: "Cape Town", lat: -33.9249, lng: 18.4241, weight: 1 },
  { name: "New York", lat: 40.7128, lng: -74.006, weight: 2 },
  { name: "Toronto", lat: 43.6532, lng: -79.3832, weight: 1 },
  { name: "Mexico City", lat: 19.4326, lng: -99.1332, weight: 1 },
  { name: "Lima", lat: -12.0464, lng: -77.0428, weight: 0 },
  { name: "Buenos Aires", lat: -34.6037, lng: -58.3816, weight: 1 },
  { name: "São Paulo", lat: -23.5505, lng: -46.6333, weight: 1 },
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, weight: 2 },
  { name: "Seoul", lat: 37.5665, lng: 126.978, weight: 1 },
  { name: "Bangkok", lat: 13.7563, lng: 100.5018, weight: 1 },
  { name: "Singapore", lat: 1.3521, lng: 103.8198, weight: 1 },
  { name: "Bali", lat: -8.65, lng: 115.2167, weight: 1 },
  { name: "Sydney", lat: -33.8688, lng: 151.2093, weight: 2 },
  { name: "Melbourne", lat: -37.8136, lng: 144.9631, weight: 1 },
  { name: "Auckland", lat: -36.8485, lng: 174.7633, weight: 0 },
];

// Mapped routes — animated arcs that trace between the high-weight cities.
const ROUTES: [string, string][] = [
  ["London", "Berlin"],
  ["London", "New York"],
  ["Dublin", "London"],
  ["Paris", "Barcelona"],
  ["Berlin", "Tokyo"],
  ["New York", "Mexico City"],
  ["Tokyo", "Sydney"],
  ["São Paulo", "Buenos Aires"],
  ["Cape Town", "London"],
  ["Bali", "Sydney"],
];

const RADIUS = 1.6;

/** Convert lat/lng (in degrees) to a position on a unit sphere of given radius. */
function latLngToVec3(lat: number, lng: number, r = RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function GlobeMesh() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.06; // slow spin
    }
  });

  // Build a deep-violet gradient sphere with a subtle fresnel glow.
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color("#1a0f3d") },
        glowColor: { value: new THREE.Color("#7c3aed") },
        accentColor: { value: new THREE.Color("#06b6d4") },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 baseColor;
        uniform vec3 glowColor;
        uniform vec3 accentColor;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main() {
          float facing = dot(normalize(vNormal), vec3(0.0, 0.0, 1.0));
          float fresnel = pow(1.0 - clamp(facing, 0.0, 1.0), 2.4);
          // Latitude-driven shimmer
          float lat = vWorldPosition.y;
          vec3 base = mix(baseColor, accentColor * 0.35, smoothstep(-1.4, 1.4, lat) * 0.4);
          vec3 col = mix(base, glowColor, fresnel * 0.85);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, []);

  return (
    <group ref={meshRef as unknown as React.MutableRefObject<THREE.Group>}>
      {/* The globe itself */}
      <mesh material={material}>
        <sphereGeometry args={[RADIUS, 96, 96]} />
      </mesh>

      {/* Wireframe overlay — gives the globe scale and tech-y feel */}
      <mesh>
        <sphereGeometry args={[RADIUS * 1.002, 48, 32]} />
        <meshBasicMaterial
          color="#a78bfa"
          wireframe
          transparent
          opacity={0.08}
        />
      </mesh>

      {/* Atmosphere shell */}
      <mesh>
        <sphereGeometry args={[RADIUS * 1.06, 64, 64]} />
        <shaderMaterial
          transparent
          side={THREE.BackSide}
          depthWrite={false}
          uniforms={{
            color: { value: new THREE.Color("#7c3aed") },
          }}
          vertexShader={/* glsl */ `
            varying vec3 vNormal;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={/* glsl */ `
            uniform vec3 color;
            varying vec3 vNormal;
            void main() {
              float intensity = pow(0.55 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
              gl_FragColor = vec4(color, 1.0) * intensity;
            }
          `}
        />
      </mesh>

      {/* Pins */}
      {CITIES.map((c) => (
        <Pin key={c.name} city={c} />
      ))}

      {/* Routes */}
      {ROUTES.map(([a, b], i) => {
        const cityA = CITIES.find((c) => c.name === a);
        const cityB = CITIES.find((c) => c.name === b);
        if (!cityA || !cityB) return null;
        return <Arc key={i} from={cityA} to={cityB} delay={i * 0.3} />;
      })}
    </group>
  );
}

function Pin({ city }: { city: City }) {
  const ref = useRef<THREE.Group>(null);
  const pos = useMemo(() => latLngToVec3(city.lat, city.lng), [city]);
  const normal = useMemo(() => pos.clone().normalize(), [pos]);
  // Orient the pin so its "tip" points outward from the globe surface.
  const quaternion = useMemo(() => {
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      normal,
    );
  }, [normal]);

  const isAccent = city.weight === 2;
  const baseScale = city.weight === 2 ? 1 : city.weight === 1 ? 0.7 : 0.5;

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    // Pulse on signature cities only — subtle for the rest.
    const pulse = isAccent ? 1 + Math.sin(t * 2 + city.lat) * 0.1 : 1;
    ref.current.scale.setScalar(baseScale * pulse);
  });

  return (
    <group ref={ref} position={pos} quaternion={quaternion}>
      {/* Tiny base dot */}
      <mesh>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial
          color={isAccent ? "#06b6d4" : "#a78bfa"}
          toneMapped={false}
        />
      </mesh>
      {/* Glow ring */}
      <mesh position={[0, 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.018, 0.04, 32]} />
        <meshBasicMaterial
          color={isAccent ? "#06b6d4" : "#7c3aed"}
          transparent
          opacity={isAccent ? 0.55 : 0.35}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * A great-circle arc between two cities, rendered as an animated tube whose
 * draw-progress sweeps from start to end on a loop.
 */
function Arc({
  from,
  to,
  delay = 0,
}: {
  from: City;
  to: City;
  delay?: number;
}) {
  const { line, material, totalLength } = useMemo(() => {
    const start = latLngToVec3(from.lat, from.lng, RADIUS * 1.002);
    const end = latLngToVec3(to.lat, to.lng, RADIUS * 1.002);
    const mid = start.clone().add(end).multiplyScalar(0.5).normalize();
    const dist = start.distanceTo(end);
    const lift = RADIUS + Math.min(dist * 0.35, 0.7);
    const apex = mid.multiplyScalar(lift);
    const curve = new THREE.QuadraticBezierCurve3(start, apex, end);
    const points = curve.getPoints(64);
    const length = curve.getLength();

    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color: new THREE.Color("#06b6d4"),
      transparent: true,
      opacity: 0.85,
      dashSize: 0,
      gapSize: length,
      toneMapped: false,
    });
    const ln = new THREE.Line(geom, mat);
    ln.computeLineDistances();
    return { line: ln, material: mat, totalLength: length };
  }, [from, to]);

  useFrame((state) => {
    const t = (state.clock.getElapsedTime() + delay) % 4;
    const progress = Math.min(t / 2, 1);
    material.dashSize = totalLength * progress;
    material.gapSize = totalLength * (1 - progress);
    material.needsUpdate = true;
  });

  return <primitive object={line} />;
}

export function Globe({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0.4, 5], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 3, 5]} intensity={0.6} />
        <Suspense fallback={null}>
          <Stars radius={50} depth={30} count={1500} factor={4} fade speed={0.6} />
          <GlobeMesh />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          zoomSpeed={0.4}
          minDistance={3.2}
          maxDistance={9}
          rotateSpeed={0.45}
          autoRotate
          autoRotateSpeed={0.35}
        />
      </Canvas>
    </div>
  );
}
