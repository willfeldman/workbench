"use client";
import { Component, Suspense, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  Html,
  Line,
  RoundedBox,
} from "@react-three/drei";
import * as THREE from "three";
import { RotateCcw, Ruler, Expand, Box } from "lucide-react";
import { Button } from "./ui/button";
import {
  formatLength,
  type SceneNode,
  type Spec,
  type Project,
} from "@/lib/project";
function useWood(enabled: boolean) {
  return useMemo(() => {
    if (!enabled || typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#d6c1a1";
    c.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 270; i++) {
      const x = (i * 71.37) % 256;
      c.strokeStyle = `rgba(81,49,22,${0.025 + (i % 7) * 0.006})`;
      c.lineWidth = 0.3 + (i % 5) * 0.2;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(
        x + Math.sin(i) * 12,
        170,
        x + Math.cos(i) * 9,
        320,
        x,
        512,
      );
      c.stroke();
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 2);
    return t;
  }, [enabled]);
}
function Part({
  node,
  muted,
  wood,
}: {
  node: SceneNode;
  muted: boolean;
  wood: boolean;
}) {
  const { gl } = useThree();
  const rendered = () => {
    if (!gl.domElement.dataset.rendered)
      gl.domElement.dataset.rendered = "true";
  };
  const size = node.size.map((x) => x * 0.01) as [number, number, number],
    position = node.position.map((x) => x * 0.01) as [number, number, number],
    map = useWood(wood);
  const geometry = useMemo(() => {
    if (node.shape === "extrusion") {
      const s = new THREE.Shape(
        node.points.map(([x, y]) => new THREE.Vector2(x * 0.01, y * 0.01)),
      );
      const g = new THREE.ExtrudeGeometry(s, {
        depth: node.size[2] * 0.01,
        bevelEnabled: false,
      });
      g.translate(0, 0, -node.size[2] * 0.005);
      return g;
    }
    if (node.shape === "mesh") {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          node.vertices.map((x) => x * 0.01),
          3,
        ),
      );
      g.setIndex(node.indices);
      g.computeVertexNormals();
      return g;
    }
    return null;
  }, [node]);
  const material = (
    <meshStandardMaterial
      color={muted ? "#dddcd8" : node.color}
      roughness={node.roughness}
      metalness={node.metalness}
      map={muted ? null : map}
      transparent={muted}
      opacity={muted ? 0.18 : 1}
    />
  );
  if (node.shape === "box")
    return (
      <RoundedBox
        onAfterRender={rendered}
        args={size}
        radius={Math.min(...size) * 0.055}
        smoothness={3}
        position={position}
        rotation={node.rotation as [number, number, number]}
        castShadow
        receiveShadow
      >
        {material}
      </RoundedBox>
    );
  return (
    <mesh
      onAfterRender={rendered}
      position={position}
      rotation={node.rotation as [number, number, number]}
      castShadow
      receiveShadow
      geometry={geometry ?? undefined}
      scale={node.shape === "sphere" ? size : undefined}
    >
      {node.shape === "cylinder" && (
        <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 48]} />
      )}
      {node.shape === "sphere" && <sphereGeometry args={[0.5, 32, 24]} />}
      {material}
    </mesh>
  );
}
class SceneBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function FlatDiagram({
  spec,
  partIds = [],
}: {
  spec: Spec;
  partIds?: string[];
}) {
  const nodes = spec.scene?.nodes ?? [],
    w = spec.dimensionsMm[0],
    h = spec.dimensionsMm[1];
  return (
    <svg
      className="flat-diagram"
      viewBox={`0 0 ${w + 80} ${h + 80}`}
      role="img"
      aria-label="Front view of the project"
    >
      {nodes.map((n) => (
        <rect
          key={n.id}
          x={n.position[0] - n.size[0] / 2 + w / 2 + 40}
          y={h - n.position[1] - n.size[1] / 2 + 40}
          width={Math.max(n.size[0], 2)}
          height={Math.max(n.size[1], 2)}
          rx="2"
          fill={
            partIds.length && !partIds.includes(n.partId) ? "#ebe9e3" : n.color
          }
          stroke="#8f806d"
          strokeWidth="1.5"
        />
      ))}
      {!nodes.length && (
        <text x="50%" y="50%" textAnchor="middle" fontSize="18" fill="#7a776f">
          Preview unavailable
        </text>
      )}
    </svg>
  );
}
export default function SceneView({
  spec,
  units,
  highlight = [],
}: {
  spec: Spec;
  units: Project["units"];
  highlight?: string[];
}) {
  const [dimensions, setDimensions] = useState(false),
    [reset, setReset] = useState(0);
  const scene = spec.scene;
  if (!scene)
    return (
      <div className="scene-unavailable">
        <Box size={26} />
        <p>{spec.sceneError || "Preview is being prepared."}</p>
      </div>
    );
  const scale = 0.01,
    half = (spec.dimensionsMm[0] * scale) / 2,
    height = spec.dimensionsMm[1] * scale,
    depth = (spec.dimensionsMm[2] * scale) / 2;
  return (
    <div className="scene-shell" data-testid="scene-view">
      <SceneBoundary fallback={<FlatDiagram spec={spec} />}>
        <Canvas
          key={reset}
          shadows
          dpr={[1, 2]}
          camera={{
            position: scene.camera.map((x) => x * scale) as [
              number,
              number,
              number,
            ],
            fov: 34,
            near: 0.01,
            far: 3000,
          }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
        >
          <color attach="background" args={["#f5f4f0"]} />
          <ambientLight intensity={1.45} />
          <hemisphereLight args={["#ffffff", "#c4b7a3", 1.1]} />
          <directionalLight
            position={[12, 18, 7]}
            intensity={3.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
            shadow-bias={-0.0002}
          />
          <directionalLight position={[-10, 8, -6]} intensity={1.3} />
          <Suspense fallback={null}>
            {scene.nodes.map((n) => (
              <Part
                key={n.id}
                node={n}
                muted={highlight.length > 0 && !highlight.includes(n.partId)}
                wood={
                  spec.materials
                    .find(
                      (m) =>
                        m.id ===
                        spec.parts.find((p) => p.id === n.partId)?.materialId,
                    )
                    ?.name.match(
                      /wood|cedar|oak|pine|plywood|walnut|timber/i,
                    ) !== null && spec.category === "Woodworking"
                }
              />
            ))}
            <ContactShadows
              position={[0, -0.02, 0]}
              opacity={0.3}
              scale={Math.max(half * 4, depth * 5, 12)}
              blur={2.8}
              far={height + 3}
              resolution={512}
            />
            {dimensions && (
              <>
                <Line
                  points={[
                    [-half, -0.01, depth + 0.7],
                    [half, -0.01, depth + 0.7],
                  ]}
                  color="#827966"
                  lineWidth={1}
                />
                <Html position={[0, -0.01, depth + 0.85]} center>
                  <span className="dimension-label">
                    {formatLength(spec.dimensionsMm[0], units)}
                  </span>
                </Html>
                <Line
                  points={[
                    [half + 0.65, 0, 0],
                    [half + 0.65, height, 0],
                  ]}
                  color="#827966"
                  lineWidth={1}
                />
                <Html position={[half + 0.8, height / 2, 0]} center>
                  <span className="dimension-label">
                    {formatLength(spec.dimensionsMm[1], units)}
                  </span>
                </Html>
              </>
            )}
            <OrbitControls
              makeDefault
              target={
                scene.target.map((x) => x * scale) as [number, number, number]
              }
              minDistance={Math.max(half, 1)}
              maxDistance={Math.max(...spec.dimensionsMm) * 0.1}
              maxPolarAngle={Math.PI * 0.49}
              enableDamping
            />
          </Suspense>
        </Canvas>
      </SceneBoundary>
      <div className="scene-controls">
        <Button
          variant="ghost"
          size="icon"
          title="Show dimensions"
          aria-label="Show dimensions"
          aria-pressed={dimensions}
          onClick={() => setDimensions(!dimensions)}
        >
          <Ruler size={17} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Reset view"
          aria-label="Reset view"
          onClick={() => setReset(reset + 1)}
        >
          <RotateCcw size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Expand preview"
          aria-label="Expand preview"
          onClick={(e) => {
            const el = e.currentTarget.closest(".scene-shell");
            if (!document.fullscreenElement) el?.requestFullscreen?.();
            else document.exitFullscreen?.();
          }}
        >
          <Expand size={16} />
        </Button>
      </div>
      <span className="scene-hint">Drag to rotate · Scroll to zoom</span>
    </div>
  );
}
