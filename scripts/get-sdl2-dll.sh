#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)

SDL2_VERSION=${SDL2_VERSION:-2.30.10}
ARCH=${ARCH:-x64}

ZIP_NAME="SDL2-${SDL2_VERSION}-win32-${ARCH}.zip"
URL="https://github.com/libsdl-org/SDL/releases/download/release-${SDL2_VERSION}/${ZIP_NAME}"

TMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

print "Downloading $URL"
curl -L "$URL" -o "$TMP_DIR/$ZIP_NAME"

print "Extracting SDL2.dll"
unzip -q "$TMP_DIR/$ZIP_NAME" -d "$TMP_DIR"

DLL_PATH=$(find "$TMP_DIR" -name SDL2.dll -maxdepth 3 | head -n 1 || true)
if [[ -z "$DLL_PATH" ]]; then
  print "SDL2.dll not found in archive" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/dist"
cp "$DLL_PATH" "$ROOT_DIR/dist/SDL2.dll"
print "Saved $ROOT_DIR/dist/SDL2.dll"
