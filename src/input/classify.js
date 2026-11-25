import { tuning } from '../tuning.js'

export function hypot(x, y) {
  return Math.hypot(x, y)
}

export function stickVector(startX, startY, x, y) {
  const dx = x - startX
  const dy = startY - y
  const mag = Math.hypot(dx, dy)
  if (mag < tuning.deadzone) return { x: 0, y: 0, mag: 0 }
  const scale = Math.min(mag, tuning.stickRadius) / tuning.stickRadius
  return { x: (dx / mag) * scale, y: (dy / mag) * scale, mag: scale }
}

export function recenter(startX, startY, x, y) {
  const dx = x - startX
  const dy = y - startY
  const mag = Math.hypot(dx, dy)
  if (mag <= tuning.stickRadius) return { startX, startY }
  const k = tuning.stickRadius / mag
  return { startX: x - dx * k, startY: y - dy * k }
}

function angleDelta(a, b) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

export function pathStats(path, now, windowMs = tuning.pathWindowMs) {
  const recent = path.filter((p) => now - p.t <= windowMs)
  if (recent.length < 2) {
    return {
      recent,
      length: 0,
      net: 0,
      straight: 1,
      speed: 0,
      wind: 0,
      reversals: 0,
      dx: 0,
      dy: 0,
    }
  }
  let length = 0
  for (let i = 1; i < recent.length; i++) {
    length += Math.hypot(recent[i].x - recent[i - 1].x, recent[i].y - recent[i - 1].y)
  }
  const dx = recent[recent.length - 1].x - recent[0].x
  const dy = recent[recent.length - 1].y - recent[0].y
  const net = Math.hypot(dx, dy)
  const dt = Math.max(1, recent[recent.length - 1].t - recent[0].t)
  let cx = 0
  let cy = 0
  for (const p of recent) {
    cx += p.x
    cy += p.y
  }
  cx /= recent.length
  cy /= recent.length
  let vx = 0
  let vy = 0
  for (const p of recent) {
    vx += (p.x - cx) ** 2
    vy += (p.y - cy) ** 2
  }
  // Heading change, not the angle around the centroid. A straight line
  // passes the centroid and looks like a half turn if measured that way.
  let wind = 0
  let prevHeading = null
  for (let i = 1; i < recent.length; i++) {
    const hx = recent[i].x - recent[i - 1].x
    const hy = recent[i].y - recent[i - 1].y
    if (hx * hx + hy * hy < 4) continue
    const heading = Math.atan2(hy, hx)
    if (prevHeading !== null) {
      const turn = angleDelta(prevHeading, heading)
      // Sharp flips are reversals. A circle is a run of small turns.
      if (Math.abs(turn) < 2.2) wind += turn
    }
    prevHeading = heading
  }
  const useX = vx >= vy
  let reversals = 0
  let prevSign = 0
  for (let i = 1; i < recent.length; i++) {
    const delta = useX ? recent[i].x - recent[i - 1].x : recent[i].y - recent[i - 1].y
    if (Math.abs(delta) < 2) continue
    const s = Math.sign(delta)
    if (prevSign && s !== prevSign) reversals += 1
    prevSign = s
  }
  return {
    recent,
    length,
    net,
    straight: length > 0 ? net / length : 1,
    speed: length / dt,
    wind,
    reversals,
    dx,
    dy,
  }
}

export function classifyPath(path, now) {
  const stats = pathStats(path, now)
  if (stats.length < 8) return { kind: 'none', ...stats, dir: { x: 0, y: 0 } }
  const dir = {
    x: stats.dx,
    y: -stats.dy,
  }
  const dirLen = Math.hypot(dir.x, dir.y) || 1
  dir.x /= dirLen
  dir.y /= dirLen
  if (
    stats.length >= tuning.circleLength &&
    Math.abs(stats.wind) >= tuning.circleWind &&
    stats.straight <= tuning.circleStraight
  ) {
    return { kind: 'circle', ...stats, dir }
  }
  if (
    stats.length >= tuning.sawLength &&
    stats.reversals >= tuning.sawReversals &&
    Math.abs(stats.wind) <= tuning.sawMaxWind
  ) {
    return { kind: 'saw', ...stats, dir }
  }
  if (
    stats.speed >= tuning.swipeSpeed &&
    stats.net >= tuning.swipeDist &&
    stats.straight >= tuning.swipeStraight
  ) {
    return { kind: 'swipe', ...stats, dir }
  }
  return { kind: 'drag', ...stats, dir }
}

export function isFastFlick(path, now) {
  const stats = pathStats(path, now, 900)
  return (
    stats.speed >= tuning.doubleSpeed &&
    stats.net >= tuning.doubleDist &&
    stats.straight >= 0.62
  )
}

// from/to are screen points (y down). facing and player are y-up screen space.
export function classifySwitch(from, to, facing, player, rotated) {
  if (rotated) return 'spin'
  const vx = to.x - from.x
  const vy = -(to.y - from.y)
  const fx = facing?.x || 0
  const fy = facing?.y || 1
  const fl = Math.hypot(fx, fy) || 1
  const ux = fx / fl
  const uy = fy / fl
  const rx = uy
  const ry = -ux
  const along = vx * ux + vy * uy
  const across = vx * rx + vy * ry
  const midX = (from.x + to.x) / 2
  const midY = -((from.y + to.y) / 2)
  const body = player
    ? Math.hypot(midX - player.x, midY - player.y)
    : 999
  if (along < -20 && Math.abs(along) > Math.abs(across) * 0.55) return 'behind'
  if (body < 110 && along > -10 && Math.abs(across) < Math.abs(along) + 30) return 'between'
  if (Math.abs(across) >= Math.abs(along) * 0.85) return 'crossover'
  return along >= 0 ? 'between' : 'behind'
}

export function rotatedDribble(path, now) {
  const stats = pathStats(path, now, 900)
  return Math.abs(stats.wind) >= tuning.spinWind && stats.length >= tuning.spinLength
}

export const MOVE_NAMES = {
  crossover: 'Crossover',
  between: 'Between the legs',
  behind: 'Behind the back',
  spin: 'Spin',
}

export function skillName(family, starter) {
  if (family === 'circle' && starter === 'dribble') return 'Wrap'
  if (family === 'circle' && starter === 'sprint') return 'Spin cycle'
  if (family === 'saw' && starter === 'dribble') return 'Hesitation'
  return 'Stutter'
}
