struct FaultParams {
  width: u32,
  height: u32,
  seed: u32,
  _pad0: u32,
}

@group(0) @binding(0) var<storage, read> plate_id: array<u32>;
@group(0) @binding(1) var<storage, read_write> fault_stress: array<f32>;
@group(0) @binding(2) var<uniform> params: FaultParams;

fn hash_u32(x: u32) -> u32 {
  var h = x;
  h = h ^ (h >> 16u);
  h = h * 0x7feb352du;
  h = h ^ (h >> 15u);
  h = h * 0x846ca68bu;
  h = h ^ (h >> 16u);
  return h;
}

fn hash_to_unit(x: u32) -> f32 {
  return f32(hash_u32(x)) * (1.0 / 4294967295.0);
}

fn plate_velocity(id: u32, seed: u32) -> vec2<f32> {
  let base = seed ^ (id * 747796405u + 2891336453u);
  let vx = hash_to_unit(base ^ 0x9e3779b9u) * 2.0 - 1.0;
  let vy = hash_to_unit(base ^ 0x85ebca6bu) * 2.0 - 1.0;
  let v = vec2<f32>(vx, vy);
  let len = length(v);
  if (len > 0.00001) {
    return v / len;
  }
  return vec2<f32>(1.0, 0.0);
}

fn evaluate_neighbor(
  self_id: u32,
  self_v: vec2<f32>,
  nx: i32,
  ny: i32,
  direction: vec2<f32>,
  best_stress: ptr<function, f32>
) {
  if (nx < 0 || nx >= i32(params.width) || ny < 0 || ny >= i32(params.height)) {
    return;
  }

  let n_index = u32(ny) * params.width + u32(nx);
  let n_id = plate_id[n_index];
  if (n_id == self_id) {
    return;
  }

  let n_v = plate_velocity(n_id, params.seed);
  let v_rel = n_v - self_v;
  let stress = dot(v_rel, direction);
  if (abs(stress) > abs(*best_stress)) {
    *best_stress = stress;
  }
}

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
  let self_v = plate_velocity(self_id, params.seed);

  var best_stress = 0.0;

  evaluate_neighbor(self_id, self_v, x, y - 1, vec2<f32>(0.0, -1.0), &best_stress);
  evaluate_neighbor(self_id, self_v, x, y + 1, vec2<f32>(0.0, 1.0), &best_stress);
  evaluate_neighbor(self_id, self_v, x - 1, y, vec2<f32>(-1.0, 0.0), &best_stress);
  evaluate_neighbor(self_id, self_v, x + 1, y, vec2<f32>(1.0, 0.0), &best_stress);

  fault_stress[flat_index] = best_stress;
}
