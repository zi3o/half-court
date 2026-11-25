export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, (a.z ?? 0) - (b.z ?? 0))
}

export function approach(player, tvx, tvz, dt, rate) {
  const dvx = tvx - player.vx
  const dvz = tvz - player.vz
  const dl = Math.hypot(dvx, dvz)
  if (dl < 0.0001) return
  const step = Math.min(dl, rate * dt)
  player.vx += (dvx / dl) * step
  player.vz += (dvz / dl) * step
}

export function nearest(list, point) {
  let best = null
  let bestD = Infinity
  for (const item of list) {
    const d = dist(item, point)
    if (d < bestD) {
      best = item
      bestD = d
    }
  }
  return best
}
