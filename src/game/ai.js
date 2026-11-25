import { court, tuning } from '../tuning.js'
import { approach, clamp, dist, nearest } from './math.js'

const WINGS = [
  { x: -6.15, z: 3.2 },
  { x: 6.15, z: 3.2 },
  { x: -5.4, z: 7.7 },
  { x: 5.4, z: 7.7 },
]

function accelFor(speed, stopping) {
  if (stopping) return tuning.accel.brake
  if (speed >= tuning.speed.sprint - 0.3) return tuning.accel.sprint
  if (speed >= tuning.speed.cut - 0.25) return tuning.accel.cut
  if (speed <= tuning.speed.check + 0.2) return tuning.accel.check
  return tuning.accel.dribble
}

export function drive(player, x, z, speed, dt, time) {
  if (player.bumpUntil > time) speed *= 0.45
  if (player.gathering) speed = Math.min(speed, tuning.speed.gather)
  const dx = x - player.x
  const dz = z - player.z
  const len = Math.hypot(dx, dz)
  let tvx = 0
  let tvz = 0
  const stopping = len < 0.22
  if (!stopping) {
    const nx = dx / len
    const nz = dz / len
    tvx = nx * speed
    tvz = nz * speed
    player.fx = nx
    player.fz = nz
  }
  player.sprinting = !stopping && speed >= tuning.speed.sprint - 0.45
  approach(player, tvx, tvz, dt, accelFor(speed, stopping))
  if (stopping && Math.hypot(player.vx, player.vz) < 0.06) {
    player.vx = 0
    player.vz = 0
  }
  player.x = clamp(player.x + player.vx * dt, court.minX, court.maxX)
  player.z = clamp(player.z + player.vz * dt, court.minZ, court.maxZ)
}

function facePoint(player, x, z) {
  const dx = x - player.x
  const dz = z - player.z
  const len = Math.hypot(dx, dz) || 1
  player.fx = dx / len
  player.fz = dz / len
}

function inPaint(player) {
  return Math.abs(player.x) < court.keyHalf + 0.35 && player.z < court.ftZ + 0.1
}

function wingSpot(player, handler, other) {
  let best = WINGS[0]
  let score = -Infinity
  const ballX = handler?.x || 0
  for (const spot of WINGS) {
    const fromOther = other ? Math.hypot(spot.x - other.x, spot.z - other.z) : 5
    if (fromOther < 1.65) continue
    const travel = Math.hypot(spot.x - player.x, spot.z - player.z)
    const weak = Math.sign(spot.x || 1) !== Math.sign(ballX || 1) ? 0.9 : 0
    const value = Math.abs(spot.x) * 0.22 + fromOther * 0.65 + weak - travel * 0.2
    if (value > score) {
      score = value
      best = spot
    }
  }
  return best
}

function openTeammate(handler, match, defense) {
  const mates = match.players.filter((p) => p.team === handler.team && p !== handler)
  let best = null
  let bestSpace = 1.2
  for (const mate of mates) {
    const marker = nearest(defense, mate)
    const space = marker ? dist(marker, mate) : 6
    if (space > bestSpace) {
      bestSpace = space
      best = mate
    }
  }
  return best
}

function thinkCpu(player, match, dt, defense) {
  if (player.cpuGather > 0) {
    player.cpuGather -= dt
    player.gathering = 1
    player.vx = 0
    player.vz = 0
    player.sprinting = false
    facePoint(player, court.rim.x, court.rim.z)
    if (player.cpuGather <= 0) {
      player.gathering = 0
      return { type: 'shot', kind: player.cpuKind, side: player.cpuSide }
    }
    return null
  }

  const rimD = dist(player, court.rim)
  let nearestD = 99
  let jammer = null
  for (const marker of defense) {
    const d = dist(marker, player)
    if (d < nearestD) {
      nearestD = d
      jammer = marker
    }
  }
  const jammed = jammer && nearestD < 1.5 && jammer.z < player.z + 0.2
  if (jammed && player.holdTime > 0.65) {
    const mate = openTeammate(player, match, defense)
    if (mate) return { type: 'pass', id: mate.id }
  }
  const inPaint = Math.abs(player.x) < court.keyHalf && player.z < court.ftZ - 0.2
  if (inPaint && player.holdTime > 0.4 && rimD > 1.8) {
    const mate = openTeammate(player, match, defense)
    if (mate) return { type: 'pass', id: mate.id }
    const side = Math.sign(player.x) || 1
    drive(player, side * 3.6, 6.6, tuning.speed.dribble, dt, match.time)
    player.dribbleLive = true
    return null
  }
  const openLook = !inPaint && nearestD > 2.05 && rimD < 6.4 && player.holdTime > 1.05
  const forced = player.holdTime > 4.6
  const finish = rimD < 2.35 && player.sprinting
  if (openLook || forced || finish) {
    player.cpuGather = finish ? 0.18 : 0.32
    player.cpuKind = rimD < 2.55 ? 'layup' : 'quick'
    player.cpuSide = Math.sign(player.x || jammer?.x || 1) || 1
    if (jammer && Math.abs(jammer.x - player.x) > 0.25) {
      player.cpuSide = player.x >= jammer.x ? 1 : -1
    }
    player.gathering = 1
    return null
  }

  const target = rimD > 6.2 ? { x: player.x * 0.4, z: 8.3 } : { x: (Math.sign(player.x) || 1) * 3.4, z: 6.5 }
  const speed = nearestD > 1.7 && rimD > 3.5 ? tuning.speed.sprint : tuning.speed.dribble
  drive(player, target.x, target.z, speed, dt, match.time)
  player.dribbleLive = true
  if (Math.floor(match.time / 1.6) % 2 === 0) player.ballHand = 'right'
  else player.ballHand = 'left'
  return null
}

function raiseHand(player, handler) {
  player.cutting = true
  player.signal = 1
  player.signalHand = player.x < (handler?.x ?? 0) ? 1 : -1
}

function clearPaint(player, match, dt) {
  if (player.paintTime <= 0.18 || match.ball.mode !== 'held') return false
  player.cutting = false
  player.signal = 0
  const side = Math.abs(player.x) < 0.45 ? (player.index === 1 ? -1 : 1) : Math.sign(player.x)
  drive(player, side * 6.05, 6.9, tuning.speed.jog, dt, match.time)
  return true
}

function moveOffense(player, match, dt, handler, defense, screener) {
  player.cutting = false
  player.signal = 0
  if (match.ball.mode === 'pass' && player.id === match.ball.targetId) {
    const dest = match.ball.to || player
    if (match.ball.lead) raiseHand(player, handler || match.ball.from)
    drive(player, dest.x, dest.z, match.ball.lead ? tuning.speed.cut : tuning.speed.jog, dt, match.time)
    return
  }
  const mates = match.players.filter((p) => p.team === player.team)
  const ballPoint = handler || match.ball
  if (match.ball.mode === 'shot' || match.ball.mode === 'loose') {
    if (player === nearest(mates, ballPoint)) {
      drive(player, ballPoint.x, Math.max(ballPoint.z, 1.7), tuning.speed.cut, dt, match.time)
    } else {
      const side = player.index % 2 === 0 ? -1 : 1
      const depth = player.index === 0 ? 7.5 : 4.3
      drive(player, side * 5.6, depth, tuning.speed.jog, dt, match.time)
    }
    return
  }
  if (!handler) {
    if (player === nearest(mates, ballPoint)) drive(player, ballPoint.x, ballPoint.z, tuning.speed.jog, dt, match.time)
    return
  }
  if (handler && inPaint(handler)) {
    const candidates = match.players.filter((p) => p.team === player.team && p !== handler && p !== screener)
    const cutter = candidates.slice().sort((a, b) => dist(a, court.rim) - dist(b, court.rim))[0]
    if (player === cutter) {
      const side = -Math.sign(handler.x || 1) || 1
      raiseHand(player, handler)
      drive(player, side * 1.4, 2.5, tuning.speed.cut, dt, match.time)
      return
    }
  }
  if (clearPaint(player, match, dt)) return

  if (
    match.time < match.swingUntil &&
    !inPaint(handler) &&
    Math.abs(handler.x) > 1.2 &&
    Math.sign(player.x || 1) !== Math.sign(handler.x) &&
    Math.abs(player.x) > 1
  ) {
    drive(player, Math.sign(handler.x) * 5.5, 6.8, tuning.speed.cut, dt, match.time)
    return
  }
  const others = match.players.filter((p) => p.team === player.team && p !== player && p !== handler)
  const spot = wingSpot(player, handler, others[0])
  drive(player, spot.x, spot.z, tuning.speed.jog, dt, match.time)
}

function moveDefense(player, match, dt, handler, offense) {
  if (player.recover && player.recover.until > match.time) {
    drive(player, player.recover.x, player.recover.z, tuning.speed.defendSprint, dt, match.time)
    return
  }
  const ball = match.ball
  const mates = match.players.filter((p) => p.team === player.team)
  if (ball.mode === 'shot' || ball.mode === 'loose') {
    const crash = nearest(mates, ball)
    if (player === crash) {
      drive(player, clamp(ball.x, -2.2, 2.2), Math.max(ball.z, 1.7), tuning.speed.defendSprint, dt, match.time)
    } else {
      const side = player.index % 2 === 0 ? -1 : 1
      drive(player, side * 5.2, 6.4, tuning.speed.defend, dt, match.time)
    }
    return
  }
  const man = offense.find((p) => p.index === player.index) || nearest(offense, player)
  if (!man) return
  const onBall = !!(handler && player === nearest(mates, handler))
  let tx = man.x + (court.rim.x - man.x) * 0.18
  let tz = man.z + (court.rim.z - man.z) * 0.18
  let speed = tuning.speed.defend
  const late = match.helpLate > match.time
  if (onBall && handler) {
    tx = handler.x + (court.rim.x - handler.x) * 0.18
    tz = handler.z + (court.rim.z - handler.z) * 0.22
    const beaten = dist(handler, court.rim) + 0.2 < dist(player, court.rim) && player.z > handler.z + 0.1
    const lagged = !!(handler.sprinting && handler.sprintAt != null && match.time - handler.sprintAt > 0.16)
    if (handler.sprinting && !beaten) speed = tuning.speed.defend
    else if (late && beaten) speed = tuning.speed.defend * 0.75
    else speed = lagged ? tuning.speed.defendSprint : tuning.speed.defend
  } else if (late && man) {
    tx = man.x
    tz = man.z + 1.15
    speed = tuning.speed.defend * 0.82
  } else {
    if (Math.abs(man.x) > court.keyHalf && tz < court.ftZ && Math.abs(tx) < court.keyHalf) {
      tx = Math.sign(man.x || 1) * (court.keyHalf + 0.4)
    }
    speed = man.sprinting ? tuning.speed.defendSprint : tuning.speed.defend
  }
  drive(player, tx, tz, speed, dt, match.time)
  if (speed < tuning.speed.defendSprint - 0.05) player.sprinting = false
}

export function updateAI(match, dt, controlled) {
  const handler = match.ball.mode === 'held' ? match.ball.owner : null
  const offense = match.players.filter((p) => p.team === match.offense)
  const defense = match.players.filter((p) => p.team !== match.offense)
  if (handler && Math.abs(handler.x) > 0.8) {
    const side = Math.sign(handler.x)
    if (side !== match.ballSide) {
      match.ballSide = side
      match.swingUntil = match.time + 1.15
    }
  }

  if (handler?.sprinting) {
    const onBall = nearest(defense, handler)
    const ahead = onBall && dist(handler, court.rim) + 0.3 < dist(onBall, court.rim) && onBall.z > handler.z + 0.15
    if (ahead) match.helpLate = match.time + 0.65
  }

  let screener = null
  if (handler) {
    const jammed = defense.some((d) => dist(d, handler) < 1.48 && d.z < handler.z + 0.2)
    if (jammed) {
      const mates = offense.filter((p) => p !== handler && p !== controlled)
      screener = nearest(mates, handler)
    }
  }

  let cpuAction = null
  for (const player of match.players) {
    if (player === controlled || player.layup) continue
    if (match.phase === 'meter' && player === handler) continue
    if (handler && player === handler && player.team !== 'blue') {
      const action = thinkCpu(player, match, dt, defense)
      if (action) cpuAction = action
      continue
    }
    if (player.team === match.offense) moveOffense(player, match, dt, handler, defense, screener)
    else moveDefense(player, match, dt, handler, offense)
  }
  return cpuAction
}
