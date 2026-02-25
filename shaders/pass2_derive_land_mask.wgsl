// Pass 2: Derive land mask from plate types.
// Continental plates (type 0.0) → land. Oceanic (type 1.0) → ocean.
// The coastline IS the plate boundary — organic shape comes from pass1 domain warp.

struct GridParams {
  width:  u32,
  height: u32,
  seed:   u32,
  _pad:   u32,
}

@group(0) @binding(0) var<storage, read>       plate_type: array<f32>;
@group(0) @binding(1) var<storage, read_write> land_mask:  array<f32>;
@group(0) @binding(2) var<uniform>             params:     GridParams;

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.width * params.height) { return; }
  // plate_type: 0.0 = continental = land, 1.0 = oceanic = ocean
  land_mask[idx] = select(1.0, 0.0, plate_type[idx] > 0.5);
}
