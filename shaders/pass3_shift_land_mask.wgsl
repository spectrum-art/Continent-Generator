struct GridParams {
  width: u32,
  height: u32,
  _pad0: u32,
  _pad1: u32,
}

struct BoundingBox {
  min_x: atomic<u32>,
  max_x: atomic<u32>,
  min_y: atomic<u32>,
  max_y: atomic<u32>,
}

@group(0) @binding(0) var<storage, read> land_mask: array<f32>;
@group(0) @binding(1) var<storage, read_write> final_land_mask: array<f32>;
@group(0) @binding(2) var<storage, read_write> bbox: BoundingBox;
@group(0) @binding(3) var<uniform> params: GridParams;

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let flat_index: u32 = gid.x;
  let cell_count: u32 = params.width * params.height;
  if (flat_index >= cell_count) {
    return;
  }

  let min_x = atomicLoad(&bbox.min_x);
  let max_x = atomicLoad(&bbox.max_x);
  let min_y = atomicLoad(&bbox.min_y);
  let max_y = atomicLoad(&bbox.max_y);

  if (min_x > max_x || min_y > max_y) {
    final_land_mask[flat_index] = 0.0;
    return;
  }

  let x: u32 = flat_index % params.width;
  let y: u32 = flat_index / params.width;

  let box_center_x = (f32(min_x) + f32(max_x)) * 0.5;
  let box_center_y = (f32(min_y) + f32(max_y)) * 0.5;
  let target_center_x = f32(params.width) * 0.5;
  let target_center_y = f32(params.height) * 0.5;
  let delta_x = i32(round(target_center_x - box_center_x));
  let delta_y = i32(round(target_center_y - box_center_y));

  let src_x = i32(x) - delta_x;
  let src_y = i32(y) - delta_y;
  let in_bounds = src_x >= 0 && src_x < i32(params.width) && src_y >= 0 && src_y < i32(params.height);

  if (in_bounds) {
    let src_idx = u32(src_y) * params.width + u32(src_x);
    final_land_mask[flat_index] = land_mask[src_idx];
  } else {
    final_land_mask[flat_index] = 0.0;
  }
}
