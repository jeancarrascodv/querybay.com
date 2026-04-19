#!/usr/bin/env bash

set -xeuo pipefail

thisDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${thisDir}/.."

# DB
# create user janium_<env> with encrypted password '<password>'
# alter user janium_<env> createdb;
# CREATE ROLE readaccess;
# CREATE USER janium_<env>_readonly WITH PASSWORD '<password>';
# GRANT readaccess TO janium_<env>_readonly;
# # connect as janium_<env>
# create database janium_<env> with owner = janium_<env> encoding = 'UTF8' LC_COLLATE = 'en_US.UTF8' LC_CTYPE = 'en_US.UTF8' template = template0;
# REVOKE CONNECT ON DATABASE janium_<env> FROM PUBLIC;
# GRANT CONNECT ON DATABASE janium_<env> TO readaccess;
# GRANT USAGE ON SCHEMA public TO readaccess;
# GRANT SELECT ON ALL TABLES IN SCHEMA public TO readaccess;
# ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readaccess;


# As Root
useradd -m janium
usermod -aG wheel janium
loginctl enable-linger janium
sysctl -w kernel.keys.maxkeys=20000
firewall-cmd --permanent --zone=public --add-forward-port=port=443:proto=tcp:toport=8443
firewall-cmd --reload
dnf install bind-utils git crontab gcc podman postgresql17 keyutils zstd
cat <<EOF > /etc/systemd/journald.conf
[Journal]
SystemMaxUse=25G
SystemMaxFileSize=100M
EOF
sudo systemctl restart systemd-journald
# uncomment line in sudoers file to allow wheel group to run sudo without password

# As janium

mkdir -p ~/.config/containers
cat <<EOF > ~/.config/containers/registries.conf
[containers]
keyring=false
EOF

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
echo '
build.target-dir = "/home/janium/.target"
target.x86_64-unknown-linux-gnu.rustflags = ["-C", "target-cpu=native"]
profile.dev     = { opt-level = 1, lto = "off", build-override = { opt-level = 3, debug = true, debug-assertions = true, overflow-checks = true, incremental = true, codegen-units = 256 }, package."*" = { opt-level = 3, debug = false, debug-assertions = false, overflow-checks = false } }
profile.test    = { opt-level = 1, lto = "off", build-override = { opt-level = 3, debug = true, debug-assertions = true, overflow-checks = true, incremental = true, codegen-units = 256 }, package."*" = { opt-level = 3, debug = false, debug-assertions = false, overflow-checks = false } }
profile.release = { opt-level = 3, lto = "fat", build-override = { opt-level = 3, debug = false, debug-assertions = false, overflow-checks = false, incremental = true, codegen-units = 256 }, package."*" = { opt-level = 3, debug = false, debug-assertions = false, overflow-checks = false } }
profile.bench   = { opt-level = 3, lto = "fat", build-override = { opt-level = 3, debug = false, debug-assertions = false, overflow-checks = false, incremental = true, codegen-units = 256 }, package."*" = { opt-level = 3, debug = false, debug-assertions = false, overflow-checks = false } }
alias.c = "clippy --all-targets"
' > ~/.cargo/config.toml

source $HOME/.cargo/env

cargo install ormlite-cli
git clone https://tylerhawkes:${GITHUB_TOKEN}@github.com/janium-org/janium-v2.git
cd janium-v2
touch run/last_git.txt
touch run/last_build_hash.txt
git remote add originssh git@github.com:janium-org/janium-v2.git
crontab -e

sudo chown janium:janium /usr/local/bin
touch /usr/local/bin/janium
chmod +x /usr/local/bin/janium

systemctl --user enable podman.socket
ln -sf "/home/janium/janium-v2/run/janium.service" ~/.config/systemd/user/janium.service
systemctl --user enable janium

systemctl --user daemon-reload

# edit super user password in database

build/docker.sh
run/run-service.sh
