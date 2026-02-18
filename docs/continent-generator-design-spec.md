# Continent Generator v1
## Design Philosophy & Visual Structure

### 1. Core Goal
Create a procedural continent generator that produces:
- Geographically plausible large-scale landmasses
- Natural mountain chains, rivers, and coastlines
- Clear, readable atlas-style visuals
- A tool useful for worldbuilding and exploration

This is not a game engine. It is:
- A map creation artifact
- A creative exploration tool
- A high-level geography simulator

---

### 2. Design Principles

#### 2.1 Intuitive Over Scientific
Controls should:
- Reflect how users think about continents
- Avoid exposing raw geophysical parameters
- Favor sliders with emotional meaning:
  - “More mountains”
  - “More land”
  - “More islands”

Scientific realism exists under the hood.

---

#### 2.2 Realism Through Relationships
Realism comes from:
- Interactions between elevation, moisture, and wind
- Plate boundaries influencing mountain placement
- Rivers responding to terrain

Not from:
- Full geological simulations
- Microscopic detail

The generator should:
- Feel geographically believable
- Show recognizable large-scale structure

---

#### 2.3 Atlas-Style Visual Language
Target aesthetic:
- National Geographic
- School atlases
- Clean cartography

Traits:
- Clear biome regions
- Subtle elevation shading
- Readable coastlines
- Natural river paths

Avoid:
- Noisy textures
- Oversaturated fantasy palettes
- Tile-like visual artifacts

---

### 3. Level-of-Detail Philosophy

#### Far Zoom (continent scale)
Focus:
- Landmass shape
- Major mountain ranges
- Large rivers
- Climate zones

Visual rules:
- Simplified biome colors
- Reduced micro-variation
- Clean coastlines

---

#### Mid Zoom (regional scale)
Focus:
- River networks
- Foothills vs highlands
- Forest belts
- Rain shadows

Visual rules:
- Clearer elevation shading
- Visible biome transitions
- Secondary rivers

---

#### Close Zoom (local scale)
Focus:
- Terrain texture
- Micro-relief
- Small rivers and lakes
- Local biome variation

Visual rules:
- Stronger shading contrast
- Subtle noise within biomes
- Fine-scale variation

---

### 4. Terrain Generation Model

#### Step 1: Plate Structure
Inputs:
- Plate count (derived from size and slider)

Outputs:
- Plate regions
- Boundary types:
  - Convergent → mountains
  - Divergent → rifts/basins
  - Transform → minor ridges

---

#### Step 2: Base Elevation
Combine:
- Plate interaction fields
- Low-frequency noise
- Relief slider influence

Outputs:
- Continental-scale elevation field

---

#### Step 3: Land/Ocean Mask
Use:
- Elevation
- Land fraction slider

Goals:
- Natural coastlines
- Water surrounding edges
- No abrupt borders

---

#### Step 4: Coastal Processing
Apply:
- Fragmentation slider → coastline complexity
- Coastal smoothing slider → rounding pass

---

#### Step 5: Climate Model
Based on:
- Latitude center and span
- Elevation
- Moisture transport
- Climate bias slider

Outputs:
- Temperature map
- Moisture map

---

#### Step 6: River Generation
Based on:
- Elevation gradients
- Moisture field
- River frequency slider

Rules:
- Rivers flow downhill
- Rivers merge into larger systems
- Rivers end in:
  - Ocean
  - Lakes
  - Inland basins (rare)

---

#### Step 7: Biome Assignment
Use:
- Elevation
- Temperature
- Moisture
- Biome target sliders

Important:
- Sliders are soft targets
- Final distribution is terrain-driven

---

### 5. Coastline Realism Priority
Coastlines are a major realism signal.

Requirements:
- No grid-like edges
- No chunk-boundary artifacts
- Natural bays and peninsulas
- Shapes influenced by tectonics

If necessary:
- Accept added complexity in generation
- But maintain reasonable performance

---

### 6. Performance Philosophy
Primary targets:
- Smooth panning at regional zoom
- Acceptable framerate at continental zoom

Guidelines:
- Avoid heavy per-tile dynamic shading
- Cache chunk results
- Separate generation cost from rendering cost

---

### 7. User Experience Goals
The tool should feel:

**Exploratory**
- Rerolling produces meaningful variations
- Seeds are memorable

**Creative**
- Sliders produce intuitive effects
- Presets give strong starting points

**Readable**
- Map understandable at a glance
- Terrain logic feels natural

---

### 8. Non-Goals for v1
Do not implement:
- Political borders
- Cities
- Roads
- Narrative systems
- Gameplay mechanics

This is purely:
- A continent generator
- A worldbuilding tool