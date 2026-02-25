use wasm_bindgen::prelude::*;

const GRID_WIDTH: u32 = 2048;
const GRID_HEIGHT: u32 = 1024;
const GRID_CELL_COUNT: u32 = GRID_WIDTH * GRID_HEIGHT;
const WORKGROUP_SIZE: u32 = 256;
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
pub fn deterministic_seed() -> u32 {
    DEFAULT_SEED
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

/// Returns [dispatch_x] for a single full-grid pass.
#[wasm_bindgen]
pub fn single_pass_dispatch(flat_cell_count: u32) -> Result<Box<[u32]>, JsValue> {
    let (_, dispatch_x) = compute_dispatch(flat_cell_count, 1.0)?;
    Ok(vec![dispatch_x].into_boxed_slice())
}

/// Returns [dispatch_x, dispatch_x, ...] for N identical full-grid passes.
#[wasm_bindgen]
pub fn n_pass_dispatch(flat_cell_count: u32, n: u32) -> Result<Box<[u32]>, JsValue> {
    if n == 0 {
        return Err(JsValue::from_str("n must be > 0"));
    }
    let (_, dispatch_x) = compute_dispatch(flat_cell_count, 1.0)?;
    Ok(vec![dispatch_x; n as usize].into_boxed_slice())
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
