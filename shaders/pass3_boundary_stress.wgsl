// Pass 3: Compute tectonic stress at plate boundaries.
// 4-neighbour scan; at each plate boundary, compute:
//   approach_speed = dot(self_v - neighbor_v, dir_to_neighbor)
//   Positive = converging = compression → mountains
//   Negative = diverging  = extension  → rifts
//
// kinematic_data layout:
//   .x = approach_speed  (clamped ±2)
//   .y = shear stress    (0–2)
//   .z = boundary_type   (0=cont-cont, 1=ocean-cont, 2=ocean-ocean)
//   .w = valid flag      (1.0 if on a plate boundary, seeds JFA)

struct KineParams {
  width:  u32,
  height: u32,
  seed:   u32,
  _pad:   u32,
}

@group(0) @binding(0) var<storage, read>       plate_id:       array<u32>;
@group(0) @binding(1) var<storage, read>       plate_velocity: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read>       plate_type:     array<f32>;
@group(0) @binding(3) var<storage, read_write> kinematic_data: array<vec4<f32>>;
@group(0) @binding(4) var<uniform>             params:         KineParams;

const STRESS_SCALE: f32 = 0.10;

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let cell_count = params.width * params.height;
  if (idx >= cell_count) { return; }

  let x  = i32(idx % params.width);
  let y  = i32(idx / params.width);
  let mx = i32(params.width)  - 1;
  let my = i32(params.height) - 1;

  let self_id   = plate_id[idx];
  let self_v    = plate_velocity[idx];
  let self_type = plate_type[idx];

  var best_kinematics = vec4<f32>(0.0);
  var best_v_mag      = 0.0;

  // 4-neighbour directions
  for (var i = 0; i < 4; i++) {
    var dx = 0; var dy = 0;
    switch (i) {
      case 0: { dy = -1; }
      case 1: { dy =  1; }
      case 2: { dx = -1; }
      default: { dx =  1; }
    }
    let nx = clamp(x + dx, 0, mx);
    let ny = clamp(y + dy, 0, my);
    let n_idx = u32(ny) * params.width + u32(nx);

    if (plate_id[n_idx] == self_id) { continue; }

    let n_v    = plate_velocity[n_idx];
    let n_type = plate_type[n_idx];

    // Direction from self toward neighbour
    let dir = normalize(vec2<f32>(f32(dx), f32(dy)));

    // Approach speed: positive = converging, negative = diverging
    let rel_v        = self_v - n_v;
    let approach_spd = clamp(dot(rel_v, dir) * STRESS_SCALE, -2.0, 2.0);
    let shear        = clamp(abs(rel_v.x * dir.y - rel_v.y * dir.x) * STRESS_SCALE, 0.0, 2.0);
    let v_mag        = length(rel_v);

    // boundary_type: self + neighbour crust combination
    // 0 = cont-cont, 1 = mixed, 2 = ocean-ocean
    let btype = self_type + n_type; // 0.0, 1.0, or 2.0

    if (v_mag > best_v_mag) {
      best_v_mag      = v_mag;
      best_kinematics = vec4<f32>(approach_spd, shear, btype, 1.0);
    }
  }

  kinematic_data[idx] = best_kinematics;
}
