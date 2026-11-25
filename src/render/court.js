import * as THREE from 'three'
import { court } from '../tuning.js'

function addStripe(parent, x1, z1, x2, z2, width = 0.08, color = 0xf4f1ea) {
  const dx = x2 - x1
  const dz = z2 - z1
  const len = Math.hypot(dx, dz)
  if (len < 0.02) return
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(len, width),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  )
  mesh.rotation.x = -Math.PI / 2
  const group = new THREE.Group()
  group.add(mesh)
  group.position.set((x1 + x2) / 2, 0.03, (z1 + z2) / 2)
  group.rotation.y = Math.atan2(-dz, dx)
  parent.add(group)
}

function addArc(parent, cx, cz, radius, a0, a1, segments, width = 0.08) {
  for (let i = 0; i < segments; i++) {
    const t0 = a0 + ((a1 - a0) * i) / segments
    const t1 = a0 + ((a1 - a0) * (i + 1)) / segments
    addStripe(
      parent,
      cx + Math.sin(t0) * radius,
      cz + Math.cos(t0) * radius,
      cx + Math.sin(t1) * radius,
      cz + Math.cos(t1) * radius,
      width,
    )
  }
}

export function createCourt() {
  const root = new THREE.Group()

  const gym = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 36),
    new THREE.MeshStandardMaterial({ color: 0x4e545c, roughness: 0.95 }),
  )
  gym.rotation.x = -Math.PI / 2
  gym.position.set(0, -0.02, 7)
  root.add(gym)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(court.width, court.length),
    new THREE.MeshStandardMaterial({ color: 0xc9843f, roughness: 0.82 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, court.length / 2)
  root.add(floor)

  const paint = new THREE.Mesh(
    new THREE.PlaneGeometry(court.keyHalf * 2, court.ftZ),
    new THREE.MeshStandardMaterial({ color: 0xb56a30, roughness: 0.88 }),
  )
  paint.rotation.x = -Math.PI / 2
  paint.position.set(0, 0.012, court.ftZ / 2)
  root.add(paint)

  const half = court.width / 2
  addStripe(root, -half, 0.2, half, 0.2)
  addStripe(root, -half, 0.2, -half, court.length)
  addStripe(root, half, 0.2, half, court.length)
  addStripe(root, -half, court.length, half, court.length)
  addStripe(root, -court.keyHalf, 0.2, -court.keyHalf, court.ftZ)
  addStripe(root, court.keyHalf, 0.2, court.keyHalf, court.ftZ)
  addStripe(root, -court.keyHalf, court.ftZ, court.keyHalf, court.ftZ)
  addArc(root, 0, court.ftZ, 1.8, -Math.PI / 2, Math.PI / 2, 18)
  addArc(root, 0, court.length, 1.8, Math.PI / 2, Math.PI * 1.5, 18)
  addArc(root, court.rim.x, court.rim.z, 1.22, -1.05, 1.05, 14, 0.06)

  const arc = 1.18
  addArc(root, court.rim.x, court.rim.z, court.threeR, -arc, arc, 32)
  const ax = Math.sin(arc) * court.threeR
  const az = court.rim.z + Math.cos(arc) * court.threeR
  addStripe(root, -ax, az, -ax, 0.2)
  addStripe(root, ax, az, ax, 0.2)

  const metal = new THREE.MeshStandardMaterial({ color: 0xb7c0c8, roughness: 0.35, metalness: 0.6 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.35, 10), metal)
  pole.position.set(0, 1.67, 0.28)
  root.add(pole)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.05), metal)
  arm.position.set(0, 3.28, 0.78)
  root.add(arm)

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 1.08, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: 0.25, transparent: true, opacity: 0.92 }),
  )
  board.position.set(0, 3.42, 1.18)
  root.add(board)
  const square = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.46, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xd4532b, roughness: 0.4 }),
  )
  square.position.set(0, 3.22, 1.23)
  root.add(square)

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.23, 0.02, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.4, metalness: 0.3 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.set(court.rim.x, court.rim.y, court.rim.z)
  root.add(rim)

  const net = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.14, 0.46, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.75 }),
  )
  net.position.set(court.rim.x, court.rim.y - 0.28, court.rim.z)
  root.add(net)

  return root
}
