import { tuning } from '../tuning.js'
import {
  classifyPath,
  classifySwitch,
  isFastFlick,
  MOVE_NAMES,
  recenter,
  rotatedDribble,
  skillName,
  stickVector,
} from './classify.js'

// The ball-hand half dribbles. The other half sprints. A tap on that other
// half, while the dribble thumb stays down, is a skill. One tap hesitates.
// Two taps wrap. Sprinting changes those into a stutter or a spin cycle.
export function createGestures(target) {
  const pointers = new Map()
  const released = []
  const suppress = new Set()
  let lastLift = null
  let expireAt = 0
  let expiredSent = false
  let dribbleWasDown = false
  let flash = ''
  let flashUntil = 0
  let skillReadyAt = 0
  let pendingTaps = []
  let hand = 'right'
  let playMode = 'offense'
  let seenMode = 'offense'
  let doubleIds = null
  let lastMove = { x: 0, y: 1 }

  function sideOf(x, width) {
    return x < width / 2 ? 'left' : 'right'
  }

  function localPoint(event) {
    const rect = target.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }
  }

  function remember(pointer, now) {
    const last = pointer.path[pointer.path.length - 1]
    if (!last || Math.hypot(pointer.x - last.x, pointer.y - last.y) > 2) {
      pointer.path.push({ x: pointer.x, y: pointer.y, t: now })
      if (pointer.path.length > 48) pointer.path.shift()
    }
  }

  function onDown(event) {
    event.preventDefault()
    try { target.setPointerCapture?.(event.pointerId) } catch { /* already released */ }
    const now = performance.now()
    const point = localPoint(event)
    const side = sideOf(point.x, point.width)
    const pointer = {
      id: event.pointerId,
      x: point.x,
      y: point.y,
      startX: point.x,
      startY: point.y,
      t0: now,
      side,
      path: [{ x: point.x, y: point.y, t: now }],
      sprintArmed: false,
      skillFired: false,
      maybeSwitch: null,
      committedSwitch: false,
    }
    if (side === hand) dribbleWasDown = true
    if (
      lastLift &&
      now - lastLift.t <= tuning.dribbleExpireMs &&
      side !== lastLift.side
    ) {
      pointer.maybeSwitch = {
        from: { x: lastLift.x, y: lastLift.y },
        rotated: lastLift.rotated,
        side,
      }
      lastLift = null
    }
    pointers.set(event.pointerId, pointer)
  }

  function onMove(event) {
    const pointer = pointers.get(event.pointerId)
    if (!pointer) return
    const point = localPoint(event)
    pointer.x = point.x
    pointer.y = point.y
    pointer.side = sideOf(point.x, point.width)
    const next = recenter(pointer.startX, pointer.startY, pointer.x, pointer.y)
    pointer.startX = next.startX
    pointer.startY = next.startY
    remember(pointer, performance.now())
  }

  function onUp(event) {
    const pointer = pointers.get(event.pointerId)
    if (!pointer) return
    const now = performance.now()
    const point = localPoint(event)
    pointer.x = point.x
    pointer.y = point.y
    remember(pointer, now)
    pointer.upAt = now
    pointer.upStats = classifyPath(pointer.path, now)
    pointers.delete(event.pointerId)
    pointer.released = true
    const liftingDribble =
      playMode === 'offense' &&
      pointer.side === hand &&
      dribbleWasDown &&
      !pointer.maybeSwitch &&
      !pointer.skillFired &&
      pointer.upStats.kind !== 'swipe' &&
      !(doubleIds && doubleIds.includes(pointer.id))
    if (liftingDribble) {
      lastLift = {
        x: pointer.x,
        y: pointer.y,
        t: now,
        side: pointer.side,
        rotated: rotatedDribble(pointer.path, now),
      }
      expireAt = now + tuning.dribbleExpireMs
      expiredSent = false
    }
    released.push(pointer)
  }


  target.addEventListener('pointerdown', onDown)
  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', onUp)
  target.addEventListener('pointercancel', onUp)
  target.addEventListener('contextmenu', (event) => event.preventDefault())

  function commitSwitch(pointer, ctx, now) {
    if (!pointer.maybeSwitch || pointer.committedSwitch) return null
    pointer.committedSwitch = true
    lastLift = null
    expireAt = 0
    expiredSent = false
    const move = classifySwitch(
      pointer.maybeSwitch.from,
      { x: pointer.x, y: pointer.y },
      ctx.facingScreen,
      ctx.playerUp,
      pointer.maybeSwitch.rotated,
    )
    hand = pointer.side
    flash = MOVE_NAMES[move]
    flashUntil = now + 900
    return { move, hand }
  }

  function frame(now, ctx) {
    hand = ctx.ballHand === 'left' ? 'left' : 'right'
    const mode = ctx.mode === 'defense' ? 'defense' : 'offense'
    playMode = mode
    if (mode !== seenMode) {
      flash = ''
      flashUntil = 0
      seenMode = mode
    }
    if (mode === 'defense') {
      dribbleWasDown = false
      expireAt = 0
      lastLift = null
      pendingTaps = []
    }
    const events = released.splice(0, released.length)
    let handSwitch = null
    let action = null
    let skill = null
    let meterRelease = false

    for (const pointer of events) {
      if (suppress.has(pointer.id)) {
        suppress.delete(pointer.id)
        continue
      }
      const travel = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY)
      const held = (pointer.upAt || now) - pointer.t0
      const dribbleHeld = mode === 'offense' && [...pointers.values()].some((item) => item.side === hand)
      const tap =
        dribbleHeld &&
        pointer.side !== hand &&
        !pointer.maybeSwitch &&
        held <= tuning.tapMs &&
        travel <= tuning.tapDist &&
        pointer.upStats.kind !== 'swipe'
      if (tap) {
        pendingTaps.push(now)
        continue
      }
      if (pointer.upStats.kind === 'swipe') pendingTaps = []
      if (pointer.maybeSwitch && !pointer.committedSwitch) {
        if (pointer.upStats.kind === 'swipe') {
          action = { type: 'swipe', dir: pointer.upStats.dir, side: pointer.side }
          lastLift = null
          continue
        }
        handSwitch = commitSwitch(pointer, ctx, now)
      } else if (!pointer.skillFired && pointer.upStats.kind === 'swipe' && !doubleIds) {
        action = { type: 'swipe', dir: pointer.upStats.dir, side: pointer.side }
      }
    }

    if (doubleIds && doubleIds.every((id) => !pointers.has(id))) {
      if (ctx.metering || mode === 'defense') meterRelease = true
      doubleIds = null
    }

    for (const pointer of pointers.values()) {
      const stick = stickVector(pointer.startX, pointer.startY, pointer.x, pointer.y)
      const forward = stick.y > tuning.sprintForward && stick.y > Math.abs(stick.x) * tuning.sprintDominance
      if (forward) pointer.sprintArmed = true
      if (
        pointer.maybeSwitch &&
        !pointer.committedSwitch &&
        now - pointer.t0 >= tuning.switchHoldMs
      ) {
        const stats = classifyPath(pointer.path, now)
        if (stats.kind !== 'swipe') handSwitch = commitSwitch(pointer, ctx, now) || handSwitch
      }
    }

    if (handSwitch) hand = handSwitch.hand

    const dribbleSide = hand
    const sprintSide = hand === 'left' ? 'right' : 'left'
    let dribblePointer = null
    let sprintPointer = null
    for (const pointer of pointers.values()) {
      if (pointer.side === dribbleSide && !dribblePointer) dribblePointer = pointer
      if (pointer.side === sprintSide && !sprintPointer) sprintPointer = pointer
    }

    if (!doubleIds && pointers.size >= 2) {
      const left = [...pointers.values()].find((p) => p.side === 'left')
      const right = [...pointers.values()].find((p) => p.side === 'right')
      if (left && right && isFastFlick(left.path, now) && isFastFlick(right.path, now)) {
        const a = classifyPath(left.path, now).dir
        const b = classifyPath(right.path, now).dir
        const dot = a.x * b.x + a.y * b.y
        if (dot > 0.55) {
          doubleIds = [left.id, right.id]
          left.skillFired = true
          right.skillFired = true
          suppress.add(left.id)
          suppress.add(right.id)
          const dir = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          const mag = Math.hypot(dir.x, dir.y) || 1
          dir.x /= mag
          dir.y /= mag
          action = { type: 'double', dir, side: 'center' }
          flash = mode === 'defense' ? 'Jump' : ''
          flashUntil = now + 900
        }
      }
    }

    const sticks = []
    for (const pointer of pointers.values()) {
      const stick = stickVector(pointer.startX, pointer.startY, pointer.x, pointer.y)
      if (stick.mag > 0) sticks.push({ pointer, stick })
    }

    let move = { x: 0, y: 0 }
    if (mode === 'offense') {
      const dribbleStick = sticks.find((s) => s.pointer === dribblePointer)
      const sprintStick = sticks.find((s) => s.pointer === sprintPointer)
      if (dribbleStick && dribbleStick.stick.mag > 0.08) move = dribbleStick.stick
      else if (sprintStick && sprintStick.stick.mag > 0.08) move = sprintStick.stick
    } else if (sticks.length) {
      let x = 0
      let y = 0
      for (const item of sticks) {
        x += item.stick.x
        y += item.stick.y
      }
      move = { x: x / sticks.length, y: y / sticks.length }
    }

    let sprint = false
    if (mode === 'offense') {
      const sprintSideArmed = !!sprintPointer?.sprintArmed
      const bothForward = !!(dribblePointer?.sprintArmed && sprintPointer?.sprintArmed)
      sprint = sprintSideArmed || bothForward
    } else {
      sprint = [...pointers.values()].some((pointer) => pointer.sprintArmed)
    }

    if (move.x * move.x + move.y * move.y > 0.02) lastMove = { x: move.x, y: move.y }
    else if (sprint) move = lastMove

    if (
      mode === 'offense' &&
      dribblePointer &&
      pendingTaps.length &&
      now - pendingTaps[pendingTaps.length - 1] >= tuning.tapGapMs &&
      !handSwitch &&
      !action &&
      now >= skillReadyAt
    ) {
      const count = pendingTaps.length
      pendingTaps = []
      const family = count >= 2 ? 'circle' : 'saw'
      const starter = sprint ? 'sprint' : 'dribble'
      skillReadyAt = now + tuning.skillCooldownMs
      skill = { family, starter, name: skillName(family, starter) }
      flash = skill.name
      flashUntil = now + 900
    } else if (!dribblePointer) {
      pendingTaps = []
    }

    const dribbleDown = mode === 'offense' && !!dribblePointer
    let expired = false
    if (dribbleDown) {
      dribbleWasDown = true
      expireAt = 0
      expiredSent = false
      lastLift = null
    } else if (dribbleWasDown && expireAt && now > expireAt && !expiredSent) {
      expired = true
      expiredSent = true
      dribbleWasDown = false
    }

    const readout = now < flashUntil && flash ? flash : ''
    const zones =
      mode === 'defense'
        ? { left: 'move', right: 'move' }
        : {
            left: dribbleSide === 'left' ? 'dribble' : 'sprint',
            right: dribbleSide === 'right' ? 'dribble' : 'sprint',
          }

    return {
      move,
      sprint,
      dribbleDown,
      expired,
      handSwitch,
      skill,
      action,
      meterRelease,
      readout,
      zones,
      hand,
    }
  }

  return { frame }
}
