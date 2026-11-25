import * as THREE from 'three'

function hang(radius, length, color) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.08, length - radius * 2), 2, 6),
    new THREE.MeshStandardMaterial({ color, roughness: 0.66 }),
  )
  mesh.position.y = -length / 2
  return mesh
}

export function createActor(player) {
  const group = new THREE.Group()
  const skin = 0xd7a37a
  const shortsColor = player.team === 'blue' ? 0x1e3a8a : 0x7f1d1d
  const shoe = player.team === 'blue' ? 0x0f172a : 0x111111
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.02
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe14a, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  const ownerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.54, 0.64, 24),
    new THREE.MeshBasicMaterial({ color: 0xff8a2a, side: THREE.DoubleSide }),
  )
  ownerRing.rotation.x = -Math.PI / 2
  ownerRing.position.y = 0.034
  const glass = new THREE.Mesh(
    new THREE.RingGeometry(0.66, 0.76, 24),
    new THREE.MeshBasicMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  )
  glass.rotation.x = -Math.PI / 2
  glass.position.y = 0.038
  glass.visible = false

  const legL = new THREE.Group()
  const legR = new THREE.Group()
  legL.position.set(-0.12, 0.86, 0)
  legR.position.set(0.12, 0.86, 0)
  legL.add(hang(0.07, 0.78, shortsColor))
  legR.add(hang(0.07, 0.78, shortsColor))
  const footL = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.06, 0.22),
    new THREE.MeshStandardMaterial({ color: shoe, roughness: 0.5 }),
  )
  const footR = footL.clone()
  footL.position.set(0, -0.78, 0.04)
  footR.position.set(0, -0.78, 0.04)
  legL.add(footL)
  legR.add(footR)

  const body = new THREE.Group()
  body.position.y = 0.9
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.34, 3, 8),
    new THREE.MeshStandardMaterial({ color: player.color, roughness: 0.58 }),
  )
  torso.position.y = 0.32
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 10),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.55 }),
  )
  head.position.y = 0.72
  const armL = new THREE.Group()
  const armR = new THREE.Group()
  armL.position.set(-0.28, 0.5, 0)
  armR.position.set(0.28, 0.5, 0)
  armL.add(hang(0.05, 0.5, skin))
  armR.add(hang(0.05, 0.5, skin))
  body.add(torso, head, armL, armR)
  group.add(shadow, ring, ownerRing, glass, legL, legR, body)
  group.scale.setScalar(1.12)
  group.userData = { body, armL, armR, legL, legR, ring, ownerRing, glass, shadow, head }
  return group
}

export function createBall() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const g = canvas.getContext('2d')
  const paint = g.createRadialGradient(46, 42, 8, 64, 64, 64)
  paint.addColorStop(0, '#ff9a3c')
  paint.addColorStop(0.55, '#e36a14')
  paint.addColorStop(1, '#9a3d0c')
  g.fillStyle = paint
  g.beginPath()
  g.arc(64, 64, 64, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#2b140c'
  g.lineWidth = 5
  g.beginPath()
  g.arc(64, 64, 58, 0, Math.PI * 2)
  g.moveTo(64, 6)
  g.lineTo(64, 122)
  g.moveTo(8, 64)
  g.lineTo(120, 64)
  g.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 20, 16),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, emissive: 0x5a240c, emissiveIntensity: 0.22 }),
  )
}

function poseArm(arm, x, z = 0) {
  arm.rotation.set(x, 0, z)
}

export function syncActor(group, player, controlled, hasBall) {
  const speed = Math.hypot(player.vx || 0, player.vz || 0)
  group.position.set(player.x, player.jumpY || 0, player.z)
  group.rotation.order = 'YXZ'
  group.rotation.y = Math.atan2(player.fx || 0, player.fz || -1)
  const { body, armL, armR, legL, legR, ring, ownerRing, glass, shadow, head } = group.userData
  const stride = speed < 0.2 ? 0 : Math.sin(player.anim || 0) * Math.min(0.8, 0.16 + speed * 0.11)
  legL.rotation.x = stride
  legR.rotation.x = -stride
  const forward = (player.fx || 0) * (player.vx || 0) + (player.fz || 0) * (player.vz || 0)
  const side = (player.fz || 0) * (player.vx || 0) - (player.fx || 0) * (player.vz || 0)
  body.rotation.x = Math.max(-0.32, Math.min(0.16, -forward * 0.05))
  body.rotation.z = Math.max(-0.14, Math.min(0.14, side * 0.035))
  body.rotation.y = 0

  const phase = player.dribblePhase || 0
  const down = phase < 0.5 ? phase * 2 : (1 - phase) * 2
  const ballArm = player.ballHand === 'left' ? armL : armR
  const offArm = player.ballHand === 'left' ? armR : armL
  poseArm(armL, -0.22, 0.16)
  poseArm(armR, -0.22, -0.16)
  if (player.dribbleLive && !player.gathering && player.shotArm <= 0.05) {
    poseArm(ballArm, -0.12 - (1 - down) * 0.75, player.ballHand === 'left' ? 0.22 : -0.22)
  }
  poseArm(offArm, -0.28 - stride * 0.55, player.ballHand === 'left' ? -0.16 : 0.16)

  if (player.signal > 0.2) {
    const arm = player.signalHand < 0 ? armL : armR
    poseArm(arm, -2.55, player.signalHand < 0 ? 0.12 : -0.12)
  }
  if (player.shotArm > 0.05) {
    const lift = Math.min(1, player.shotArm / 0.45)
    poseArm(ballArm, -0.2 - 2.15 * lift, player.ballHand === 'left' ? 0.08 : -0.08)
    poseArm(offArm, -0.25 - 0.9 * lift, player.ballHand === 'left' ? -0.2 : 0.2)
  }
  if (player.gathering) {
    poseArm(ballArm, -1.65, player.ballHand === 'left' ? 0.1 : -0.1)
    poseArm(offArm, -1.4, player.ballHand === 'left' ? -0.16 : 0.16)
  }
  if (player.celebrate) {
    const amount = player.celebrate
    if (player.celeKind === 'five') {
      poseArm(armL, -1.25 * amount, 0.2)
      poseArm(armR, -1.25 * amount, -0.2)
    } else {
      body.rotation.x = 0.38 * amount
    }
  }
  if ((player.contestArm || 0) > 0.05 && !player.gathering && player.shotArm <= 0.05) {
    const lift = Math.min(1, player.contestArm)
    poseArm(armL, -0.25 - 2.2 * lift, 0.36)
    poseArm(armR, -0.25 - 2.2 * lift, -0.36)
  }
  if ((player.jumpY || 0) > 0.18) {
    legL.rotation.x = 0.35
    legR.rotation.x = -0.2
  }
  head.rotation.x = player.cutting ? -0.3 : player.gathering ? -0.35 : 0
  ring.visible = !!controlled
  ownerRing.visible = !!hasBall && !controlled
  glass.visible = (player.glass || 0) > 0.05
  glass.material.opacity = Math.max(0.2, player.glass || 0)
  const hop = player.jumpY || 0
  const shadowScale = Math.max(0.5, 1 - hop * 0.5)
  shadow.scale.setScalar(shadowScale)
  shadow.material.opacity = 0.26 * (1 - hop * 0.4)
}
