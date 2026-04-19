FROM fedora:42 AS builder

RUN curl -sSf https://sh.rustup.rs | sh -s -- --profile=minimal --default-toolchain=stable -y \
  && dnf install -y gcc

COPY . /app

WORKDIR /app

RUN . $HOME/.cargo/env && rm rust-toolchain.toml && cargo install --path crates/container-service --root /usr/local

FROM fedora:42

# --exclude=virtualbox-guest-additions \
# --exclude=plymouth* \
RUN echo max_parallel_downloads=20 >> /etc/dnf/dnf.conf \
  && curl -o /etc/yum.repos.d/xpra.repo https://raw.githubusercontent.com/Xpra-org/xpra/master/packaging/repos/Fedora/xpra.repo \
  && dnf install -y --setopt=install_weak_deps=False \
  --exclude=kernel-core \
  --exclude=kernel-debug-core \
  --exclude=kernel-modules \
  --exclude=kernel-debug-modules \
  --exclude=kernel-modules-extra \
  --exclude=kernel-debug-modules-extra \
  --exclude=kernel-modules-core \
  --exclude=kernel \
  --exclude=dracut* \
  --skip-broken \
  @xfce-desktop-environment \
  https://xpra.org/stable/Fedora/42/$(uname -m)/xpra-html5-17.1-1.r0.fc42.noarch.rpm \
  xpra-6.4.1 \
  xpra-x11-6.4.1 \
  xpra-server-6.4.1 \
  gstreamer1-plugins-{bad-*,good-*,ugly-*,base} \
  chromedriver \
  ripgrep \
  fd-find \
  htop \
  tinyproxy \
  libX11-devel \
  libxdo-devel \
  xdotool \
  && useradd -m -s /bin/bash janium \
  && sed -i 's/cdc_/zxq_/g' "$(which chromedriver)"

RUN curl -fsS https://dl.brave.com/install.sh | sh

COPY --from=builder /usr/local/bin/container-service /usr/local/bin/container-service

# RUN mkdir -p /usr/local/share/xpra/www \
#   && curl -Lo /tmp/xpra-html.tar.gz https://github.com/Xpra-org/xpra-html5/archive/refs/tags/v17.1.tar.gz \
#   && tar -xzf /tmp/xpra-html.tar.gz -C /tmp \
#   && mv /tmp/xpra-html5-17.1/html5/* /usr/local/share/xpra/www/ \
#   && chown -R janium:janium /usr/local/share/xpra/www \
#   && rm -rf /tmp/*

COPY xpra/Default_keyring.keyring /home/janium/.local/share/keyrings/
COPY xpra/entrypoint.sh /entrypoint.sh
COPY xpra/tinyproxy.conf /etc/tinyproxy/janium.conf

RUN echo 'Default_keyring' > /home/janium/.local/share/keyrings/default \
  && sed -i "s/1700000000/$(date +%s)/" /home/janium/.local/share/keyrings/Default_keyring.keyring \
  && chown -R janium:janium /home/janium/.local

ENTRYPOINT ["/entrypoint.sh"]
