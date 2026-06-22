'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const BUILDING_SCALE = 0.1258151;
const BUILDING_Y = -3.15;
const BUILDING_ROTATION_Y = -Math.PI / 4;
const MODEL_SCALE_BOOST = 1.33;

const IN_SCALES = [
  0.49891934,
  0.48924589,
  0.65903157,
  0.56163494,
  0.525617,
  0.48504462,
  0.47589859,
  0.00563856,
  0.44955175,
  0.45042205,
  0.51490548,
  0.55951631,
];

const OUT_SCALES = [
  0.00015744,
  0.12354705,
  0.05394827,
  0.0738189,
  0.10172009,
];

const IN_PATHS = Array.from({ length: 12 }, (_, i) =>
  `/models/in_${String(i + 1).padStart(2, '0')}.glb`
);

const OUT_PATHS = Array.from({ length: 5 }, (_, i) =>
  `/models/out_${String(i + 1).padStart(2, '0')}.glb`
);

const CONSTRUCT_DURATION = 4;
const MATERIAL_STAGGER = 0.4;
const MATERIAL_TRAVEL = 2.8;
const ABSORB_PAUSE = 0.8;
const OUTPUT_STAGGER = 0.8;
const OUTPUT_TRAVEL = 3.2;
const DECONSTRUCT_DURATION = 2;
const MATERIAL_START = CONSTRUCT_DURATION;
const MATERIAL_PHASE = (IN_PATHS.length - 1) * MATERIAL_STAGGER + MATERIAL_TRAVEL;
const PULSE_START = MATERIAL_START + MATERIAL_PHASE;
const OUTPUT_START = PULSE_START + ABSORB_PAUSE;
const OUTPUT_PHASE = (OUT_PATHS.length - 1) * OUTPUT_STAGGER + OUTPUT_TRAVEL;
const DECONSTRUCT_START = OUTPUT_START + OUTPUT_PHASE;
const LOOP_DURATION = DECONSTRUCT_START + DECONSTRUCT_DURATION;

const MATERIAL_Y = 1.0;

function easeConstruct(t: number) {
  return t < 0.82 ? t * 0.92 : 0.7544 + 0.2456 * Math.pow((t - 0.82) / 0.18, 1.35);
}

function centerAtBase(scene: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  box.getCenter(center);
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box.min.y;
}

function setTransparentMaterials(scene: THREE.Object3D) {
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (material) {
          material.transparent = true;
          material.needsUpdate = true;
        }
      });
    }
  });
}

function setOpacity(scene: THREE.Object3D, opacity: number) {
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (material) material.opacity = opacity;
      });
    }
  });
}

function usePreparedModel(path: string, transparent = false) {
  const { scene } = useGLTF(path);

  return useMemo(() => {
    const clone = scene.clone(true);
    centerAtBase(clone);
    if (transparent) setTransparentMaterials(clone);
    return clone;
  }, [scene, transparent]);
}

function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 8, 18);
    camera.lookAt(1.2, 0.25, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function Building({ loopTime }: { loopTime: number }) {
  const group = useRef<THREE.Group>(null);
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);
  const clone = usePreparedModel('/models/building.glb');

  const buildingTop = 47.689037 * BUILDING_SCALE;
  let reveal = 1;
  if (loopTime < CONSTRUCT_DURATION) {
    reveal = easeConstruct(loopTime / CONSTRUCT_DURATION);
  } else if (loopTime >= DECONSTRUCT_START) {
    reveal = 1 - (loopTime - DECONSTRUCT_START) / DECONSTRUCT_DURATION;
  }

  const pulse = loopTime >= PULSE_START && loopTime < OUTPUT_START
    ? 1 + Math.sin(((loopTime - PULSE_START) / ABSORB_PAUSE) * Math.PI) * 0.035
    : 1;

  useEffect(() => {
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          if (material) {
            material.clippingPlanes = [clipPlane];
            material.clipShadows = true;
            material.needsUpdate = true;
          }
        });
      }
    });
  }, [clone, clipPlane]);

  useFrame(() => {
    clipPlane.constant = BUILDING_Y + buildingTop * reveal;
    if (group.current) {
      group.current.scale.setScalar(BUILDING_SCALE * pulse);
    }
  });

  return (
    <group
      ref={group}
      position={[1.9, BUILDING_Y, 0]}
      rotation={[0, BUILDING_ROTATION_Y, 0]}
      scale={BUILDING_SCALE}
    >
      <primitive object={clone} />
    </group>
  );
}

function MaterialItem({
  path,
  scale,
  index,
  loopTime,
}: {
  path: string;
  scale: number;
  index: number;
  loopTime: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const clone = usePreparedModel(path, true);
  const t = loopTime - MATERIAL_START - index * MATERIAL_STAGGER;
  const active = t >= 0 && t <= MATERIAL_TRAVEL;
  const progress = THREE.MathUtils.clamp(t / MATERIAL_TRAVEL, 0, 1);
  const x = -12 + 12 * progress;
  const opacity = active ? Math.max(0, 1 - Math.max(0, progress - 0.72) / 0.28) : 0;
  const itemScale = scale * MODEL_SCALE_BOOST * (1 - progress * 0.58);

  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = active;
    ref.current.position.set(x, MATERIAL_Y, 0);
    ref.current.scale.setScalar(Math.max(0.01, itemScale));
    setOpacity(clone, opacity);
  });

  return <primitive ref={ref} object={clone} />;
}

function FloorPlanItem({
  path,
  scale,
  index,
  loopTime,
}: {
  path: string;
  scale: number;
  index: number;
  loopTime: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const clone = usePreparedModel(path, true);
  const t = loopTime - OUTPUT_START - index * OUTPUT_STAGGER;
  const active = t >= 0 && t <= OUTPUT_TRAVEL;
  const progress = THREE.MathUtils.clamp(t / OUTPUT_TRAVEL, 0, 1);
  const x = -12 * progress;
  const opacity = active ? Math.min(1, progress / 0.18) : 0;
  const itemScale = scale * MODEL_SCALE_BOOST * (0.18 + 0.82 * progress);

  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = active;
    ref.current.position.set(x, MATERIAL_Y, 0);
    ref.current.scale.setScalar(Math.max(0.01, itemScale));
    setOpacity(clone, opacity);
  });

  return <primitive ref={ref} object={clone} />;
}

function SceneContent({ onProgress }: { onProgress: (progress: number) => void }) {
  const [loopTime, setLoopTime] = useState(0);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    const nextLoopTime = elapsed % LOOP_DURATION;
    setLoopTime(nextLoopTime);
    const constructProgress = nextLoopTime < CONSTRUCT_DURATION
      ? easeConstruct(nextLoopTime / CONSTRUCT_DURATION)
      : nextLoopTime >= DECONSTRUCT_START
        ? 1 - (nextLoopTime - DECONSTRUCT_START) / DECONSTRUCT_DURATION
        : 1;
    onProgress(THREE.MathUtils.clamp(constructProgress, 0, 1));
  });

  return (
    <>
      <CameraRig />
      <directionalLight position={[5, 10, 5]} intensity={1.65} color="#FFF8EE" />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#F0E6D0', '#8B7355', 0.7]} />
      <Building loopTime={loopTime} />
      {IN_PATHS.map((path, index) => (
        <MaterialItem
          key={path}
          path={path}
          index={index}
          scale={IN_SCALES[index]}
          loopTime={loopTime}
        />
      ))}
      {OUT_PATHS.map((path, index) => (
        <FloorPlanItem
          key={path}
          path={path}
          index={index}
          scale={OUT_SCALES[index]}
          loopTime={loopTime}
        />
      ))}
    </>
  );
}

useGLTF.preload('/models/building.glb');
IN_PATHS.forEach((path) => useGLTF.preload(path));
OUT_PATHS.forEach((path) => useGLTF.preload(path));

export default function HeroScene() {
  const [progress, setProgress] = useState(0);
  const [loaderComplete, setLoaderComplete] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--hero-construction-progress', String(progress));
    if (progress >= 0.995) setLoaderComplete(true);
  }, [progress]);

  return (
    <>
      <div className={`hero-loading-screen${loaderComplete ? ' complete' : ''}`}>
        <div className="hero-loading-wordmark">Vulpine<span>.</span></div>
        <div className="hero-loading-status">CONSTRUCTING {Math.round(progress * 100)}%</div>
      </div>
      <Canvas
        gl={{ alpha: true, antialias: true, localClippingEnabled: true }}
        camera={{ position: [0, 8, 18], fov: 40 }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
        dpr={[1, 2]}
      >
        <SceneContent onProgress={setProgress} />
      </Canvas>
    </>
  );
}
