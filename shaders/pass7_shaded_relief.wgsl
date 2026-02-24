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
@group(0) @binding(2) var<storage, read> elevation: array<f32>;
@group(0) @binding(3) var<storage, read_write> shaded_rgba: array<u32>;
@group(0) @binding(4) var<uniform> params: RenderParams;

fn pack_rgba8(color: vec4<f32>) -> u32 {
  let c = vec4<u32>(round(clamp(color, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0));
  return
    (c.x & 255u) |
    ((c.y & 255u) << 8u) |
    ((c.z & 255u) << 16u) |
    ((c.w & 255u) << 24u);
}

fn sample_elevation(x: i32, y: i32) -> f32 {
  let cx = clamp(x, 0, i32(params.width) - 1);
  let cy = clamp(y, 0, i32(params.height) - 1);
  let idx = u32(cy) * params.width + u32(cx);
  return elevation[idx];
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

  if (params.render_mode == 3u) {
    let center = sample_elevation(x, y);
    if (center <= 0.08) {
      let ocean = vec4<f32>(0.03, 0.16, 0.32, 1.0);
      shaded_rgba[flat_index] = pack_rgba8(ocean);
      return;
    }

    let left = sample_elevation(x - 1, y);
    let right = sample_elevation(x + 1, y);
    let top = sample_elevation(x, y - 1);
    let bottom = sample_elevation(x, y + 1);

    let relief_scale = params.elevation_scale * params.vertical_exaggeration;
    let dx = (right - left) * relief_scale;
    let dy = (bottom - top) * relief_scale;
    let normal = normalize(vec3<f32>(-dx, -dy, 1.0));

    let sun_rad = radians(params.sun_angle);
    let light_dir = normalize(vec3<f32>(cos(sun_rad), sin(sun_rad), 1.0));
    let diffuse = max(dot(normal, light_dir), 0.0);
    let ambient = 0.2;
    let light = ambient + diffuse * (1.0 - ambient);

    let lowland = vec3<f32>(0.56, 0.60, 0.45);
    let highland = vec3<f32>(0.79, 0.74, 0.62);
    let base_land = mix(lowland, highland, clamp(center, 0.0, 1.0));
    let lit = base_land * light;
    shaded_rgba[flat_index] = pack_rgba8(vec4<f32>(lit, 1.0));
    return;
  }

  if (params.render_mode == 4u) {
    let h = clamp(sample_elevation(x, y), 0.0, 1.0);
    shaded_rgba[flat_index] = pack_rgba8(vec4<f32>(h, h, h, 1.0));
    return;
  }

  shaded_rgba[flat_index] = pack_rgba8(vec4<f32>(0.0, 0.0, 0.0, 1.0));
}
