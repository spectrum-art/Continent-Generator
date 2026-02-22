struct RenderParams {
  width: u32,
  height: u32,
  render_mode: u32,
  _pad0: u32,
  sun_angle: f32,
  elevation_scale: f32,
  vertical_exaggeration: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<storage, read> kinematic_data: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> jfa_nearest: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> shaded_rgba: array<u32>;
@group(0) @binding(3) var<uniform> params: RenderParams;

fn pack_rgba8(color: vec4<f32>) -> u32 {
  let c = vec4<u32>(round(clamp(color, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0));
  return
    (c.x & 255u) |
    ((c.y & 255u) << 8u) |
    ((c.z & 255u) << 16u) |
    ((c.w & 255u) << 24u);
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

  if (params.render_mode == 1u) {
    let kin = kinematic_data[flat_index];
    let is_even = f32((x + y) % 2 == 0);
    let error_color = vec4<f32>(is_even, 0.0, 1.0 - is_even, 1.0);

    if (kin.y < 0.0) {
      shaded_rgba[flat_index] = pack_rgba8(error_color);
      return;
    }

    let c = kin.z;
    if (c != 0.0 && c != 1.0 && c != 2.0) {
      shaded_rgba[flat_index] = pack_rgba8(error_color);
      return;
    }

    if (kin.w == 0.0 && (kin.x != 0.0 || kin.y != 0.0 || kin.z != 0.0)) {
      shaded_rgba[flat_index] = pack_rgba8(error_color);
      return;
    }

    if (kin.w == 0.0) {
      shaded_rgba[flat_index] = pack_rgba8(vec4<f32>(0.0, 0.0, 0.0, 1.0));
      return;
    }

    let kinematics_color = vec4<f32>(
      clamp(abs(kin.x), 0.0, 1.0),
      clamp(kin.y, 0.0, 1.0),
      clamp(kin.z * 0.5, 0.0, 1.0),
      1.0
    );
    shaded_rgba[flat_index] = pack_rgba8(kinematics_color);
    return;
  }

  if (params.render_mode == 2u) {
    let nearest = jfa_nearest[flat_index];
    if (nearest.x < -9999.0 || nearest.y < -9999.0) {
      shaded_rgba[flat_index] = pack_rgba8(vec4<f32>(0.0, 0.0, 0.0, 1.0));
      return;
    }

    let p = vec2<f32>(f32(x), f32(y));
    let d = nearest - p;
    let distance = length(d);
    let col = 1.0 - clamp(distance / 200.0, 0.0, 1.0);
    shaded_rgba[flat_index] = pack_rgba8(vec4<f32>(col, col, col, 1.0));
    return;
  }

  shaded_rgba[flat_index] = pack_rgba8(vec4<f32>(0.0, 0.0, 0.0, 1.0));
}
