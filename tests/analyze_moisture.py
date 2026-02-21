import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from pathlib import Path
import argparse
import sys

def _decode_moisture_from_rgb(moisture_rgb: np.ndarray) -> np.ndarray:
    """Invert the current debug moisture colormap using its monotonic red channel."""

    red = moisture_rgb[..., 0].astype(np.float32)
    # Forward map in cli.main:
    # t in [0, 0.5]: r = 210 - 240*t
    # t in [0.5, 1.0]: r = 160 - 140*t
    t_low = (210.0 - red) / 240.0
    t_high = (160.0 - red) / 140.0
    moisture = np.where(red >= 90.0, t_low, t_high)
    return np.clip(moisture, 0.0, 1.0).astype(np.float32)


def analyze_moisture(run_dir: Path):
    print("Analyzing Moisture Map Realism...")
    print(f"Run directory: {run_dir}")
    
    # 1. Load the data
    try:
        moisture_img = Image.open(run_dir / 'debug_moisture.png').convert('RGB')
        moisture_rgb = np.array(moisture_img, dtype=np.uint8)
        moisture = _decode_moisture_from_rgb(moisture_rgb)
        
        height = np.load(run_dir / 'height.npy')
    except Exception as e:
        print(f"Error loading files from {run_dir}: {e}")
        sys.exit(1)

    land_mask = height > 0

    # 2. Coastal Decay Math
    print("\n--- 1. COASTAL DECAY (Ambient Humidity) ---")
    dist_to_coast = distance_transform_edt(land_mask)
    
    coast_1_10 = land_mask & (dist_to_coast > 0) & (dist_to_coast <= 10)
    coast_10_50 = land_mask & (dist_to_coast > 10) & (dist_to_coast <= 50)
    inland_50_plus = land_mask & (dist_to_coast > 50)

    print(f"Mean Intensity (Coast 1-10px):  {np.mean(moisture[coast_1_10]):.3f}")
    print(f"Mean Intensity (Coast 10-50px): {np.mean(moisture[coast_10_50]):.3f}")
    print(f"Mean Intensity (Inland 50px+):  {np.mean(moisture[inland_50_plus]):.3f}")
    print("-> Objective: If these numbers don't show a clear, steady drop-off, the coastal gradient is broken.")

    # 3. Orographic Lift (Rain Shadows) Math
    print("\n--- 2. OROGRAPHIC LIFT (Rain Shadows) ---")
    # Assuming West-to-East wind: Positive dx means moving uphill (upslope)
    dy, dx = np.gradient(height)
    
    # Isolate steep slopes to avoid flatland noise
    upslope_w_facing = land_mask & (dx > 5)   # Western faces (Windward)
    downslope_e_facing = land_mask & (dx < -5)  # Eastern faces (Leeward)

    print(f"Mean Intensity (Upslope W-facing):   {np.mean(moisture[upslope_w_facing]):.3f}")
    print(f"Mean Intensity (Downslope E-facing): {np.mean(moisture[downslope_e_facing]):.3f}")
    print("-> Objective: If the Upslope number isn't drastically different from the Downslope number, the rain shadows failed.")

    # 4. Riparian Corridors Math
    print("\n--- 3. RIPARIAN CORRIDORS (Inland Only) ---")
    try:
        rivers = Image.open(run_dir / 'debug_river_mask.png').convert('L')
        river_mask = np.array(rivers) > 128
        
        dist_to_river = distance_transform_edt(~river_mask)
        inland_mask = dist_to_coast > 20  # Look only at deep inland pixels
        
        near_river = inland_mask & (dist_to_river <= 5)
        far_from_river = inland_mask & (dist_to_river > 20)
        
        print(f"Mean Intensity (Near River <=5px):  {np.mean(moisture[near_river]):.3f}")
        print(f"Mean Intensity (Far from River >20px): {np.mean(moisture[far_from_river]):.3f}")
        print("-> Objective: If the 'Near River' number isn't significantly different, the rivers are not emitting moisture.")
    except Exception:
        print("Could not load 'debug_river_mask.png' to test riparian corridors.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyze moisture debug realism metrics")
    parser.add_argument(
        "--run-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "out" / "mistyforge" / "2048x1024",
        help="Directory containing debug_moisture.png, debug_river_mask.png, and height.npy",
    )
    args = parser.parse_args()
    analyze_moisture(args.run_dir)
