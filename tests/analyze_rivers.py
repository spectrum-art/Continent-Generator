import argparse
import numpy as np
from PIL import Image
from pathlib import Path
import sys

def analyze_rivers(run_dir: Path):
    print("Analyzing Hydrological Sinuosity and D8 Artifacts...")
    print(f"Run directory: {run_dir}")
    
    try:
        # Load river mask and convert to binary boolean array
        river_img = Image.open(run_dir / 'debug_river_mask.png').convert('L')
        rivers = np.array(river_img) > 128
        
        # Load heightfield to separate mountains from flatlands
        height = np.load(run_dir / 'height.npy')
    except Exception as e:
        print(f"Error loading files: {e}")
        sys.exit(1)

    # We will define flatlands as the bottom 30% of the landmass elevation
    land_heights = height[height > 0]
    if len(land_heights) == 0:
        print("No landmass detected.")
        return
        
    flatland_threshold = np.percentile(land_heights, 30)
    flatlands = (height > 0) & (height <= flatland_threshold)
    mountains = height > flatland_threshold

    def calculate_straight_vs_turn(mask_region, region_name):
        # Isolate rivers in this specific elevation region
        region_rivers = rivers & mask_region
        
        # Get coordinates of all river pixels in this region
        y_coords, x_coords = np.where(region_rivers)
        
        straight_count = 0
        turn_count = 0
        endpoint_count = 0
        
        for y, x in zip(y_coords, x_coords):
            # Check 8-way neighbors for other river pixels
            # Slice safely around the edges
            y_min, y_max = max(0, y-1), min(rivers.shape[0], y+2)
            x_min, x_max = max(0, x-1), min(rivers.shape[1], x+2)
            
            neighborhood = rivers[y_min:y_max, x_min:x_max]
            
            # Count neighbors (subtract 1 because the center pixel itself is True)
            num_neighbors = np.sum(neighborhood) - 1
            
            if num_neighbors <= 1:
                endpoint_count += 1
            elif num_neighbors == 2:
                # Exactly 2 neighbors -> It's a continuous path. Is it straight or turning?
                # Find the local coordinates of the two neighbors
                ny, nx = np.where(neighborhood)
                
                # Remove the center pixel (which is at local index 1,1 if not on an edge)
                neighbor_coords = []
                for idx in range(len(ny)):
                    # Calculate global offset
                    global_ny = y_min + ny[idx]
                    global_nx = x_min + nx[idx]
                    if global_ny != y or global_nx != x:
                        neighbor_coords.append((global_ny, global_nx))
                
                if len(neighbor_coords) == 2:
                    dy1, dx1 = neighbor_coords[0][0] - y, neighbor_coords[0][1] - x
                    dy2, dx2 = neighbor_coords[1][0] - y, neighbor_coords[1][1] - x
                    
                    # If the vector to N1 is the exact opposite of N2, it's a straight line
                    if dy1 == -dy2 and dx1 == -dx2:
                        straight_count += 1
                    else:
                        turn_count += 1

        total_path_pixels = straight_count + turn_count
        if total_path_pixels == 0:
            print(f"\n--- {region_name} ---")
            print("No continuous river paths found.")
            return

        straight_ratio = straight_count / total_path_pixels
        
        print(f"\n--- {region_name} ---")
        print(f"Total Path Pixels: {total_path_pixels}")
        print(f"Endpoints/Fractures: {endpoint_count}")
        print(f"Straight Pixels: {straight_count}")
        print(f"Turning Pixels: {turn_count}")
        print(f"Straight-to-Turn Ratio: {straight_ratio:.2f} (1.0 = Laser Beam, 0.0 = Pure Chaos)")
        
        # A natural river usually hovers around 0.4 to 0.6. 
        # If it's 0.8+, the D8 artifact is dominating.

    calculate_straight_vs_turn(mountains, "HIGH-ALTITUDE (Mountains)")
    calculate_straight_vs_turn(flatlands, "LOW-ALTITUDE (Plains/Flatlands)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyze river sinuosity and D8 artifacts")
    parser.add_argument(
        "--run-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "out" / "mistyforge" / "2048x1024",
        help="Directory containing debug_river_mask.png and height.npy",
    )
    args = parser.parse_args()
    analyze_rivers(args.run_dir)
