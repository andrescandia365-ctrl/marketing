// A rigged humanoid (GLB) drawn into the explainer frame. Every call is a function of time: the clip is sampled at
// t, and hip travel / yaw (root motion) moves and turns the character. No clock, so the final render's seek(t) matches
// the preview. Mesh2Motion and Mixamo both export this kind of file; Playbook does not rig.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Rig, RigMove } from "../../shared/series.ts";

export type ActorAsset = {
  names: string[];
  // True when that clip actually displaces or yaws the hips. False: the scene still moves, but it is a slide.
  root: Partial<Record<RigMove, boolean>>;
  draw: (ctx: CanvasRenderingContext2D, x: number, bottom: number, height: number, t: number, dur: number, move: RigMove, talk: number) => { x: number; y: number; w: number; h: number };
};

const loader = new GLTFLoader();
let renderer: THREE.WebGLRenderer | null = null;

function gl(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function findBone(root: THREE.Object3D, re: RegExp): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && re.test(o.name)) found = o;
  });
  return found;
}

function yawOf(bone: THREE.Object3D): number {
  const q = bone.getWorldQuaternion(new THREE.Quaternion());
  return new THREE.Euler().setFromQuaternion(q, "YXZ").y;
}

function pose(mixer: THREE.AnimationMixer, clip: THREE.AnimationClip, time: number, model: THREE.Object3D) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.enabled = true;
  action.play();
  mixer.setTime(Math.max(0, Math.min(time, Math.max(0, clip.duration - 0.001))));
  model.updateMatrixWorld(true);
}

export function loadActor(url: string, rig: Rig): Promise<ActorAsset | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        model.position.y -= box.min.y;
        model.scale.setScalar(1.7 / Math.max(0.001, size.y));
        model.updateMatrixWorld(true);

        const hips = findBone(model, /hips|pelvis|root/i);
        const jaw = findBone(model, /jaw|chin/i);
        const mixer = new THREE.AnimationMixer(model);
        const byName = new Map(gltf.animations.map((c) => [c.name, c]));
        const root: Partial<Record<RigMove, boolean>> = {};
        for (const move of ["idle", "walk", "turnL", "turnR", "point"] as RigMove[]) {
          const clip = byName.get(rig.clips[move]);
          if (!clip || !hips) continue;
          pose(mixer, clip, 0, model);
          const a = hips.getWorldPosition(new THREE.Vector3());
          const ay = yawOf(hips);
          pose(mixer, clip, clip.duration * 0.85, model);
          const b = hips.getWorldPosition(new THREE.Vector3());
          let dy = yawOf(hips) - ay;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          root[move] = move === "walk" ? Math.abs(b.x - a.x) > 0.2 : move.startsWith("turn") ? Math.abs(dy) > 0.35 : true;
        }

        const scene = new THREE.Scene();
        const rigGroup = new THREE.Group();
        rigGroup.add(model);
        scene.add(rigGroup);
        scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a342c, 1.35));
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(1.2, 3, 2);
        scene.add(key);
        const camera = new THREE.PerspectiveCamera(32, 0.72, 0.1, 20);
        camera.position.set(0, 1.15, 4.4);
        camera.lookAt(0, 0.95, 0);

        const draw: ActorAsset["draw"] = (ctx, x, bottom, pxH, t, dur, move, talk) => {
          const w = pxH * 0.72;
          const h = pxH;
          const r = gl();
          r.setSize(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)), false);
          const clip = byName.get(rig.clips[move]) ?? byName.get(rig.clips.idle) ?? gltf.animations[0];
          rigGroup.position.set(0, 0, 0);
          rigGroup.rotation.set(0, 0, 0);
          if (clip) {
            const local = clip.duration > 0 ? t % clip.duration : 0;
            pose(mixer, clip, 0, model);
            const rest = hips?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
            const restYaw = hips ? yawOf(hips) : 0;
            pose(mixer, clip, local, model);
            const has = root[move];
            if (move === "walk") {
              const dx = has && hips ? hips.getWorldPosition(new THREE.Vector3()).x - rest.x : (t / Math.max(0.2, dur) - 0.5) * 1.4;
              rigGroup.position.x = dx;
            } else if (move === "turnL" || move === "turnR") {
              const sign = move === "turnL" ? 1 : -1;
              const dyaw = has && hips ? yawOf(hips) - restYaw : sign * (t / Math.max(0.2, dur)) * 1.3;
              rigGroup.rotation.y = dyaw;
            }
          }
          if (jaw) jaw.rotation.x = 0.12 + talk * 0.45;
          r.render(scene, camera);
          ctx.drawImage(r.domElement, x - w / 2, bottom - h, w, h);
          return { x: x - w / 2, y: bottom - h, w, h };
        };
        resolve({ names: gltf.animations.map((c) => c.name), root, draw });
      },
      undefined,
      () => resolve(null),
    );
  });
}
