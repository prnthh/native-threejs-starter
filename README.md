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

This writes intermediate files to `.tmp/` and final binaries to `dist/`.

## Get SDL2.dll (Windows build helper)

```zsh
deno task get:sdl2:dll
```

This saves `SDL2.dll` to `dist/SDL2.dll`.

Options (env vars):

- `SDL2_VERSION` (default: `2.30.10`)
- `ARCH` (default: `x64`)

## Build macOS app bundle

```zsh
deno task build:mac
```

### Options (env vars)

- `APP_NAME` (default: `NativeThree`)
- `BUNDLE_ID` (default: `com.example.nativethree`)
- `VERSION` (default: `1.0.0`)
- `TMP_DIR` (default: `.tmp`)
- `OUT_DIR` (default: `dist`)
- `SDL2_PATH` (set if your `libSDL2.dylib` is in a non-standard path)

Example:

```zsh
APP_NAME="NativeThree" BUNDLE_ID="com.prnth.native" VERSION="0.1.0" deno task build:mac
```

Note: `deno compile` embeds the Deno runtime, so binaries can be large; example sizes (Jan 21, 2026):

- `dist/NativeThree.app`: 121M
- `dist/SDL2.dll`: 1.5M
- `dist/r3f`: 73M