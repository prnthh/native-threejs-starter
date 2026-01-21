# Native Three.js Starter (Deno + SDL2 + WebGPU)

## Prerequisites

- Deno
- SDL2 (native library)

### macOS setup

```zsh
brew install deno
brew install sdl2
```

## Run

### Basic Three.js (WebGPU)

```zsh
deno run -A --unstable-webgpu main.ts
```

### React Three Fiber (R3F)

```zsh
deno run -A --unstable-webgpu r3f.tsx
```

## Build (optional)

```zsh
deno task build
```