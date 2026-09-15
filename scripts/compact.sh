#!/usr/bin/env bash
# Compile Compact sources with toolchain 0.31.1.
#
#   scripts/compact.sh [--skip-zk] <src.compact> <outdir>
#
# Uses a native `compact` devtools install when present (macOS / Linux), otherwise
# runs the Linux compiler in Docker (image built from tools/compactc on first use).
# Paths must be inside the repository.
set -euo pipefail
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

VERSION=0.31.1
IMAGE="${COMPACTC_IMAGE:-stockandfoil/compactc:${VERSION}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

flags=(); pos=()
for a in "$@"; do
  case "$a" in
    --*) flags+=("$a") ;;
    *) pos+=("$a") ;;
  esac
done
[[ ${#pos[@]} -eq 2 ]] || { echo "usage: scripts/compact.sh [--skip-zk] <src.compact> <outdir>" >&2; exit 2; }

if [[ "$(uname -s)" != MINGW* && "$(uname -s)" != MSYS* ]] && command -v compact >/dev/null 2>&1; then
  exec compact compile "+${VERSION}" "${flags[@]}" "${pos[0]}" "${pos[1]}"
fi

abs() { local p="$1"; [[ "$p" = /* ]] || p="$PWD/$p"; echo "$p"; }
rel_to_root() {
  local p; p="$(abs "$1")"
  mkdir -p "$(dirname "$p")"
  p="$(cd "$(dirname "$p")" && pwd)/$(basename "$p")"
  [[ "${p,,}" == "${ROOT,,}"/* ]] || { echo "path outside repository: $1" >&2; exit 2; }
  echo "/w${p:${#ROOT}}"
}

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "building $IMAGE ..." >&2
  docker build -q -t "$IMAGE" "$ROOT/tools/compactc" >&2
fi

host_root="$ROOT"
if pwd -W >/dev/null 2>&1; then host_root="$(cd "$ROOT" && pwd -W)"; fi

src="$(rel_to_root "${pos[0]}")"
out="$(rel_to_root "${pos[1]}")"
docker run --rm -v "${host_root}:/w" -v compactc-zkcache:/root/.cache -w /w "$IMAGE" "${flags[@]}" "$src" "$out"
