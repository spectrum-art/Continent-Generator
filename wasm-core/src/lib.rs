use wasm_bindgen::prelude::*;

const GRID_WIDTH: u32 = 2048;
const GRID_HEIGHT: u32 = 1024;
const GRID_CELL_COUNT: u32 = GRID_WIDTH * GRID_HEIGHT;
const WORKGROUP_SIZE: u32 = 256;
const DEFAULT_FBM_BASE_FREQUENCY_NORM: f32 = 1.20;
const DEFAULT_LAND_THRESHOLD_NORM: f32 = 0.54;
const DEFAULT_FALLOFF_STRENGTH_NORM: f32 = 2.20;
const DEFAULT_NOISE_AMPLITUDE_NORM: f32 = 0.60;
const DEFAULT_EDGE_WARP_NORM: f32 = 0.12;
const DEFAULT_PLATE_COUNT: u32 = 15;
const DEFAULT_PLATE_WARP_AMPLITUDE_NORM: f32 = 0.50;
const DEFAULT_PLATE_WARP_ROUGHNESS_NORM: f32 = 0.60;
const DEFAULT_MOUNTAIN_RADIUS_NORM: f32 = 20.0;
const DEFAULT_MOUNTAIN_HEIGHT_NORM: f32 = 0.80;
const DEFAULT_TERRAIN_ROUGHNESS_NORM: f32 = 0.50;
const DEFAULT_TERRAIN_FREQUENCY_NORM: f32 = 8.0;
const DEFAULT_SUN_ANGLE_NORM: f32 = 315.0;
const DEFAULT_ELEVATION_SCALE_NORM: f32 = 10.0;
const DEFAULT_VERTICAL_EXAGGERATION_NORM: f32 = 5.0;
const DEFAULT_SEED: u32 = 1337;

fn compute_dispatch(flat_cell_count: u32, coverage_norm: f32) -> Result<(u32, u32), JsValue> {
    if flat_cell_count != GRID_CELL_COUNT {
        return Err(JsValue::from_str("flat_cell_count must match 2048x1024"));
    }
    if !(0.0..=1.0).contains(&coverage_norm) {
        return Err(JsValue::from_str(
            "coverage_norm must be within [0.0, 1.0]",
        ));
    }

    let covered_cells = ((flat_cell_count as f32) * coverage_norm)
        .ceil()
        .max(1.0) as u32;
    let dispatch_x = covered_cells.div_ceil(WORKGROUP_SIZE);
    Ok((covered_cells, dispatch_x))
}

#[wasm_bindgen]
pub fn grid_width() -> u32 {
    GRID_WIDTH
}

#[wasm_bindgen]
pub fn grid_height() -> u32 {
    GRID_HEIGHT
}

#[wasm_bindgen]
pub fn grid_cell_count() -> u32 {
    GRID_CELL_COUNT
}

#[wasm_bindgen]
pub fn normalized_fbm_base_frequency() -> f32 {
    DEFAULT_FBM_BASE_FREQUENCY_NORM
}

#[wasm_bindgen]
pub fn normalized_land_threshold() -> f32 {
    DEFAULT_LAND_THRESHOLD_NORM
}

#[wasm_bindgen]
pub fn normalized_land_threshold_from_slider(raw: f32) -> f32 {
    raw.clamp(-1.0, 2.0)
}

#[wasm_bindgen]
pub fn normalized_falloff_strength() -> f32 {
    DEFAULT_FALLOFF_STRENGTH_NORM
}

#[wasm_bindgen]
pub fn normalized_falloff_strength_from_slider(raw: f32) -> f32 {
    raw.clamp(0.0, 4.0)
}

#[wasm_bindgen]
pub fn normalized_noise_amplitude() -> f32 {
    DEFAULT_NOISE_AMPLITUDE_NORM
}

#[wasm_bindgen]
pub fn normalized_noise_amplitude_from_slider(raw: f32) -> f32 {
    raw.clamp(0.0, 2.0)
}

#[wasm_bindgen]
pub fn normalized_edge_warp() -> f32 {
    DEFAULT_EDGE_WARP_NORM
}

#[wasm_bindgen]
pub fn normalized_edge_warp_from_input(raw: f32) -> f32 {
    if raw.is_finite() {
        raw
    } else {
        DEFAULT_EDGE_WARP_NORM
    }
}

#[wasm_bindgen]
pub fn deterministic_seed() -> u32 {
    DEFAULT_SEED
}

#[wasm_bindgen]
pub fn normalized_plate_count() -> u32 {
    DEFAULT_PLATE_COUNT
}

#[wasm_bindgen]
pub fn normalized_plate_count_from_slider(raw: f32) -> u32 {
    if !raw.is_finite() {
        return DEFAULT_PLATE_COUNT;
    }
    raw.round().clamp(3.0, 100.0) as u32
}

#[wasm_bindgen]
pub fn normalized_plate_warp_amplitude() -> f32 {
    DEFAULT_PLATE_WARP_AMPLITUDE_NORM
}

#[wasm_bindgen]
pub fn normalized_plate_warp_amplitude_from_slider(raw: f32) -> f32 {
    raw.clamp(0.0, 2.0)
}

#[wasm_bindgen]
pub fn normalized_plate_warp_roughness() -> f32 {
    DEFAULT_PLATE_WARP_ROUGHNESS_NORM
}

#[wasm_bindgen]
pub fn normalized_plate_warp_roughness_from_slider(raw: f32) -> f32 {
    raw.clamp(0.3, 0.8)
}

#[wasm_bindgen]
pub fn normalized_mountain_radius() -> f32 {
    DEFAULT_MOUNTAIN_RADIUS_NORM
}

#[wasm_bindgen]
pub fn normalized_mountain_radius_from_slider(raw: f32) -> f32 {
    raw.clamp(5.0, 50.0)
}

#[wasm_bindgen]
pub fn normalized_mountain_height() -> f32 {
    DEFAULT_MOUNTAIN_HEIGHT_NORM
}

#[wasm_bindgen]
pub fn normalized_mountain_height_from_slider(raw: f32) -> f32 {
    raw.clamp(0.1, 2.0)
}

#[wasm_bindgen]
pub fn normalized_terrain_roughness() -> f32 {
    DEFAULT_TERRAIN_ROUGHNESS_NORM
}

#[wasm_bindgen]
pub fn normalized_terrain_roughness_from_slider(raw: f32) -> f32 {
    raw.clamp(0.0, 1.0)
}

#[wasm_bindgen]
pub fn normalized_terrain_frequency() -> f32 {
    DEFAULT_TERRAIN_FREQUENCY_NORM
}

#[wasm_bindgen]
pub fn normalized_terrain_frequency_from_slider(raw: f32) -> f32 {
    raw.clamp(1.0, 20.0)
}

#[wasm_bindgen]
pub fn normalized_sun_angle() -> f32 {
    DEFAULT_SUN_ANGLE_NORM
}

#[wasm_bindgen]
pub fn normalized_sun_angle_from_slider(raw: f32) -> f32 {
    if raw.is_finite() {
        raw.clamp(0.0, 360.0)
    } else {
        DEFAULT_SUN_ANGLE_NORM
    }
}

#[wasm_bindgen]
pub fn normalized_elevation_scale() -> f32 {
    DEFAULT_ELEVATION_SCALE_NORM
}

#[wasm_bindgen]
pub fn normalized_elevation_scale_from_slider(raw: f32) -> f32 {
    raw.clamp(1.0, 20.0)
}

#[wasm_bindgen]
pub fn normalized_vertical_exaggeration() -> f32 {
    DEFAULT_VERTICAL_EXAGGERATION_NORM
}

#[wasm_bindgen]
pub fn normalized_vertical_exaggeration_from_slider(raw: f32) -> f32 {
    raw.clamp(1.0, 20.0)
}

#[wasm_bindgen]
pub fn deterministic_seed_from_input(raw: f64) -> u32 {
    if !raw.is_finite() || raw.is_sign_negative() {
        return DEFAULT_SEED;
    }
    raw.floor().min(u32::MAX as f64) as u32
}

#[wasm_bindgen]
pub fn map_flat_1d_to_gpu(flat_cell_count: u32, coverage_norm: f32) -> Result<Box<[u32]>, JsValue> {
    let (covered_cells, dispatch_x) = compute_dispatch(flat_cell_count, coverage_norm)?;

    Ok(vec![
        GRID_WIDTH,
        GRID_HEIGHT,
        covered_cells,
        dispatch_x,
        WORKGROUP_SIZE,
    ]
    .into_boxed_slice())
}

#[wasm_bindgen]
pub fn three_pass_dispatch_sequence(
    flat_cell_count: u32,
    coverage_norm: f32,
) -> Result<Box<[u32]>, JsValue> {
    let (_, dispatch_x) = compute_dispatch(flat_cell_count, coverage_norm)?;
    let reduce_dispatch_x = dispatch_x.div_ceil(64).max(1);
    Ok(vec![dispatch_x, reduce_dispatch_x, dispatch_x].into_boxed_slice())
}

#[wasm_bindgen]
pub fn four_pass_dispatch_sequence(
    flat_cell_count: u32,
    coverage_norm: f32,
) -> Result<Box<[u32]>, JsValue> {
    let (_, dispatch_x) = compute_dispatch(flat_cell_count, coverage_norm)?;
    let reduce_dispatch_x = dispatch_x.div_ceil(64).max(1);
    Ok(vec![dispatch_x, reduce_dispatch_x, dispatch_x, dispatch_x].into_boxed_slice())
}

#[wasm_bindgen]
pub fn five_pass_dispatch_sequence(
    flat_cell_count: u32,
    coverage_norm: f32,
) -> Result<Box<[u32]>, JsValue> {
    let (_, dispatch_x) = compute_dispatch(flat_cell_count, coverage_norm)?;
    let reduce_dispatch_x = dispatch_x.div_ceil(64).max(1);
    Ok(vec![
        dispatch_x,
        reduce_dispatch_x,
        dispatch_x,
        dispatch_x,
        dispatch_x,
    ]
    .into_boxed_slice())
}

#[wasm_bindgen]
pub fn six_pass_dispatch_sequence(
    flat_cell_count: u32,
    coverage_norm: f32,
) -> Result<Box<[u32]>, JsValue> {
    let (_, dispatch_x) = compute_dispatch(flat_cell_count, coverage_norm)?;
    let reduce_dispatch_x = dispatch_x.div_ceil(64).max(1);
    Ok(vec![
        dispatch_x,
        reduce_dispatch_x,
        dispatch_x,
        dispatch_x,
        dispatch_x,
        dispatch_x,
    ]
    .into_boxed_slice())
}

#[wasm_bindgen]
pub fn source_of_truth_json(flat: &[f32], latency_ms: f64) -> Result<String, JsValue> {
    if flat.len() != GRID_CELL_COUNT as usize {
        return Err(JsValue::from_str("flat heightmap length mismatch"));
    }

    let width = GRID_WIDTH as usize;
    let height = GRID_HEIGHT as usize;
    let mut turn_count: u64 = 0;
    let mut straight_count: u64 = 0;
    let mut drainage_cells: u64 = 0;

    for y in 0..height {
        let row_start = y * width;
        let mut previous_delta = 0.0_f32;

        for x in 0..width {
            let idx = row_start + x;
            let value = flat[idx].clamp(0.0, 1.0);

            if value < 0.42 {
                drainage_cells += 1;
            }

            if x > 0 {
                let delta = value - flat[idx - 1].clamp(0.0, 1.0);
                if x > 1 {
                    if (delta - previous_delta).abs() > 0.0035 {
                        turn_count += 1;
                    } else {
                        straight_count += 1;
                    }
                }
                previous_delta = delta;
            }
        }
    }

    let straight_to_turn_ratio = straight_count as f64 / (turn_count.max(1) as f64);
    let sinuosity_index = 1.0 + ((turn_count as f64) / (straight_count.max(1) as f64)) * 0.1;
    let hydro_drainage_pct = (drainage_cells as f64 / GRID_CELL_COUNT as f64) * 100.0;

    Ok(format!(
        "{{\"sinuosity_index\":{sinuosity:.6},\"straight_to_turn_ratio\":{ratio:.6},\"hydro_drainage_pct\":{drainage:.6},\"latency_ms\":{latency:.6}}}",
        sinuosity = sinuosity_index,
        ratio = straight_to_turn_ratio,
        drainage = hydro_drainage_pct,
        latency = latency_ms
    ))
}
