import * as THREE from 'three'
import { createMatch } from './game/match.js'
import { createGestures } from './input/gestures.js'
import { createSounds } from './audio/sounds.js'
import { createActor, createBall, syncActor } from './render/actors.js'
import { createCourt } from './render/court.js'

const app = document.querySelector('#app')
const scoreEl = document.querySelector('#score')
const roleEl = document.querySelector('#role')
const bannerEl = document.querySelector('#banner')
const readoutEl = document.querySelector('#readout')
const zoneLeft = document.querySelector('#zone-left')
const zoneRight = document.querySelector('#zone-right')
const meterEl = document.querySelector('#meter')
const knobEl = document.querySelector('#knob')

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x8eafd4)
scene.fog = new THREE.Fog(0x8eafd4, 22, 46)

const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 80)
const camPos = new THREE.Vector3(0, 11.8, 18.5)
const camLook = new THREE.Vector3(0, 0.35, 6)
const desiredPos = new THREE.Vector3()
const desiredLook = new THREE.Vector3()
let camReady = false
const court = createCourt()
scene.add(court)

scene.add(new THREE.HemisphereLight(0xfff6ea, 0x3c4148, 1.2))
const sun = new THREE.DirectionalLight(0xffffff, 1.2)
sun.position.set(-7, 16, 11)
scene.add(sun)
const fill = new THREE.DirectionalLight(0xd5e4ff, 0.4)
fill.position.set(8, 8, -2)
scene.add(fill)

const match = createMatch()
const actors = new Map()
for (const player of match.players) {
  const group = createActor(player)
  actors.set(player.id, group)
  scene.add(group)
}
const ballMesh = createBall()
scene.add(ballMesh)
const ballShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.28, 18),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
)
ballShadow.rotation.x = -Math.PI / 2
scene.add(ballShadow)

const gestures = createGestures(renderer.domElement)
const courtSounds = createSounds()
const projectPoint = new THREE.Vector3()

function frameCamera(dt, snap) {
  const ball = match.ball
  const fx = Math.max(-3.6, Math.min(3.6, ball.x))
  const fz = Math.max(2.6, Math.min(10.4, ball.z))
  const short = (app.clientHeight || window.innerHeight) < 520
  desiredPos.set(fx * 0.22, short ? 13.6 : 12.2, fz + (short ? 11.0 : 10.0))
  desiredLook.set(fx * 0.12, 1.15, Math.max(1.2, fz - 2.7))
  if (!camReady || snap) {
    camPos.copy(desiredPos)
    camLook.copy(desiredLook)
    camReady = true
  } else {
    const k = 1 - Math.exp(-Math.max(0, dt) * 4.5)
    camPos.lerp(desiredPos, k)
    camLook.lerp(desiredLook, k)
  }
  camera.position.copy(camPos)
  camera.lookAt(camLook)
}

function resize() {
  const width = app.clientWidth || window.innerWidth
  const height = app.clientHeight || window.innerHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / Math.max(1, height)
  const short = height < 520
  camera.fov = short ? 48 : 42
  camera.updateProjectionMatrix()
  frameCamera(0.2, true)
}

function project(x, y, z) {
  projectPoint.set(x, y, z).project(camera)
  const width = renderer.domElement.clientWidth
  const height = renderer.domElement.clientHeight
  return {
    x: (projectPoint.x * 0.5 + 0.5) * width,
    y: (-projectPoint.y * 0.5 + 0.5) * height,
  }
}

function basisOf(cam) {
  cam.updateMatrixWorld()
  const e = cam.matrixWorld.elements
  let rx = e[0]
  let rz = e[2]
  const rl = Math.hypot(rx, rz) || 1
  rx /= rl
  rz /= rl
  let fx = -e[8]
  let fz = -e[10]
  const fl = Math.hypot(fx, fz) || 1
  fx /= fl
  fz /= fl
  return { right: { x: rx, z: rz }, forward: { x: fx, z: fz } }
}

let shownYou = 0
let shownCpu = 0
function paint(input) {
  const you = match.score.blue
  const cpu = match.score.red
  scoreEl.textContent = `YOU ${you}  ·  CPU ${cpu}`
  const opening = shownYou === 0 && shownCpu === 0 && you === 0 && cpu === 0
  if (!opening && (you !== shownYou || cpu !== shownCpu)) {
    scoreEl.classList.remove('pop')
    void scoreEl.offsetWidth
    scoreEl.classList.add('pop')
    shownYou = you
    shownCpu = cpu
  }
  roleEl.textContent = match.offense === 'blue' ? 'OFFENSE' : 'DEFENSE'
  bannerEl.textContent = match.banner
  bannerEl.className = match.banner ? match.bannerKind || '' : ''
  readoutEl.hidden = !input.readout
  readoutEl.textContent = input.readout
  zoneLeft.textContent = input.zones.left
  zoneRight.textContent = input.zones.right
  const pos = match.meterPos()
  const shooter = match.meterShooter()
  meterEl.hidden = pos == null || !shooter
  if (pos != null && shooter) {
    knobEl.style.bottom = `${pos * 100}%`
    const spot = project(shooter.x, 1.7, shooter.z)
    const width = renderer.domElement.clientWidth
    const side = spot.x < width * 0.5 ? -58 : 58
    const left = Math.max(36, Math.min(width - 36, spot.x + side))
    const top = spot.y < 150 ? spot.y + 78 : spot.y
    meterEl.style.left = `${left}px`
    meterEl.style.top = `${Math.max(128, top)}px`
  }
  const me = match.controlled()
  for (const player of match.players) {
    const hasBall = match.ball.mode === 'held' && match.ball.owner === player
    syncActor(actors.get(player.id), player, player === me, hasBall)
  }
  ballMesh.position.set(match.ball.x, match.ball.y, match.ball.z)
  ballMesh.rotation.x = match.ball.spin || 0
  ballMesh.rotation.z = (match.ball.spin || 0) * 0.35
  const squash = match.ball.y < 0.26 ? 0.74 + match.ball.y : 1
  const spread = 1 + (1 - squash) * 0.4
  ballMesh.scale.set(spread, squash, spread)
  ballShadow.position.set(match.ball.x, 0.026, match.ball.z)
  ballShadow.scale.setScalar(Math.max(0.45, 1.15 - match.ball.y * 0.18))
  for (const cue of match.sounds.splice(0, match.sounds.length)) courtSounds.play(cue)
}

window.addEventListener('resize', resize)
resize()

renderer.domElement.addEventListener('pointerdown', () => {
  courtSounds.unlock()
  const root = document.documentElement
  if (!document.fullscreenElement && root.requestFullscreen) {
    root.requestFullscreen().catch(() => {})
    screen.orientation?.lock?.('landscape').catch(() => {})
  }
}, { once: true })

let last = performance.now()
let frame = 0
function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000)
  last = now
  frameCamera(dt)
  const ctx = match.view(project)
  const input = gestures.frame(now, ctx)
  input.aim = ctx.aim
  match.update(dt, input, basisOf(camera))
  paint(input)
  renderer.render(scene, camera)
  frame = requestAnimationFrame(tick)
}
frame = requestAnimationFrame(tick)
if (import.meta.hot) import.meta.hot.dispose(() => cancelAnimationFrame(frame))

window.__halfcourt = { match, gestures, sounds: courtSounds, THREE, project, basisOf }
