#!/usr/bin/env bash

if [[ -n "${USERNAME}" ]]; then
  useradd -m -s /bin/bash "${USERNAME}"
  cp -r /home/janium/.local /home/${USERNAME}
  chown -R ${USERNAME}:${USERNAME} /home/${USERNAME}
else
  echo "USERNAME is not set"
  exit 1
fi

if [[ -n "${PROXY_URL}" ]]; then
  echo "Upstream http ${PROXY_URL}" >> /etc/tinyproxy/janium.conf
fi

# exec chroot --userspec="${USERNAME}" --skip-chdir /
exec su -c "xpra start \
--daemon=no \
--exit-with-children=yes \
--start='xpra control :0 name \"Janium - ${USERNAME}\"' \
--start-child='tinyproxy -d -c /etc/tinyproxy/janium.conf' \
--start-child='container-service' \
--start-child='chromedriver --port=9515 --log-level=DEBUG --log-path=/tmp/chromedriver.log --append-log --readable-timestamp --allowed-origins=* --allowed-ips' \
--bind-tcp=0.0.0.0:10000 \
${XPRA_OPTS:-}" "${USERNAME}"
