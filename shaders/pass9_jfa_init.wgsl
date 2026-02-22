struct GridParams {
  width: u32,
  height: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<storage, read> kinematic_data: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> jfa_seed: array<vec2<f32>>;
@group(0) @binding(2) var<uniform> params: GridParams;

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let flat_index = gid.x;
  let cell_count = params.width * params.height;
  if (flat_index >= cell_count) {
    return;
  }

  let x = i32(flat_index % params.width);
  let y = i32(flat_index / params.width);
  let kin = kinematic_data[flat_index];

  if (kin.w > 0.5) {
    jfa_seed[flat_index] = vec2<f32>(f32(x), f32(y));
  } else {
    jfa_seed[flat_index] = vec2<f32>(-10000.0, -10000.0);
  }
}
