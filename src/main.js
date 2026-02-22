import './style.css'
import pass1Source from '../shaders/pass1_generate_land_mask.wgsl?raw'
import pass2Source from '../shaders/pass2_reduce_bbox.wgsl?raw'
import pass3Source from '../shaders/pass3_shift_land_mask.wgsl?raw'
import pass4Source from '../shaders/pass4_generate_plate_ids.wgsl?raw'
import pass5Source from '../shaders/pass5_compute_fault_stress.wgsl?raw'
import pass6Source from '../shaders/pass6_generate_elevation.wgsl?raw'
import pass7Source from '../shaders/pass7_shaded_relief.wgsl?raw'
import pass8Source from '../shaders/pass8_jfa_step.wgsl?raw'
import pass9Source from '../shaders/pass9_jfa_init.wgsl?raw'
import initWasm, {
  deterministic_seed,
  deterministic_seed_from_input,
  six_pass_dispatch_sequence,
  grid_cell_count,
  grid_height,
  grid_width,
  map_flat_1d_to_gpu,
  normalized_edge_warp,
  normalized_edge_warp_from_input,
  normalized_elevation_scale,
  normalized_elevation_scale_from_slider,
  normalized_falloff_strength,
  normalized_falloff_strength_from_slider,
  normalized_fbm_base_frequency,
  normalized_land_threshold,
  normalized_land_threshold_from_slider,
  normalized_mountain_height,
  normalized_mountain_height_from_slider,
  normalized_mountain_radius,
  normalized_mountain_radius_from_slider,
  normalized_noise_amplitude,
  normalized_noise_amplitude_from_slider,
  normalized_plate_count,
  normalized_plate_count_from_slider,
  normalized_plate_warp_amplitude,
  normalized_plate_warp_amplitude_from_slider,
  normalized_plate_warp_roughness,
  normalized_plate_warp_roughness_from_slider,
  normalized_sun_angle,
  normalized_sun_angle_from_slider,
  normalized_terrain_frequency,
  normalized_terrain_frequency_from_slider,
  normalized_terrain_roughness,
  normalized_terrain_roughness_from_slider,
  normalized_vertical_exaggeration,
  normalized_vertical_exaggeration_from_slider,
} from './wasm/wasm_core.js'

const statusNode = document.querySelector('#status')
const canvas = document.querySelector('#heightmap')
const seedInput = document.querySelector('#seed-input')
const randomizeSeedButton = document.querySelector('#randomize-seed')
const thresholdSlider = document.querySelector('#land-threshold')
const thresholdValueNode = document.querySelector('#land-threshold-value')
const falloffSlider = document.querySelector('#falloff-strength')
const falloffValueNode = document.querySelector('#falloff-strength-value')
const noiseSlider = document.querySelector('#noise-amplitude')
const noiseValueNode = document.querySelector('#noise-amplitude-value')
const edgeWarpInput = document.querySelector('#edge-warp')
const plateCountSlider = document.querySelector('#plate-count')
const plateCountValueNode = document.querySelector('#plate-count-value')
const plateWarpSlider = document.querySelector('#plate-warp-amplitude')
const plateWarpValueNode = document.querySelector('#plate-warp-amplitude-value')
const plateRoughnessSlider = document.querySelector('#plate-warp-roughness')
const plateRoughnessValueNode = document.querySelector('#plate-warp-roughness-value')
const mountainRadiusSlider = document.querySelector('#mountain-radius')
const mountainRadiusValueNode = document.querySelector('#mountain-radius-value')
const mountainHeightSlider = document.querySelector('#mountain-height')
const mountainHeightValueNode = document.querySelector('#mountain-height-value')
const terrainRoughnessSlider = document.querySelector('#terrain-roughness')
const terrainRoughnessValueNode = document.querySelector('#terrain-roughness-value')
const terrainFrequencySlider = document.querySelector('#terrain-frequency')
const terrainFrequencyValueNode = document.querySelector('#terrain-frequency-value')
const sunAngleSlider = document.querySelector('#sun-angle')
const sunAngleValueNode = document.querySelector('#sun-angle-value')
const elevationScaleSlider = document.querySelector('#elevation-scale')
const elevationScaleValueNode = document.querySelector('#elevation-scale-value')
const verticalExaggerationSlider = document.querySelector('#vertical-exaggeration')
const verticalExaggerationValueNode = document.querySelector('#vertical-exaggeration-value')
const renderModeSelect = document.querySelector('#render-mode')
const landFractionNode = document.querySelector('#land-fraction')

function renderLandMask(ctx, flatData, width, height) {
  const image = ctx.createImageData(width, height)
  const pixels = image.data
  for (let i = 0; i < flatData.length; i += 1) {
    const isLand = flatData[i] >= 0.5
    const intensity = isLand ? 255 : 0
    const offset = i * 4
    pixels[offset] = intensity
    pixels[offset + 1] = intensity
    pixels[offset + 2] = intensity
    pixels[offset + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

function hash32(x) {
  let h = x >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

function plateColor(id, cache) {
  const cached = cache.get(id)
  if (cached) {
    return cached
  }

  const h = hash32((id + 1) >>> 0)
  const color = [
    64 + (h & 0x7f),
    64 + ((h >>> 8) & 0x7f),
    64 + ((h >>> 16) & 0x7f),
  ]
  cache.set(id, color)
  return color
}

function renderPlateIds(ctx, flatPlateIds, width, height, colorCache) {
  const image = ctx.createImageData(width, height)
  const pixels = image.data
  for (let i = 0; i < flatPlateIds.length; i += 1) {
    const [r, g, b] = plateColor(flatPlateIds[i], colorCache)
    const offset = i * 4
    pixels[offset] = r
    pixels[offset + 1] = g
    pixels[offset + 2] = b
    pixels[offset + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

function renderShadedRelief(ctx, packedColor, width, height) {
  const image = ctx.createImageData(width, height)
  const pixels = image.data
  for (let i = 0; i < packedColor.length; i += 1) {
    const rgba = packedColor[i] >>> 0
    const offset = i * 4
    pixels[offset] = rgba & 0xff
    pixels[offset + 1] = (rgba >>> 8) & 0xff
    pixels[offset + 2] = (rgba >>> 16) & 0xff
    pixels[offset + 3] = (rgba >>> 24) & 0xff
  }
  ctx.putImageData(image, 0, 0)
}

function computeLandFraction(flatData) {
  let landCount = 0
  for (let i = 0; i < flatData.length; i += 1) {
    if (flatData[i] >= 0.5) {
      landCount += 1
    }
  }
  return landCount / flatData.length
}

function writeGenerateParams(
  buffer,
  width,
  height,
  fbmBaseFrequency,
  threshold,
  falloff,
  noiseAmplitude,
  edgeWarp,
  seed
) {
  const view = new DataView(buffer)
  view.setUint32(0, width, true)
  view.setUint32(4, height, true)
  view.setUint32(8, 0, true)
  view.setUint32(12, seed >>> 0, true)
  view.setFloat32(16, 1 / width, true)
  view.setFloat32(20, 1 / height, true)
  view.setFloat32(24, fbmBaseFrequency, true)
  view.setFloat32(28, threshold, true)
  view.setFloat32(32, falloff, true)
  view.setFloat32(36, noiseAmplitude, true)
  view.setFloat32(40, edgeWarp, true)
  view.setFloat32(44, 0, true)
}

function writePlateParams(
  buffer,
  width,
  height,
  plateCount,
  plateWarpAmplitude,
  plateWarpRoughness,
  plateWarpFrequency,
  seed
) {
  const view = new DataView(buffer)
  view.setUint32(0, width, true)
  view.setUint32(4, height, true)
  view.setUint32(8, plateCount >>> 0, true)
  view.setUint32(12, seed >>> 0, true)
  view.setFloat32(16, 1 / width, true)
  view.setFloat32(20, 1 / height, true)
  view.setFloat32(24, plateWarpAmplitude, true)
  view.setFloat32(28, plateWarpRoughness, true)
  view.setFloat32(32, plateWarpFrequency, true)
  view.setFloat32(36, 0, true)
  view.setFloat32(40, 0, true)
  view.setFloat32(44, 0, true)
}

function writeGridParams(buffer, width, height) {
  const view = new DataView(buffer)
  view.setUint32(0, width, true)
  view.setUint32(4, height, true)
  view.setUint32(8, 0, true)
  view.setUint32(12, 0, true)
}

function writeKinematicParams(buffer, width, height, seed) {
  const view = new DataView(buffer)
  view.setUint32(0, width, true)
  view.setUint32(4, height, true)
  view.setUint32(8, seed >>> 0, true)
  view.setUint32(12, 0, true)
}

function writeJfaStepParams(buffer, width, height, stepSize) {
  const view = new DataView(buffer)
  view.setUint32(0, width, true)
  view.setUint32(4, height, true)
  view.setFloat32(8, stepSize, true)
  view.setFloat32(12, 0, true)
}

function writeTopographyParams(
  buffer,
  width,
  height,
  seed,
  mountainRadius,
  mountainHeight,
  terrainRoughness,
  terrainFrequency
) {
  const view = new DataView(buffer)
  view.setUint32(0, width, true)
  view.setUint32(4, height, true)
  view.setUint32(8, seed >>> 0, true)
  view.setUint32(12, 0, true)
  view.setFloat32(16, mountainRadius, true)
  view.setFloat32(20, mountainHeight, true)
  view.setFloat32(24, terrainRoughness, true)
  view.setFloat32(28, terrainFrequency, true)
}

function writeRenderParams(
  buffer,
  width,
  height,
  renderMode,
  sunAngle,
  elevationScale,
  verticalExaggeration
) {
  let renderModeCode = 0
  if (renderMode === 'kinematics') {
    renderModeCode = 1
  } else if (renderMode === 'sdf_distance') {
    renderModeCode = 2
  } else if (renderMode === 'shaded_relief') {
    renderModeCode = 3
  }
  const view = new DataView(buffer)
  view.setUint32(0, width, true)
  view.setUint32(4, height, true)
  view.setUint32(8, renderModeCode, true)
  view.setUint32(12, 0, true)
  view.setFloat32(16, sunAngle, true)
  view.setFloat32(20, elevationScale, true)
  view.setFloat32(24, verticalExaggeration, true)
  view.setFloat32(28, 0, true)
}

async function runPipeline() {
  await initWasm()

  if (
    !statusNode ||
    !canvas ||
    !seedInput ||
    !randomizeSeedButton ||
    !thresholdSlider ||
    !thresholdValueNode ||
    !falloffSlider ||
    !falloffValueNode ||
    !noiseSlider ||
    !noiseValueNode ||
    !edgeWarpInput ||
    !plateCountSlider ||
    !plateCountValueNode ||
    !plateWarpSlider ||
    !plateWarpValueNode ||
    !plateRoughnessSlider ||
    !plateRoughnessValueNode ||
    !mountainRadiusSlider ||
    !mountainRadiusValueNode ||
    !mountainHeightSlider ||
    !mountainHeightValueNode ||
    !terrainRoughnessSlider ||
    !terrainRoughnessValueNode ||
    !terrainFrequencySlider ||
    !terrainFrequencyValueNode ||
    !sunAngleSlider ||
    !sunAngleValueNode ||
    !elevationScaleSlider ||
    !elevationScaleValueNode ||
    !verticalExaggerationSlider ||
    !verticalExaggerationValueNode ||
    !renderModeSelect ||
    !landFractionNode
  ) {
    throw new Error('Required DOM nodes were not found.')
  }

  if (!navigator.gpu) {
    throw new Error('WebGPU is unavailable in this browser.')
  }

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    throw new Error('Failed to acquire a WebGPU adapter.')
  }

  const device = await adapter.requestDevice()
  const width = grid_width()
  const height = grid_height()
  const cellCount = grid_cell_count()
  const coverageNorm = 1.0
  const mapping = map_flat_1d_to_gpu(cellCount, coverageNorm)
  const activeCells = mapping[2]
  const dispatches = six_pass_dispatch_sequence(cellCount, coverageNorm)
  const dispatchGenerate = dispatches[0]
  const dispatchReduce = dispatches[1]
  const dispatchShift = dispatches[2]
  const dispatchPlate = dispatches[3]
  const dispatchKinematics = dispatches[4]
  const dispatchJfa = dispatches[5]
  const dispatchTopo = dispatchJfa
  const dispatchShade = dispatchJfa
  const jfaPasses = Math.ceil(Math.log2(Math.max(width, height)))
  const dataByteLength = activeCells * Float32Array.BYTES_PER_ELEMENT
  const plateByteLength = activeCells * Uint32Array.BYTES_PER_ELEMENT
  const jfaByteLength = activeCells * 2 * Float32Array.BYTES_PER_ELEMENT

  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('2D canvas context could not be created.')
  }

  const landMaskBuffer = device.createBuffer({
    size: dataByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const finalLandMaskBuffer = device.createBuffer({
    size: dataByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const plateIdBuffer = device.createBuffer({
    size: plateByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const kinematicDataBuffer = device.createBuffer({
    size: dataByteLength * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const elevationBuffer = device.createBuffer({
    size: dataByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const jfaBufferA = device.createBuffer({
    size: jfaByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const jfaBufferB = device.createBuffer({
    size: jfaByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const shadedOutputBuffer = device.createBuffer({
    size: plateByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const bboxBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })
  const pass3Readback = device.createBuffer({
    size: dataByteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const plateReadback = device.createBuffer({
    size: plateByteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const shadedOutputReadback = device.createBuffer({
    size: plateByteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  const generateParamsBuffer = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const gridParamsBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const plateParamsBuffer = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const kinematicParamsBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const topographyParamsBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const jfaStepParamsBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const renderParamsBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const generateParamsBytes = new ArrayBuffer(48)
  const gridParamsBytes = new ArrayBuffer(16)
  const plateParamsBytes = new ArrayBuffer(48)
  const kinematicParamsBytes = new ArrayBuffer(16)
  const topographyParamsBytes = new ArrayBuffer(32)
  const jfaStepParamsBytes = new ArrayBuffer(16)
  const renderParamsBytes = new ArrayBuffer(32)
  writeGridParams(gridParamsBytes, width, height)
  device.queue.writeBuffer(gridParamsBuffer, 0, gridParamsBytes)

  const pass1Pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: pass1Source }),
      entryPoint: 'main',
    },
  })
  const pass2Pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: pass2Source }),
      entryPoint: 'main',
    },
  })
  const pass3Pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: pass3Source }),
      entryPoint: 'main',
    },
  })
  const pass4Pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: pass4Source }),
      entryPoint: 'main',
    },
  })
  const pass5Pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: pass5Source }),
      entryPoint: 'main',
    },
  })
  const pass6Pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: pass6Source }),
      entryPoint: 'main',
    },
  })
  const pass7Pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: pass7Source }),
      entryPoint: 'main',
    },
  })
  const pass8Pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: pass8Source }),
      entryPoint: 'main',
    },
  })
  const pass9Pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: pass9Source }),
      entryPoint: 'main',
    },
  })

  const pass1BindGroup = device.createBindGroup({
    layout: pass1Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: landMaskBuffer } },
      { binding: 1, resource: { buffer: generateParamsBuffer } },
    ],
  })

  const pass2BindGroup = device.createBindGroup({
    layout: pass2Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: landMaskBuffer } },
      { binding: 1, resource: { buffer: bboxBuffer } },
      { binding: 2, resource: { buffer: gridParamsBuffer } },
    ],
  })

  const pass3BindGroup = device.createBindGroup({
    layout: pass3Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: landMaskBuffer } },
      { binding: 1, resource: { buffer: finalLandMaskBuffer } },
      { binding: 2, resource: { buffer: bboxBuffer } },
      { binding: 3, resource: { buffer: gridParamsBuffer } },
    ],
  })

  const pass4BindGroup = device.createBindGroup({
    layout: pass4Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: plateIdBuffer } },
      { binding: 1, resource: { buffer: plateParamsBuffer } },
    ],
  })

  const pass5BindGroup = device.createBindGroup({
    layout: pass5Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: plateIdBuffer } },
      { binding: 1, resource: { buffer: finalLandMaskBuffer } },
      { binding: 2, resource: { buffer: kinematicDataBuffer } },
      { binding: 3, resource: { buffer: kinematicParamsBuffer } },
    ],
  })

  const pass9BindGroup = device.createBindGroup({
    layout: pass9Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: kinematicDataBuffer } },
      { binding: 1, resource: { buffer: jfaBufferA } },
      { binding: 2, resource: { buffer: gridParamsBuffer } },
    ],
  })

  const pass6BindGroupA = device.createBindGroup({
    layout: pass6Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: kinematicDataBuffer } },
      { binding: 1, resource: { buffer: jfaBufferA } },
      { binding: 2, resource: { buffer: finalLandMaskBuffer } },
      { binding: 3, resource: { buffer: elevationBuffer } },
      { binding: 4, resource: { buffer: topographyParamsBuffer } },
    ],
  })
  const pass6BindGroupB = device.createBindGroup({
    layout: pass6Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: kinematicDataBuffer } },
      { binding: 1, resource: { buffer: jfaBufferB } },
      { binding: 2, resource: { buffer: finalLandMaskBuffer } },
      { binding: 3, resource: { buffer: elevationBuffer } },
      { binding: 4, resource: { buffer: topographyParamsBuffer } },
    ],
  })
  const pass8BindGroupAB = device.createBindGroup({
    layout: pass8Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: jfaBufferA } },
      { binding: 1, resource: { buffer: jfaBufferB } },
      { binding: 2, resource: { buffer: jfaStepParamsBuffer } },
    ],
  })
  const pass8BindGroupBA = device.createBindGroup({
    layout: pass8Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: jfaBufferB } },
      { binding: 1, resource: { buffer: jfaBufferA } },
      { binding: 2, resource: { buffer: jfaStepParamsBuffer } },
    ],
  })
  const pass7BindGroupA = device.createBindGroup({
    layout: pass7Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: kinematicDataBuffer } },
      { binding: 1, resource: { buffer: jfaBufferA } },
      { binding: 2, resource: { buffer: elevationBuffer } },
      { binding: 3, resource: { buffer: shadedOutputBuffer } },
      { binding: 4, resource: { buffer: renderParamsBuffer } },
    ],
  })
  const pass7BindGroupB = device.createBindGroup({
    layout: pass7Pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: kinematicDataBuffer } },
      { binding: 1, resource: { buffer: jfaBufferB } },
      { binding: 2, resource: { buffer: elevationBuffer } },
      { binding: 3, resource: { buffer: shadedOutputBuffer } },
      { binding: 4, resource: { buffer: renderParamsBuffer } },
    ],
  })

  const bboxInit = new Uint32Array([width, 0, height, 0])
  const fbmBaseFrequency = normalized_fbm_base_frequency()
  const plateWarpFrequency = 1.5
  const plateColorCache = new Map()

  const renderWithControls = async (
    threshold,
    falloffStrength,
    noiseAmplitude,
    edgeWarp,
    seed,
    plateCount,
    plateWarpAmplitude,
    plateWarpRoughness,
    mountainRadius,
    mountainHeight,
    renderMode,
    terrainRoughness,
    terrainFrequency,
    sunAngle,
    elevationScale,
    verticalExaggeration
  ) => {
    writeGenerateParams(
      generateParamsBytes,
      width,
      height,
      fbmBaseFrequency,
      threshold,
      falloffStrength,
      noiseAmplitude,
      edgeWarp,
      seed
    )
    writePlateParams(
      plateParamsBytes,
      width,
      height,
      plateCount,
      plateWarpAmplitude,
      plateWarpRoughness,
      plateWarpFrequency,
      seed
    )
    writeKinematicParams(kinematicParamsBytes, width, height, seed)
    writeTopographyParams(
      topographyParamsBytes,
      width,
      height,
      seed,
      mountainRadius,
      mountainHeight,
      terrainRoughness,
      terrainFrequency
    )
    writeRenderParams(
      renderParamsBytes,
      width,
      height,
      renderMode,
      sunAngle,
      elevationScale,
      verticalExaggeration
    )
    device.queue.writeBuffer(generateParamsBuffer, 0, generateParamsBytes)
    device.queue.writeBuffer(plateParamsBuffer, 0, plateParamsBytes)
    device.queue.writeBuffer(kinematicParamsBuffer, 0, kinematicParamsBytes)
    device.queue.writeBuffer(topographyParamsBuffer, 0, topographyParamsBytes)
    device.queue.writeBuffer(renderParamsBuffer, 0, renderParamsBytes)
    device.queue.writeBuffer(bboxBuffer, 0, bboxInit)

    const pass1Encoder = device.createCommandEncoder()
    const pass1 = pass1Encoder.beginComputePass()
    pass1.setPipeline(pass1Pipeline)
    pass1.setBindGroup(0, pass1BindGroup)
    pass1.dispatchWorkgroups(dispatchGenerate)
    pass1.end()
    device.queue.submit([pass1Encoder.finish()])
    await device.queue.onSubmittedWorkDone()

    const pass2Start = performance.now()
    const pass2Encoder = device.createCommandEncoder()
    const pass2 = pass2Encoder.beginComputePass()
    pass2.setPipeline(pass2Pipeline)
    pass2.setBindGroup(0, pass2BindGroup)
    pass2.dispatchWorkgroups(dispatchReduce)
    pass2.end()
    device.queue.submit([pass2Encoder.finish()])
    await device.queue.onSubmittedWorkDone()
    const reductionLatencyMs = performance.now() - pass2Start

    const pass3Encoder = device.createCommandEncoder()
    const pass3 = pass3Encoder.beginComputePass()
    pass3.setPipeline(pass3Pipeline)
    pass3.setBindGroup(0, pass3BindGroup)
    pass3.dispatchWorkgroups(dispatchShift)
    pass3.end()
    device.queue.submit([pass3Encoder.finish()])
    await device.queue.onSubmittedWorkDone()

    const pass4Encoder = device.createCommandEncoder()
    const pass4 = pass4Encoder.beginComputePass()
    pass4.setPipeline(pass4Pipeline)
    pass4.setBindGroup(0, pass4BindGroup)
    pass4.dispatchWorkgroups(dispatchPlate)
    pass4.end()
    device.queue.submit([pass4Encoder.finish()])
    await device.queue.onSubmittedWorkDone()

    const pass5Encoder = device.createCommandEncoder()
    const pass5 = pass5Encoder.beginComputePass()
    pass5.setPipeline(pass5Pipeline)
    pass5.setBindGroup(0, pass5BindGroup)
    pass5.dispatchWorkgroups(dispatchKinematics)
    pass5.end()
    device.queue.submit([pass5Encoder.finish()])
    await device.queue.onSubmittedWorkDone()

    const pass9Encoder = device.createCommandEncoder()
    const pass9 = pass9Encoder.beginComputePass()
    pass9.setPipeline(pass9Pipeline)
    pass9.setBindGroup(0, pass9BindGroup)
    pass9.dispatchWorkgroups(dispatchJfa)
    pass9.end()
    device.queue.submit([pass9Encoder.finish()])
    await device.queue.onSubmittedWorkDone()

    let readFromA = true
    for (let i = 0; i < jfaPasses; i += 1) {
      const stepSize = 2 ** (jfaPasses - i - 1)
      writeJfaStepParams(jfaStepParamsBytes, width, height, stepSize)
      device.queue.writeBuffer(jfaStepParamsBuffer, 0, jfaStepParamsBytes)

      const pass8Encoder = device.createCommandEncoder()
      const pass8 = pass8Encoder.beginComputePass()
      pass8.setPipeline(pass8Pipeline)
      pass8.setBindGroup(0, readFromA ? pass8BindGroupAB : pass8BindGroupBA)
      pass8.dispatchWorkgroups(dispatchJfa)
      pass8.end()
      device.queue.submit([pass8Encoder.finish()])
      await device.queue.onSubmittedWorkDone()
      readFromA = !readFromA
    }

    const finalJfaIsA = readFromA

    const pass6Encoder = device.createCommandEncoder()
    const pass6 = pass6Encoder.beginComputePass()
    pass6.setPipeline(pass6Pipeline)
    pass6.setBindGroup(0, finalJfaIsA ? pass6BindGroupA : pass6BindGroupB)
    pass6.dispatchWorkgroups(dispatchTopo)
    pass6.end()
    device.queue.submit([pass6Encoder.finish()])
    await device.queue.onSubmittedWorkDone()

    if (
      renderMode === 'kinematics' ||
      renderMode === 'sdf_distance' ||
      renderMode === 'shaded_relief'
    ) {
      const pass7Encoder = device.createCommandEncoder()
      const pass7 = pass7Encoder.beginComputePass()
      pass7.setPipeline(pass7Pipeline)
      pass7.setBindGroup(0, finalJfaIsA ? pass7BindGroupA : pass7BindGroupB)
      pass7.dispatchWorkgroups(dispatchShade)
      pass7.end()
      device.queue.submit([pass7Encoder.finish()])
      await device.queue.onSubmittedWorkDone()
    }

    const copyEncoder = device.createCommandEncoder()
    copyEncoder.copyBufferToBuffer(finalLandMaskBuffer, 0, pass3Readback, 0, dataByteLength)
    if (renderMode === 'plate_id') {
      copyEncoder.copyBufferToBuffer(plateIdBuffer, 0, plateReadback, 0, plateByteLength)
    } else if (
      renderMode === 'kinematics' ||
      renderMode === 'sdf_distance' ||
      renderMode === 'shaded_relief'
    ) {
      copyEncoder.copyBufferToBuffer(shadedOutputBuffer, 0, shadedOutputReadback, 0, plateByteLength)
    }
    device.queue.submit([copyEncoder.finish()])
    await device.queue.onSubmittedWorkDone()

    await pass3Readback.mapAsync(GPUMapMode.READ)
    const pass3Flat = new Float32Array(pass3Readback.getMappedRange())
    const postShiftLandFraction = computeLandFraction(pass3Flat)

    if (renderMode === 'plate_id') {
      await plateReadback.mapAsync(GPUMapMode.READ)
      const plateFlat = new Uint32Array(plateReadback.getMappedRange())
      renderPlateIds(context, plateFlat, width, height, plateColorCache)
      plateReadback.unmap()
    } else if (
      renderMode === 'kinematics' ||
      renderMode === 'sdf_distance' ||
      renderMode === 'shaded_relief'
    ) {
      await shadedOutputReadback.mapAsync(GPUMapMode.READ)
      const shadedFlat = new Uint32Array(shadedOutputReadback.getMappedRange())
      renderShadedRelief(context, shadedFlat, width, height)
      shadedOutputReadback.unmap()
    } else {
      renderLandMask(context, pass3Flat, width, height)
    }

    console.log(
      JSON.stringify({
        seed: seed >>> 0,
        post_shift_land_fraction: Number(postShiftLandFraction.toFixed(6)),
        latency_ms: Number(reductionLatencyMs.toFixed(3)),
      })
    )

    statusNode.textContent =
      `Rendered ${width}x${height} @ threshold ${threshold.toFixed(2)} / falloff ${falloffStrength.toFixed(2)} / noise ${noiseAmplitude.toFixed(2)} / edge_warp ${edgeWarp.toFixed(4)} / plate_count ${plateCount} / plate_warp ${plateWarpAmplitude.toFixed(2)} / plate_roughness ${plateWarpRoughness.toFixed(2)} / mountain_radius ${mountainRadius.toFixed(1)} / mountain_height ${mountainHeight.toFixed(2)} / terrain_roughness ${terrainRoughness.toFixed(2)} / terrain_frequency ${terrainFrequency.toFixed(1)} / sun_angle ${sunAngle.toFixed(0)} / elevation_scale ${elevationScale.toFixed(1)} / vertical_exaggeration ${verticalExaggeration.toFixed(1)} / seed ${seed >>> 0} / view ${renderMode}. Reduction pass: ${reductionLatencyMs.toFixed(2)} ms.`
    landFractionNode.textContent =
      `Land fraction (post-shift): ${(postShiftLandFraction * 100).toFixed(2)}%`

    pass3Readback.unmap()
  }

  let queuedThreshold = normalized_land_threshold_from_slider(normalized_land_threshold())
  let queuedFalloff = normalized_falloff_strength_from_slider(normalized_falloff_strength())
  let queuedNoise = normalized_noise_amplitude_from_slider(normalized_noise_amplitude())
  let queuedEdgeWarp = normalized_edge_warp_from_input(normalized_edge_warp())
  let queuedSeed = deterministic_seed_from_input(deterministic_seed())
  let queuedPlateCount = normalized_plate_count_from_slider(normalized_plate_count())
  let queuedPlateWarpAmplitude = normalized_plate_warp_amplitude_from_slider(
    normalized_plate_warp_amplitude()
  )
  let queuedPlateWarpRoughness = normalized_plate_warp_roughness_from_slider(
    normalized_plate_warp_roughness()
  )
  let queuedMountainRadius = normalized_mountain_radius_from_slider(normalized_mountain_radius())
  let queuedMountainHeight = normalized_mountain_height_from_slider(normalized_mountain_height())
  let queuedTerrainRoughness = normalized_terrain_roughness_from_slider(normalized_terrain_roughness())
  let queuedTerrainFrequency = normalized_terrain_frequency_from_slider(normalized_terrain_frequency())
  let queuedSunAngle = normalized_sun_angle_from_slider(normalized_sun_angle())
  let queuedElevationScale = normalized_elevation_scale_from_slider(normalized_elevation_scale())
  let queuedVerticalExaggeration = normalized_vertical_exaggeration_from_slider(
    normalized_vertical_exaggeration()
  )
  let queuedRenderMode = 'land_mask'
  let renderQueued = false
  let renderInFlight = false

  const processQueuedRender = async () => {
    if (renderInFlight) {
      return
    }
    renderInFlight = true
    try {
      while (renderQueued) {
        renderQueued = false
        await renderWithControls(
          queuedThreshold,
          queuedFalloff,
          queuedNoise,
          queuedEdgeWarp,
          queuedSeed,
          queuedPlateCount,
          queuedPlateWarpAmplitude,
          queuedPlateWarpRoughness,
          queuedMountainRadius,
          queuedMountainHeight,
          queuedRenderMode,
          queuedTerrainRoughness,
          queuedTerrainFrequency,
          queuedSunAngle,
          queuedElevationScale,
          queuedVerticalExaggeration
        )
      }
    } finally {
      renderInFlight = false
    }
  }

  const queueRender = (
    rawThreshold,
    rawFalloff,
    rawNoise,
    rawEdgeWarp,
    rawSeed,
    rawPlateCount,
    rawPlateWarpAmplitude,
    rawPlateWarpRoughness,
    rawMountainRadius,
    rawMountainHeight,
    rawRenderMode,
    rawTerrainRoughness,
    rawTerrainFrequency,
    rawSunAngle,
    rawElevationScale,
    rawVerticalExaggeration
  ) => {
    const parsedThreshold = Number.isFinite(rawThreshold) ? rawThreshold : queuedThreshold
    const parsedFalloff = Number.isFinite(rawFalloff) ? rawFalloff : queuedFalloff
    const parsedNoise = Number.isFinite(rawNoise) ? rawNoise : queuedNoise
    const parsedEdgeWarp = Number.isFinite(rawEdgeWarp) ? rawEdgeWarp : queuedEdgeWarp
    const parsedSeed = Number.isFinite(rawSeed) ? rawSeed : queuedSeed
    const parsedPlateCount = Number.isFinite(rawPlateCount) ? rawPlateCount : queuedPlateCount
    const parsedPlateWarpAmplitude = Number.isFinite(rawPlateWarpAmplitude)
      ? rawPlateWarpAmplitude
      : queuedPlateWarpAmplitude
    const parsedPlateWarpRoughness = Number.isFinite(rawPlateWarpRoughness)
      ? rawPlateWarpRoughness
      : queuedPlateWarpRoughness
    const parsedMountainRadius = Number.isFinite(rawMountainRadius)
      ? rawMountainRadius
      : queuedMountainRadius
    const parsedMountainHeight = Number.isFinite(rawMountainHeight)
      ? rawMountainHeight
      : queuedMountainHeight
    const parsedTerrainRoughness = Number.isFinite(rawTerrainRoughness)
      ? rawTerrainRoughness
      : queuedTerrainRoughness
    const parsedTerrainFrequency = Number.isFinite(rawTerrainFrequency)
      ? rawTerrainFrequency
      : queuedTerrainFrequency
    const parsedSunAngle = Number.isFinite(rawSunAngle) ? rawSunAngle : queuedSunAngle
    const parsedElevationScale = Number.isFinite(rawElevationScale)
      ? rawElevationScale
      : queuedElevationScale
    const parsedVerticalExaggeration = Number.isFinite(rawVerticalExaggeration)
      ? rawVerticalExaggeration
      : queuedVerticalExaggeration

    const parsedRenderMode =
      rawRenderMode === 'plate_id' ||
      rawRenderMode === 'kinematics' ||
      rawRenderMode === 'sdf_distance' ||
      rawRenderMode === 'shaded_relief'
        ? rawRenderMode
        : 'land_mask'

    queuedThreshold = normalized_land_threshold_from_slider(parsedThreshold)
    queuedFalloff = normalized_falloff_strength_from_slider(parsedFalloff)
    queuedNoise = normalized_noise_amplitude_from_slider(parsedNoise)
    queuedEdgeWarp = normalized_edge_warp_from_input(parsedEdgeWarp)
    queuedSeed = deterministic_seed_from_input(parsedSeed)
    queuedPlateCount = normalized_plate_count_from_slider(parsedPlateCount)
    queuedPlateWarpAmplitude = normalized_plate_warp_amplitude_from_slider(parsedPlateWarpAmplitude)
    queuedPlateWarpRoughness = normalized_plate_warp_roughness_from_slider(parsedPlateWarpRoughness)
    queuedMountainRadius = normalized_mountain_radius_from_slider(parsedMountainRadius)
    queuedMountainHeight = normalized_mountain_height_from_slider(parsedMountainHeight)
    queuedTerrainRoughness = normalized_terrain_roughness_from_slider(parsedTerrainRoughness)
    queuedTerrainFrequency = normalized_terrain_frequency_from_slider(parsedTerrainFrequency)
    queuedSunAngle = normalized_sun_angle_from_slider(parsedSunAngle)
    queuedElevationScale = normalized_elevation_scale_from_slider(parsedElevationScale)
    queuedVerticalExaggeration = normalized_vertical_exaggeration_from_slider(
      parsedVerticalExaggeration
    )
    queuedRenderMode = parsedRenderMode

    thresholdSlider.value = queuedThreshold.toFixed(2)
    thresholdValueNode.textContent = queuedThreshold.toFixed(2)
    falloffSlider.value = queuedFalloff.toFixed(2)
    falloffValueNode.textContent = queuedFalloff.toFixed(2)
    noiseSlider.value = queuedNoise.toFixed(2)
    noiseValueNode.textContent = queuedNoise.toFixed(2)
    edgeWarpInput.value = String(queuedEdgeWarp)
    plateCountSlider.value = String(queuedPlateCount)
    plateCountValueNode.textContent = String(queuedPlateCount)
    plateWarpSlider.value = queuedPlateWarpAmplitude.toFixed(2)
    plateWarpValueNode.textContent = queuedPlateWarpAmplitude.toFixed(2)
    plateRoughnessSlider.value = queuedPlateWarpRoughness.toFixed(2)
    plateRoughnessValueNode.textContent = queuedPlateWarpRoughness.toFixed(2)
    mountainRadiusSlider.value = queuedMountainRadius.toFixed(1)
    mountainRadiusValueNode.textContent = queuedMountainRadius.toFixed(1)
    mountainHeightSlider.value = queuedMountainHeight.toFixed(2)
    mountainHeightValueNode.textContent = queuedMountainHeight.toFixed(2)
    terrainRoughnessSlider.value = queuedTerrainRoughness.toFixed(2)
    terrainRoughnessValueNode.textContent = queuedTerrainRoughness.toFixed(2)
    terrainFrequencySlider.value = queuedTerrainFrequency.toFixed(1)
    terrainFrequencyValueNode.textContent = queuedTerrainFrequency.toFixed(1)
    sunAngleSlider.value = queuedSunAngle.toFixed(0)
    sunAngleValueNode.textContent = queuedSunAngle.toFixed(0)
    elevationScaleSlider.value = queuedElevationScale.toFixed(1)
    elevationScaleValueNode.textContent = queuedElevationScale.toFixed(1)
    verticalExaggerationSlider.value = queuedVerticalExaggeration.toFixed(1)
    verticalExaggerationValueNode.textContent = queuedVerticalExaggeration.toFixed(1)
    seedInput.value = String(queuedSeed >>> 0)
    renderModeSelect.value = queuedRenderMode

    renderQueued = true
    void processQueuedRender().catch((error) => {
      statusNode.textContent = `Pipeline failed: ${error.message}`
      console.error(error)
    })
  }

  thresholdSlider.addEventListener('input', (event) => {
    queueRender(
      Number.parseFloat(event.target.value),
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode
    )
  })

  falloffSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      Number.parseFloat(event.target.value),
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode
    )
  })

  noiseSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      Number.parseFloat(event.target.value),
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode
    )
  })

  edgeWarpInput.addEventListener('change', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      Number.parseFloat(event.target.value),
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode
    )
  })

  plateCountSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      Number.parseFloat(event.target.value),
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode
    )
  })

  plateWarpSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      Number.parseFloat(event.target.value),
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode
    )
  })

  plateRoughnessSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      Number.parseFloat(event.target.value),
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode
    )
  })

  mountainRadiusSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      Number.parseFloat(event.target.value),
      queuedMountainHeight,
      queuedRenderMode
    )
  })

  mountainHeightSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      Number.parseFloat(event.target.value),
      queuedRenderMode
    )
  })

  terrainRoughnessSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode,
      Number.parseFloat(event.target.value),
      queuedTerrainFrequency
    )
  })

  terrainFrequencySlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode,
      queuedTerrainRoughness,
      Number.parseFloat(event.target.value)
    )
  })

  sunAngleSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode,
      queuedTerrainRoughness,
      queuedTerrainFrequency,
      Number.parseFloat(event.target.value),
      queuedElevationScale
    )
  })

  elevationScaleSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode,
      queuedTerrainRoughness,
      queuedTerrainFrequency,
      queuedSunAngle,
      Number.parseFloat(event.target.value),
      queuedVerticalExaggeration
    )
  })

  verticalExaggerationSlider.addEventListener('input', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode,
      queuedTerrainRoughness,
      queuedTerrainFrequency,
      queuedSunAngle,
      queuedElevationScale,
      Number.parseFloat(event.target.value)
    )
  })

  renderModeSelect.addEventListener('change', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      queuedSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      event.target.value
    )
  })

  seedInput.addEventListener('change', (event) => {
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      Number.parseFloat(event.target.value),
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode
    )
  })

  randomizeSeedButton.addEventListener('click', () => {
    const randomSeed = crypto.getRandomValues(new Uint32Array(1))[0]
    queueRender(
      queuedThreshold,
      queuedFalloff,
      queuedNoise,
      queuedEdgeWarp,
      randomSeed,
      queuedPlateCount,
      queuedPlateWarpAmplitude,
      queuedPlateWarpRoughness,
      queuedMountainRadius,
      queuedMountainHeight,
      queuedRenderMode
    )
  })

  queueRender(
    queuedThreshold,
    queuedFalloff,
    queuedNoise,
    queuedEdgeWarp,
    queuedSeed,
    queuedPlateCount,
    queuedPlateWarpAmplitude,
    queuedPlateWarpRoughness,
    queuedMountainRadius,
    queuedMountainHeight,
    queuedRenderMode,
    queuedTerrainRoughness,
    queuedTerrainFrequency,
    queuedSunAngle,
    queuedElevationScale,
    queuedVerticalExaggeration
  )
}

runPipeline().catch((error) => {
  if (statusNode) {
    statusNode.textContent = `Pipeline failed: ${error.message}`
  }
  console.error(error)
})
