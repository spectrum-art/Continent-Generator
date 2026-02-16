import { Application, Container, Graphics } from 'pixi.js';

const TILE_SIZE = 64;
const GRID_HALF_EXTENT = 40;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3.5;
const ZOOM_SENSITIVITY = 0.0012;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drawGrid(world: Container): void {
  const grid = new Graphics();

  for (let y = -GRID_HALF_EXTENT; y <= GRID_HALF_EXTENT; y += 1) {
    for (let x = -GRID_HALF_EXTENT; x <= GRID_HALF_EXTENT; x += 1) {
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      const isEven = (x + y) % 2 === 0;
      const fill = isEven ? 0x4f8f58 : 0x3d7446;

      grid.rect(px, py, TILE_SIZE, TILE_SIZE).fill(fill);
      grid
        .rect(px, py, TILE_SIZE, TILE_SIZE)
        .stroke({ color: 0x1f3f25, width: 1, alpha: 0.65 });
    }
  }

  world.addChild(grid);
}

export async function startMapExplorer(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#1e2124',
    antialias: false,
  });

  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  app.canvas.style.display = 'block';
  document.body.appendChild(app.canvas);

  const world = new Container();
  world.position.set(window.innerWidth / 2, window.innerHeight / 2);
  app.stage.addChild(world);

  drawGrid(world);

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  app.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
    isDragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
  });

  window.addEventListener('pointermove', (event: PointerEvent) => {
    if (!isDragging) {
      return;
    }

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    world.position.x += dx;
    world.position.y += dy;
    lastX = event.clientX;
    lastY = event.clientY;
  });

  app.canvas.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      event.preventDefault();

      const rect = app.canvas.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;

      const oldScale = world.scale.x;
      const worldX = (cursorX - world.position.x) / oldScale;
      const worldY = (cursorY - world.position.y) / oldScale;
      const nextScale = clamp(
        oldScale * Math.exp(-event.deltaY * ZOOM_SENSITIVITY),
        MIN_ZOOM,
        MAX_ZOOM,
      );

      world.scale.set(nextScale);
      world.position.set(
        cursorX - worldX * nextScale,
        cursorY - worldY * nextScale,
      );
    },
    { passive: false },
  );

}
