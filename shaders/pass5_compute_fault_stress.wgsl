struct KinematicParams {
  width: u32,
  height: u32,
  seed: u32,
  _pad0: u32,
}

@group(0) @binding(0) var<storage, read> plate_id: array<u32>;
@group(0) @binding(1) var<storage, read> plate_velocity: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> final_land_mask: array<f32>;
@group(0) @binding(3) var<storage, read_write> kinematic_data: array<vec4<f32>>;
@group(0) @binding(4) var<uniform> params: KinematicParams;

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let flat_index = gid.x;
  let cell_count = params.width * params.height;
  if (flat_index >= cell_count) {
    return;
  }

  let x = i32(flat_index % params.width);
  let y = i32(flat_index / params.width);
  let self_id = plate_id[flat_index];
  let self_mask = final_land_mask[flat_index];
  let self_is_land = f32(self_mask >= 0.5);
  let self_v = plate_velocity[flat_index];

  var max_v_mag = 0.0;
  var best_kinematics = vec4<f32>(0.0);

  for (var i = 0; i < 4; i = i + 1) {
    var nx = x;
    var ny = y;
    if (i == 0) {
      ny = y - 1;
    } else if (i == 1) {
      ny = y + 1;
    } else if (i == 2) {
      nx = x - 1;
    } else {
      nx = x + 1;
    }

    if (nx < 0 || nx >= i32(params.width) || ny < 0 || ny >= i32(params.height)) {
      continue;
    }

    let n_index = u32(ny) * params.width + u32(nx);
    let n_id = plate_id[n_index];
    if (n_id == self_id) {
      continue;
    }

    let neighbor_mask = final_land_mask[n_index];
    let neighbor_is_land = f32(neighbor_mask >= 0.5);
    let crust_type = self_is_land + neighbor_is_land;
    let dir = normalize(vec2<f32>(f32(nx - x), f32(ny - y)));
    let neighbor_v = plate_velocity[n_index];
    let v_rel = neighbor_v - self_v;
    let normal_stress = dot(v_rel, dir);
    let shear_stress = abs(v_rel.x * dir.y - v_rel.y * dir.x);
    let v_mag = length(v_rel);

    if (v_mag > max_v_mag) {
      max_v_mag = v_mag;
      best_kinematics = vec4<f32>(normal_stress, shear_stress, crust_type, 1.0);
    }
  }

  kinematic_data[flat_index] = best_kinematics;
}
