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
@group(0) @binding(1) var<storage, read_write> bbox: BoundingBox;
@group(0) @binding(2) var<uniform> params: GridParams;

var<workgroup> local_extents: array<atomic<u32>, 4>;

@compute @workgroup_size(256, 1, 1)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_index) local_index: u32,
  @builtin(num_workgroups) num_workgroups: vec3<u32>
) {
  if (local_index == 0u) {
    atomicStore(&local_extents[0], params.width);
    atomicStore(&local_extents[1], 0u);
    atomicStore(&local_extents[2], params.height);
    atomicStore(&local_extents[3], 0u);
  }
  workgroupBarrier();

  let total_threads: u32 = num_workgroups.x * 256u;
  var flat_index: u32 = gid.x;
  let cell_count: u32 = params.width * params.height;
  var has_land = false;
  var thread_min_x = params.width;
  var thread_max_x = 0u;
  var thread_min_y = params.height;
  var thread_max_y = 0u;

  loop {
    if (flat_index >= cell_count) {
      break;
    }
    if (land_mask[flat_index] >= 0.5) {
      let x: u32 = flat_index % params.width;
      let y: u32 = flat_index / params.width;
      has_land = true;
      thread_min_x = min(thread_min_x, x);
      thread_max_x = max(thread_max_x, x);
      thread_min_y = min(thread_min_y, y);
      thread_max_y = max(thread_max_y, y);
    }
    flat_index = flat_index + total_threads;
  }

  if (has_land) {
    atomicMin(&local_extents[0], thread_min_x);
    atomicMax(&local_extents[1], thread_max_x);
    atomicMin(&local_extents[2], thread_min_y);
    atomicMax(&local_extents[3], thread_max_y);
  }

  workgroupBarrier();

  if (local_index == 0u) {
    atomicMin(&bbox.min_x, atomicLoad(&local_extents[0]));
    atomicMax(&bbox.max_x, atomicLoad(&local_extents[1]));
    atomicMin(&bbox.min_y, atomicLoad(&local_extents[2]));
    atomicMax(&bbox.max_y, atomicLoad(&local_extents[3]));
  }
}
