import { useEffect, useRef, useState } from 'react'
import './Tower3D.css'

// A real WebGL scene. Three.js is loaded as an ES module so the existing
// project does not need a bundler or application-architecture rewrite.
export default function Tower3D({ floors, selectedFloor, onSelectFloor, onWheel }) {
  const hostRef = useRef(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let alive = true
    let renderer, frame = 0, observer, cleanup = () => {}
    const host = hostRef.current
    if (!host) return undefined

    async function boot() {
      try {
        const THREE = await import('https://esm.sh/three@0.180.0')
        if (!alive || !host) return
        const scene = new THREE.Scene()
        scene.background = new THREE.Color('#a8d9ec')
        scene.fog = new THREE.Fog('#a8d9ec', 28, 75)
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 150)
        camera.position.set(11 / zoom, 10 / zoom, 21 / zoom)
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8))
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.15
        renderer.domElement.className = 'tower-webgl'
        renderer.domElement.setAttribute('aria-label', 'Interactive 3D community tower. Drag to rotate, scroll to travel floors.')
        host.replaceChildren(renderer.domElement)

        scene.add(new THREE.HemisphereLight('#e5f7ff', '#527b50', 2.1))
        const sun = new THREE.DirectionalLight('#fff1c8', 3.1)
        sun.position.set(-8, 18, 10)
        sun.castShadow = true
        sun.shadow.mapSize.set(1024, 1024)
        sun.shadow.camera.left = -18
        sun.shadow.camera.right = 18
        sun.shadow.camera.top = 22
        sun.shadow.camera.bottom = -18
        scene.add(sun)

        const mat = (color, roughness = 0.82) => new THREE.MeshStandardMaterial({ color, roughness })
        const grass = mat('#75b96e')
        const earth = mat('#b9d88b')
        const grassDark = mat('#4c965f')
        const trunkMat = mat('#81583d')
        const leafMats = [mat('#398965'), mat('#4d9c6c'), mat('#78b978')]
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), grass)
        ground.rotation.x = -Math.PI / 2
        ground.position.y = -0.2
        ground.receiveShadow = true
        scene.add(ground)

        // Stars sit far above the landscape; they become visible as the tower climbs into space.
        const starPositions = []
        let starSeed = 87431
        const seeded = () => { starSeed = (starSeed * 16807) % 2147483647; return (starSeed - 1) / 2147483646 }
        for (let i = 0; i < 520; i++) {
          starPositions.push((seeded() - 0.5) * 150, 14 + seeded() * 110, (seeded() - 0.5) * 100)
        }
        const starGeometry = new THREE.BufferGeometry()
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
        const starMaterial = new THREE.PointsMaterial({ color: '#ffffff', size: 0.13, transparent: true, opacity: 0, sizeAttenuation: true })
        const stars = new THREE.Points(starGeometry, starMaterial)
        scene.add(stars)

        // Rounded low-poly hills provide a small game-world horizon.
        for (let i = 0; i < 7; i++) {
          const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), i % 2 ? grassDark : earth)
          hill.scale.set(4 + (i % 3), 1.4 + (i % 2) * 0.6, 2.4)
          hill.position.set(-13 + i * 4.5, -0.1, -13 - (i % 3) * 2)
          hill.receiveShadow = true
          scene.add(hill)
        }

        // Distant blocky buildings make the tower feel placed in a world.
        const distantMats = ['#8fb9a0', '#a9c8a8', '#83b0a1'].map(c => mat(c))
        for (let i = 0; i < 14; i++) {
          const h = 1 + (i % 4) * 0.65
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), distantMats[i % distantMats.length])
          b.position.set(-12 + (i * 1.9) % 25, h / 2 - 0.1, -8 - (i % 4) * 1.5)
          b.castShadow = true
          scene.add(b)
        }

        // Little stylized trees, each made from actual 3D meshes.
        function addTree(x, z, scale = 1) {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, 0.9 * scale, 7), trunkMat)
          trunk.position.set(x, 0.35 * scale, z)
          trunk.castShadow = true
          scene.add(trunk)
          for (let j = 0; j < 3; j++) {
            const crown = new THREE.Mesh(new THREE.ConeGeometry((0.72 - j * 0.12) * scale, 1.05 * scale, 7), leafMats[(j + Math.abs(Math.round(x))) % leafMats.length])
            crown.position.set(x, (0.9 + j * 0.47) * scale, z)
            crown.castShadow = true
            crown.receiveShadow = true
            scene.add(crown)
          }
        }
        addTree(-5, 1.8, 1.25)
        addTree(5.2, -0.3, 1.05)
        addTree(-4.7, -3.4, 0.8)
        addTree(4.8, 3.2, 0.75)

        const building = new THREE.Group()
        scene.add(building)
        const floorMeshes = new Map()
        const frontColors = ['#e9a85f', '#e98b63', '#79b9cf', '#a4c979', '#b59ad8', '#e2bd72']
        const sideColors = ['#b97542', '#bd6248', '#4d8fa7', '#699a4c', '#8270a9', '#b88e4d']
        const windowMat = mat('#8ed5dc', 0.38)
        const windowFrameMat = mat('#76513a')
        const trimMat = mat('#f5d69b')
        function makeLabelTexture(text) {
          const canvas = document.createElement('canvas')
          canvas.width = 1024
          canvas.height = 240
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#fff0cb'
          ctx.fillRect(8, 8, 1008, 224)
          ctx.strokeStyle = '#99643f'
          ctx.lineWidth = 7
          ctx.strokeRect(8, 8, 1008, 164)
          ctx.fillStyle = '#4b3324'
          ctx.font = 'bold 48px monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const label = text.length > 26 ? `${text.slice(0, 25)}…` : text
          ctx.fillText(label, 512, 90, 960)
          const texture = new THREE.CanvasTexture(canvas)
          texture.colorSpace = THREE.SRGBColorSpace
          return texture
        }

        const maxKnown = Math.max(1, ...floors.map(f => Number(f.id) || 1))
        // When the database is empty/unconfigured, show clearly marked visual-only
        // placeholder storeys so the 3D design can be judged without inventing users.
        const basePreview = floors.length <= 1
          ? Array.from({ length: 12 }, (_, i) => ({ id: i + 1, author: i === 0 ? (floors[0]?.author || 'founder') : 'preview', preview: i > 0 }))
          : floors
        const visualPreview = basePreview.map(f => Number(f.id) === 2
          ? { ...f, author: 'alex.castle', special: 'bread-mice', preview: false }
          : f)
        const visibleFloors = visualPreview
          .filter(f => Math.abs(Number(f.id) - selectedFloor) <= 11)
          .sort((a, b) => Number(a.id) - Number(b.id))
        const shown = visibleFloors.length ? visibleFloors : [{ id: selectedFloor, author: 'unclaimed' }]
        for (const floor of shown) {
          const n = Number(floor.id)
          const y = (n - 1) * 0.82
          const colorIndex = ((n % frontColors.length) + frontColors.length) % frontColors.length
          const frontMat = mat(frontColors[colorIndex])
          const sideMat = mat(sideColors[colorIndex])
          const shell = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.78, 2.6), [sideMat, sideMat, trimMat, mat('#9b623c'), frontMat, sideMat])
          shell.position.set(0, y, 0)
          shell.castShadow = true
          shell.receiveShadow = true
          shell.userData.floorNumber = n
          building.add(shell)
          floorMeshes.set(n, shell)

          // Thin balcony/ledge on each storey.
          const ledge = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.09, 2.78), trimMat)
          ledge.position.set(0, y - 0.37, 0)
          ledge.castShadow = true
          building.add(ledge)

          // Three inset windows on the front face, with visible frames.
          for (let w = 0; w < 3; w++) {
            const x = -1.05 + w * 1.05
            const frame = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.36, 0.07), windowFrameMat)
            frame.position.set(x, y + 0.04, 1.335)
            building.add(frame)
            const glass = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.23, 0.035), windowMat)
            glass.position.set(x, y + 0.04, 1.38)
            building.add(glass)
          }
          // A smaller window row on the visible side face.
          for (let w = 0; w < 2; w++) {
            const glass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.23, 0.34), windowMat)
            glass.position.set(1.78, y + 0.04, -0.42 + w * 0.82)
            building.add(glass)
          }

          const labelText = floor.special === 'bread-mice'
            ? `FLOOR ${n} · ALEX.CASTLE · BREAD & MICE`
            : floor.preview ? `FLOOR ${n} · PREVIEW`
            : (n === selectedFloor ? `YOU ARE HERE · FLOOR ${n} · @${floor.author || 'unclaimed'}` : `FLOOR ${n} · @${floor.author || 'unclaimed'}`)
          const tex = makeLabelTexture(labelText)
          const badgeMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
          const badge = new THREE.Mesh(new THREE.PlaneGeometry(floor.special === 'bread-mice' ? 3.45 : 3.35, 0.68), badgeMat)
          badge.position.set(0, y - 0.22, 1.46)
          badge.userData.floorNumber = n
          building.add(badge)

          // Alex's special floor: a giant golden loaf and a crowd of tiny 3D mice.
          if (floor.special === 'bread-mice') {
            // A deep, projecting balcony makes Alex's floor a distinct showcase rather than
            // placing the props flat against the building facade.
            const balconyBase = new THREE.Mesh(
              new THREE.BoxGeometry(4.45, 0.16, 1.85),
              mat('#e5c58b', 0.9)
            )
            balconyBase.position.set(0, y - 0.27, 1.82)
            balconyBase.castShadow = true
            balconyBase.receiveShadow = true
            building.add(balconyBase)
            const balconyFront = new THREE.Mesh(
              new THREE.BoxGeometry(4.45, 0.2, 0.12),
              mat('#9b633d', 0.95)
            )
            balconyFront.position.set(0, y - 0.36, 2.72)
            balconyFront.castShadow = true
            building.add(balconyFront)
            const railMat = mat('#f0d9a4', 0.9)
            for (const x of [-2.05, -1.35, -0.65, 0.05, 0.75, 1.45, 2.05]) {
              const post = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.34, 0.055), railMat)
              post.position.set(x, y - 0.02, 2.64)
              building.add(post)
            }
            const rail = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.07, 0.07), railMat)
            rail.position.set(0, y + 0.15, 2.64)
            building.add(rail)

            const breadCrust = mat('#c77a2e', 0.92)
            const breadTop = mat('#e9b85e', 0.88)
            const breadScore = mat('#f6d88a', 0.9)
            const bread = new THREE.Group()
            const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.45, 5, 10), breadCrust)
            loaf.rotation.z = Math.PI / 2
            loaf.scale.set(1, 0.72, 0.8)
            loaf.position.set(-0.1, y + 0.03, 1.9)
            loaf.castShadow = true
            loaf.receiveShadow = true
            bread.add(loaf)
            const top = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.3, 5, 10), breadTop)
            top.rotation.z = Math.PI / 2
            top.scale.set(1, 0.55, 0.7)
            top.position.set(-0.1, y + 0.16, 1.92)
            top.castShadow = true
            bread.add(top)
            // Scored diagonal cuts on the loaf top.
            for (let cut = 0; cut < 4; cut++) {
              const score = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.36), breadScore)
              score.position.set(-0.72 + cut * 0.42, y + 0.39, 1.91)
              score.rotation.y = -0.18
              bread.add(score)
            }
            building.add(bread)

            const mouseBodyMat = mat('#777a80', 0.9)
            const mouseLightMat = mat('#c7c6c0', 0.95)
            const earMat = mat('#e7a4a1', 0.85)
            const tailMat = mat('#b57f77', 0.95)
            const mouseGroup = new THREE.Group()
            for (let m = 0; m < 15; m++) {
              const angle = (m / 15) * Math.PI * 2
              const radius = m < 8 ? 0.82 : 1.22
              const mx = Math.cos(angle) * radius
              const mz = Math.sin(angle) * 0.48 + 2.15
              const mouse = new THREE.Group()
              const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), m % 3 === 0 ? mouseLightMat : mouseBodyMat)
              body.scale.set(1.35, 0.78, 0.9)
              body.position.set(mx, y - 0.12, mz)
              body.castShadow = true
              mouse.add(body)
              const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), mouseBodyMat)
              head.position.set(mx + 0.12, y - 0.07, mz + 0.07)
              mouse.add(head)
              for (const side of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 5), earMat)
                ear.position.set(mx + 0.1, y - 0.005, mz + 0.04 + side * 0.055)
                mouse.add(ear)
              }
              const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.28, 5), tailMat)
              tail.rotation.z = Math.PI / 2
              tail.position.set(mx - 0.18, y - 0.13, mz - 0.08)
              mouse.add(tail)
              mouseGroup.add(mouse)
            }
            building.add(mouseGroup)
          }
        }

        // Rooftop crown and entrance base.
        const topFloor = Math.max(...shown.map(f => Number(f.id)))
        const bottomFloor = Math.min(...shown.map(f => Number(f.id)))
        if (topFloor >= maxKnown) {
          const topY = (topFloor - 1) * 0.82
          const roof = new THREE.Mesh(new THREE.ConeGeometry(2.45, 0.72, 4), mat('#f1d08b'))
          roof.rotation.y = Math.PI / 4
          roof.position.set(0, topY + 0.72, 0)
          roof.castShadow = true
          building.add(roof)
        }
        if (bottomFloor <= 1) {
          const entrance = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.12), mat('#71472f'))
          entrance.position.set(0, -0.02, 1.34)
          building.add(entrance)
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.32, 4.4), mat('#5c9a5f'))
          plinth.position.set(0, -0.54, 0)
          plinth.receiveShadow = true
          plinth.castShadow = true
          scene.add(plinth)
        }

        const target = new THREE.Vector3(0, (selectedFloor - 1) * 0.82 + 0.25, 0)
        function applyZoom(e) {
          const z = Math.max(0.65, Math.min(1.65, Number(e.detail) || 1))
          camera.position.set(11 / z, target.y + 10 / z, 21 / z)
          camera.lookAt(target)
        }
        host.addEventListener('towerlab-zoom', applyZoom)
        cleanup = () => { host.removeEventListener('towerlab-zoom', applyZoom) }
        let targetRot = -0.12
        let currentRot = -0.12
        let drag = false, lastX = 0, lastY = 0, dragStartX = 0
        const raycaster = new THREE.Raycaster()
        const pointer = new THREE.Vector2()
        function resize() {
          if (!alive || !host) return
          const width = Math.max(1, host.clientWidth)
          const height = Math.max(1, host.clientHeight)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.setSize(width, height, false)
        }
        observer = new ResizeObserver(resize)
        observer.observe(host)
        resize()

        function pointerDown(e) { drag = true; lastX = e.clientX; lastY = e.clientY; dragStartX = e.clientX; renderer.domElement.setPointerCapture?.(e.pointerId) }
        function pointerMove(e) {
          if (!drag) return
          const dx = e.clientX - lastX
          const dy = e.clientY - lastY
          targetRot += dx * 0.008
          camera.position.y = Math.max(3, Math.min(17, camera.position.y + dy * -0.025))
          lastX = e.clientX; lastY = e.clientY
        }
        function pointerUp(e) {
          if (!drag) return
          drag = false
          if (Math.abs(e.clientX - dragStartX) < 5) {
            const rect = renderer.domElement.getBoundingClientRect()
            pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
            pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
            raycaster.setFromCamera(pointer, camera)
            const hits = raycaster.intersectObjects(building.children, true)
            const hit = hits.find(h => Number.isFinite(h.object.userData.floorNumber))
            if (hit) onSelectFloor(hit.object.userData.floorNumber)
          }
        }
        renderer.domElement.addEventListener('pointerdown', pointerDown)
        renderer.domElement.addEventListener('pointermove', pointerMove)
        renderer.domElement.addEventListener('pointerup', pointerUp)
        renderer.domElement.addEventListener('pointercancel', pointerUp)
        cleanup = () => {
          renderer.domElement.removeEventListener('pointerdown', pointerDown)
          renderer.domElement.removeEventListener('pointermove', pointerMove)
          renderer.domElement.removeEventListener('pointerup', pointerUp)
          renderer.domElement.removeEventListener('pointercancel', pointerUp)
          observer?.disconnect()
          scene.traverse(o => {
            if (o.geometry) o.geometry.dispose()
            if (o.material) {
              const materials = Array.isArray(o.material) ? o.material : [o.material]
              materials.forEach(m => { if (m.map) m.map.dispose(); m.dispose() })
            }
          })
          renderer.dispose()
        }

        const clock = new THREE.Clock()
        function render() {
          if (!alive) return
          frame = requestAnimationFrame(render)
          const t = clock.getElapsedTime()
          if (!drag) currentRot += (targetRot - currentRot) * 0.035
          building.rotation.y = currentRot + Math.sin(t * 0.18) * 0.035
          // The building stays anchored to the ground; the camera follows the chosen storey upward.
          const height = Math.max(0, selectedFloor - 1)
          const spaceBlend = Math.max(0, Math.min(1, (height - 7) / 15))
          const sky = new THREE.Color('#a8d9ec').lerp(new THREE.Color('#071327'), spaceBlend)
          scene.background.copy(sky)
          scene.fog.color.copy(sky)
          scene.fog.near = 28 + spaceBlend * 25
          scene.fog.far = 75 + spaceBlend * 45
          starMaterial.opacity = spaceBlend * 0.95
          stars.visible = spaceBlend > 0.01
          // Smooth camera rise keeps the selected floor centred and reveals the sky at height.
          const cameraTargetY = (selectedFloor - 1) * 0.82 + 0.25
          camera.position.x = (11 / zoom) + Math.sin(t * 0.13) * 0.22
          camera.position.y = cameraTargetY + 10 / zoom
          camera.position.z = 21 / zoom
          target.y = cameraTargetY
          camera.lookAt(target)
          renderer.render(scene, camera)
        }
        render()
      } catch (err) {
        console.error('TowerLab 3D renderer failed:', err)
        if (alive) setFailed(true)
      }
    }
    boot()
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      cleanup()
      observer?.disconnect()
      if (renderer) renderer.dispose()
    }
  }, [floors, selectedFloor, onSelectFloor])

  return <div className="tower3d-host" ref={hostRef} onWheel={onWheel}>
    {failed && <div className="tower3d-fallback"><strong>3D scene unavailable</strong><span>Allow access to esm.sh and reload to load the 3D renderer.</span></div>}
    {!failed && <div className="tower3d-hint">DRAG TO ROTATE · SCROLL TO CLIMB</div>}
    {!failed && <div className="tower3d-zoom" aria-label="Zoom controls">
      <button type="button" onClick={() => setZoom(v => Math.min(1.65, +(v + 0.15).toFixed(2)))} aria-label="Zoom in" title="Zoom in">+</button>
      <button type="button" onClick={() => setZoom(v => Math.max(0.65, +(v - 0.15).toFixed(2)))} aria-label="Zoom out" title="Zoom out">−</button>
      <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom" title="Reset zoom">RESET</button>
    </div>}
  </div>
}
