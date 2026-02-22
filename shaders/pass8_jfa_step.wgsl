struct JfaStepParams {
  width: u32,
  height: u32,
  step_size: f32,
  _pad0: f32,
}

@group(0) @binding(0) var<storage, read> jfa_read: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> jfa_write: array<vec2<f32>>;
@group(0) @binding(2) var<uniform> params: JfaStepParams;

fn is_valid_candidate(p: vec2<f32>) -> bool {
  return p.x > -9999.0 && p.y > -9999.0;
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
  let center = vec2<f32>(f32(x), f32(y));
  let step_i = max(1, i32(round(params.step_size)));

  var best_coord = vec2<f32>(-10000.0, -10000.0);
  var best_dist2 = 1e30;

  for (var oy = -1; oy <= 1; oy = oy + 1) {
    for (var ox = -1; ox <= 1; ox = ox + 1) {
      let nx = x + ox * step_i;
      let ny = y + oy * step_i;
      if (nx < 0 || nx >= i32(params.width) || ny < 0 || ny >= i32(params.height)) {
        continue;
      }

      let n_index = u32(ny) * params.width + u32(nx);
      let candidate = jfa_read[n_index];
      if (!is_valid_candidate(candidate)) {
        continue;
      }

      let d = candidate - center;
      let dist2 = dot(d, d);
      if (dist2 < best_dist2) {
        best_dist2 = dist2;
        best_coord = candidate;
      }
    }
  }

  jfa_write[flat_index] = best_coord;
}
