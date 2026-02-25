import './style.css'
import pass1Src from '../shaders/pass1_generate_plates.wgsl?raw'
import pass2Src from '../shaders/pass2_derive_land_mask.wgsl?raw'
import pass3Src from '../shaders/pass3_boundary_stress.wgsl?raw'
import pass6Src from '../shaders/pass6_elevation.wgsl?raw'
import pass7Src from '../shaders/pass7_shaded_relief.wgsl?raw'
import pass8Src from '../shaders/pass8_jfa_step.wgsl?raw'
import pass9Src from '../shaders/pass9_jfa_init.wgsl?raw'
import initWasm, {
  deterministic_seed,
  deterministic_seed_from_input,
  grid_cell_count,
  grid_height,
  grid_width,
  n_pass_dispatch,
} from './wasm/wasm_core.js'

// ── DOM refs ──────────────────────────────────────────────────────────────────
const statusNode = document.querySelector('#status')
const canvas = document.querySelector('#heightmap')
const seedInput = document.querySelector('#seed-input')
const randomizeSeedBtn = document.querySelector('#randomize-seed')
const generateBtn = document.querySelector('#generate-btn')
const landFractionNode = document.querySelector('#land-fraction')

// ── Seed helpers ──────────────────────────────────────────────────────────────
function hash32(x) {
  let h = x >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

function hashToUnit(v) {
  return (hash32(v >>> 0) >>> 0) / 4294967295
}

function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0
}

// ── Canvas render ─────────────────────────────────────────────────────────────
function renderPackedRgba(ctx, packedColor, width, height) {
  const image = ctx.createImageData(width, height)
  const pixels = image.data
  for (let i = 0; i < packedColor.length; i++) {
    const rgba = packedColor[i] >>> 0
    const o = i * 4
    pixels[o    ] = rgba & 0xff
    pixels[o + 1] = (rgba >>> 8) & 0xff
    pixels[o + 2] = (rgba >>> 16) & 0xff
    pixels[o + 3] = (rgba >>> 24) & 0xff
  }
  ctx.putImageData(image, 0, 0)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Init WASM
  await initWasm()
  const WIDTH = grid_width()
  const HEIGHT = grid_height()
  const CELL_COUNT = grid_cell_count()

  // Size canvas
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')

  // Seed input setup
  seedInput.value = String(deterministic_seed())
  randomizeSeedBtn.addEventListener('click', () => {
    seedInput.value = String(randomSeed())
    generate()
  })

  // WebGPU init
  if (!navigator.gpu) {
    statusNode.textContent = 'WebGPU not available. Use Chrome/Edge with WebGPU enabled.'
    return
  }
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    statusNode.textContent = 'No WebGPU adapter found.'
    return
  }
  const device = await adapter.requestDevice()
  device.lost.then(info => {
    statusNode.textContent = `GPU device lost: ${info.message}`
  })

  // Surface WebGPU validation errors (including silent shader compilation failures)
  device.addEventListener('uncapturederror', event => {
    console.error('WebGPU uncaptured error:', event.error.message)
    statusNode.textContent = `GPU Error: ${event.error.message}`
  })

  // ── Buffer allocation ───────────────────────────────────────────────────────
  const PLATE_FLOATS_PER_ENTRY = 8           // see buildPlateStory layout
  const MAX_PLATES = 24
  const F32 = Float32Array.BYTES_PER_ELEMENT
  const U32 = Uint32Array.BYTES_PER_ELEMENT

  function makeStorageBuffer(byteSize, label) {
    return device.createBuffer({
      label,
      size: byteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
  }
  function makeUniformBuffer(byteSize, label) {
    return device.createBuffer({
      label,
      size: byteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
  }

  const plateSeedBuf      = makeStorageBuffer(MAX_PLATES * PLATE_FLOATS_PER_ENTRY * F32, 'plateSeed')
  const plateIdBuf        = makeStorageBuffer(CELL_COUNT * U32, 'plateId')
  const plateTypeBuf      = makeStorageBuffer(CELL_COUNT * F32, 'plateType')
  const plateVelocityBuf  = makeStorageBuffer(CELL_COUNT * 2 * F32, 'plateVelocity')
  const landMaskBuf       = makeStorageBuffer(CELL_COUNT * F32, 'landMask')
  const kinematicBuf      = makeStorageBuffer(CELL_COUNT * 4 * F32, 'kinematic')
  const jfaSeedBuf        = makeStorageBuffer(CELL_COUNT * 2 * F32, 'jfaSeed')
  const jfaPingBuf        = makeStorageBuffer(CELL_COUNT * 2 * F32, 'jfaPing')
  const jfaPongBuf        = makeStorageBuffer(CELL_COUNT * 2 * F32, 'jfaPong')
  const elevationBuf      = makeStorageBuffer(CELL_COUNT * F32, 'elevation')
  const shadedRgbaBuf     = makeStorageBuffer(CELL_COUNT * U32, 'shadedRgba')
  const readbackBuf       = device.createBuffer({
    label: 'readback',
    size: CELL_COUNT * U32,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  // ── Uniform buffers ─────────────────────────────────────────────────────────
  const plateUniformBuf   = makeUniformBuffer(32, 'plateUniform')   // PlateParams
  const gridUniformBuf    = makeUniformBuffer(16, 'gridUniform')     // GridParams (pass9, pass2)
  const kineUniformBuf    = makeUniformBuffer(16, 'kineUniform')     // KinematicParams
  // jfaStepUniform buffers are created per-step below
  const elevUniformBuf    = makeUniformBuffer(48, 'elevUniform')     // ElevationParams
  const renderUniformBuf  = makeUniformBuffer(32, 'renderUniform')   // RenderParams

  // ── Pipelines ────────────────────────────────────────────────────────────────
  // Use async variant so WGSL compilation errors surface as rejected promises
  // instead of silent error pipelines that produce a blank canvas.
  function makePipeline(src, label) {
    const mod = device.createShaderModule({ label, code: src })
    return device.createComputePipelineAsync({
      label,
      layout: 'auto',
      compute: { module: mod, entryPoint: 'main' },
    })
  }

  statusNode.textContent = 'Compiling shaders...'
  let pass1Pipeline, pass2Pipeline, pass3Pipeline,
      pass6Pipeline, pass7Pipeline, pass8Pipeline, pass9Pipeline
  try {
    ;[pass1Pipeline, pass2Pipeline, pass3Pipeline,
      pass6Pipeline, pass7Pipeline, pass8Pipeline, pass9Pipeline] =
      await Promise.all([
        makePipeline(pass1Src, 'pass1_generate_plates'),
        makePipeline(pass2Src, 'pass2_derive_land_mask'),
        makePipeline(pass3Src, 'pass3_boundary_stress'),
        makePipeline(pass6Src, 'pass6_elevation'),
        makePipeline(pass7Src, 'pass7_shaded_relief'),
        makePipeline(pass8Src, 'pass8_jfa_step'),
        makePipeline(pass9Src, 'pass9_jfa_init'),
      ])
  } catch (err) {
    statusNode.textContent = `Shader compilation failed: ${err.message}`
    console.error('Shader compilation error:', err)
    return
  }

  statusNode.textContent = 'Ready.'

  // ── Bind groups (created once, reused across generates) ─────────────────────
  function bg(pipeline, ...entries) {
    return device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: entries.map((resource, binding) => ({ binding, resource })),
    })
  }
  const buf = b => ({ buffer: b })

  const pass1BG = bg(pass1Pipeline,
    buf(plateSeedBuf), buf(plateIdBuf), buf(plateTypeBuf), buf(plateVelocityBuf),
    buf(plateUniformBuf))

  const pass2BG = bg(pass2Pipeline,
    buf(plateTypeBuf), buf(landMaskBuf), buf(gridUniformBuf))

  const pass3BG = bg(pass3Pipeline,
    buf(plateIdBuf), buf(plateVelocityBuf), buf(plateTypeBuf),
    buf(kinematicBuf), buf(kineUniformBuf))

  const pass9BG = bg(pass9Pipeline,
    buf(kinematicBuf), buf(jfaSeedBuf), buf(gridUniformBuf))

  // JFA ping-pong: even steps read ping write pong; odd steps read pong write ping
  // JFA: pre-create per-step uniform buffers and bind groups (avoids mid-encoder writeBuffer)
  const maxDim = Math.max(WIDTH, HEIGHT)
  const jfaSteps = []
  for (let s = Math.ceil(maxDim / 2); s >= 1; s = Math.floor(s / 2)) {
    jfaSteps.push(s)
    if (s === 1) break
  }

  const jfaStepBGs = jfaSteps.map((step, i) => {
    const ub = makeUniformBuffer(16, `jfaStep${i}`)
    const a = new ArrayBuffer(16)
    const v = new DataView(a)
    v.setUint32(0, WIDTH, true)
    v.setUint32(4, HEIGHT, true)
    v.setFloat32(8, step, true)
    v.setFloat32(12, 0, true)
    device.queue.writeBuffer(ub, 0, a)
    const readBuf  = i % 2 === 0 ? jfaPingBuf : jfaPongBuf
    const writeBuf = i % 2 === 0 ? jfaPongBuf : jfaPingBuf
    return bg(pass8Pipeline, buf(readBuf), buf(writeBuf), buf(ub))
  })

  const pass6BG = bg(pass6Pipeline,
    buf(plateTypeBuf), buf(kinematicBuf),
    buf(jfaPingBuf), buf(elevationBuf), buf(elevUniformBuf))

  const pass7BG = bg(pass7Pipeline,
    buf(jfaPingBuf), buf(elevationBuf),
    buf(shadedRgbaBuf), buf(renderUniformBuf))

  // Dispatch size for full grid
  const [dispatchX] = n_pass_dispatch(CELL_COUNT, 1)

  // ── Uniform writers ─────────────────────────────────────────────────────────
  function writeGridUniform(seed) {
    const a = new ArrayBuffer(16)
    const v = new DataView(a)
    v.setUint32(0, WIDTH, true)
    v.setUint32(4, HEIGHT, true)
    v.setUint32(8, seed >>> 0, true)
    v.setUint32(12, 0, true)
    device.queue.writeBuffer(gridUniformBuf, 0, a)
  }

  function writePlateUniform(plateCount, seed) {
    const a = new ArrayBuffer(32)
    const v = new DataView(a)
    v.setUint32(0, WIDTH, true)
    v.setUint32(4, HEIGHT, true)
    v.setUint32(8, plateCount >>> 0, true)
    v.setUint32(12, seed >>> 0, true)
    v.setFloat32(16, 1 / WIDTH, true)
    v.setFloat32(20, 1 / HEIGHT, true)
    v.setFloat32(24, 0.6, true)   // warp_roughness
    v.setFloat32(28, 0.0, true)   // pad
    device.queue.writeBuffer(plateUniformBuf, 0, a)
  }

  function writeKineUniform(seed) {
    const a = new ArrayBuffer(16)
    const v = new DataView(a)
    v.setUint32(0, WIDTH, true)
    v.setUint32(4, HEIGHT, true)
    v.setUint32(8, seed >>> 0, true)
    v.setUint32(12, 0, true)
    device.queue.writeBuffer(kineUniformBuf, 0, a)
  }

  function writeElevUniform(seed) {
    const a = new ArrayBuffer(48)
    const v = new DataView(a)
    v.setUint32(0, WIDTH, true)
    v.setUint32(4, HEIGHT, true)
    v.setUint32(8, seed >>> 0, true)
    v.setUint32(12, 0, true)
    v.setFloat32(16, 1 / WIDTH, true)
    v.setFloat32(20, 1 / HEIGHT, true)
    v.setFloat32(24, 0.75, true)  // mountain_height
    v.setFloat32(28, 35.0, true)  // mountain_radius (pixels)
    v.setFloat32(32, 0.7, true)   // terrain_roughness
    v.setFloat32(36, 0.0, true)
    v.setFloat32(40, 0.0, true)
    v.setFloat32(44, 0.0, true)
    device.queue.writeBuffer(elevUniformBuf, 0, a)
  }

  function writeRenderUniform(seed) {
    const a = new ArrayBuffer(32)
    const v = new DataView(a)
    v.setUint32(0, WIDTH, true)
    v.setUint32(4, HEIGHT, true)
    v.setUint32(8, 3, true)         // render_mode = shaded_relief
    v.setUint32(12, 0, true)
    v.setFloat32(16, 315.0, true)   // sun_angle
    v.setFloat32(20, 10.0, true)    // elevation_scale
    v.setFloat32(24, 7.5, true)     // vertical_exaggeration
    v.setFloat32(28, seed >>> 0, true)
    device.queue.writeBuffer(renderUniformBuf, 0, a)
  }

  // ── Plate story generator ──────────────────────────────────────────────────
  // Each plate: 8 floats
  //   [0] pos.x       (x ∈ [0,2])
  //   [1] pos.y       (y ∈ [0,1])
  //   [2] weight      (Voronoi bias, 0–0.5)
  //   [3] plate_type  (0.0 = continental, 1.0 = oceanic)
  //   [4] velocity.x
  //   [5] velocity.y
  //   [6] _pad
  //   [7] _pad

  const STORY_TYPES = ['single_continent', 'collision', 'rift', 'archipelago']
  const MAX_SPEED = 12.0

  function buildPlateStory(seed) {
    const plates = []
    const storyType = STORY_TYPES[hash32(seed) % 4]

    // Deterministic random helpers scoped to this seed
    let counter = 0
    function rng() { return hashToUnit(hash32((seed ^ (++counter * 0x9e3779b9)) >>> 0)) }
    function rngRange(lo, hi) { return lo + rng() * (hi - lo) }
    function rngAngle() { return rng() * Math.PI * 2 }

    function addPlate(x, y, type, vx, vy, weight) {
      plates.push({ x, y, type, vx, vy, weight: weight ?? 0.0 })
    }

    // Place continental plates with some positional jitter in center region
    function jitter(base, range) { return base + (rng() - 0.5) * 2 * range }

    switch (storyType) {
      case 'single_continent': {
        // One dominant cluster of 3–4 continental plates near center
        const cx = jitter(1.0, 0.15)
        const cy = jitter(0.5, 0.10)
        addPlate(cx,              cy,              0, rngRange(-2,2), rngRange(-2,2), 0.20)
        addPlate(cx - 0.35, jitter(cy, 0.12), 0, rngRange(-2,2), rngRange(-2,2), 0.12)
        addPlate(cx + 0.35, jitter(cy, 0.12), 0, rngRange(-2,2), rngRange(-2,2), 0.12)
        addPlate(jitter(cx, 0.2), cy + 0.25, 0, rngRange(-1,1), rngRange(-1,1), 0.08)
        break
      }
      case 'collision': {
        // Two continental masses converging — guaranteed central orogen
        const speed = rngRange(6, 10)
        const leftCx  = jitter(0.60, 0.10)
        const rightCx = jitter(1.40, 0.10)
        const cy = jitter(0.5, 0.12)
        // Left group moves right, right group moves left → convergent
        addPlate(leftCx,        jitter(cy, 0.08), 0, +speed, rngRange(-1,1), 0.18)
        addPlate(leftCx - 0.28, jitter(cy, 0.10), 0, +speed * 0.8, rngRange(-1,1), 0.10)
        addPlate(rightCx,       jitter(cy, 0.08), 0, -speed, rngRange(-1,1), 0.18)
        addPlate(rightCx + 0.28,jitter(cy, 0.10), 0, -speed * 0.8, rngRange(-1,1), 0.10)
        break
      }
      case 'rift': {
        // One continent pulling apart — central divergent rift
        const speed = rngRange(4, 8)
        const cx = jitter(1.0, 0.10)
        const cy = jitter(0.5, 0.10)
        // Left half moves left, right half moves right → divergent rift
        addPlate(cx - 0.22, jitter(cy, 0.08), 0, -speed, rngRange(-1,1), 0.15)
        addPlate(cx + 0.22, jitter(cy, 0.08), 0, +speed, rngRange(-1,1), 0.15)
        addPlate(cx - 0.45, jitter(cy, 0.12), 0, -speed * 0.6, rngRange(-1,1), 0.10)
        addPlate(cx + 0.45, jitter(cy, 0.12), 0, +speed * 0.6, rngRange(-1,1), 0.10)
        break
      }
      case 'archipelago': {
        // 6 smaller continental plates scattered in an oceanic field
        const positions = [
          [jitter(0.60, 0.12), jitter(0.35, 0.10)],
          [jitter(1.10, 0.12), jitter(0.30, 0.10)],
          [jitter(1.50, 0.12), jitter(0.42, 0.10)],
          [jitter(0.75, 0.12), jitter(0.65, 0.10)],
          [jitter(1.25, 0.12), jitter(0.70, 0.10)],
          [jitter(0.95, 0.12), jitter(0.52, 0.10)],
        ]
        for (const [px, py] of positions) {
          const a = rngAngle()
          addPlate(px, py, 0, Math.cos(a) * rngRange(2,7), Math.sin(a) * rngRange(2,7), 0.06)
        }
        break
      }
    }

    // Fill remaining slots with oceanic plates spread across canvas
    const totalPlates = 20
    const oceanic = totalPlates - plates.length
    for (let i = 0; i < oceanic; i++) {
      const px = rng() * 2.0       // x ∈ [0,2]
      const py = rng() * 1.0       // y ∈ [0,1]
      const a = rngAngle()
      const spd = rngRange(1, MAX_SPEED)
      addPlate(px, py, 1, Math.cos(a) * spd, Math.sin(a) * spd, 0.0)
    }

    return { storyType, plates }
  }

  function uploadPlateStory(story, seed) {
    const floats = new Float32Array(MAX_PLATES * PLATE_FLOATS_PER_ENTRY)
    story.plates.forEach((p, i) => {
      const o = i * PLATE_FLOATS_PER_ENTRY
      floats[o    ] = p.x
      floats[o + 1] = p.y
      floats[o + 2] = p.weight
      floats[o + 3] = p.type      // 0.0 = continental, 1.0 = oceanic
      floats[o + 4] = p.vx
      floats[o + 5] = p.vy
      floats[o + 6] = 0.0
      floats[o + 7] = 0.0
    })
    device.queue.writeBuffer(plateSeedBuf, 0, floats)
  }

  // ── Generate pipeline ───────────────────────────────────────────────────────
  async function generate() {
    const seed = deterministic_seed_from_input(Number(seedInput.value))
    statusNode.textContent = 'Generating...'
    const t0 = performance.now()

    // Build and upload plate story
    const story = buildPlateStory(seed)
    uploadPlateStory(story, seed)

    // Write uniforms
    writePlateUniform(story.plates.length, seed)
    writeGridUniform(seed)
    writeKineUniform(seed)
    writeElevUniform(seed)
    writeRenderUniform(seed)

    const encoder = device.createCommandEncoder()

    function dispatch(pipeline, bg, dx) {
      const pass = encoder.beginComputePass()
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bg)
      pass.dispatchWorkgroups(dx)
      pass.end()
    }

    // Pass 1: generate plates (plate_id, plate_type, plate_velocity)
    dispatch(pass1Pipeline, pass1BG, dispatchX)

    // Pass 2: derive land mask from plate types
    dispatch(pass2Pipeline, pass2BG, dispatchX)

    // Pass 3: boundary stress → kinematic_data
    dispatch(pass3Pipeline, pass3BG, dispatchX)

    // Pass 9: JFA init (seed from kinematic_data.w)
    dispatch(pass9Pipeline, pass9BG, dispatchX)

    // Copy seed → ping for first JFA step
    encoder.copyBufferToBuffer(jfaSeedBuf, 0, jfaPingBuf, 0, CELL_COUNT * 2 * F32)

    // JFA steps (bind groups pre-created with correct step sizes and ping-pong buffers)
    for (const jfaBG of jfaStepBGs) {
      dispatch(pass8Pipeline, jfaBG, dispatchX)
    }
    // Ensure result lands in jfaPingBuf for pass6
    // Step i reads ping if i%2==0 (writes pong); after N steps, result is in pong if N is odd
    if (jfaSteps.length % 2 === 1) {
      encoder.copyBufferToBuffer(jfaPongBuf, 0, jfaPingBuf, 0, CELL_COUNT * 2 * F32)
    }

    // Pass 6: elevation
    dispatch(pass6Pipeline, pass6BG, dispatchX)

    // Pass 7: shaded relief
    dispatch(pass7Pipeline, pass7BG, dispatchX)

    // Readback
    encoder.copyBufferToBuffer(shadedRgbaBuf, 0, readbackBuf, 0, CELL_COUNT * U32)

    device.queue.submit([encoder.finish()])

    await readbackBuf.mapAsync(GPUMapMode.READ)
    const raw = new Uint32Array(readbackBuf.getMappedRange().slice(0))
    readbackBuf.unmap()

    if (!raw.some(v => v !== 0)) {
      console.error('shaded_rgba is all zeros — GPU pipeline produced no output. Check console for WebGPU errors.')
      statusNode.textContent = 'GPU pipeline produced no output — check console for errors'
      return
    }

    renderPackedRgba(ctx, raw, WIDTH, HEIGHT)

    const ms = (performance.now() - t0).toFixed(1)
    statusNode.textContent = `${story.storyType} · ${ms} ms`
    if (landFractionNode) landFractionNode.textContent = ''
  }

  // Wire generate button + auto-generate on load
  generateBtn.addEventListener('click', generate)
  seedInput.addEventListener('change', generate)
  await generate()
}

main().catch(err => {
  console.error(err)
  const s = document.querySelector('#status')
  if (s) s.textContent = `Error: ${err.message}`
})
