import * as THREE from "three/webgpu";

const WIDTH = 800;
const HEIGHT = 600;

//#region rAF polyfill
type RafCallback = (time: number) => void;
const globalAny = globalThis as unknown as {
  requestAnimationFrame?: (cb: RafCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
};
if (!globalAny.requestAnimationFrame) {
  globalAny.requestAnimationFrame = (cb: RafCallback): number => {
    return setTimeout(() => cb(performance.now()), 16) as unknown as number;
  };
}
if (!globalAny.cancelAnimationFrame) {
  globalAny.cancelAnimationFrame = (id: number) => {
    clearTimeout(id as unknown as number);
  };
}
//#endregion

const BUILD_OS = Deno.build.os;

function resolveSdl2Library(): string {
  if (BUILD_OS !== "darwin") return "SDL2";
  const candidates = [
    "/opt/homebrew/opt/sdl2/lib/libSDL2.dylib",
    "/opt/homebrew/lib/libSDL2.dylib",
    "/usr/local/opt/sdl2/lib/libSDL2.dylib",
    "/usr/local/lib/libSDL2.dylib",
    "SDL2",
  ];
  for (const candidate of candidates) {
    try {
      Deno.statSync(candidate);
      return candidate;
    } catch {
    }
  }
  return "SDL2";
}

//#region SDL2 FFI
console.log("Loading SDL2 library");
const sdl2 = Deno.dlopen(resolveSdl2Library(), {
  SDL_Init: { parameters: ["u32"], result: "i32" },
  SDL_Quit: { parameters: [], result: "void" },
  SDL_CreateWindow: {
    parameters: ["buffer", "i32", "i32", "i32", "i32", "u32"],
    result: "pointer",
  },
  SDL_DestroyWindow: { parameters: ["pointer"], result: "void" },
  SDL_GetWindowWMInfo: { parameters: ["pointer", "pointer"], result: "i32" },
  SDL_GetVersion: { parameters: ["pointer"], result: "void" },
  SDL_PollEvent: { parameters: ["pointer"], result: "i32" },
  SDL_Metal_CreateView: { parameters: ["pointer"], result: "pointer" },
});
//#endregion

//#region SDL2 helpers
const enc = new TextEncoder();
function asCString(text: string): Uint8Array {
  return enc.encode(`${text}\0`);
}

const SDL_INIT_VIDEO = 0x00000020;
const SDL_WINDOW_SHOWN = 0x00000004;
const SDL_WINDOW_RESIZABLE = 0x00000020;
const SDL_QUIT = 0x100;

const sizeOfEvent = 56; // type (u32) + event union
const eventBuf = new Uint8Array(sizeOfEvent);

const sizeOfSDL_SysWMInfo = 3 + 4 + 8 * 64;
const wmInfoBuf = new Uint8Array(sizeOfSDL_SysWMInfo);
//#endregion

function createWindow(title: string, width: number, height: number) {
  console.log("Creating SDL window", { title, width, height });
  const raw = sdl2.symbols.SDL_CreateWindow(
    asCString(title) as BufferSource,
    0x2FFF0000,
    0x2FFF0000,
    width,
    height,
    SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE,
  );
  if (raw === null) {
    throw new Error("SDL_CreateWindow failed");
  }
  console.log("SDL window created", raw);
  const metalView = BUILD_OS === "darwin" ? sdl2.symbols.SDL_Metal_CreateView(raw) : null;
  console.log("Metal view created", metalView);
  return { window: raw, metalView };
}

function createSurface(
  window: Deno.PointerValue,
  metalView: Deno.PointerValue | null,
  width: number,
  height: number,
): Deno.UnsafeWindowSurface {
  console.log("Creating UnsafeWindowSurface", { width, height });
  const wm_info = Deno.UnsafePointer.of(wmInfoBuf);
  sdl2.symbols.SDL_GetVersion(wm_info);
  const ok = sdl2.symbols.SDL_GetWindowWMInfo(window, wm_info);
  if (ok === 0) {
    throw new Error("SDL_GetWindowWMInfo failed");
  }

  const view = new Deno.UnsafePointerView(wm_info!);
  const subsystem = view.getUint32(4); // u32

  if (BUILD_OS === "darwin") {
    const SDL_SYSWM_COCOA = 4;
    const nsView = view.getPointer(4 + 4)!; // usize
    if (subsystem !== SDL_SYSWM_COCOA) {
      throw new Error("Expected SDL_SYSWM_COCOA on macOS");
    }
    console.log("Using cocoa surface");
    return new Deno.UnsafeWindowSurface({
      system: "cocoa",
      windowHandle: nsView,
      displayHandle: metalView,
      width,
      height,
    });
  }

  if (BUILD_OS === "windows") {
    const SDL_SYSWM_WINDOWS = 1;
    const SDL_SYSWM_WINRT = 8;
    const hwnd = view.getPointer(4 + 4)!; // usize
    if (subsystem === SDL_SYSWM_WINDOWS) {
      const hinstance = view.getPointer(4 + 4 + 8 + 8)!; // usize (gap of 8 bytes)
      console.log("Using win32 surface", { hwnd, hinstance });
      return new Deno.UnsafeWindowSurface({
        system: "win32",
        windowHandle: hwnd,
        displayHandle: hinstance,
        width,
        height,
      });
    }
    if (subsystem === SDL_SYSWM_WINRT) {
      throw new Error("WinRT is not supported");
    }
    throw new Error("Expected SDL_SYSWM_WINDOWS on Windows");
  }

  if (BUILD_OS === "linux") {
    const SDL_SYSWM_X11 = 2;
    const SDL_SYSWM_WAYLAND = 6;
    const display = view.getPointer(4 + 4)!; // usize
    const surface = view.getPointer(4 + 4 + 8)!; // usize
    if (subsystem === SDL_SYSWM_X11) {
      console.log("Using x11 surface");
      return new Deno.UnsafeWindowSurface({
        system: "x11",
        windowHandle: surface,
        displayHandle: display,
        width,
        height,
      });
    }
    if (subsystem === SDL_SYSWM_WAYLAND) {
      console.log("Using wayland surface");
      return new Deno.UnsafeWindowSurface({
        system: "wayland",
        windowHandle: surface,
        displayHandle: display,
        width,
        height,
      });
    }
    throw new Error("Expected SDL_SYSWM_X11 or SDL_SYSWM_WAYLAND on Linux");
  }

  throw new Error("Unsupported platform");
}

//#region Canvas shim
function makeCanvas(
  surface: Deno.UnsafeWindowSurface,
  width: number,
  height: number,
) {
  console.log("Creating canvas shim", { width, height });
  const context = surface.getContext("webgpu");
  const canvas = {
    width,
    height,
    getContext(type: "webgpu") {
      if (type !== "webgpu") {
        return null;
      }
      console.log("Canvas.getContext('webgpu')");
      return context;
    },
    requestAnimationFrame: globalAny.requestAnimationFrame,
    cancelAnimationFrame: globalAny.cancelAnimationFrame,
    addEventListener() {},
    removeEventListener() {},
    style: {},
  } as unknown as {
    width: number;
    height: number;
    getContext: (type: "webgpu") => GPUCanvasContext | null;
    requestAnimationFrame?: (cb: RafCallback) => number;
    cancelAnimationFrame?: (id: number) => void;
  };

  return { canvas, context };
}
//#endregion

//#region WebGPU init
console.log("Initializing SDL2 video subsystem");
const initResult = sdl2.symbols.SDL_Init(SDL_INIT_VIDEO);
if (initResult !== 0) {
  throw new Error("SDL_Init failed");
}
console.log("SDL2 initialized");

console.log("Requesting WebGPU adapter");
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found");
}
const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
console.log("Requesting WebGPU device");
const device = await adapter.requestDevice();
console.log("WebGPU device ready");

const { window, metalView } = createWindow("Deno + SDL2 + WebGPU", WIDTH, HEIGHT);
console.log("Window handle", window);
const surface = createSurface(window, metalView, WIDTH, HEIGHT);
console.log("UnsafeWindowSurface created");
const { canvas, context: canvasContext } = makeCanvas(surface, WIDTH, HEIGHT);
console.log("Canvas shim created");
console.log("Resizing WebGPU surface");
surface.resize(WIDTH, HEIGHT);
console.log("Configuring WebGPU canvas context");
canvasContext.configure({
  device,
  format: preferredFormat,
  alphaMode: "opaque",
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
});
console.log("WebGPU canvas configured", { format: preferredFormat });
//#endregion

//#region Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, WIDTH / HEIGHT, 0.1, 1000);
camera.position.z = 2;

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0x44aa88 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

scene.background = new THREE.Color(0x202020);

console.log("Creating WebGPURenderer");
const renderer = new THREE.WebGPURenderer({
  canvas,
  context: canvasContext,
  device,
  antialias: false,
});
renderer.setSize(WIDTH, HEIGHT);
console.log("Initializing WebGPURenderer");
await renderer.init();
console.log("WebGPURenderer initialized");
//#endregion

//#region Main loop
let running = true;
let frame = 0;
console.log("Entering render loop");
while (running) {
  const event = Deno.UnsafePointer.of(eventBuf);
  while (sdl2.symbols.SDL_PollEvent(event) === 1) {
    const view = new Deno.UnsafePointerView(event!);
    const type = view.getUint32();
    if (type === SDL_QUIT) {
      console.log("SDL_QUIT received");
      running = false;
      break;
    }
  }

  cube.rotation.x += 0.01;
  cube.rotation.y += 0.02;
  if (frame === 0 || frame % 120 === 0) {
    console.log("Rendering frame", frame);
  }
  renderer.render(scene, camera);
  surface.present();
  frame++;
}

sdl2.symbols.SDL_DestroyWindow(window);
sdl2.symbols.SDL_Quit();
console.log("Shutdown complete");
//#endregion
