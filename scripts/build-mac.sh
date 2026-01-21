#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)

APP_NAME=${APP_NAME:-NativeThree}
BUNDLE_ID=${BUNDLE_ID:-com.example.nativethree}
VERSION=${VERSION:-1.0.0}

TMP_DIR=${TMP_DIR:-"$ROOT_DIR/.tmp"}
OUT_DIR=${OUT_DIR:-"$ROOT_DIR/dist"}
APP_DIR="$OUT_DIR/$APP_NAME.app"
BIN_PATH="$TMP_DIR/$APP_NAME"

if [[ -z "${TARGET:-}" ]]; then
  if [[ "$(uname -m)" == "arm64" ]]; then
    TARGET="aarch64-apple-darwin"
  else
    TARGET="x86_64-apple-darwin"
  fi
fi

mkdir -p "$TMP_DIR" "$OUT_DIR"

print "Building binary ($TARGET)..."
deno compile -A --unstable-webgpu --target "$TARGET" -o "$BIN_PATH" "$ROOT_DIR/main.ts"

print "Creating app bundle..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Frameworks"
cp "$BIN_PATH" "$APP_DIR/Contents/MacOS/$APP_NAME"

SDL2_CANDIDATES=()
if [[ -n "${SDL2_PATH:-}" ]]; then
  SDL2_CANDIDATES+=("$SDL2_PATH")
fi
SDL2_CANDIDATES+=(
  "/opt/homebrew/opt/sdl2/lib/libSDL2.dylib"
  "/opt/homebrew/lib/libSDL2.dylib"
  "/usr/local/opt/sdl2/lib/libSDL2.dylib"
  "/usr/local/lib/libSDL2.dylib"
)

for candidate in "${SDL2_CANDIDATES[@]}"; do
  if [[ -f "$candidate" ]]; then
    SDL2_PATH="$candidate"
    break
  fi
done

if [[ -z "${SDL2_PATH:-}" || ! -f "$SDL2_PATH" ]]; then
  print "SDL2 dylib not found. Set SDL2_PATH to libSDL2.dylib." >&2
  exit 1
fi

cp "$SDL2_PATH" "$APP_DIR/Contents/Frameworks/libSDL2.dylib"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleExecutable</key><string>$APP_NAME</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict>
</plist>
PLIST

print "Done: $APP_DIR"
