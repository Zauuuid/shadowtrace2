/**
 * The opening Moon (lazy chunk, loaded after first paint). One canvas, an orthographic camera in screen pixels, a
 * 64×32 sphere with a Lommel–Seeliger shader, and one Points object of stars. Nothing else.
 *
 * Light: the Sun direction comes from NASA JPL Horizons at JOURNEY_DATE (pose.ts). At rest each page shows exactly
 * that geometry; the slow self-rotation turns the surface under a fixed Sun, like a real rotating body.
 * No atmosphere on the Moon, so no rim glow: the terminator is crisp.
 */
import {
  BufferGeometry, Euler, Float32BufferAttribute, LinearMipmapLinearFilter, Mesh, NoColorSpace, OrthographicCamera, Points,
  PointsMaterial, Quaternion, RepeatWrapping, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Texture, TextureLoader,
  Vector3, WebGLRenderer, DataTexture, ImageBitmapLoader,
} from 'three';
import { easeInOut, PAGE_MS, poseFor, SPIN_DEG_S, sunOnScreen, type Pose } from './pose';

const BASE = `${import.meta.env.BASE_URL}data/moon/`;

const VERT = /* glsl */ `
varying vec3 vPos;
varying vec2 vUv;
void main() {
  vPos = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uColor;
uniform sampler2D uNormal;
uniform float uRelief;
uniform vec3 uSun;
uniform vec3 uView;
varying vec3 vPos;
varying vec2 vUv;
void main() {
  vec3 up = normalize(vPos);
  vec3 east = vec3(up.z, 0.0, -up.x);
  east = length(east) > 1e-4 ? normalize(east) : vec3(0.0, 0.0, -1.0);
  vec3 north = cross(up, east);
  vec3 tn = mix(vec3(0.0, 0.0, 1.0), texture2D(uNormal, vUv).xyz * 2.0 - 1.0, uRelief);
  vec3 N = normalize(east * tn.x + north * tn.y + up * tn.z);
  vec3 L = normalize(uSun);
  float mu0 = max(dot(N, L), 0.0);
  float mu = max(dot(N, uView), 0.02);
  float lit = smoothstep(0.0, 0.02, dot(up, L));
  vec3 albedo = texture2D(uColor, vUv).rgb;
  gl_FragColor = vec4(albedo * (2.0 * mu0 / (mu0 + mu)) * lit * 1.1, 1.0);
  #include <colorspace_fragment>
}`;

export interface MoonOptions {
  readonly canvas: HTMLCanvasElement;
  readonly rtl: boolean;
  readonly page: 0 | 1;
  /** Phones and small CPUs: DPR 1, no antialias, no relief map, 2k texture only. */
  readonly low: boolean;
  /** Desktop with ≥ 8 cores: the 4k colour map after idle. */
  readonly hi: boolean;
  readonly onReady: () => void;
  readonly onFail: () => void;
}

export interface MoonHandle {
  setPage(page: 0 | 1): void;
  dispose(): void;
}

function idle(fn: () => void, ms: number): void {
  const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  setTimeout(() => (ric ? ric(fn, { timeout: 2000 }) : fn()), ms);
}

const D = Math.PI / 180;

export function createMoon(o: MoonOptions): MoonHandle {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas: o.canvas, antialias: !o.low, alpha: true, powerPreference: o.low ? 'low-power' : 'default' });
  } catch {
    o.onFail();
    return { setPage() {}, dispose() {} };
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.low ? 1 : 1.5));
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  const flat = track(new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1));
  flat.needsUpdate = true;
  const uniforms = {
    uColor: { value: flat as Texture }, uNormal: { value: flat as Texture }, uRelief: { value: 0 },
    uSun: { value: new Vector3() }, uView: { value: new Vector3() },
  };
  const moon = new Mesh(track(new SphereGeometry(1, 64, 32)), track(new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms })));
  scene.add(moon);

  // Stars: one Points object in a unit square, scaled to the screen.
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pos: number[] = [], col: number[] = [];
  for (let i = 0; i < 900; i++) {
    pos.push(rnd() * 2 - 1, rnd() * 2 - 1, -1500);
    const k = 0.25 + rnd() ** 2 * 0.6;
    col.push(k, k, k * 1.04);
  }
  const starGeo = track(new BufferGeometry());
  starGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new Float32BufferAttribute(col, 3));
  const stars = new Points(starGeo, track(new PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors: true })));
  scene.add(stars);

  // ImageBitmapLoader decodes the WebP off the main thread (no long decode task while the Moon appears).
  const bitmaps = typeof createImageBitmap === 'function' ? new ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' }) : null;
  const loader = new TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const prep = (t: Texture, srgb: boolean) => {
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.wrapS = RepeatWrapping;
    t.anisotropy = aniso;
    t.minFilter = LinearMipmapLinearFilter;
    return track(t);
  };
  const load = (name: string, srgb: boolean) => new Promise<Texture>((res, rej) => {
    const url = `${BASE}${name}`;
    if (!bitmaps) { loader.load(url, (t) => res(prep(t, srgb)), undefined, rej); return; }
    bitmaps.load(url, (bmp) => {
      const t = new Texture(bmp);
      t.flipY = false;
      t.needsUpdate = true;
      disposables.push({ dispose: () => bmp.close() });
      res(prep(t, srgb));
    }, undefined, rej);
  });

  let ready = false;
  let alive = true;
  load('color_2k.webp', true).then((c) => {
    if (!alive) return;
    uniforms.uColor.value = c;
    ready = true;
    o.onReady();
    if (o.low) return;
    idle(() => {
      if (!alive) return;
      load('normal_2k.webp', false).then((n) => { uniforms.uNormal.value = n; reliefT0 = performance.now(); }, () => undefined);
      if (o.hi) load('color_4k.webp', true).then((c4) => { if (alive) uniforms.uColor.value = c4; }, () => undefined);
    }, 1500);
  }, () => o.onFail());
  let reliefT0 = 0;

  // Pose state: page change tween + constant spin.
  let w = 1, h = 1;
  let from: Pose = poseFor(o.page, window.innerWidth, window.innerHeight, o.rtl);
  let to = from;
  let target: 0 | 1 = o.page;
  let t0 = 0;
  const sunFrom = new Vector3(), sunTo = new Vector3();
  const setSun = (v: Vector3, p: Pose) => { const s = sunOnScreen(p); v.set(s[0], s[1], s[2]).normalize(); };
  setSun(sunFrom, from); sunTo.copy(sunFrom);

  const resize = () => {
    const nw = o.canvas.clientWidth || window.innerWidth, nh = o.canvas.clientHeight || window.innerHeight;
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    renderer.setSize(w, h, false);
    camera.left = 0; camera.right = w; camera.top = 0; camera.bottom = -h;
    camera.updateProjectionMatrix();
    stars.scale.set(w / 2, h / 2, 1);
    stars.position.set(w / 2, -h / 2, 0);
    from = to = poseFor(target, w, h, o.rtl);
    setSun(sunFrom, from); sunTo.copy(sunFrom);
  };

  const start = performance.now();
  const q = new Quaternion(), qi = new Quaternion(), e = new Euler();
  const sun = new Vector3();
  const frame = () => {
    const now = performance.now();
    resize();
    const k = t0 ? easeInOut((now - t0) / PAGE_MS) : 1;
    const lerp = (a: number, b: number) => a + (b - a) * k;
    const spin = ((now - start) / 1000) * SPIN_DEG_S;
    const x = lerp(from.x, to.x), y = lerp(from.y, to.y), r = lerp(from.d, to.d) / 2;
    moon.position.set(x, -y, 0);
    moon.scale.setScalar(r);
    // Facing point drifts west, so surface features move toward the east limb, as on the real Moon.
    e.set(lerp(from.lat, to.lat) * D, (-90 - (lerp(from.lon, to.lon) - spin)) * D, 0, 'XYZ');
    q.setFromEuler(e);
    moon.quaternion.copy(q);
    qi.copy(q).invert();
    sun.copy(sunFrom).lerp(sunTo, k).normalize();
    uniforms.uSun.value.copy(sun).applyQuaternion(qi);
    uniforms.uView.value.set(0, 0, 1).applyQuaternion(qi);
    if (reliefT0) uniforms.uRelief.value = Math.min(1, (now - reliefT0) / 800);
    if (ready) renderer.render(scene, camera);
  };

  const run = () => renderer.setAnimationLoop(document.hidden || !alive ? null : frame);
  document.addEventListener('visibilitychange', run);
  const onLost = (ev: Event) => { ev.preventDefault(); renderer.setAnimationLoop(null); o.onFail(); };
  o.canvas.addEventListener('webglcontextlost', onLost);
  run();

  return {
    setPage(page) {
      if (page === target) return;
      const now = performance.now();
      const k = t0 ? easeInOut((now - t0) / PAGE_MS) : 1;
      // start the new tween from wherever the Moon is now
      const cur: Pose = {
        x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, d: from.d + (to.d - from.d) * k,
        lat: from.lat + (to.lat - from.lat) * k, lon: from.lon + (to.lon - from.lon) * k, top: to.top,
      };
      sunFrom.lerp(sunTo, k).normalize();
      from = cur;
      target = page;
      to = poseFor(page, w, h, o.rtl);
      setSun(sunTo, to);
      t0 = now;
    },
    dispose() {
      alive = false;
      renderer.setAnimationLoop(null);
      document.removeEventListener('visibilitychange', run);
      o.canvas.removeEventListener('webglcontextlost', onLost);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
