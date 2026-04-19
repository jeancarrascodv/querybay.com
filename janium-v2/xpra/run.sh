#!/usr/bin/env bash
set -xo pipefail

thisDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${thisDir}/.."

cmd=podman

case "${1}" in
  "docker")
    cmd=docker
    shift
    ;;
  "podman")
    cmd=podman
    shift
    ;;
  *)
    if $(docker ps > /dev/null 2>&1); then
      cmd=docker
    fi
    ;;
esac

set -e

if [[ "${1}" == "build" ]]; then
  ${cmd} build -t janium-xpra -f xpra/Dockerfile .
  shift
  if [[ "${1}" != "run" ]]; then
    exit 0
  fi
fi

if [[ "${1}" == "run" ]]; then
  # --bind-quic=0.0.0.0:14502 \
  # --env='all_proxy=http://SVhnkDxiPqlfo8pP:wifi;us;;utah;salt+lake+city@rotating.proxyempire.io:9000' \
  USERNAME="$(whoami)"
  SRC_MNT="/Users/tyler/dev/janium/container/mounts/${USERNAME}/home"
  mkdir -p "${SRC_MNT}"
  ${cmd} run \
  --rm -it \
  --name=janium-xpra \
  -p 3000:3000 \
  -p 9515:9515 \
  -p 9222:9222 \
  -p 10000:10000 \
  -p 10001:10001 \
  --privileged \
  --shm-size=4G \
  --env="USERNAME=$(whoami)" \
  --mount="type=bind,source=${SRC_MNT},target=/home/${USERNAME}" \
  janium-xpra
  exit 0
fi

${cmd} exec -it janium-xpra /bin/bash -l
