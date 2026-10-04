# Tech research: isometric turn-based tactical roguelike in three.js + TypeScript + Vite

Written 2026-10-04. Everything below was checked against the actual packages and assets, not memory:

| Thing | Verified value |
|---|---|
| `three` | **0.186.1 (r186)**. `@types/three` 0.186.0. Vite 8.3.2. Node 22. |
| Addon import path | `three/addons/<dir>/<File>.js` — the `package.json` `exports` map `./addons/*` → `./examples/jsm/*`. Both resolve; the manual documents `three/addons/`. `@types/three` ships the same `./addons/*` export, so types work. |
| WebGPU | `import * as THREE from 'three/webgpu'` + `three/tsl`. Manual still calls WebGPURenderer "experimental" and says `WebGLRenderer` is the "recommended choice for pure WebGL 2 applications". WebGPURenderer does **not** support `ShaderMaterial`, `onBeforeCompile`, or `EffectComposer` (uses `RenderPipeline`/`PostProcessing` + TSL instead). **Recommendation: WebGLRenderer** for this project. |
| EffectComposer | Still in addons: `three/addons/postprocessing/EffectComposer.js`, plus `RenderPass`, `UnrealBloomPass`, `OutlinePass`, `SMAAPass` (constructor now takes **no args**), `FXAAPass`, `ShaderPass`, `RenderPixelatedPass`, `OutputPass`. `VignetteShader` exists in `three/addons/shaders/VignetteShader.js`. |
| Timing | `THREE.Clock` **deprecated r183** → `THREE.Timer` (core): `connect(document)`, `update(ts)`, `getDelta()`, `getElapsed()`, `setTimescale()`, `dispose()`. |
| Shadows | `PCFSoftShadowMap` **removed r186** (warns and falls back). Use `PCFShadowMap` (now soft) or `VSMShadowMap`. |
| Skinned cloning | `import { clone } from 'three/addons/utils/SkeletonUtils.js'` (also exports `retarget`, `retargetClip`). |
| Thick lines | `three/addons/lines/Line2.js`, `LineGeometry.js`, `LineMaterial.js`. |
| Draco | decoder files at `node_modules/three/examples/jsm/libs/draco/gltf/` (js + wasm). KayKit files are not Draco-compressed, so you don't need it. |
| KayKit Dungeon Remastered | Grid = **4 × 4 world units per tile**. `floor_tile_large` spans x,z ∈ [−2, 2], y ∈ [−0.1, 0.05] (floor top is **y = 0.05**). `floor_tile_small` is 2 × 2. Walls are **4 long × 1 thick × 4 tall**, centred on the cell: `wall` x ∈ [−2, 2], z ∈ [−0.5, 0.5]. `wall_corner` arms go −X and +Z; `wall_Tsplit` −X, +X, +Z; `wall_crossing` all four; `wall_endcap` is a stub from x=0 to 1.07 (+X). `pillar` is 1.5 × 4 × 1.5. `wall_doorway.glb` has two nodes: `wall_doorway` and `wall_doorway_door` (door is separately animatable). One material named `texture`, one embedded PNG **per file** (`dungeon_texture.png`, 1024², gradient atlas) — share it at load time. Files are named `*.gltf.glb`. |
| KayKit Adventurers (Knight.glb, 3.6 MB) | **One GLB per character with all 76 animation clips embedded**. One skin `Rig` with 41 joints including `handslot.l`, `handslot.r`, `head`. Weapons/accessories (`1H_Sword`, `2H_Sword`, `1H_Sword_Offhand`, `Round_Shield`, `Badge_Shield`, `Rectangle_Shield`, `Spike_Shield`, `Knight_Helmet`, `Knight_Cape`) are **non-skinned meshes already parented to those bones** and all visible by default — you hide what you don't want. Body = 6 skinned meshes, ~3.7k verts, ~4.1k tris. Standing height **2.31 units** (so a character is ~0.58 tile tall, which reads right). Per-character atlas (`knight_texture` etc.), `metallicFactor 0`, `roughnessFactor 0.5`. Separate weapon `.gltf` files in `Assets/gltf/` (`sword_1handed`, `axe_2handed`, `staff`, `shield_round`, …). |
| KayKit Skeletons | Same bone names (`handslot.l/r`), 95 clips, materials `skeleton` + `Glow` (emissive eyes — bloom candidate). |
| Clip names (exact) | `Idle`, `Walking_A/B/C`, `Running_A/B`, `1H_Melee_Attack_Chop/Slice_Diagonal/Slice_Horizontal/Stab`, `2H_Melee_Attack_*`, `Unarmed_Melee_Attack_Punch_A/B/Kick`, `Spellcast_Shoot/Raise/Long`, `Block`, `Hit_A`, `Hit_B`, `Death_A`, `Death_B`, `Death_A_Pose`, `Death_B_Pose` (0-length hold poses), `Dodge_*`, `PickUp`, `Use_Item`, `Interact`, `Cheer`, `T-Pose`. Durations: Idle 1.067 s, Walking_A 1.067 s, Running_A 0.8 s, 1H_Melee_Attack_Chop 1.067 s, Hit_A 0.667 s, Death_A 0.8 s. |

---

## 1. Project setup

```bash
npm create vite@latest combat -- --template vanilla-ts
cd combat && npm i three && npm i -D @types/three
```

Folder layout:

```
combat/
  public/
    models/dungeon/*.glb        # KayKit pieces, served as-is at /models/...
    models/characters/*.glb
    audio/*.ogg
    draco/                      # only if you ever Draco-compress; copy from node_modules/three/examples/jsm/libs/draco/gltf/
  src/
    main.ts
    engine/   (renderer, camera, loop, assets, post)
    world/    (grid, tilemap, autotile, fogofwar, highlights)
    sim/      (rng, state, pathfinding, los, turn logic)  ← no three.js imports
    view/     (actors, animation, vfx, sequencer)
    ui/       (hud.ts, floating text)
  index.html
  vite.config.ts
  tsconfig.json
```

Anything in `/public` is copied verbatim and fetched at runtime, so `.glb` needs no Vite config. If you prefer to `import url from './x.glb?url'`, add `assetsInclude: ['**/*.glb']`. No wasm config is needed unless you load Draco/KTX2 decoders, which are plain static files you point the loader at.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
export default defineConfig({
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5173 },
});
```

```json
// tsconfig.json (relevant bits)
{ "compilerOptions": {
  "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
  "strict": true, "noUncheckedIndexedAccess": true, "types": ["vite/client"] } }
```

`npm run dev` / `npm run build` / `npm run preview`. three.js is ~650 KB minified for core; Vite tree-shakes addons you don't import.

Renderer bootstrap:

```ts
// src/engine/renderer.ts
import * as THREE from 'three';

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap; 2.0 is 4x the pixels of 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace;               // default, be explicit
  renderer.toneMapping = THREE.ACESFilmicToneMapping;             // or AgXToneMapping / NeutralToneMapping
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;                   // PCFSoftShadowMap removed in r186
  return renderer;
}
```

---

## 2. Isometric camera

**Angles.** Yaw 45° puts walls on diagonals (the classic look). Pitch options:

- 35.264° = `atan(1/√2)`: true isometric, all three cube axes foreshorten equally. Tiles render as 2:1.155 rhombi.
- 30°: the 2D "2:1 pixel art" convention. Floors look flatter, walls taller — more occlusion of what's behind walls.
- 40–45°: more top-down, floor cells are easier to read for tactics, tall walls hide less. Baldur's Gate's painted backgrounds are roughly 30°-ish oblique; XCOM-style tactics sit nearer 45°.

Recommendation: **yaw 45°, pitch 40°**, exposed as constants so you can tune, with a ±90° yaw snap. The camera orbits a `target` on the ground plane (y = 0) at a fixed distance; distance only affects depth range for an ortho camera, not size.

```ts
// src/engine/isoCamera.ts
import * as THREE from 'three';

export class IsoCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  readonly target = new THREE.Vector3();  // point on y=0 the camera looks at
  yaw = THREE.MathUtils.degToRad(45);
  pitch = THREE.MathUtils.degToRad(40);   // 35.264 for true iso
  distance = 120;                          // just keeps near/far sane
  viewHeight = 28;                          // world units visible vertically at zoom 1 (= 7 tiles of 4u)
  zoom = 1;
  private aspect = 1;

  resize(w: number, h: number) { this.aspect = w / h; this.updateFrustum(); }

  setZoom(z: number) { this.zoom = THREE.MathUtils.clamp(z, 0.5, 3); this.updateFrustum(); }

  private updateFrustum() {
    const halfH = this.viewHeight / (2 * this.zoom);
    const halfW = halfH * this.aspect;
    const c = this.camera;
    c.left = -halfW; c.right = halfW; c.top = halfH; c.bottom = -halfH;
    c.updateProjectionMatrix();
  }

  /** world units per CSS pixel (useful for pan speed) */
  worldPerPixel(canvasHeightPx: number) { return (this.viewHeight / this.zoom) / canvasHeightPx; }

  update() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(cp * Math.sin(this.yaw), sp, cp * Math.cos(this.yaw)); // from target to camera
    this.camera.position.copy(this.target).addScaledVector(dir, this.distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** Pan in screen space by pixel deltas; keeps target on y=0. */
  panPixels(dx: number, dy: number, canvasHeightPx: number) {
    const s = this.worldPerPixel(canvasHeightPx);
    // camera right/forward projected onto the ground plane
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd   = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); // screen-up on the ground
    this.target.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s);
  }

  /** Snap yaw by ±90°. Tween `yaw` toward `targetYaw` in your loop if you want it animated. */
  rotateSnap(steps: number) { this.yaw += steps * Math.PI / 2; }
}
```

Note the ortho camera's apparent size depends only on `left/right/top/bottom`; `camera.zoom` also exists, but computing the frustum yourself keeps "N tiles visible" explicit.

**Screen → world → cell.** For an orthographic camera the pick ray is parallel to the view axis; `Raycaster.setFromCamera` handles that, and `Ray.intersectPlane` against `y = 0` is exact and allocation-free with a reused target. No invisible mesh needed.

```ts
// src/engine/pick.ts
import * as THREE from 'three';
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0 (set constant to -0.05 to hit floor tops)
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

export function screenToGround(ev: PointerEvent, canvas: HTMLCanvasElement, camera: THREE.Camera): THREE.Vector3 | null {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(GROUND, hit); // null if parallel (can't happen for pitch > 0)
}

export const TILE = 4; // KayKit Dungeon Remastered
export const worldToCell = (p: THREE.Vector3) => ({ x: Math.floor(p.x / TILE + 0.5), z: Math.floor(p.z / TILE + 0.5) });
export const cellToWorld = (x: number, z: number, out = new THREE.Vector3()) => out.set(x * TILE, 0, z * TILE);
```

Cells are centred on `(x*4, 0, z*4)` because KayKit pieces are centred on their origin. The analytic alternative (unproject NDC at z=−1 and z=1, then `t = -o.y/d.y`) is the same thing `intersectPlane` does.

---

## 3. Grid world

**Units.** KayKit Dungeon Remastered = 4 units/tile (verified from accessor bounds). Kenney kits are 1 unit. Quaternius varies (often 1 or 2). Pick `TILE = 4` and treat 1 unit ≈ 0.5 m; a 2.31-unit character is a 4.5-foot-ish adventurer standing in a 5-ft square — the proportions KayKit intends.

**Floors and walls: InstancedMesh.** A 60×60 dungeon has thousands of floor tiles; one `InstancedMesh` per *piece variant* gives you one draw call per variant regardless of count. Static merging (`mergeGeometries`) is the alternative; comparison:

| | `InstancedMesh` per piece | `mergeGeometries` into chunks |
|---|---|---|
| Draw calls | 1 per piece variant (~15–25 total) | 1 per chunk (e.g. 16×16 cells) |
| Per-cell tint (fog of war) | `setColorAt(i, color)` — cheap | needs a vertex-colour attribute rewrite |
| Frustum culling | whole batch (bounding sphere of all instances) — effectively always drawn | per chunk — real culling for big maps |
| Memory | tiny (one matrix per instance) | geometry duplicated per cell |
| Edits (destroyed wall) | set matrix to zero scale | rebuild chunk |

Recommendation: **InstancedMesh per piece variant**, because per-instance colour is exactly what fog of war needs, and dungeon levels fit in view often enough that culling isn't the bottleneck. If maps get large (>100×100), split into chunked InstancedMeshes (one set per 16×16 region) to get culling back. With an orthographic camera `Frustum` culling still works (`Object3D.frustumCulled`), it's just that the frustum is a box; per-instance culling does not exist, so an InstancedMesh with a huge combined bounding sphere is always submitted — `computeBoundingSphere()` after setting matrices to keep it tight.

```ts
// src/world/tileBatch.ts
import * as THREE from 'three';

export class TileBatch {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private readonly tmp = new THREE.Object3D();

  constructor(source: THREE.Mesh, capacity: number, material: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(source.geometry, material, capacity);
    this.mesh.count = 0;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  }

  add(x: number, z: number, rotY: number, y = 0): number {
    const i = this.count++;
    this.tmp.position.set(x * 4, y, z * 4);
    this.tmp.rotation.set(0, rotY, 0);
    this.tmp.updateMatrix();
    this.mesh.setMatrixAt(i, this.tmp.matrix);
    this.mesh.setColorAt(i, WHITE);          // allocates instanceColor on first call
    this.mesh.count = this.count;
    return i;
  }

  finalize() {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }
}
const WHITE = new THREE.Color(1, 1, 1);
```

KayKit pieces are single-mesh GLBs (except `wall_doorway`, which has a separate door node), so `gltf.scene.getObjectByProperty('isMesh', true)` yields the geometry. If a piece has several meshes, `mergeGeometries` them first (same material, so it's safe).

**Share one material.** Every KayKit file embeds its own copy of `dungeon_texture.png`. Load one, keep its material, and replace the material on every other piece, otherwise you upload 200 copies of the same 1024² texture:

```ts
let dungeonMat: THREE.MeshStandardMaterial | undefined;
function adoptSharedMaterial(mesh: THREE.Mesh) {
  const m = mesh.material as THREE.MeshStandardMaterial;
  if (!dungeonMat) { dungeonMat = m; m.map!.colorSpace = THREE.SRGBColorSpace; return; }
  m.map?.dispose(); m.dispose();
  mesh.material = dungeonMat;
}
```

---

## 4. glTF loading and animation

```ts
// src/engine/assets.ts
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
// Only if you compress your own assets:
// import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
// const draco = new DRACOLoader().setDecoderPath('/draco/');   // copy node_modules/three/examples/jsm/libs/draco/gltf/* to public/draco/
// loader.setDRACOLoader(draco);

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();
export const loadGLTF = (url: string) => cache.get(url) ?? (cache.set(url, loader.loadAsync(url)), cache.get(url)!);
```

**Detecting how a character pack is structured** (KayKit Adventurers/Skeletons embed everything; some packs ship a rig + separate animation GLBs):

```ts
export function describe(gltf: GLTF) {
  const skinned: THREE.SkinnedMesh[] = [];
  const bones: string[] = [];
  const attachments: THREE.Mesh[] = []; // non-skinned meshes parented under bones (KayKit weapons/helmets)
  gltf.scene.traverse(o => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
    else if ((o as THREE.Bone).isBone) bones.push(o.name);
    else if ((o as THREE.Mesh).isMesh && o.parent && (o.parent as THREE.Bone).isBone) attachments.push(o as THREE.Mesh);
  });
  return { clips: gltf.animations.map(c => `${c.name} (${c.duration.toFixed(2)}s)`), skinned: skinned.map(s => s.name), bones, attachments: attachments.map(a => a.name) };
}
```

If `gltf.animations.length === 0` on the character and a separate `Animations.glb` exists, load that and use its `animations` array with the character's mixer — clip tracks bind by **node name**, so this works as long as bone names match (they do across KayKit packs). `SkeletonUtils.retargetClip` exists for rigs with different names.

**Cloning a skinned character correctly.** `Object3D.clone()` does not rebind skeletons — all clones would share the first clone's bones. Use `SkeletonUtils.clone`:

```ts
// src/view/actor.ts
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

export class Actor {
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;

  constructor(gltf: GLTF, private readonly fade = 0.15) {
    this.root = skeletonClone(gltf.scene);
    this.root.traverse(o => { o.castShadow = true; o.frustumCulled = false; }); // skinned bounds don't follow animation
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  clipNames() { return [...this.actions.keys()]; }

  /** Crossfade to a looping clip (Idle, Walking_A ...). */
  play(name: string) {
    const next = this.actions.get(name); if (!next || next === this.current) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(this.fade).play();
    this.current?.fadeOut(this.fade);
    this.current = next;
  }

  /**
   * One-shot (attack, hit, death). Resolves when the clip finishes.
   * `holdPose` = true leaves the last frame (deaths); otherwise returns to `then`.
   */
  playOnce(name: string, opts: { then?: string; holdPose?: boolean; speed?: number } = {}): Promise<void> {
    const act = this.actions.get(name);
    if (!act) return Promise.resolve();
    act.reset().setLoop(THREE.LoopOnce, 1).setEffectiveTimeScale(opts.speed ?? 1).setEffectiveWeight(1);
    act.clampWhenFinished = true;                   // freeze on last frame instead of snapping to t=0
    act.fadeIn(this.fade).play();
    this.current?.fadeOut(this.fade);
    this.current = act;
    return new Promise(resolve => {
      const onFinished = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== act) return;
        this.mixer.removeEventListener('finished', onFinished);
        if (!opts.holdPose) this.play(opts.then ?? 'Idle');
        resolve();
      };
      this.mixer.addEventListener('finished', onFinished);
    });
  }

  update(dt: number) { this.mixer.update(dt); }

  /** KayKit ships every weapon/shield/helmet attached and visible; hide all, show the chosen ones. */
  configureAttachments(visible: string[]) {
    this.root.traverse(o => {
      if ((o as THREE.Mesh).isMesh && o.parent && (o.parent as THREE.Bone).isBone) o.visible = visible.includes(o.name);
    });
  }

  /** Attach an external weapon GLB to a hand. KayKit bones: 'handslot.r', 'handslot.l', 'head'. */
  equip(weapon: THREE.Object3D, boneName = 'handslot.r') {
    const bone = this.root.getObjectByName(boneName);
    if (!bone) throw new Error(`no bone ${boneName}; have: ${this.bones().join(',')}`);
    bone.add(weapon);                 // weapon authored at the slot origin → identity local transform
    // If the weapon was positioned in world space already, use bone.attach(weapon) to keep its world pose.
  }
  bones() { const b: string[] = []; this.root.traverse(o => { if ((o as THREE.Bone).isBone) b.push(o.name); }); return b; }
}
```

**Timing the hit to the swing.** Clips have no event tracks. Three options, in increasing effort: (1) a per-clip table `{ '1H_Melee_Attack_Chop': 0.45 }` of impact time as a fraction of `clip.duration`, found by scrubbing in the three.js editor or Blender; (2) poll `action.time` each frame and fire when it crosses the threshold; (3) derive it: the frame where `handslot.r` world-space speed peaks or direction reverses. (1)+(2) is what most games do:

```ts
const IMPACT: Record<string, number> = { '1H_Melee_Attack_Chop': 0.42, '1H_Melee_Attack_Stab': 0.5, 'Unarmed_Melee_Attack_Punch_A': 0.4 };

// Add to Actor: a per-frame check of the running one-shot's time.
//   private impact?: { at: number; fire: () => void };
//   update(dt) { this.mixer.update(dt); if (this.impact && this.current && this.current.time >= this.impact.at) { this.impact.fire(); this.impact = undefined; } }
//   attackWithImpact(clip: string, onImpact: () => void) {
//     const act = this.actions.get(clip)!;
//     this.impact = { at: (IMPACT[clip] ?? 0.45) * act.getClip().duration, fire: onImpact };
//     return this.playOnce(clip).finally(() => (this.impact = undefined));
//   }
export function attackWithImpact(actor: Actor, clip: string, onImpact: () => void) { return actor.attackWithImpact(clip, onImpact); }
```

Polling `action.time` once per frame in `update()` is exact to within a frame and costs nothing; `AnimationMixer` only emits `'loop'` and `'finished'` events, so there is no built-in per-time callback.

Animation blending note: `fadeIn/fadeOut` crossfades are fine between Idle↔Walk. For walk → attack mid-stride, 0.1–0.15 s fades look right at this poly level.

---

## 5. Lighting and the dark-dungeon look

**Base.** `HemisphereLight(sky, ground, 0.15)` or `AmbientLight(0x1a1a2e, 0.3)` for a floor that reads as "dark but visible". One `DirectionalLight` (moonlight through grates, intensity 0.3–0.6, cool blue) for shadow shape. Then torches.

**Point light budget.** three.js's WebGL path is a classic forward renderer: the number of each light type is compiled into the shader as `NUM_POINT_LIGHTS` etc. Consequences:

1. Every point light adds per-fragment cost to *every* lit pixel, shadows or not. 4–8 point lights in view is comfortable on integrated GPUs; 16 starts to hurt; there's no hard cap short of `MAX_FRAGMENT_UNIFORM_VECTORS` (≥224 vec4 on WebGL2, usually 1024).
2. **Changing the number of lights in the scene recompiles every material's shader** (a hitch of tens to hundreds of ms). Keep the count constant: create a fixed pool of N `PointLight`s, keep them all in the scene, and park unused ones with `intensity = 0` far away. Lights not in the scene don't count; lights with intensity 0 still count (which is what we want for stability).
3. Point-light **shadows** render the scene 6 extra times each (cube map). Budget: zero or one.

So: pool of ~6 torch lights assigned to the nearest lit torches to the camera target; fake the rest with emissive torch meshes + a baked warm tint in `instanceColor` of nearby floor tiles. The Skeletons pack's `Glow` material is emissive — bloom picks it up for free.

```ts
// src/engine/torches.ts
import * as THREE from 'three';
export class TorchPool {
  lights: THREE.PointLight[] = [];
  private seeds: number[] = [];
  constructor(scene: THREE.Scene, n = 6) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 18, 2); // color, intensity, distance (world units), decay
      l.castShadow = false;
      scene.add(l); this.lights.push(l); this.seeds.push(Math.random() * 100);
    }
  }
  /** Call each frame with torch world positions sorted by distance to camera target. */
  update(torchPositions: THREE.Vector3[], t: number) {
    this.lights.forEach((l, i) => {
      const p = torchPositions[i];
      if (!p) { l.intensity = 0; return; }
      l.position.copy(p).y += 0.6;
      const s = this.seeds[i]!;
      // cheap flicker: two sines + a hash; keep amplitude small (~15%) or it strobes
      l.intensity = 40 * (0.85 + 0.1 * Math.sin(t * 9 + s) + 0.05 * Math.sin(t * 23 + s * 1.7));
    });
  }
}
```

(Physically-based light units are on by default in modern three.js: a `PointLight` intensity around 20–60 candela with `decay = 2` at these distances is a plausible torch.)

**Directional shadow with an ortho camera.** The light's shadow camera is also orthographic; fit it to the visible area and move it with the camera target every frame. Low-poly hard edges show acne; fix with `normalBias`, not huge `bias`.

```ts
export function makeSun(scene: THREE.Scene) {
  const sun = new THREE.DirectionalLight(0x9fb4ff, 0.5);
  sun.position.set(30, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;              // OrthographicCamera
  c.near = 1; c.far = 200;
  c.left = c.bottom = -40; c.right = c.top = 40; // ~ visible area + margin; shrink with zoom for crisper shadows
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.04;             // the one that fixes low-poly acne
  scene.add(sun, sun.target);
  return sun;
}
// per frame: sun.target.position.copy(iso.target); sun.position.copy(iso.target).add(SUN_OFFSET);
```

Set `castShadow` on characters and walls, `receiveShadow` on floors/walls. Skip `castShadow` on floors (nothing is under them).

**Fog.** three.js fog uses `vFogDepth = -mvPosition.z`, i.e. distance along the view axis. With an orthographic camera every visible object sits in a thin depth slab near `distance`, so `Fog`/`FogExp2` produce an almost uniform tint — a tall wall fades slightly differently from the floor, and that's it. It does not give you "darkness in the distance from the player". Use fog of war (§6) and light falloff for that. If you want the subtle version: `scene.fog = new THREE.Fog(bg, distance - 10, distance + 30)`.

**Color/tonemapping.** `outputColorSpace = SRGBColorSpace` (default). ACESFilmic desaturates and crushes saturated low-poly colours a bit; `AgXToneMapping` or `NeutralToneMapping` keep the palette truer — try all three with a hotkey. Set `texture.colorSpace = SRGBColorSpace` on colour maps (GLTFLoader does this for you).

**Post-processing (WebGLRenderer).** Order: RenderPass → OutlinePass → UnrealBloomPass → vignette ShaderPass → OutputPass (tone mapping + sRGB conversion happens here, so the earlier passes work in linear) → SMAAPass.

```ts
// src/engine/post.ts
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, offset: { value: 1.1 }, darkness: { value: 1.2 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float offset; uniform float darkness; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(offset);
      float v = 1.0 - dot(uv, uv) * darkness;        // radial falloff
      gl_FragColor = vec4(c.rgb * clamp(v, 0.0, 1.0), c.a);
    }`,
};
// (three ships an equivalent: import { VignetteShader } from 'three/addons/shaders/VignetteShader.js')

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, opts = { pixelate: 0 }) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);

  if (opts.pixelate > 0) composer.addPass(new RenderPixelatedPass(opts.pixelate, scene, camera, { normalEdgeStrength: 0.3, depthEdgeStrength: 0.4 }));
  else composer.addPass(new RenderPass(scene, camera));

  const outline = new OutlinePass(size, scene, camera);
  outline.edgeStrength = 4; outline.edgeThickness = 1; outline.edgeGlow = 0; outline.pulsePeriod = 0;
  outline.visibleEdgeColor.set(0xffe066); outline.hiddenEdgeColor.set(0x5a4a00);
  composer.addPass(outline);

  const bloom = new UnrealBloomPass(size, 0.6, 0.4, 0.9); // strength, radius, threshold (tune threshold so only torches/glow bloom)
  composer.addPass(bloom);

  composer.addPass(new ShaderPass(VignetteShader));
  composer.addPass(new OutputPass());   // tone mapping + sRGB
  composer.addPass(new SMAAPass());     // r186: no constructor args; resizes with composer
  return { composer, outline, bloom, resize(w: number, h: number) { composer.setSize(w, h); } };
}
// selection: outline.selectedObjects = [actor.root];
```

Bloom at 1.5× DPR on a laptop is the most expensive pass here; give it a quality toggle. `RenderPixelatedPass` renders at `1/pixelSize` resolution with optional normal/depth edge lines — a real retro look, but it fights with `OutlinePass`/SMAA, so use it instead of them if you go that way. For dithering, write a ShaderPass that quantises to N levels with an ordered Bayer threshold; keep it after OutputPass so you quantise display values.

If you later move to WebGPURenderer: none of the above passes work; the equivalents are TSL nodes (`pass`, `bloom`, `fxaa`, `smaa` from `three/tsl` and `three/addons/tsl/display/*`) composed through `RenderPipeline` (named `PostProcessing` in r17x builds; both symbols are in the r186 webgpu build).

---

## 6. Fog of war

Three cell states: `unseen` (black), `remembered` (desaturated/dark), `visible` (lit). Approaches:

1. **`instanceColor` per tile** — tint each floor/wall instance by state. Cheap, but props and characters need their own handling, and it tints per *tile* so wall tops don't darken consistently with their floor.
2. **Overlay plane with a visibility DataTexture** — a translucent black quad over the whole map, alpha from a texture. Simple, but it draws *over* walls/characters at the same screen position (it's a flat quad), which looks wrong for tall geometry in iso.
3. **Sample a visibility texture inside the world materials** (`onBeforeCompile` on the shared dungeon material + prop materials), by world XZ. Every lit surface darkens correctly in 3D, one texture update per turn, no extra draws.

Recommendation: **(3)**, plus simply toggling `visible` on actors not in a visible cell. (Not available on WebGPURenderer — there you'd do the same with a TSL `colorNode`; another reason to stay on WebGL for now.)

```ts
// src/world/fogOfWar.ts
import * as THREE from 'three';
import { TILE } from '../engine/pick';

export const enum Vis { Unseen = 0, Remembered = 1, Visible = 2 }

export class FogOfWar {
  readonly tex: THREE.DataTexture;
  readonly data: Uint8Array;
  private readonly uniforms = { uVis: { value: null as THREE.Texture | null }, uVisSize: { value: new THREE.Vector2() }, uRemembered: { value: 0.25 } };

  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8Array(w * h);
    this.tex = new THREE.DataTexture(this.data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter; // Linear = soft edges between cells, Nearest = hard
    this.tex.needsUpdate = true;
    this.uniforms.uVis.value = this.tex;
    this.uniforms.uVisSize.value.set(w, h);
  }

  set(x: number, z: number, v: Vis) { this.data[z * this.w + x] = v * 127; }
  commit() { this.tex.needsUpdate = true; }

  /** Patch any MeshStandardMaterial so its output is multiplied by visibility at the fragment's world XZ. */
  patch(mat: THREE.MeshStandardMaterial) {
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWorldPos; uniform sampler2D uVis; uniform vec2 uVisSize; uniform float uRemembered;`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          vec2 cell = (vWorldPos.xz / ${TILE.toFixed(1)}) + 0.5;        // cell coords, centre of cell 0 is world 0
          float v = texture2D(uVis, cell / uVisSize).r * 2.0;           // 0, ~1, ~2
          float lit = v < 0.5 ? 0.0 : (v < 1.5 ? uRemembered : 1.0);
          float grey = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          gl_FragColor.rgb = mix(vec3(grey) * lit, gl_FragColor.rgb * lit, step(1.5, v)); // remembered = grey+dim`);
    };
    mat.customProgramCacheKey = () => 'fow';   // so all patched materials share a program
    mat.needsUpdate = true;
  }
}
```

`uRemembered` and the threshold logic are branches on a uniform — trivially cheap. `InstancedMesh` works unchanged because `modelMatrix` already includes the instance transform in three.js's `worldpos_vertex` chunk (`transformed` is post-instancing).

**Line of sight.** Bresenham for "can A see B" and recursive shadowcasting for whole-FOV, both on the cell grid:

```ts
// src/sim/los.ts
export type Opaque = (x: number, y: number) => boolean;

/** Bresenham LOS: true if no opaque cell strictly between (x0,y0) and (x1,y1). Target cell may be opaque (walls are visible). */
export function hasLOS(x0: number, y0: number, x1: number, y1: number, opaque: Opaque): boolean {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    if (x === x1 && y === y1) return true;
    if ((x !== x0 || y !== y0) && opaque(x, y)) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** Recursive shadowcasting (Björn Bergström). Calls reveal(x,y) for every visible cell within radius. */
export function computeFOV(ox: number, oy: number, radius: number, opaque: Opaque, reveal: (x: number, y: number) => void) {
  reveal(ox, oy);
  const mult = [[1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1], [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1]] as const;
  for (const [xx, xy, yx, yy] of mult) cast(1, 1.0, 0.0, xx, xy, yx, yy);

  function cast(row: number, start: number, end: number, xx: number, xy: number, yx: number, yy: number) {
    if (start < end) return;
    const r2 = radius * radius;
    for (let j = row; j <= radius; j++) {
      let dx = -j - 1, dy = -j, blocked = false, newStart = start;
      while (dx <= 0) {
        dx++;
        const X = ox + dx * xx + dy * xy, Y = oy + dx * yx + dy * yy;
        const lSlope = (dx - 0.5) / (dy + 0.5), rSlope = (dx + 0.5) / (dy - 0.5);
        if (start < rSlope) continue; else if (end > lSlope) break;
        if (dx * dx + dy * dy < r2) reveal(X, Y);
        if (blocked) {
          if (opaque(X, Y)) { newStart = rSlope; continue; } else { blocked = false; start = newStart; }
        } else if (opaque(X, Y) && j < radius) { blocked = true; cast(j + 1, start, lSlope, xx, xy, yx, yy); newStart = rSlope; }
      }
      if (blocked) break;
    }
  }
}
```

Per turn: mark all `Visible` cells `Remembered`, run `computeFOV` for each party member, mark `Visible`, `commit()`. Actors: `actor.root.visible = vis[cell] === Vis.Visible`.

---

## 7. Picking and highlighting cells

Picking is §2's analytic plane hit — do not raycast the whole scene for cell selection (skinned meshes are expensive to raycast). Raycast actors only if you need "clicked on this enemy" semantics the cell lookup can't give you; when you do, raycast against invisible per-actor capsule/cylinder proxies, not the skinned mesh.

**Highlight cells with an InstancedMesh of quads.** One geometry, one material, per-instance colour; set `count` to the number of cells to show. Render after the floor, don't write depth, and lift it above the floor top (y = 0.05 for KayKit floors) to avoid z-fighting.

```ts
// src/world/highlights.ts
import * as THREE from 'three';
import { TILE } from '../engine/pick';

export class CellHighlights {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  constructor(capacity = 512) {
    const geo = new THREE.PlaneGeometry(TILE * 0.92, TILE * 0.92).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.renderOrder = 10;            // after opaque floor
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }
  /** cells: [{x,z,color}] — call once per selection change, not per frame */
  set(cells: { x: number; z: number; color: THREE.Color }[]) {
    cells.forEach((c, i) => {
      this.m.makeTranslation(c.x * TILE, 0.07, c.z * TILE);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, c.color);
    });
    this.mesh.count = cells.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
```

Use two instances: one for movement range (blue), one for attack range (red) — or one with mixed colours. A ground-overlay-shader alternative (a texture of cell states sampled on one big quad) is better for very large ranges or animated edges, but the InstancedMesh is simpler and plenty for ranges of ≤ 200 cells.

**Path preview with Line2** (constant pixel width; needs `resolution` set on resize):

```ts
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export class PathLine {
  readonly line: Line2;
  readonly material = new LineMaterial({ color: 0xffe066, linewidth: 4 /* px when worldUnits=false */, worldUnits: false, transparent: true, opacity: 0.9, depthTest: false });
  constructor() { this.line = new Line2(new LineGeometry(), this.material); this.line.renderOrder = 20; this.line.visible = false; }
  resize(w: number, h: number) { this.material.resolution.set(w, h); }
  set(cells: { x: number; z: number }[]) {
    if (cells.length < 2) { this.line.visible = false; return; }
    const pts = cells.flatMap(c => [c.x * TILE, 0.12, c.z * TILE]);
    this.line.geometry.dispose();
    this.line.geometry = new LineGeometry().setPositions(pts);
    this.line.computeLineDistances();
    this.line.visible = true;
  }
}
```

A quad strip with an arrow texture (built from `PlaneGeometry` segments between cell centres) looks more "game" than a line and is just as cheap; Line2 is the fastest to get working.

---

## 8. UI / HUD

Use a **plain HTML/CSS overlay**: a `<div id="hud">` absolutely positioned over the canvas with `pointer-events: none` and `pointer-events: auto` on buttons. You get text rendering, fonts, flex layout, accessibility and DevTools for free; in-canvas UI gives none of that and the overlay costs nothing. CSS2DRenderer (`three/addons/renderers/CSS2DRenderer.js`) does the projection bookkeeping for you (one `CSS2DObject` per label, it moves DOM nodes each frame); it's fine for ≤ ~50 labels. For health bars and damage numbers, project yourself — it's three lines and lets you batch:

```ts
// src/ui/project.ts
import * as THREE from 'three';
const v = new THREE.Vector3();
/** world → CSS pixel coords relative to the canvas; returns false if behind camera (can't happen for ortho) */
export function worldToScreen(p: THREE.Vector3, camera: THREE.Camera, canvas: HTMLCanvasElement, out: { x: number; y: number }) {
  v.copy(p).project(camera);                         // NDC
  const r = canvas.getBoundingClientRect();
  out.x = (v.x + 1) * 0.5 * r.width;
  out.y = (1 - v.y) * 0.5 * r.height;
  return v.z < 1;
}

// floating damage number
export function spawnDamageNumber(hud: HTMLElement, text: string, x: number, y: number, crit = false) {
  const el = document.createElement('div');
  el.className = 'dmg' + (crit ? ' crit' : '');
  el.textContent = text;
  el.style.transform = `translate(${x}px, ${y}px)`;
  hud.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}
```

```css
#hud { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
.dmg { position:absolute; left:0; top:0; font: 700 20px/1 system-ui; color:#fff; text-shadow:0 2px 0 #000; animation: rise .9s ease-out forwards; }
.dmg.crit { color:#ffd166; font-size:28px; }
@keyframes rise { from { opacity:1; margin-top:0 } to { opacity:0; margin-top:-48px } }
```

Health bars: keep a `Map<ActorId, HTMLElement>`; each frame compute `worldToScreen(actor.root.position + (0, 2.6, 0))` and set `transform`. Transform-only updates don't trigger layout. Hide bars for actors in non-visible cells.

---

## 9. Game loop, simulation vs presentation

Turn-based logic doesn't need a fixed timestep: the simulation is a pure function of (state, action, rng) that runs instantly and emits **events**. The presentation layer consumes events through a sequencer with real-time tweens. Keep `sim/` free of three.js imports so it can be unit-tested in Node and replayed from a seed.

```ts
// src/engine/loop.ts
import * as THREE from 'three';
export function startLoop(renderer: THREE.WebGLRenderer, frame: (dt: number, t: number) => void) {
  const timer = new THREE.Timer();   // Clock is deprecated (r183)
  timer.connect(document);           // pauses delta accumulation while tab hidden
  renderer.setAnimationLoop(ts => {  // works for WebXR too; stop with setAnimationLoop(null)
    timer.update(ts);
    frame(Math.min(timer.getDelta(), 0.1), timer.getElapsed()); // clamp dt after tab switch
  });
}
```

**Seedable RNG** (sfc32 has better statistical quality than mulberry32 and is still tiny; use mulberry32 for the seed-mixing):

```ts
// src/sim/rng.ts
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export class Rng {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: number) { const m = mulberry32(seed); this.a = m() * 2 ** 32; this.b = m() * 2 ** 32; this.c = m() * 2 ** 32; this.d = m() * 2 ** 32; for (let i = 0; i < 12; i++) this.next(); }
  /** sfc32: uniform [0,1) */
  next() {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0; this.a = this.b ^ (this.b >>> 9); this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11); this.d = (this.d + 1) | 0; t = (t + this.d) | 0; this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  int(min: number, maxInclusive: number) { return min + Math.floor(this.next() * (maxInclusive - min + 1)); }
  roll(n: number, sides: number) { let s = 0; for (let i = 0; i < n; i++) s += this.int(1, sides); return s; }
  pick<T>(arr: readonly T[]) { return arr[Math.floor(this.next() * arr.length)]!; }
  shuffle<T>(arr: T[]) { for (let i = arr.length - 1; i > 0; i--) { const j = this.int(0, i); [arr[i], arr[j]] = [arr[j]!, arr[i]!]; } return arr; }
}
```

Use separate `Rng` streams for level generation and combat so a replayed combat isn't perturbed by UI-driven generation order.

**Events and a sequencer.** The sim returns `CombatEvent[]`; the view plays them in order with awaits:

```ts
// src/sim/events.ts
export type CombatEvent =
  | { type: 'move'; id: string; path: { x: number; z: number }[] }
  | { type: 'attack'; attacker: string; target: string; clip: string }
  | { type: 'damage'; id: string; amount: number; crit: boolean; hpAfter: number }
  | { type: 'miss'; id: string }
  | { type: 'death'; id: string };

// src/view/sequencer.ts
export class Sequencer {
  private queue: (() => Promise<void>)[] = [];
  private running = false;
  push(step: () => Promise<void>) { this.queue.push(step); this.pump(); }
  get busy() { return this.running || this.queue.length > 0; }
  private async pump() {
    if (this.running) return; this.running = true;
    while (this.queue.length) await this.queue.shift()!();
    this.running = false;
  }
}

// tween helper (no library needed)
export const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export function tween(duration: number, onUpdate: (t: number) => void, ease = (t: number) => t * t * (3 - 2 * t)) {
  return new Promise<void>(resolve => {
    const t0 = performance.now();
    const step = (now: number) => { const t = Math.min(1, (now - t0) / duration); onUpdate(ease(t)); t < 1 ? requestAnimationFrame(step) : resolve(); };
    requestAnimationFrame(step);
  });
}

// playing events
async function playEvents(events: CombatEvent[], view: GameView) {
  for (const e of events) switch (e.type) {
    case 'move': {
      const a = view.actor(e.id); a.play('Walking_A');
      for (let i = 1; i < e.path.length; i++) {
        const from = a.root.position.clone(), to = cellToWorld(e.path[i]!.x, e.path[i]!.z).setY(0.05);
        a.root.lookAt(to.x, a.root.position.y, to.z);
        await tween(220, t => a.root.position.lerpVectors(from, to, t), t => t);
      }
      a.play('Idle'); break;
    }
    case 'attack': {
      const a = view.actor(e.attacker), t = view.actor(e.target);
      a.root.lookAt(t.root.position.x, a.root.position.y, t.root.position.z);
      await attackWithImpact(a, e.clip, () => view.flashHit(t)); break;   // impact triggers the next 'damage' visuals
    }
    case 'damage': { const t = view.actor(e.id); view.damageNumber(t, e.amount, e.crit); view.setHp(e.id, e.hpAfter); t.playOnce('Hit_A'); await wait(250); break; }
    case 'death': { await view.actor(e.id).playOnce('Death_A', { holdPose: true }); break; }
  }
}
```

Block input while `sequencer.busy`. Let players skip: a "fast" flag that sets `mixer.timeScale = 2` and halves tween durations.

**A\*** with 8-directional movement and corner-cutting rules. For a tactics game, forbid diagonal moves that squeeze between two orthogonally adjacent blockers (and usually forbid them if *either* orthogonal neighbour is a wall, which reads as "can't cut corners"):

```ts
// src/sim/astar.ts
export interface GridLike { w: number; h: number; passable(x: number, y: number): boolean; }
const DIRS8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const;
const DIRS4 = DIRS8.slice(0, 4);

export function astar(g: GridLike, sx: number, sy: number, tx: number, ty: number, opts = { diagonal: true, cutCorners: false }) {
  const idx = (x: number, y: number) => y * g.w + x;
  const gScore = new Float64Array(g.w * g.h).fill(Infinity);
  const came = new Int32Array(g.w * g.h).fill(-1);
  const closed = new Uint8Array(g.w * g.h);
  const h = (x: number, y: number) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return opts.diagonal ? Math.max(dx, dy) + 0.4142 * Math.min(dx, dy) : dx + dy; };
  // binary heap of [f, index]
  const heap: number[][] = []; const push = (n: number[]) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p]![0] <= heap[i]![0]) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; } };
  const pop = () => { const top = heap[0]!; const last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { let m = i; const l = 2*i+1, r = l+1; if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l; if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i]!, heap[m]!]; i = m; } } return top; };

  const s = idx(sx, sy); gScore[s] = 0; push([h(sx, sy), s]);
  const dirs = opts.diagonal ? DIRS8 : DIRS4;
  while (heap.length) {
    const [, cur] = pop() as [number, number];
    if (closed[cur]) continue; closed[cur] = 1;
    const cx = cur % g.w, cy = (cur - cx) / g.w;
    if (cx === tx && cy === ty) { const path: { x: number; y: number }[] = []; for (let n = cur; n !== -1; n = came[n]!) path.push({ x: n % g.w, y: Math.floor(n / g.w) }); return path.reverse(); }
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || !g.passable(nx, ny)) continue;
      if (dx && dy && !opts.cutCorners && (!g.passable(cx + dx, cy) || !g.passable(cx, cy + dy))) continue; // no corner cutting
      const n = idx(nx, ny), cost = gScore[cur]! + (dx && dy ? 1.4142 : 1);
      if (cost < gScore[n]!) { gScore[n] = cost; came[n] = cur; push([cost + h(nx, ny), n]); }
    }
  }
  return null;
}
```

For movement *range* display, run Dijkstra (same code, no target, stop when `cost > movePoints`) and collect reached cells. Occupied cells count as impassable for pathing but allies are usually passable for range display — pass a different `passable`.

---

## 10. Procedural dungeon and autotiling

**Generator.** Rooms-and-corridors is the right fit for a tactical game (rooms = encounter arenas, corridors = chokepoints) and maps cleanly onto a wall kit. BSP gives more regular rooms; cellular automata produces caves that modular wall kits render badly (too many odd junctions). Cell model: each cell is `Floor`, `Wall`, or `Void` (rock). Walls occupy whole cells (that's how KayKit's centred 4×4 pieces are meant to be used).

```ts
// src/sim/dungeon.ts
import { Rng } from './rng';
export const enum Cell { Void = 0, Floor = 1, Wall = 2, Door = 3 }
export interface Room { x: number; y: number; w: number; h: number }

export function generate(w: number, h: number, rng: Rng, opts = { rooms: 10, minSize: 3, maxSize: 7 }) {
  const cells = new Uint8Array(w * h).fill(Cell.Void);
  const at = (x: number, y: number) => cells[y * w + x]!;
  const set = (x: number, y: number, c: Cell) => { if (x >= 0 && y >= 0 && x < w && y < h) cells[y * w + x] = c; };
  const rooms: Room[] = [];
  for (let tries = 0; tries < opts.rooms * 20 && rooms.length < opts.rooms; tries++) {
    const rw = rng.int(opts.minSize, opts.maxSize), rh = rng.int(opts.minSize, opts.maxSize);
    const r: Room = { x: rng.int(1, w - rw - 2), y: rng.int(1, h - rh - 2), w: rw, h: rh };
    if (rooms.some(o => r.x < o.x + o.w + 2 && r.x + r.w + 2 > o.x && r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y)) continue;
    rooms.push(r);
    for (let y = r.y; y < r.y + rh; y++) for (let x = r.x; x < r.x + rw; x++) set(x, y, Cell.Floor);
  }
  // L-shaped corridors between consecutive rooms (sorted by x for fewer crossings)
  rooms.sort((a, b) => a.x - b.x);
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1]!, b = rooms[i]!;
    let x = a.x + (a.w >> 1), y = a.y + (a.h >> 1); const tx = b.x + (b.w >> 1), ty = b.y + (b.h >> 1);
    const horizontalFirst = rng.next() < 0.5;
    const carve = () => { if (at(x, y) === Cell.Void) set(x, y, Cell.Floor); };
    if (horizontalFirst) { while (x !== tx) { carve(); x += Math.sign(tx - x); } while (y !== ty) { carve(); y += Math.sign(ty - y); } }
    else { while (y !== ty) { carve(); y += Math.sign(ty - y); } while (x !== tx) { carve(); x += Math.sign(tx - x); } }
    carve();
  }
  // walls: every Void cell 8-adjacent to a Floor becomes Wall
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (at(x, y) !== Cell.Void) continue;
    outer: for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && at(nx, ny) === Cell.Floor) { set(x, y, Cell.Wall); break outer; }
    }
  }
  // doors: a wall-adjacent corridor floor cell with floor on exactly two opposite sides and walls on the other two
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (at(x, y) !== Cell.Floor) continue;
    const n = at(x, y - 1), s = at(x, y + 1), e = at(x + 1, y), wv = at(x - 1, y);
    const inRoom = rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (!inRoom && ((n === Cell.Wall && s === Cell.Wall && e === Cell.Floor && wv === Cell.Floor) || (e === Cell.Wall && wv === Cell.Wall && n === Cell.Floor && s === Cell.Floor)))
      if (rng.next() < 0.3) set(x, y, Cell.Door);
  }
  return { w, h, cells, rooms };
}
```

**Autotiling by neighbour bitmask.** A wall cell's piece and rotation are determined by which of its 4 orthogonal neighbours are also walls (or doors). Grid axes: `x` → world +X, `y` (grid) → world +Z. Bits: N(−Z)=1, E(+X)=2, S(+Z)=4, W(−X)=8. From the verified KayKit bounds, each piece's *unrotated* connections are:

| piece | connects |
|---|---|
| `wall` | W, E |
| `wall_corner` | W, S |
| `wall_Tsplit` | W, E, S |
| `wall_crossing` | N, E, S, W |
| `wall_endcap` | E (stub toward +X; the other end is capped) |
| `wall_pillar` / `pillar` | none |
| `wall_doorway` | W, E (door cells) |

Rotating a piece by +90° about Y maps directions E→N, N→W, W→S, S→E (from x' = z, z' = −x). Rather than hand-write 16 cases, derive the table:

```ts
// src/world/autotile.ts
export const N = 1, E = 2, S = 4, W = 8;
const BASE: Record<string, number> = {
  wall: W | E, wall_corner: W | S, wall_Tsplit: W | E | S, wall_crossing: N | E | S | W, wall_endcap: E, wall_pillar: 0,
};
const rot90 = (m: number) => ((m & E) ? N : 0) | ((m & N) ? W : 0) | ((m & W) ? S : 0) | ((m & S) ? E : 0);

export interface Placement { piece: string; rotY: number }
export const WALL_TABLE: Placement[] = new Array(16);
for (const [piece, base] of Object.entries(BASE)) {
  let m = base;
  for (let k = 0; k < 4; k++) { if (WALL_TABLE[m] === undefined) WALL_TABLE[m] = { piece, rotY: k * Math.PI / 2 }; m = rot90(m); }
}
// sanity: every mask 0..15 is covered (0=pillar, 1-bit=endcap, opposite=wall, adjacent=corner, 3=Tsplit, 15=crossing)

export function wallMask(isWall: (x: number, y: number) => boolean, x: number, y: number) {
  return (isWall(x, y - 1) ? N : 0) | (isWall(x + 1, y) ? E : 0) | (isWall(x, y + 1) ? S : 0) | (isWall(x - 1, y) ? W : 0);
}
export function placeWall(isWall: (x: number, y: number) => boolean, x: number, y: number): Placement {
  return WALL_TABLE[wallMask(isWall, x, y)]!;
}
// Door cells: mask will be W|E or N|S (walls on two opposite sides) → use 'wall_doorway' with the 'wall' rotation.
export function placeDoor(isWall: (x: number, y: number) => boolean, x: number, y: number): Placement {
  const m = wallMask(isWall, x, y);
  return { piece: 'wall_doorway', rotY: (m & (N | S)) ? Math.PI / 2 : 0 };
}
```

Then: `isWall = (x,y) => cell(x,y) === Cell.Wall || cell(x,y) === Cell.Door`, and for each wall cell `batches[p.piece].add(x, y, p.rotY)`. Variants (`wall_cracked`, `wall_broken`, `wall_shelves`, `wall_window_*`) all share the straight `wall` footprint, so swap them in with `rng` for mask W|E / N|S. Walls that face *only* Void on one side can use `wall_half`-style thin pieces, but since the iso camera sees over them that's mostly irrelevant. Floor: `floor_tile_large` at every Floor/Door cell, rotated by `rng.int(0,3) * π/2` for variety; sprinkle `floor_tile_large_rocks`, `floor_dirt_large`. Since the camera looks down from +Y at yaw 45°, the walls on the camera-facing (south/east in screen terms) edges of a room will occlude the floor; common fixes are hiding/fading those wall instances (set instance matrix to zero scale or tint via `instanceColor` and a transparent material) when they're between the camera and the active unit, or using the `wall_half` pieces on the two camera-facing sides.

---

## 11. Audio

three.js's `AudioListener`/`Audio`/`PositionalAudio` wrap Web Audio and handle decoding, gain, and panner nodes. Use them; no library needed. Two iso-specific caveats:

1. **Don't attach the `AudioListener` to the ortho camera** — it sits 120 units away and up, so every `PositionalAudio` is equally far and quiet. Attach the listener to an `Object3D` that you keep at `iso.target` (ground level, oriented like the camera) so left/right panning and distance follow what the player is looking at.
2. Browsers require a user gesture before audio can play. Resume the shared context on first `pointerdown`/`keydown`.

```ts
// src/engine/audio.ts
import * as THREE from 'three';
export class GameAudio {
  readonly listener = new THREE.AudioListener();
  readonly listenerRig = new THREE.Object3D();
  private loader = new THREE.AudioLoader();
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private music?: THREE.Audio;

  constructor(scene: THREE.Scene) {
    this.listenerRig.add(this.listener); scene.add(this.listenerRig);
    const unlock = () => { THREE.AudioContext.getContext().resume(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  }
  /** keep listener on the ground at the camera target, facing the camera's yaw */
  update(target: THREE.Vector3, yaw: number) { this.listenerRig.position.copy(target); this.listenerRig.rotation.set(0, yaw, 0); }

  load(url: string) { let p = this.buffers.get(url); if (!p) { p = this.loader.loadAsync(url); this.buffers.set(url, p); } return p; }

  async playAt(url: string, parent: THREE.Object3D, volume = 1) {
    const buf = await this.load(url);
    const s = new THREE.PositionalAudio(this.listener);
    s.setBuffer(buf).setRefDistance(6).setMaxDistance(60).setDistanceModel('linear').setVolume(volume);
    parent.add(s); s.play();
    s.source!.onended = () => { parent.remove(s); s.disconnect(); };
  }

  async playUI(url: string, volume = 1) { const s = new THREE.Audio(this.listener); s.setBuffer(await this.load(url)).setVolume(volume).play(); }

  /** crossfade music over `ms` */
  async playMusic(url: string, ms = 1500, volume = 0.6) {
    const next = new THREE.Audio(this.listener); next.setBuffer(await this.load(url)).setLoop(true).setVolume(0).play();
    const prev = this.music; this.music = next;
    const ctx = THREE.AudioContext.getContext(), t = ctx.currentTime;
    next.gain.gain.linearRampToValueAtTime(volume, t + ms / 1000);        // .gain is the GainNode
    if (prev) { prev.gain.gain.setValueAtTime(prev.getVolume(), t); prev.gain.gain.linearRampToValueAtTime(0, t + ms / 1000); setTimeout(() => { prev.stop(); prev.disconnect(); }, ms + 50); }
  }
}
```

Use `.ogg` (Vorbis) for everything; Safari now decodes it, and `.m4a` as a fallback only if you must. Keep one-shots short and pre-decoded (the `buffers` cache). For a turn-based game, play attack/hit sounds from the sequencer at the same impact callback that spawns the damage number.

---

## 12. Performance budget and gotchas

**Targets** (60 fps on a 2020 integrated-GPU laptop at 1.5× DPR): ≤ 150 draw calls, ≤ 300k triangles, ≤ 6 point lights, 1 shadow-casting directional light at 2048², bloom + SMAA. Watch `renderer.info.render.calls/triangles` in a debug overlay.

- **Draw calls**: one `InstancedMesh` per dungeon piece variant (~20), one per prop type, one per actor *mesh* (a KayKit character is 6 skinned meshes + visible attachments → 7–10 draws each; 12 actors ≈ 100 draws). If that bites, merge the 6 body meshes per character at load time (they share one material and one skeleton: `mergeGeometries` on the skinned geometries keeps `skinIndex/skinWeight`, then one `SkinnedMesh` bound to the same skeleton).
- **Textures and materials**: one `dungeon_texture` material for the whole kit (§3). Characters each have their own atlas — fine, that's 5–10 textures. Set `anisotropy` low (1–4); the camera never sees grazing angles.
- **Shader permutations**: each distinct (material type × light count × shadow × fog × instancing × vertex colours) compiles a program. Keep light count fixed (pool), avoid toggling `fog` or `castShadow` at runtime; warm up by rendering one frame with everything present before the game starts (`renderer.compile(scene, camera)`).
- **Allocation**: never `new Vector3()` in per-frame code; preallocate scratch objects at module scope (as done above). Avoid `scene.traverse` per frame; cache arrays. `Raycaster` only on click.
- **Skinned mesh culling**: skinned meshes' bounding spheres don't follow animation; a character lunging can vanish at the screen edge. Either `frustumCulled = false` on actors (cheap at these counts) or `computeBoundingSphere` after setting a generous radius.
- **Disposal**: when leaving a level: `geometry.dispose()`, `material.dispose()`, `texture.dispose()`, `mixer.stopAllAction()`, `mixer.uncacheRoot(root)`, composer render targets `composer.dispose()`. Shared `dungeonMat` is not disposed per level. Check `renderer.info.memory.geometries/textures` doesn't climb.
- **devicePixelRatio**: cap at 1.5 (or 1.0 when bloom is on and the GPU is weak). Resize handler: `renderer.setSize(w, h, false)`; `composer.setSize(w, h)`; `lineMaterial.resolution.set(w, h)`; `iso.resize(w, h)`.
- **Orthographic shadow acne**: fix order: `normalBias` 0.02–0.06 → tighter shadow camera bounds → bigger map. A large negative `bias` creates peter-panning (shadow detached from feet) which is very visible at iso.
- **Z-fighting of overlays on floors**: floor top is y = 0.05; put selection quads at y ≈ 0.07, path lines at 0.12, decals 0.06, and also set `depthWrite: false` + `polygonOffset` + `renderOrder` so sorting is deterministic. Translucent overlays must not write depth or they'll punch holes in later translucent objects.
- **Transparent sorting**: three.js sorts transparent objects back-to-front by object centre only; an `InstancedMesh` sorts as one object. Keep transparency to flat overlays and particles; don't make walls partially transparent — use `alphaTest`-free opaque tinting via `instanceColor`, or if you must fade walls, render them in a separate pass/`renderOrder` with `depthWrite: true`.
- **Instance colours and sRGB**: `setColorAt` takes linear colours; a `Color` created from a hex is converted automatically, but `new Color(r,g,b)` with raw 0–1 values is linear — use `.setRGB(r,g,b, THREE.SRGBColorSpace)` for values you eyeballed in a colour picker.
- **Camera far plane**: an ortho camera's `near/far` are distances along the view axis; with `distance = 120`, `near = 1`, `far = 400` is plenty and keeps depth precision (24-bit depth over 400 units is fine).
- **Tab switching**: `Timer.connect(document)` already freezes elapsed time while hidden; still clamp `dt` to ~0.1 s so the mixer doesn't leap.
- **GLTF texture colour space**: `GLTFLoader` sets `map.colorSpace = SRGBColorSpace` on base colour maps; if you build a `DataTexture` or `CanvasTexture` for a decal, set it yourself.
- **Pixelation + outline**: `RenderPixelatedPass` downsamples the scene render; `OutlinePass` after it runs at full res and looks off. Pick one aesthetic.

---

### Appendix: minimal `main.ts` wiring

```ts
import * as THREE from 'three';
import { createRenderer } from './engine/renderer';
import { IsoCamera } from './engine/isoCamera';
import { startLoop } from './engine/loop';
import { createPost } from './engine/post';
import { makeSun, TorchPool } from './engine/lighting';
import { loadGLTF } from './engine/assets';
import { Actor } from './view/actor';

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const renderer = createRenderer(canvas);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07070c);
scene.add(new THREE.HemisphereLight(0x3a4a6a, 0x101014, 0.25));
const sun = makeSun(scene);
const torches = new TorchPool(scene, 6);
const iso = new IsoCamera();
const post = createPost(renderer, scene, iso.camera);

function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); post.resize(w, h); iso.resize(w, h); }
new ResizeObserver(resize).observe(canvas); resize();

const knight = new Actor(await loadGLTF('/models/characters/Knight.glb'));
knight.configureAttachments(['1H_Sword', 'Round_Shield', 'Knight_Helmet']);
knight.root.position.set(0, 0.05, 0); knight.play('Idle'); scene.add(knight.root);

startLoop(renderer, (dt, t) => {
  iso.update();
  sun.target.position.copy(iso.target); sun.position.copy(iso.target).add(new THREE.Vector3(30, 60, 20)); // (preallocate in real code)
  torches.update([], t);
  knight.update(dt);
  post.composer.render();
});
```

Sources checked: `three@0.186.1` package contents (`package.json` exports, `build/three.core.js`, `examples/jsm/*`), `@types/three@0.186.0`, three.js manual pages `installation`, `webgpurenderer`, `webgpu-postprocessing` (mrdoob/three.js `dev` branch), three.js release notes r183–r186, KayKit GitHub repos `KayKit-Dungeon-Remastered-1.0` and `KayKit-Character-Pack-Adventures-1.0` / `-Skeletons-1.0` (GLB JSON chunks parsed directly for bounds, node names, skins, clips and durations).
