// The Roast — one persistent Three.js world driven by scroll progress (0..1).
// Camera flies down a tunnel of procedural coffee beans; the beans roast from green to dark,
// ember light peaks at "first crack", then fog turns to cream and hands off to the next section.
import * as THREE from 'three'

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const lerp = (a, b, t) => a + (b - a) * t

// Roast colour stops along the story (progress -> bean colour).
const STOPS = [
  [0.0, '#7c8760'],
  [0.2, '#8d8a58'],
  [0.34, '#b78b4f'],
  [0.46, '#7e5230'],
  [0.56, '#4d2f1b'],
  [0.7, '#2b170c'],
  [1.0, '#241209'],
].map(([p, c]) => [p, new THREE.Color(c)])

const FOG_ORIGIN = new THREE.Color('#1c2620') // cool mist at altitude
const FOG_HEAT = new THREE.Color('#2a1409') // copper haze
const FOG_DARK = new THREE.Color('#150d08')
const FOG_DAWN = new THREE.Color('#9a6b3c') // golden light between the dark roast and the cream hand-off
const CREAM = new THREE.Color('#f3e9dc') // --cream-100
const KEY_COOL = new THREE.Color('#f3e3c6')
const KEY_WARM = new THREE.Color('#e9ad73')
const HEMI_SKY_COOL = new THREE.Color('#7a8a7e')
const HEMI_SKY_WARM = new THREE.Color('#f2dcc0')
const HEMI_GROUND_DARK = new THREE.Color('#1a0f09')
const HEMI_GROUND_CREAM = new THREE.Color('#cdb79b')

function colourAt(p, out) {
  for (let i = 1; i < STOPS.length; i++) {
    if (p <= STOPS[i][0]) {
      const [p0, c0] = STOPS[i - 1]
      const [p1, c1] = STOPS[i]
      return out.lerpColors(c0, c1, (p - p0) / (p1 - p0))
    }
  }
  return out.copy(STOPS[STOPS.length - 1][1])
}

// A coffee bean: ellipsoid with a centre crease that fades toward the ends.
function beanGeometry(widthSeg, heightSeg) {
  const g = new THREE.SphereGeometry(0.5, widthSeg, heightSeg)
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    let y = pos.getY(i)
    const z = pos.getZ(i)
    let ao = 1
    if (y > -0.02) {
      const centre = Math.sin(x * 7) * 0.06
      const groove = Math.exp(-((z - centre) ** 2) / (2 * 0.045 * 0.045)) * clamp(1.15 - Math.abs(x) * 1.9)
      y -= groove * 0.2
      ao = 1 - groove * 0.62 // baked crease shadow
    }
    pos.setY(i, y)
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.scale(1, 0.72, 0.82)
  g.computeVertexNormals()
  return g
}

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

// Seeded RNG so the world is identical on every load and every scroll direction.
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ getProgress: () => number, mobile: boolean, finePointer: boolean }} opts
 */
export function createRoastScene(canvas, { getProgress, mobile, finePointer }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: 'high-performance' })
  const maxDpr = mobile ? 1.25 : 1.75
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
  renderer.setPixelRatio(dpr)

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(FOG_ORIGIN.getHex(), 0.036)
  scene.background = new THREE.Color().copy(FOG_ORIGIN)

  const camera = new THREE.PerspectiveCamera(mobile ? 66 : 54, 1, 0.1, 140)
  scene.add(camera)

  // lights ride with the camera so every frame is lit consistently
  const key = new THREE.DirectionalLight('#f3e3c6', 2.4)
  key.position.set(5, 3, 2) // side-front key: lights faces yet keeps the crease readable
  camera.add(key)
  const fill = new THREE.HemisphereLight('#7a8a7e', '#1a0f09', 0.7)
  scene.add(fill)
  const ember = new THREE.PointLight('#ff7a2a', 0, 26, 1.6)
  ember.position.set(0, -0.8, -5)
  camera.add(ember)
  const rim = new THREE.PointLight('#a9c4d2', 2.2, 30, 1.8)
  rim.position.set(-2, 2, -6)
  camera.add(rim)

  // ---- beans -------------------------------------------------------------
  const COUNT = mobile ? 720 : 1300
  const LENGTH = 82
  const geo = beanGeometry(mobile ? 10 : 16, mobile ? 8 : 12)
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: STOPS[0][1],
    roughness: 0.8,
    metalness: 0,
    emissive: new THREE.Color('#c0561a'),
    emissiveIntensity: 0,
  })
  const beans = new THREE.InstancedMesh(geo, mat, COUNT)
  const rand = rng(1611)
  const dummy = new THREE.Object3D()
  const tint = new THREE.Color()
  for (let i = 0; i < COUNT; i++) {
    const z = 14 - rand() * (LENGTH + 24)
    const ang = rand() * Math.PI * 2 + z * 0.045 // gentle spiral
    // portrait screens see a narrow slice of the tunnel: pull the walls in and make beans larger
    const r = mobile ? 2.5 + Math.pow(rand(), 0.7) * 8 : 3.1 + Math.pow(rand(), 0.7) * 13
    dummy.position.set(Math.cos(ang) * r, Math.sin(ang) * r, z)
    dummy.rotation.set(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2)
    const s = (0.55 + rand() * 0.9 + (r < 5 ? rand() * 0.5 : 0)) * (mobile ? 1.3 : 1)
    dummy.scale.setScalar(s)
    dummy.updateMatrix()
    beans.setMatrixAt(i, dummy.matrix)
    const v = 0.78 + rand() * 0.42
    beans.setColorAt(i, tint.setRGB(v, v * (0.95 + rand() * 0.08), v * (0.9 + rand() * 0.1)))
  }
  beans.instanceMatrix.needsUpdate = true
  beans.instanceColor.needsUpdate = true
  beans.frustumCulled = false
  scene.add(beans)

  // ---- embers (camera-relative, so density stays constant as you fly) ----
  const EMBERS = mobile ? 90 : 240
  const eGeo = new THREE.BufferGeometry()
  const ePos = new Float32Array(EMBERS * 3)
  const eSpd = new Float32Array(EMBERS)
  const er = rng(77)
  for (let i = 0; i < EMBERS; i++) {
    ePos[i * 3] = (er() - 0.5) * 14
    ePos[i * 3 + 1] = (er() - 0.5) * 8
    ePos[i * 3 + 2] = -1 - er() * 16
    eSpd[i] = 0.25 + er() * 0.6
  }
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3))
  const glow = glowTexture()
  const eMat = new THREE.PointsMaterial({
    size: 0.2,
    map: glow,
    color: '#ff9a4a',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const embers = new THREE.Points(eGeo, eMat)
  embers.frustumCulled = false
  camera.add(embers)

  // ---- state -------------------------------------------------------------
  let target = 0
  let sm = getProgress()
  let prev = sm
  let speed = 0
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
  const tmpColor = new THREE.Color()
  const fogColor = new THREE.Color()

  function onPointer(e) {
    pointer.x = (e.clientX / window.innerWidth - 0.5) * 2
    pointer.y = (e.clientY / window.innerHeight - 0.5) * 2
  }
  if (finePointer) window.addEventListener('pointermove', onPointer, { passive: true })

  function resize() {
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // portrait / tall viewports: widen the lens instead of accepting a centre crop
    camera.fov = w / h < 0.8 ? 70 : mobile ? 62 : 54
    camera.updateProjectionMatrix()
  }
  resize()

  // ---- per-frame world ---------------------------------------------------
  function update(dt) {
    target = getProgress()
    sm += (target - sm) * (1 - Math.exp(-5.2 * dt)) // damped; native scroll stays the truth
    speed = lerp(speed, Math.abs(sm - prev) / Math.max(dt, 1e-4), 0.1)
    prev = sm
    const p = sm

    // camera rail
    const z = 9 - p * (LENGTH + 4)
    const weave = 1 - smooth(0.82, 1, p)
    camera.position.set(
      Math.sin(p * 6.2) * 0.8 * weave + pointer.sx * 0.35,
      Math.cos(p * 4.7) * 0.5 * weave + smooth(0.84, 1, p) * 2.6 - pointer.sy * 0.25,
      z,
    )
    pointer.sx += (pointer.x - pointer.sx) * 0.05
    pointer.sy += (pointer.y - pointer.sy) * 0.05
    camera.lookAt(camera.position.x * 0.5, camera.position.y * 0.5 + smooth(0.84, 1, p) * 1.6, z - 10)
    camera.rotateZ(Math.sin(p * 3) * 0.04 + p * 0.5)

    // roast
    colourAt(p, tmpColor)
    mat.color.copy(tmpColor)
    mat.roughness = lerp(0.82, 0.38, smooth(0.35, 0.75, p))
    const heat = smooth(0.22, 0.46, p) * (1 - smooth(0.62, 0.8, p))
    const crack = Math.exp(-(((p - 0.5) / 0.03) ** 2)) // the first-crack flash
    mat.emissiveIntensity = heat * 0.05 + crack * 0.12
    ember.intensity = heat * 4.5 + crack * 9
    rim.intensity = 2.2 * (1 - smooth(0.12, 0.34, p))
    key.intensity = lerp(2.8, 3.6, smooth(0.25, 0.5, p))
    key.color.copy(KEY_COOL).lerp(KEY_WARM, smooth(0.2, 0.5, p)).lerp(KEY_COOL, smooth(0.8, 0.94, p))
    key.intensity += crack * 1.5

    // atmosphere: mist -> copper haze -> dark -> cream hand-off
    fogColor.copy(FOG_ORIGIN).lerp(FOG_HEAT, smooth(0.18, 0.42, p)).lerp(FOG_DARK, smooth(0.62, 0.78, p))
    const cream = smooth(0.86, 0.95, p)
    fogColor.lerp(FOG_DAWN, smooth(0.74, 0.86, p)).lerp(CREAM, cream)
    scene.fog.color.copy(fogColor)
    scene.background.copy(fogColor)
    scene.fog.density = lerp(0.036, 0.03, smooth(0.2, 0.5, p)) + cream * 0.1
    fill.intensity = lerp(0.9, 0.9, smooth(0.2, 0.5, p)) + smooth(0.74, 0.86, p) * 0.6 + cream * 0.9
    fill.color.copy(HEMI_SKY_COOL).lerp(HEMI_SKY_WARM, smooth(0.15, 0.45, p))
    fill.groundColor.copy(HEMI_GROUND_DARK).lerp(HEMI_GROUND_CREAM, cream)
    fill.color.lerp(HEMI_SKY_WARM, smooth(0.74, 0.9, p))

    // embers
    eMat.opacity = clamp(heat * 1.2 + crack) * 0.9 * (1 - cream)
    const burst = 1 + crack * 5 + clamp(speed * 40) * 2
    for (let i = 0; i < EMBERS; i++) {
      ePos[i * 3 + 1] += eSpd[i] * dt * burst * 0.8
      ePos[i * 3 + 2] += (0.4 + eSpd[i]) * dt * burst * 2.2
      if (ePos[i * 3 + 2] > -0.8) {
        ePos[i * 3 + 2] = -17
        ePos[i * 3] = (Math.random() - 0.5) * 14
        ePos[i * 3 + 1] = (Math.random() - 0.5) * 8
      }
      if (ePos[i * 3 + 1] > 4.5) ePos[i * 3 + 1] = -4.5
    }
    eGeo.attributes.position.needsUpdate = true
    embers.visible = eMat.opacity > 0.01

    return { p, cream }
  }

  // ---- loop, visibility, quality governor --------------------------------
  let raf = 0
  let running = false
  let inView = true
  let last = 0
  let frames = 0
  let acc = 0
  let level = 0
  const stats = { fps: 0, calls: 0, tris: 0, dpr, cpuMs: 0 }

  function governor(dt) {
    frames++
    acc += dt
    if (frames >= 90) {
      const avg = acc / frames
      stats.fps = 1 / avg
      if (avg > 0.026 && level < 2) {
        level++
        dpr = Math.max(0.85, dpr * 0.75)
        renderer.setPixelRatio(dpr)
        resize()
        if (level === 2) embers.visible = false
      }
      stats.dpr = dpr
      frames = 0
      acc = 0
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    const t0 = performance.now()
    update(dt)
    renderer.render(scene, camera)
    stats.cpuMs = stats.cpuMs * 0.9 + (performance.now() - t0) * 0.1
    stats.calls = renderer.info.render.calls
    stats.tris = renderer.info.render.triangles
    governor(dt)
  }
  function start() {
    if (running || !inView || document.hidden) return
    running = true
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  function stop() {
    running = false
    cancelAnimationFrame(raf)
  }
  const onVis = () => (document.hidden ? stop() : start())
  document.addEventListener('visibilitychange', onVis)

  const io = new IntersectionObserver(([e]) => {
    inView = e.isIntersecting
    inView ? start() : stop()
  }, { rootMargin: '10% 0px' })
  io.observe(canvas)

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  // GPU context loss: stop cleanly rather than freeze on a dead canvas
  const onLost = (e) => { e.preventDefault(); stop() }
  canvas.addEventListener('webglcontextlost', onLost)

  update(1 / 60)
  renderer.render(scene, camera)
  start()

  return {
    stats,
    dispose() {
      stop()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pointermove', onPointer)
      canvas.removeEventListener('webglcontextlost', onLost)
      geo.dispose()
      mat.dispose()
      eGeo.dispose()
      eMat.dispose()
      glow.dispose()
      beans.dispose()
      renderer.dispose()
    },
  }
}
