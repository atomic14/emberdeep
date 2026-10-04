import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TILE } from './assets';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.55 }, tint: { value: new THREE.Color(0x000000) }, warmth: { value: 0.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform vec3 tint; uniform float warmth; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = smoothstep(0.35, 0.95, length(d) * 1.35);
      vec3 col = mix(c.rgb, tint, v * strength);
      // gentle warm grade toward the deep
      col = mix(col, col * vec3(1.06, 0.98, 0.9), warmth);
      gl_FragColor = vec4(col, c.a); }`,
};

export const ZOOMS = [11, 15, 21]; // half-height of view in world units

/** Renderer, isometric orthographic camera, lights and post-processing. */
export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  vignette: ShaderPass;
  target = new THREE.Vector3(0, 0, 0);
  private desired = new THREE.Vector3(0, 0, 0);
  zoomIndex = 1;
  private zoomHalf = ZOOMS[1];
  yaw = Math.PI / 4;
  pitch = THREE.MathUtils.degToRad(42);
  dist = 120;
  key: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  lantern: THREE.PointLight;
  follow = true;
  shake = 0;
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ray = new THREE.Raycaster();

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(0x07060a);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
    this.hemi = new THREE.HemisphereLight(0x5a6a8a, 0x1a0f0a, 0.9); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xaab8d8, 1.6);
    this.key.castShadow = true; this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 1; this.key.shadow.camera.far = 300; this.key.shadow.normalBias = 0.04; this.key.shadow.bias = -0.0005;
    const sc = this.key.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    this.scene.add(this.key); this.scene.add(this.key.target);
    this.lantern = new THREE.PointLight(0xffc070, 90, 34, 2); this.lantern.position.set(0, 4, 0); this.scene.add(this.lantern);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.5, 0.82); this.composer.addPass(this.bloom);
    this.vignette = new ShaderPass(VignetteShader); this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
    const aspect = w / h; const hh = this.zoomHalf;
    this.camera.left = -hh * aspect; this.camera.right = hh * aspect; this.camera.top = hh; this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
  }
  setZoom(i: number) { this.zoomIndex = Math.max(0, Math.min(ZOOMS.length - 1, i)); this.zoomHalf = ZOOMS[this.zoomIndex]; this.resize(); }
  zoomBy(delta: number) { this.setZoom(this.zoomIndex + delta); }

  /** Grid cell -> world centre. */
  static gridToWorld(x: number, y: number, h = 0) { return new THREE.Vector3(x * TILE, h, y * TILE); }
  static worldToGrid(v: THREE.Vector3) { return { x: Math.round(v.x / TILE), y: Math.round(v.z / TILE) }; }

  /** Pan so that the given world point is centred (eased). */
  lookAtWorld(v: THREE.Vector3, immediate = false) { this.desired.set(v.x, 0, v.z); if (immediate) this.target.copy(this.desired); }
  lookAtGrid(x: number, y: number, immediate = false) { this.lookAtWorld(View.gridToWorld(x, y), immediate); }
  panBy(dx: number, dz: number) { this.desired.x += dx; this.desired.z += dz; }
  /** Pan in screen space: right = +screenX, up = +screenY (world units). */
  panScreen(sx: number, sy: number) {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.desired.addScaledVector(right, sx).addScaledVector(up, sy);
  }

  screenToGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.groundPlane, out) ? out : null;
  }
  worldToScreen(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, visible: p.z < 1 };
  }

  update(dt: number) {
    // ease camera target
    const k = 1 - Math.pow(0.0015, dt);
    this.target.lerp(this.desired, k);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const shake = this.shake > 0 ? new THREE.Vector3((Math.random() - 0.5) * this.shake, 0, (Math.random() - 0.5) * this.shake) : new THREE.Vector3();
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.camera.position.copy(this.target).add(shake).addScaledVector(dir, this.dist);
    this.camera.lookAt(this.target.clone().add(shake));
    // key light follows target so the shadow frustum stays tight
    this.key.position.copy(this.target).add(new THREE.Vector3(-30, 60, 20));
    this.key.target.position.copy(this.target);
  }

  render() { this.composer.render(); }

  /** Per-hour palette. */
  setMood(hour: number) {
    const moods: Record<number, { bg: number; hemiSky: number; hemiGround: number; key: number; keyI: number; tint: number; warmth: number; lantern: number }> = {
      1: { bg: 0x06080c, hemiSky: 0x3b5577, hemiGround: 0x0e0b0c, key: 0x9fb4d8, keyI: 1.3, tint: 0x000306, warmth: 0.0, lantern: 0xffc070 },
      2: { bg: 0x0a0806, hemiSky: 0x6a5a48, hemiGround: 0x1a0f0a, key: 0xc8b090, keyI: 1.2, tint: 0x050200, warmth: 0.25, lantern: 0xffb860 },
      3: { bg: 0x0d0604, hemiSky: 0x7a4a30, hemiGround: 0x2a0c04, key: 0xd89060, keyI: 1.1, tint: 0x0a0200, warmth: 0.5, lantern: 0xffa850 },
      4: { bg: 0x1a0e06, hemiSky: 0xb08860, hemiGround: 0x4a2410, key: 0xf0c090, keyI: 1.0, tint: 0x1a0a00, warmth: 0.8, lantern: 0xffd9a0 },
      0: { bg: 0x07060a, hemiSky: 0x4a4a60, hemiGround: 0x1a1210, key: 0xb0b8d0, keyI: 1.2, tint: 0x000000, warmth: 0.1, lantern: 0xffc070 },
    };
    const m = moods[hour] ?? moods[0];
    (this.scene.background as THREE.Color).setHex(m.bg);
    this.hemi.color.setHex(m.hemiSky); this.hemi.groundColor.setHex(m.hemiGround);
    this.key.color.setHex(m.key); this.key.intensity = m.keyI;
    (this.vignette.uniforms.tint.value as THREE.Color).setHex(m.tint); this.vignette.uniforms.warmth.value = m.warmth;
    this.lantern.color.setHex(m.lantern);
  }
}
