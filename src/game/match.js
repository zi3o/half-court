import { court, tuning } from '../tuning.js'
import { drive, updateAI } from './ai.js'
import { approach, clamp, dist, nearest } from './math.js'

function makePlayer(team, index) {
  const shades = team === 'blue' ? [0x2f6bff, 0x60a5fa, 0x1d4ed8] : [0xef4444, 0xfb7185, 0xb91c1c]
  return {
    id: `${team}-${index}`,
    team,
    index,
    color: shades[index],
    skill: 0.5 + index * 0.12,
    ballHand: 'right',
    x: 0,
    z: 8,
    fx: 0,
    fz: -1,
    vx: 0,
    vz: 0,
    holdTime: 0,
    sprintTime: 0,
    sprintAt: null,
    sprinting: false,
    dribbleLive: true,
    hasDribbled: false,
    pickedUp: false,
    pivotX: 0,
    pivotZ: 0,
    skillUntil: 0,
    screenUntil: 0,
    bumpUntil: 0,
    reboundUntil: 0,
    jump: 0,
    jumpY: 0,
    gathering: 0,
    celebrate: 0,
    celeKind: 'five',
    paintTime: 0,
    cutting: false,
    signal: 0,
    signalHand: 1,
    shotArm: 0,
    anim: 0,
    dribblePhase: 0,
    skillBurst: null,
    layup: null,
    cpuGather: 0,
    cpuKind: 'quick',
    cpuSide: 1,
  }
}

function aimDot(dir, from, to) {
  if (!from || !to || !dir) return -1
  const vx = to.x - from.x
  const vy = -(to.y - from.y)
  const vl = Math.hypot(vx, vy)
  const dl = Math.hypot(dir.x, dir.y)
  if (dl < 0.2) return -1
  if (vl < 8) return dir.y > 0.2 ? 0.9 : -1
  return (dir.x * vx + dir.y * vy) / (vl * dl)
}

export function createMatch() {
  const players = []
  for (const team of ['blue', 'red']) {
    for (let index = 0; index < 3; index++) players.push(makePlayer(team, index))
  }
  const match = {
    players,
    offense: 'blue',
    score: { blue: 0, red: 0 },
    time: 0,
    phase: 'play',
    inboundT: 0,
    check: null,
    banner: 'Tap the other side while you dribble',
    bannerKind: '',
    bannerUntil: 3.4,
    helpLate: 0,
    ballSide: 0,
    swingUntil: 0,
    lag: [],
    meter: null,
    cele: null,
    rand: () => Math.random(),
    ball: {
      mode: 'held',
      owner: null,
      targetId: null,
      x: 0,
      y: 1,
      z: 10,
      vx: 0,
      vy: 0,
      vz: 0,
      from: null,
      to: null,
      t: 0,
      dur: 0.5,
      arc: 2,
      make: false,
      shooterId: null,
      points: 2,
      kind: 'quick',
      through: 0,
      scored: false,
      looseReason: '',
      lastTeam: 'blue',
      spin: 0,
      lead: false,
      skipFloor: false,
    },
    sounds: [],
  }

  const api = {
    get players() { return match.players },
    get offense() { return match.offense },
    set offense(value) { match.offense = value },
    get score() { return match.score },
    get time() { return match.time },
    set time(value) { match.time = value },
    get phase() { return match.phase },
    set phase(value) { match.phase = value },
    get ball() { return match.ball },
    get sounds() { return match.sounds },
    get banner() { return match.time < match.bannerUntil ? match.banner : '' },
    get bannerKind() { return match.time < match.bannerUntil ? match.bannerKind : '' },
    get ballSide() { return match.ballSide },
    set ballSide(value) { match.ballSide = value },
    get swingUntil() { return match.swingUntil },
    set swingUntil(value) { match.swingUntil = value },
    get meter() { return match.meter },
    rand: () => match.rand(),
    byId,
    controlled,
    view,
    update,
    meterPos,
    meterShooter,
    setRand(fn) { match.rand = fn },
  }

  function byId(id) {
    return match.players.find((player) => player.id === id) || null
  }

  function say(text, seconds = 1.15, kind = '') {
    match.banner = text
    match.bannerUntil = match.time + seconds
    match.bannerKind = kind
  }

  function controlled() {
    const blues = match.players.filter((player) => player.team === 'blue')
    if (match.offense === 'blue') {
      if (match.ball.mode === 'pass' && match.ball.targetId) {
        const target = byId(match.ball.targetId)
        if (target?.team === 'blue') return target
      }
      if (match.ball.owner?.team === 'blue') return match.ball.owner
      return nearest(blues, match.ball)
    }
    return nearest(blues, match.ball.owner || match.ball)
  }

  function view(project) {
    const me = controlled()
    const playerScreen = me ? project(me.x, 1.2, me.z) : { x: 0, y: 0 }
    const ahead = me ? project(me.x + me.fx, 1.2, me.z + me.fz) : { x: playerScreen.x, y: playerScreen.y - 20 }
    const facingScreen = { x: ahead.x - playerScreen.x, y: -(ahead.y - playerScreen.y) }
    const basket = project(court.rim.x, court.rim.y, court.rim.z)
    const mates = []
    if (me && me.team === match.offense) {
      for (const player of match.players) {
        if (player.team !== me.team || player === me) continue
        mates.push({ id: player.id, ...project(player.x, 1.2, player.z) })
      }
    }
    let handler = null
    if (match.ball.owner && me && match.ball.owner !== me) {
      handler = { id: match.ball.owner.id, ...project(match.ball.owner.x, 1.2, match.ball.owner.z) }
    }
    return {
      ballHand: me?.ballHand || 'right',
      mode: me && me.team === match.offense ? 'offense' : 'defense',
      metering: match.phase === 'meter',
      facingScreen,
      playerUp: { x: playerScreen.x, y: -playerScreen.y },
      aim: { me: playerScreen, basket, mates, handler },
    }
  }

  function handPoint(player, live) {
    const side = player.ballHand === 'left' ? -1 : 1
    const rx = -player.fz * side
    const rz = player.fx * side
    const yBase = player.jumpY || 0
    if (player.gathering) return { x: player.x + rx * 0.12, y: 1.9 + yBase, z: player.z + rz * 0.12 }
    if (live && player.dribbleLive) {
      const freq = player.sprinting ? 5.4 : 3.6
      const phase = player.dribblePhase || (match.time * freq) % 1
      const down = phase < 0.5 ? phase * 2 : (1 - phase) * 2
      return { x: player.x + rx * 0.34, y: 0.92 - down * 0.62 + yBase, z: player.z + rz * 0.34 }
    }
    return { x: player.x + rx * 0.2, y: 1.28 + yBase, z: player.z + rz * 0.16 }
  }

  function placeHeld() {
    if (match.ball.mode !== 'held' || !match.ball.owner) return
    const point = handPoint(match.ball.owner, true)
    match.ball.x = point.x
    match.ball.y = point.y
    match.ball.z = point.z
  }

  function giveBall(player) {
    const previous = match.ball.owner
    if (previous && previous !== player) {
      previous.cpuGather = 0
      previous.gathering = 0
      previous.layup = null
      previous.dribbleLive = false
    }
    player.dribbleLive = true
    player.hasDribbled = false
    player.pickedUp = false
    player.holdTime = 0
    player.layup = null
    player.gathering = 0
    player.cpuGather = 0
    player.pivotX = player.x
    player.pivotZ = player.z
    match.ball.mode = 'held'
    match.ball.owner = player
    match.ball.targetId = null
    match.ball.vx = 0
    match.ball.vy = 0
    match.ball.vz = 0
    match.ball.looseReason = ''
    match.ball.skipFloor = false
    match.ball.lastTeam = player.team
    match.offense = player.team
    placeHeld()
  }

  function layout() {
    const offense = match.offense
    const defense = offense === 'blue' ? 'red' : 'blue'
    const spots = {
      [`${offense}-0`]: { x: 0, z: 11.1, fx: 0, fz: -1 },
      [`${offense}-1`]: { x: -4.8, z: 8.5, fx: 0, fz: -1 },
      [`${offense}-2`]: { x: 4.8, z: 8.5, fx: 0, fz: -1 },
      [`${defense}-0`]: { x: 0.15, z: 9.25, fx: 0, fz: 1 },
      [`${defense}-1`]: { x: -4.3, z: 6.9, fx: 0, fz: 1 },
      [`${defense}-2`]: { x: 4.3, z: 6.9, fx: 0, fz: 1 },
    }
    for (const player of match.players) {
      const spot = spots[player.id]
      Object.assign(player, {
        x: spot.x,
        z: spot.z,
        fx: spot.fx,
        fz: spot.fz,
        vx: 0,
        vz: 0,
        sprinting: false,
        sprintAt: null,
        sprintTime: 0,
        jump: 0,
        jumpY: 0,
        screenUntil: 0,
        skillUntil: 0,
        layup: null,
        gathering: 0,
        celebrate: 0,
        pickedUp: false,
        hasDribbled: false,
        dribbleLive: true,
        holdTime: 0,
        cpuGather: 0,
        bumpUntil: 0,
        reboundUntil: 0,
      })
    }
  }

  function faceBasket(player) {
    const dx = court.rim.x - player.x
    const dz = court.rim.z - player.z
    const len = Math.hypot(dx, dz) || 1
    player.fx = dx / len
    player.fz = dz / len
  }

  function burst(player, forward, lateral, dur) {
    const handSign = player.ballHand === 'left' ? -1 : 1
    const rx = -player.fz
    const rz = player.fx
    player.skillBurst = {
      x: rx * handSign * lateral + player.fx * forward,
      z: rz * handSign * lateral + player.fz * forward,
      until: match.time + dur,
      dur,
    }
    player.skillUntil = match.time + dur
    player.vx *= 0.15
    player.vz *= 0.15
    chirp(player)
  }

  let squeaksThisFrame = 0

  function cue(name, rate, gain) {
    if (match.sounds.length >= 8) return
    match.sounds.push({ name, rate, gain })
  }

  function chirp(player) {
    if (squeaksThisFrame >= 2) return
    if (player.squeakAt != null && match.time - player.squeakAt < tuning.audio.squeakGap) return
    player.squeakAt = match.time
    squeaksThisFrame += 1
    const speed = Math.hypot(player.vx || 0, player.vz || 0)
    cue('squeak', 0.92 + Math.min(0.2, speed * 0.03), tuning.audio.squeak)
  }

  function applyMove(player, move) {
    if (move === 'crossover') burst(player, 0.12, 0.7, 0.3)
    else if (move === 'between') burst(player, 0.48, 0.08, 0.28)
    else if (move === 'behind') burst(player, 0.22, -0.62, 0.36)
    else burst(player, 0.42, -0.9, 0.42)
  }

  function applySkill(player, skill) {
    const sign = skill.starter === 'dribble' ? 1 : -1
    if (skill.family === 'saw' && skill.starter === 'dribble') burst(player, -0.48, 0.12 * sign, 0.38)
    else if (skill.family === 'saw') burst(player, 0.12, 0.95 * sign, 0.2)
    else if (skill.starter === 'dribble') burst(player, 0.22, 1.15 * sign, 0.5)
    else burst(player, 0.62, 1.25 * sign, 0.34)
    say(skill.name)
  }

  function contest(shooter) {
    let pen = 0
    let closest = null
    let closestGap = 99
    for (const defender of match.players) {
      if (defender.team === shooter.team) continue
      const gap = dist(defender, shooter)
      if (gap < closestGap) {
        closest = defender
        closestGap = gap
      }
      if (gap < 1.15) pen += 0.22
      else if (gap < 2.2) pen += 0.1
      if ((defender.jumpY || 0) > 0.35 && gap < 2.1) pen += 0.12
    }
    if (closest && closestGap < 2.35) {
      closest.contestArm = Math.max(closest.contestArm || 0, closestGap < 1.25 ? 0.95 : 0.62)
    }
    return clamp(1 - pen, 0.38, 1)
  }

  function releaseShot(shooter, kind, quality, side) {
    if (!shooter) return
    const rimD = dist(shooter, court.rim)
    let chance = tuning.shot[kind] ?? 0.5
    if (kind === 'quick') {
      if (rimD < 3) chance *= 1
      else if (rimD < 6) chance *= 0.74
      else if (rimD < 8.2) chance *= 0.42
      else chance *= 0.26
    }
    const timed = quality == null ? 0.78 : quality
    if (quality != null) chance *= quality
    const pressure = contest(shooter)
    chance *= pressure
    const make = match.rand() < clamp(chance, 0.06, 0.94)
    const sideSign = side === 'left' ? -1 : side === 'right' ? 1 : Math.sign(shooter.x) || 1
    const miss = (1.05 - timed) * 0.9 + (1 - pressure) * 0.75
    const to = make
      ? { x: court.rim.x, y: court.rim.y, z: court.rim.z }
      : {
          x: court.rim.x + sideSign * (0.26 + miss),
          y: court.rim.y + (timed < 0.5 ? -0.08 : 0.24),
          z: court.rim.z + (timed < 0.5 ? 0.55 : 0.08),
        }
    const from = handPoint(shooter, false)
    from.y = Math.max(from.y, kind === 'layup' ? 1.7 : 2.15)
    const flight = {
      layup: { dur: 0.34 + rimD * 0.015, arc: 0.48 },
      quick: { dur: 0.55 + rimD * 0.04, arc: 1.05 + rimD * 0.04 },
      jumper: { dur: 0.7 + rimD * 0.045, arc: 1.75 + rimD * 0.06 },
      three: { dur: 0.86 + rimD * 0.03, arc: 2.2 + rimD * 0.04 },
    }[kind] || { dur: 0.6 + rimD * 0.04, arc: 1.4 }
    flight.arc *= 0.62 + timed * 0.5
    flight.arc *= 0.74 + pressure * 0.26
    if (timed >= 0.99 && make) flight.arc *= 1.08
    match.ball.mode = 'shot'
    match.ball.owner = null
    match.ball.from = from
    match.ball.to = to
    match.ball.t = 0
    match.ball.dur = flight.dur
    match.ball.arc = flight.arc
    match.ball.lastTeam = shooter.team
    match.ball.make = make
    match.ball.shooterId = shooter.id
    match.ball.kind = kind
    match.ball.points = kind === 'layup' ? 2 : rimD >= tuning.threeDist - 0.05 ? 3 : 2
    match.ball.through = 0
    match.ball.scored = false
    match.ball.x = from.x
    match.ball.y = from.y
    match.ball.z = from.z
    shooter.gathering = 0
    shooter.layup = null
    shooter.cpuGather = 0
    shooter.shotArm = kind === 'layup' ? 0.28 : 0.62
    if (kind === 'jumper' || kind === 'three') shooter.jump = Math.max(shooter.jump, 0.08)
    match.phase = 'play'
    match.meter = null
  }

  function leadCatch(to) {
    const toRimX = court.rim.x - to.x
    const toRimZ = court.rim.z - to.z
    const rimLen = Math.hypot(toRimX, toRimZ) || 1
    const ux = toRimX / rimLen
    const uz = toRimZ / rimLen
    const toward = (to.vx || 0) * ux + (to.vz || 0) * uz
    const cutting = toward > 1.15 || ((to.cutting || to.signal > 0) && toward > 0.35)
    if (!cutting) return { cutting: false, point: handPoint(to, false) }
    const lead = clamp(0.65 + Math.hypot(to.vx || 0, to.vz || 0) * 0.26 + toward * 0.16, 0.75, Math.max(0.75, rimLen - 0.8))
    return {
      cutting: true,
      point: {
        x: clamp(to.x + ux * lead, court.minX + 0.4, court.maxX - 0.4),
        y: 1.22,
        z: clamp(to.z + uz * lead, 0.9, court.maxZ - 0.4),
      },
    }
  }

  function passTo(from, to) {
    if (!from || !to || to === from || match.ball.owner !== from) return
    const lead = leadCatch(to)
    const gap = Math.hypot(lead.point.x - from.x, lead.point.z - from.z)
    match.ball.mode = 'pass'
    match.ball.owner = null
    match.ball.targetId = to.id
    match.ball.from = handPoint(from, false)
    match.ball.to = lead.point
    match.ball.lead = lead.cutting
    match.ball.t = 0
    match.ball.dur = (lead.cutting ? 0.3 : 0.38) + gap * 0.07
    match.ball.arc = lead.cutting ? 0.4 : 0.72
    match.ball.lastTeam = from.team
    from.dribbleLive = false
    from.layup = null
    const marker = nearest(match.players.filter((p) => p.team !== to.team), to)
    const cover = marker ? dist(marker, to) : 9
    const lane = Math.abs(to.x) < court.keyHalf + 0.2 && to.z < court.ftZ
    match.ball.risky = lane && cover < 1.45
    match.ball.easy = !lane && cover > 2.35
    match.ball.riskRolled = false
    if (match.ball.easy) match.ball.dur *= 0.88
    say('Pass')
  }

  function startLayup(player, side) {
    player.layup = { side: side === 'left' ? -1 : 1, t: 0 }
    player.gathering = 0.4
  }

  function startMeter(player) {
    match.phase = 'meter'
    match.meter = { t: 0, shooterId: player.id }
    player.gathering = 1
    player.layup = null
    say('Lift to shoot', 0.8)
  }

  function meterPos() {
    if (!match.meter) return null
    const x = (match.meter.t * tuning.meter.hz) % 2
    return x < 1 ? x : 2 - x
  }

  function meterShooter() {
    return byId(match.meter?.shooterId)
  }

  function releaseMeter() {
    const shooter = byId(match.meter?.shooterId)
    const pos = meterPos()
    match.meter = null
    if (!shooter) {
      match.phase = 'play'
      return
    }
    const delta = Math.abs((pos ?? 0) - 0.5)
    let quality = 0.16
    if (delta < tuning.meter.perfect) quality = 1
    else if (delta < tuning.meter.good) quality = 0.8
    else if (delta < tuning.meter.ok) quality = 0.48
    const grade = quality >= 1 ? 'Perfect' : quality >= 0.8 ? 'Good' : quality >= 0.48 ? 'Late' : 'Short'
    say(grade, 0.7, quality >= 1 ? 'make' : quality < 0.5 ? 'miss' : '')
    const kind = dist(shooter, court.rim) >= tuning.threeDist - 0.15 ? 'three' : 'jumper'
    releaseShot(shooter, kind, quality, Math.sign(shooter.x) >= 0 ? 'right' : 'left')
  }

  function whiffReach(defender, handler) {
    defender.recover = {
      x: handler.x + (court.rim.x - handler.x) * 0.28,
      z: Math.max(court.minZ, handler.z + (court.rim.z - handler.z) * 0.2),
      until: match.time + 0.48,
    }
    defender.contestArm = Math.max(defender.contestArm || 0, 0.7)
    say('Missed reach', 0.9, 'whiff')
  }

  function trySteal(defender) {
    const handler = match.ball.owner
    if (!handler || handler.team === defender.team || match.ball.mode !== 'held') {
      say('No reach')
      return
    }
    const gap = dist(defender, handler)
    defender.jump = Math.max(defender.jump, 0.01)
    if (gap > tuning.steal.range) {
      say('Too far')
      return
    }
    let chance = tuning.steal.base
    chance += (1 - gap / tuning.steal.range) * tuning.steal.close
    chance += defender.skill * tuning.steal.skill
    if (defender.sprinting) chance += tuning.steal.sprint
    chance += Math.min(defender.sprintTime, 0.8) * tuning.steal.sprintTime
    chance += Math.min(handler.holdTime, 3.2) * tuning.steal.hold
    if (handler.skillUntil > match.time) chance -= tuning.steal.skillPenalty
    chance = clamp(chance, 0.04, tuning.steal.max)
    if (match.rand() < chance) {
      giveBall(defender)
      say('Steal')
    } else whiffReach(defender, handler)
  }

  function popLoose(reason, text) {
    match.ball.mode = 'loose'
    match.ball.owner = null
    match.ball.looseReason = reason
    match.ball.vx = (match.ball.x - court.rim.x) * 1.5 + (match.rand() - 0.5) * 1.4
    match.ball.vz = 2.6 + match.rand()
    match.ball.vy = 2.3
    match.ball.y = Math.max(match.ball.y, 2.1)
    match.phase = 'play'
    match.meter = null
    say(text)
  }

  function tryBlock(defender) {
    defender.jump = Math.max(defender.jump, 0.01)
    defender.reboundUntil = match.time + 0.7
    defender.contestArm = Math.max(defender.contestArm || 0, 0.9)
    if (match.ball.mode !== 'shot') {
      say('Hands up')
      return
    }
    const gap = Math.hypot(defender.x - match.ball.x, defender.z - match.ball.z)
    const along = match.ball.t / match.ball.dur
    if (gap > tuning.block.range) {
      say('Too far')
      return
    }
    if (along < tuning.block.start) {
      say('Early')
      return
    }
    if (along > tuning.block.end) {
      say('Late')
      return
    }
    popLoose('block', 'Block')
  }

  function tryJump(defender) {
    defender.jump = Math.max(defender.jump, 0.01)
    defender.reboundUntil = match.time + 0.75
    if (match.ball.mode === 'shot') {
      tryBlock(defender)
      return
    }
    const handler = match.ball.owner
    if (match.ball.mode === 'loose') {
      const gap = dist(defender, match.ball)
      if (gap < 1.45 && match.ball.y < 2.3) {
        giveBall(defender)
        say('Rebound')
        return
      }
    }
    if (handler && handler.team !== defender.team && handler.holdTime > 0.7 && dist(defender, handler) < 1.6) {
      const saved = handler.holdTime
      handler.holdTime = Math.max(handler.holdTime, 2.5)
      trySteal(defender)
      if (match.ball.owner === handler) handler.holdTime = saved
      return
    }
    say('Jump')
  }

  function applyDribble(me, input) {
    if (!me || match.ball.owner !== me || match.ball.mode !== 'held') return
    if (input.handSwitch && me.dribbleLive && !me.pickedUp) {
      me.ballHand = input.handSwitch.hand
      applyMove(me, input.handSwitch.move)
    }
    if (input.dribbleDown && !me.pickedUp) {
      me.dribbleLive = true
      me.hasDribbled = true
    }
    if (input.expired && me.hasDribbled) {
      me.dribbleLive = false
      me.pickedUp = true
      me.pivotX = me.x
      me.pivotZ = me.z
    }
    if (input.skill && me.dribbleLive && !me.pickedUp) applySkill(me, input.skill)
  }

  function applyAction(me, input) {
    if (!me || !input.action || match.phase !== 'play') return
    const dir = input.action.dir || { x: 0, y: 1 }
    const aim = input.aim
    if (me.team === match.offense && match.ball.owner === me && match.ball.mode === 'held') {
      let bestMate = null
      let bestDot = 0
      for (const mate of aim?.mates || []) {
        const player = byId(mate.id)
        const marker = player && nearest(match.players.filter((p) => p.team !== player.team), player)
        const gap = marker && player ? dist(marker, player) : 6
        const lane = player && Math.abs(player.x) < court.keyHalf + 0.2 && player.z < court.ftZ
        const need = lane && gap < 1.6 ? 0.93 : !lane && gap > 2.2 ? 0.58 : 0.74
        const dot = aimDot(dir, aim.me, mate)
        if (dot >= need && dot > bestDot) {
          bestDot = dot
          bestMate = mate
        }
      }
      const basketDot = aimDot(dir, aim?.me, aim?.basket)
      const closeFinish = dist(me, court.rim) < 1.75 && dir.y > 0.2
      if (bestMate && bestDot >= basketDot - 0.04 && input.action.type !== 'double') {
        passTo(me, byId(bestMate.id))
        return
      }
      if (input.action.type === 'double' && (basketDot > 0.45 || closeFinish)) {
        startMeter(me)
        return
      }
      if (basketDot > 0.58 || closeFinish) {
        const basketV = {
          x: (aim?.basket?.x ?? 0) - (aim?.me?.x ?? 0),
          y: -((aim?.basket?.y ?? 0) - (aim?.me?.y ?? 0)),
        }
        const cross = basketV.x * dir.y - basketV.y * dir.x
        const side = cross >= 0 ? 'left' : 'right'
        if (input.sprint || me.sprinting) startLayup(me, side)
        else releaseShot(me, 'quick', null, side)
      }
      return
    }
    if (me.team !== match.offense) {
      if (input.action.type === 'double') {
        tryJump(me)
        return
      }
      const basketDot = aimDot(dir, aim?.me, aim?.basket)
      const stealDot = aim?.handler ? aimDot(dir, aim.me, aim.handler) : -1
      if (stealDot > basketDot && stealDot > 0.52) trySteal(me)
      else if (basketDot > 0.52) tryBlock(me)
    }
  }

  function updateLayups(dt) {
    for (const player of match.players) {
      if (!player.layup || match.ball.owner !== player) continue
      player.layup.t += dt
      const tx = court.rim.x + player.layup.side * 0.7
      const tz = court.rim.z + 0.95
      const dx = tx - player.x
      const dz = tz - player.z
      const len = Math.hypot(dx, dz) || 1
      const step = Math.min(len, tuning.speed.layup * dt)
      player.x += (dx / len) * step
      player.z += (dz / len) * step
      player.fx = dx / len
      player.fz = dz / len
      player.sprinting = true
      player.gathering = 0.55
      if (len < 1.15 || player.layup.t > 0.42) {
        const side = player.layup.side < 0 ? 'left' : 'right'
        releaseShot(player, 'layup', null, side)
      }
    }
  }

  function moveControlled(me, input, basis, dt) {
    if (!me || !basis || me.layup || match.phase === 'meter') return
    let move = input.move || { x: 0, y: 0 }
    let sprint = !!input.sprint
    if (me.team !== match.offense) {
      match.lag.push({ t: match.time, move: { x: move.x, y: move.y }, sprint })
      while (match.lag.length && match.time - match.lag[0].t > 0.6) match.lag.shift()
      const want = match.time - tuning.defenseLag
      let sample = match.lag[0]
      for (const item of match.lag) if (item.t <= want) sample = item
      if (sample) {
        move = sample.move
        sprint = sample.sprint
      }
    } else if (match.lag.length) match.lag.length = 0

    const wx = basis.right.x * move.x + basis.forward.x * move.y
    const wz = basis.right.z * move.x + basis.forward.z * move.y
    const mag = Math.hypot(wx, wz)
    let tvx = 0
    let tvz = 0
    let speed = 0
    let stopping = true
    const bursting = me.skillBurst && me.skillBurst.until > match.time
    const recovering = !!(me.recover && me.recover.until > match.time)
    if (bursting) {
      const burstMove = me.skillBurst
      tvx = burstMove.x / burstMove.dur
      tvz = burstMove.z / burstMove.dur
      speed = Math.hypot(tvx, tvz)
      stopping = false
      me.sprinting = false
    } else if (mag > 0.08) {
      const nx = wx / mag
      const nz = wz / mag
      const scale = Math.min(mag, 1)
      speed = sprint ? tuning.speed.sprint : match.ball.owner === me && me.dribbleLive ? tuning.speed.dribble : tuning.speed.jog
      if (me.team !== match.offense) speed = sprint ? tuning.speed.defendSprint : tuning.speed.defend
      if (me.gathering) speed = Math.min(speed, tuning.speed.gather)
      if (me.bumpUntil > match.time) speed *= 0.45
      tvx = nx * speed * scale
      tvz = nz * speed * scale
      stopping = false
      me.sprinting = sprint
      me.fx = nx
      me.fz = nz
    } else if ((match.ball.mode === 'loose' || match.ball.mode === 'shot') && me.team === 'blue') {
      const blues = match.players.filter((player) => player.team === 'blue')
      if (nearest(blues, match.ball) === me) {
        const dx = match.ball.x - me.x
        const dz = match.ball.z - me.z
        const len = Math.hypot(dx, dz) || 1
        speed = tuning.speed.jog
        tvx = (dx / len) * speed
        tvz = (dz / len) * speed
        stopping = false
        me.fx = dx / len
        me.fz = dz / len
      }
      me.sprinting = false
    } else {
      me.sprinting = false
      faceBasket(me)
    }
    if (recovering && !bursting) {
      const rdx = me.recover.x - me.x
      const rdz = me.recover.z - me.z
      const rl = Math.hypot(rdx, rdz) || 1
      const pull = mag < 0.25 ? 1 : 0.45
      const rs = tuning.speed.defendSprint
      tvx = tvx * (1 - pull) + (rdx / rl) * rs * pull
      tvz = tvz * (1 - pull) + (rdz / rl) * rs * pull
      stopping = false
      me.fx = rdx / rl
      me.fz = rdz / rl
    }
    const rate = bursting
      ? tuning.accel.skill
      : stopping
        ? tuning.accel.brake
        : speed >= tuning.speed.sprint - 0.3
          ? tuning.accel.sprint
          : speed >= tuning.speed.cut - 0.25
            ? tuning.accel.cut
            : tuning.accel.dribble
    approach(me, tvx, tvz, dt, rate)
    if (stopping && !bursting && Math.hypot(me.vx, me.vz) < 0.05) {
      me.vx = 0
      me.vz = 0
    }
    me.x += me.vx * dt
    me.z += me.vz * dt
  }

  function separate() {
    const list = match.players
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        let dx = b.x - a.x
        let dz = b.z - a.z
        let gap = Math.hypot(dx, dz)
        const min = 0.86
        if (gap < 0.0001) {
          dx = 0.02
          dz = 0
          gap = 0.02
        }
        if (gap >= min) continue
        const push = (min - gap) / 2
        let aShare = 0.5
        let bShare = 0.5
        if (a.screenUntil > match.time && a.team !== b.team) {
          aShare = 0.08
          bShare = 0.92
          b.bumpUntil = match.time + 0.28
        } else if (b.screenUntil > match.time && a.team !== b.team) {
          bShare = 0.08
          aShare = 0.92
          a.bumpUntil = match.time + 0.28
        }
        a.x -= (dx / gap) * push * 2 * aShare
        a.z -= (dz / gap) * push * 2 * aShare
        b.x += (dx / gap) * push * 2 * bShare
        b.z += (dz / gap) * push * 2 * bShare
      }
    }
  }

  function bounds() {
    for (const player of match.players) {
      const dx = player.x
      const dz = player.z - 0.32
      const gap = Math.hypot(dx, dz)
      if (gap < 0.5) {
        player.x += (dx / (gap || 1)) * (0.5 - gap)
        player.z += (dz / (gap || 1)) * (0.5 - gap)
      }
      player.x = clamp(player.x, court.minX, court.maxX)
      player.z = clamp(player.z, court.minZ, court.maxZ)
    }
  }

  function finishScore() {
    if (match.ball.scored) return
    match.ball.scored = true
    const shooter = byId(match.ball.shooterId)
    if (!shooter) return
    match.score[shooter.team] += match.ball.points
    const mates = match.players.filter((player) => player.team === shooter.team && player !== shooter)
    const mate = nearest(mates, shooter)
    const kind = (match.score.blue + match.score.red) % 2 === 0 ? 'bump' : 'five'
    match.phase = 'celebrate'
    match.cele = {
      a: shooter.id,
      b: mate?.id || shooter.id,
      kind,
      t: 0,
      ax: shooter.x,
      az: shooter.z,
      bx: mate?.x ?? shooter.x + 1,
      bz: mate?.z ?? shooter.z,
    }
    match.ball.mode = 'held'
    match.ball.owner = shooter
    shooter.dribbleLive = false
    placeHeld()
    const label = match.ball.points === 3 ? 'Three' : 'Bucket'
    say(label, 1.75, 'make')
  }

  function updateCelebrate(dt) {
    const cele = match.cele
    if (!cele) {
      match.phase = 'play'
      return
    }
    cele.t += dt
    const a = byId(cele.a)
    const b = byId(cele.b)
    const mx = (cele.ax + cele.bx) / 2
    const mz = (cele.az + cele.bz) / 2
    let dx = cele.bx - cele.ax
    let dz = cele.bz - cele.az
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    const gap = cele.kind === 'bump' ? 0.48 : 0.72
    const u = clamp(cele.t / 0.42, 0, 1)
    if (a) {
      a.x = cele.ax + (mx - dx * gap - cele.ax) * u
      a.z = cele.az + (mz - dz * gap - cele.az) * u
      a.fx = dx
      a.fz = dz
    }
    if (b && b !== a) {
      b.x = cele.bx + (mx + dx * gap - cele.bx) * u
      b.z = cele.bz + (mz + dz * gap - cele.bz) * u
      b.fx = -dx
      b.fz = -dz
    }
    const contact = cele.t > 0.42 ? clamp((cele.t - 0.42) / 0.18, 0, 1) : 0
    for (const player of match.players) {
      player.celebrate = 0
      player.sprinting = false
      player.jump = 0
    }
    if (a) {
      a.celebrate = contact
      a.celeKind = cele.kind
    }
    if (b) {
      b.celebrate = contact
      b.celeKind = cele.kind
    }
    placeHeld()
    if (cele.t > 1.35) {
      const scorer = byId(cele.a)
      beginCheck(scorer?.team === 'red' ? 'blue' : 'red', 'Pick it up')
    }
  }

  function beginCheck(team, text) {
    match.offense = team
    match.phase = 'check'
    match.check = { team, stage: 'pickup', t: 0 }
    match.cele = null
    match.meter = null
    match.ballSide = 0
    match.swingUntil = 0
    match.lag.length = 0
    for (const player of match.players) {
      player.layup = null
      player.cpuGather = 0
      player.gathering = 0
      player.cutting = false
      player.signal = 0
      player.skillBurst = null
      player.celebrate = 0
      player.sprinting = false
    }
    const heldByOther = match.ball.mode === 'held' && match.ball.owner && match.ball.owner.team !== team
    if (heldByOther || (match.ball.mode !== 'loose' && match.ball.mode !== 'held')) {
      const owner = match.ball.owner
      match.ball.mode = 'loose'
      match.ball.owner = null
      match.ball.targetId = null
      match.ball.looseReason = 'check'
      match.ball.vx = 0
      match.ball.vz = 0.15
      match.ball.vy = 1.05
      match.ball.y = Math.max(match.ball.y, 0.9)
      if (owner) owner.dribbleLive = false
    }
    match.ball.x = clamp(match.ball.x, -court.width / 2 + 0.6, court.width / 2 - 0.6)
    match.ball.z = clamp(match.ball.z, 0.7, court.length - 0.6)
    say(text, 1.6)
  }

  function checkSpots() {
    const team = match.check.team
    const offense = match.players.filter((player) => player.team === team)
    const defense = match.players.filter((player) => player.team !== team)
    const handler = match.ball.mode === 'held' && match.ball.owner?.team === team ? match.ball.owner : null
    const spots = new Map()
    const wings = offense.filter((player) => player !== handler)
    if (handler) spots.set(handler, { x: 0, z: 11.35, fx: 0, fz: -1, role: 'handle' })
    wings.forEach((player, index) => {
      const side = index % 2 === 0 ? -1 : 1
      spots.set(player, { x: side * (4.6 + (index > 1 ? 1.1 : 0)), z: handler ? 8.5 : 9.2, fx: 0, fz: -1, role: 'wing' })
    })
    const checker = nearest(defense, { x: 0, z: 10.2 })
    if (checker) spots.set(checker, { x: 0, z: 9.85, fx: 0, fz: 1, role: 'check' })
    defense.filter((player) => player !== checker).forEach((player, index) => {
      const side = index % 2 === 0 ? -1 : 1
      spots.set(player, { x: side * 4.15, z: 6.9, fx: 0, fz: 1, role: 'wing' })
    })
    return spots
  }

  function updateCheck(dt) {
    const check = match.check
    if (!check) {
      match.phase = 'play'
      return
    }
    check.t += dt
    const team = check.team
    if (check.stage === 'pickup' && match.ball.mode === 'held' && match.ball.owner?.team === team) {
      check.stage = 'form'
      check.t = 0
      say('Bring it up', 1.3)
    } else if (check.stage === 'pickup' && check.t > 4.5) {
      const getter = nearest(match.players.filter((player) => player.team === team), match.ball)
      if (getter) {
        getter.x = match.ball.x
        getter.z = match.ball.z
        giveBall(getter)
        check.stage = 'form'
        check.t = 0
      }
    }
    const spots = checkSpots()
    const chaser = nearest(match.players.filter((player) => player.team === team), match.ball)
    for (const player of match.players) {
      player.signal = 0
      player.cutting = false
      const spot = spots.get(player)
      const chasing = check.stage === 'pickup' && match.ball.mode !== 'held' && player === chaser
      if (chasing) {
        drive(player, match.ball.x, match.ball.z, tuning.speed.check, dt, match.time)
        continue
      }
      if (!spot) continue
      drive(player, spot.x, spot.z, tuning.speed.check, dt, match.time)
      if (Math.hypot(spot.x - player.x, spot.z - player.z) < 0.4) {
        player.fx = spot.fx
        player.fz = spot.fz
      }
    }
    const handler = match.ball.mode === 'held' ? match.ball.owner : null
    const checker = [...spots.entries()].find((entry) => entry[1].role === 'check')?.[0]
    if (check.stage === 'form') {
      const ready = handler && checker
        && dist(handler, { x: 0, z: 11.35 }) < 0.9
        && dist(checker, { x: 0, z: 9.85 }) < 0.95
      if (ready || check.t > 7.5) {
        check.stage = 'tap'
        check.t = 0
        say('Check', 0.8)
      }
    }
    if (check.stage === 'tap' && handler && checker) {
      handler.vx = 0
      handler.vz = 0
      checker.vx = 0
      checker.vz = 0
      const dx = handler.x - checker.x
      const dz = handler.z - checker.z
      const len = Math.hypot(dx, dz) || 1
      checker.fx = dx / len
      checker.fz = dz / len
      handler.fx = -dx / len
      handler.fz = -dz / len
      checker.signal = 1
      checker.signalHand = 1
      const mid = Math.sin(Math.min(check.t / 0.5, 1) * Math.PI)
      const hand = handPoint(handler, false)
      match.ball.x = hand.x + (checker.x - hand.x) * 0.38 * mid
      match.ball.z = hand.z + (checker.z - hand.z) * 0.38 * mid
      match.ball.y = hand.y + 0.18 * mid
      if (check.t > 0.55) {
        match.phase = 'play'
        match.check = null
        handler.dribbleLive = true
        handler.hasDribbled = false
        handler.pickedUp = false
        handler.holdTime = 0
        handler.signal = 0
        checker.signal = 0
        say(team === 'blue' ? 'Your ball' : 'Live', 0.9)
      }
    }
  }

  function leftCourt() {
    const ball = match.ball
    if (ball.mode === 'shot' || ball.mode === 'through') return false
    const half = court.width / 2
    const margin = ball.mode === 'held' ? 0.28 : 0.02
    return ball.x < -half - margin || ball.x > half + margin || ball.z < -margin || ball.z > court.length + margin
  }

  function whistleOut() {
    if (match.phase === 'check' || match.phase === 'celebrate') return
    const next = match.ball.lastTeam === 'blue' ? 'red' : 'blue'
    match.ball.mode = 'loose'
    match.ball.owner = null
    match.ball.targetId = null
    match.ball.vx = 0
    match.ball.vz = 0
    match.ball.vy = 0
    match.ball.y = 0.85
    match.ball.looseReason = 'out'
    beginCheck(next, 'Out of bounds')
  }

  function updateBall(dt) {
    const ball = match.ball
    if (ball.mode === 'pass') {
      const target = byId(ball.targetId)
      if (!target) {
        ball.mode = 'loose'
        ball.vy = 1
        return
      }
      const dest = ball.to || handPoint(target, false)
      ball.t += dt
      ball.spin = (ball.spin || 0) + dt * (ball.lead ? 7 : 10)
      const u = clamp(ball.t / ball.dur, 0, 1)
      ball.x = ball.from.x + (dest.x - ball.from.x) * u
      ball.z = ball.from.z + (dest.z - ball.from.z) * u
      ball.y = ball.from.y + (dest.y - ball.from.y) * u + Math.sin(u * Math.PI) * (ball.arc || 0.7)
      const near = Math.hypot(target.x - ball.x, target.z - ball.z)
      if (ball.risky && !ball.riskRolled && u > 0.42) {
        ball.riskRolled = true
        if (match.rand() < 0.62) {
          ball.mode = 'loose'
          ball.owner = null
          ball.targetId = null
          ball.vy = 1.5
          ball.vx = (match.rand() - 0.5) * 2.2
          ball.vz = 1.1
          ball.y = Math.max(ball.y, 1.2)
          ball.looseReason = 'pass'
          say('Tipped', 1, 'miss')
          return
        }
      }
      const catchReach = ball.easy ? 1.75 : 1.45
      if (u >= 1 || (ball.lead && near < 0.7 && u > 0.4)) {
        if (near < catchReach) giveBall(target)
        else {
          ball.mode = 'loose'
          ball.owner = null
          ball.targetId = null
          ball.vy = 0.4
          ball.vx = 0
          ball.vz = 0
          ball.y = Math.max(ball.y, 0.7)
          ball.looseReason = 'pass'
        }
      }
      return
    }
    if (ball.mode === 'shot') {
      ball.t += dt
      ball.spin = (ball.spin || 0) + dt * 6.5
      const u = clamp(ball.t / ball.dur, 0, 1)
      ball.x = ball.from.x + (ball.to.x - ball.from.x) * u
      ball.z = ball.from.z + (ball.to.z - ball.from.z) * u
      ball.y = ball.from.y + (ball.to.y - ball.from.y) * u + Math.sin(u * Math.PI) * ball.arc
      if (u >= 1) {
        if (ball.make) {
          ball.mode = 'through'
          ball.through = 0
          ball.x = court.rim.x
          ball.y = court.rim.y
          ball.z = court.rim.z
          cue('swish', 1, tuning.audio.swish)
        } else {
          ball.mode = 'loose'
          ball.looseReason = 'miss'
          ball.skipFloor = true
          ball.vx = (ball.to.x - court.rim.x) * 3.4
          ball.vz = 2.8
          ball.vy = 2.5
          cue('bounce', 0.72, tuning.audio.miss)
          say('Miss', 1.05, 'miss')
          markRebound()
        }
      }
      return
    }
    if (ball.mode === 'through') {
      ball.through += dt
      ball.x = court.rim.x
      ball.z = court.rim.z
      ball.y = court.rim.y - ball.through * 5.8
      if (ball.through > 0.2) finishScore()
      return
    }
    if (ball.mode === 'loose') {
      ball.spin = (ball.spin || 0) + dt * 11
      ball.vy -= 9.5 * dt
      ball.x += ball.vx * dt
      ball.z += ball.vz * dt
      ball.y += ball.vy * dt
      if (ball.y < 0.16) {
        const falling = ball.vy < -0.8
        if (falling && ball.skipFloor) ball.skipFloor = false
        else if (falling) {
          cue('bounce', 0.86, tuning.audio.bounce * Math.min(1, Math.abs(ball.vy) / 4))
        }
        ball.y = 0.16
        ball.vy = Math.abs(ball.vy) * 0.42
        ball.vx *= 0.8
        ball.vz *= 0.8
      }
    }
  }

  function markRebound() {
    let best = null
    let bestD = 99
    const spot = { x: match.ball.x + match.ball.vx * 0.22, z: match.ball.z + match.ball.vz * 0.22 }
    for (const player of match.players) {
      player.glass = 0
      const gap = dist(player, spot)
      if (gap < bestD) {
        bestD = gap
        best = player
      }
    }
    if (best) best.glass = 1
  }

  function pickup() {
    if (match.ball.mode !== 'loose' || match.ball.y > 1.75) return
    let best = null
    let bestScore = Infinity
    for (const player of match.players) {
      if (match.phase === 'check' && player.team !== match.check?.team) continue
      const reach = player.reboundUntil > match.time ? tuning.reboundReach : tuning.pickup
      const gap = Math.hypot(player.x - match.ball.x, player.z - match.ball.z)
      if (gap > reach) continue
      const score = gap - (player.reboundUntil > match.time ? 0.4 : 0)
      if (score < bestScore) {
        best = player
        bestScore = score
      }
    }
    if (!best) return
    const reason = match.ball.looseReason
    giveBall(best)
    if (reason === 'miss' || reason === 'block') say('Rebound')
  }

  function travel(me) {
    if (match.phase !== 'play' || !me || me.layup) return
    if (match.ball.mode !== 'held' || match.ball.owner !== me) return
    if (!me.pickedUp || !me.hasDribbled || me.dribbleLive) return
    if (dist(me, { x: me.pivotX, z: me.pivotZ }) <= tuning.pivot) return
    const thief = nearest(match.players.filter((player) => player.team !== me.team), me)
    if (!thief) return
    giveBall(thief)
    say('Travel')
  }

  function clocks(dt) {
    for (const player of match.players) {
      if (player.sprinting) {
        if (player.sprintAt == null) {
          player.sprintAt = match.time
          chirp(player)
        }
        player.sprintTime += dt
      } else {
        player.sprintAt = null
        player.sprintTime = 0
      }
      if (player.jump > 0 && player.jump < 1) player.jump = Math.min(1, player.jump + dt / 0.55)
      else if (player.jump >= 1) player.jump = 0
      player.jumpY = player.jump > 0 ? Math.sin(player.jump * Math.PI) * 0.72 : 0
      if (match.phase !== 'meter' && !player.cpuGather && !player.layup) player.gathering = 0
      const speed = Math.hypot(player.vx, player.vz)
      if (speed > 0.2) player.anim += dt * (6.4 + speed * 1.2)
      const inPaint = Math.abs(player.x) < court.keyHalf + 0.05 && player.z < court.ftZ - 0.1
      player.paintTime = inPaint ? player.paintTime + dt : 0
      if (player.shotArm > 0) player.shotArm = Math.max(0, player.shotArm - dt * 0.8)
      if (player.contestArm > 0) player.contestArm = Math.max(0, player.contestArm - dt * 1.35)
      if (player.glass > 0) player.glass = Math.max(0, player.glass - dt * 0.65)
      if (player.skillBurst && player.skillBurst.until <= match.time) player.skillBurst = null
      const dribbling = match.ball.mode === 'held' && match.ball.owner === player && player.dribbleLive
      const prevPhase = player.dribblePhase || 0
      const nextPhase = dribbling ? (match.time * (player.sprinting ? 5.4 : 3.6)) % 1 : 0
      if (dribbling && prevPhase < 0.5 && nextPhase >= 0.5) {
        cue('bounce', player.sprinting ? 1.05 : 0.92, tuning.audio.bounce)
      }
      player.dribblePhase = nextPhase
      if (player.cutting && !player.wasCutting) chirp(player)
      player.wasCutting = !!player.cutting
    }
    if (match.ball.mode === 'held' && match.ball.owner) {
      match.ball.owner.holdTime += dt
      if (match.ball.owner.dribbleLive) match.ball.spin = (match.ball.spin || 0) + dt * (match.ball.owner.sprinting ? 12 : 8)
    }
  }

  function update(dt, input, basis) {
    squeaksThisFrame = 0
    match.time += dt
    if (match.phase === 'celebrate') {
      updateCelebrate(dt)
      return
    }
    if (match.phase === 'check') {
      updateCheck(dt)
      separate()
      bounds()
      if (match.check?.stage !== 'tap') updateBall(dt)
      if (match.phase === 'check') {
        match.ball.x = clamp(match.ball.x, -court.width / 2 + 0.45, court.width / 2 - 0.45)
        match.ball.z = clamp(match.ball.z, 0.55, court.length - 0.45)
      }
      pickup()
      clocks(dt)
      if (match.phase !== 'check' || match.check?.stage !== 'tap') placeHeld()
      return
    }
    const me = controlled()
    applyDribble(me, input)
    if (match.phase === 'meter') {
      if (match.meter) match.meter.t += dt
      if (input.meterRelease || (match.meter && match.meter.t > 2.4)) releaseMeter()
    } else {
      applyAction(me, input)
    }
    updateLayups(dt)
    const actor = controlled()
    if (match.phase !== 'celebrate') moveControlled(actor, input, basis, dt)
    const cpuAction = updateAI(match, dt, controlled())
    if (cpuAction && match.ball.mode === 'held' && match.ball.owner?.team === 'red') {
      if (cpuAction.type === 'pass') passTo(match.ball.owner, byId(cpuAction.id))
      else if (cpuAction.type === 'shot') {
        releaseShot(match.ball.owner, cpuAction.kind, cpuAction.kind === 'layup' ? null : 0.7, cpuAction.side < 0 ? 'left' : 'right')
      }
    }
    separate()
    bounds()
    updateBall(dt)
    if (match.phase === 'celebrate') return
    if (leftCourt()) {
      whistleOut()
      return
    }
    pickup()
    travel(controlled())
    clocks(dt)
    placeHeld()
    if (leftCourt()) whistleOut()
  }

  layout()
  giveBall(byId('blue-0'))
  match.phase = 'play'
  api.byId = byId
  api.controlled = controlled
  return api
}
