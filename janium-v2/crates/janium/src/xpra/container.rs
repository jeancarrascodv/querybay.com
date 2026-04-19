use crate::prelude::*;
use compact_str::{CompactString as String, format_compact};
use futures::Stream;
use std::string::String as StdString;

pub struct ContainerHandle {
  #[expect(dead_code)]
  pub id: Id<LinkedIn>,
  pub docker: Arc<bollard::Docker>,
  pub docker_container_name: String,
  pub docker_username: String,
  pub docker_hostname: String,
  pub docker_host_mount: String,
  pub docker_id: String,
  pub container_service_port: u16,
  pub chromedriver_port: u16,
  pub xpra_http_port: u16,
  pub proxy_url: Option<String>,
  pub timezone: ArcSwap<TimeZone>,
  /// Set to true when running memory-intensive actions (connection sync, inbox download).
  /// The memory watchdog will auto-bump the container limit when this is set.
  pub memory_intensive: std::sync::atomic::AtomicBool,
}

/// Default memory limit (matches container creation in `start`).
const DEFAULT_MEMORY_LIMIT: u64 = 5 * 1024 * 1024 * 1024 / 2; // 2.5 GB
/// Bump limit if free memory drops below this threshold.
const MEMORY_HEADROOM: u64 = 512 * 1024 * 1024; // 0.5 GB
/// Amount to increase memory limit by when headroom is breached.
const MEMORY_BUMP: u64 = 1024 * 1024 * 1024; // 1 GB
/// Absolute ceiling to prevent runaway bumps (and `u64 as i64` overflow).
const MAX_MEMORY_LIMIT: u64 = 16 * 1024 * 1024 * 1024; // 16 GB

impl ContainerHandle {
  // #[cfg(test)]
  // fn port_counter() -> u16 {
  //   static PORT_COUNTER: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(0);
  //   PORT_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
  // }
  // #[cfg(test)]
  // pub async fn new_test(app_state: &AppState) -> Result<Self> {
  //   let start_port = Self::port_counter();
  //   let name = compact_str::format_compact!("john.doe{start_port}");
  //   Self::new(
  //     name.clone(),
  //     name.clone(),
  //     compact_str::format_compact!("test/{name}"),
  //     start_port,
  //     None,
  //     app_state,
  //   )
  //   .await
  // }
  // #[cfg(test)]
  // pub async fn new_test_with_name(name: String, app_state: &AppState) -> Result<Self> {
  //   let start_port = Self::port_counter();
  //   let mount_name = compact_str::format_compact!("test/{name}");
  //   Self::new(name.clone(), name, mount_name, start_port, None, app_state).await
  // }
  // attempts to start a container and returns a DockerHandle if successful
  pub async fn new(
    id: Id<LinkedIn>,
    docker_username: String,
    docker_hostname: String,
    docker_host_mount: String,
    start_port: u16,
    proxy_url: Option<String>,
    timezone: ArcSwap<TimeZone>,
    app_state: &AppState,
  ) -> Result<Self> {
    let start_port = start_port * 3 + app_state.opts.docker.base_port;
    let mut this: ContainerHandle = Self {
      id,
      docker: app_state.docker.clone(),
      docker_container_name: format_compact!("{}.{}", docker_username, ShortId::new(id)),
      docker_username,
      docker_id: "".into(),
      container_service_port: start_port,
      chromedriver_port: start_port + 1,
      xpra_http_port: start_port + 2,
      docker_hostname,
      docker_host_mount,
      proxy_url,
      timezone,
      memory_intensive: std::sync::atomic::AtomicBool::new(false),
    };

    // Ignore any errors for now, we just want to start a new container.
    Self::stop_inner(&this.docker, this.container_name()).await.ok();
    this.start(&app_state.opts.docker).await?;

    Ok(this)
  }

  pub async fn clean_mounted_dir(app_state: &AppState, docker_host_mount: &str) -> Result<()> {
    let full_mount_path = Self::full_mount_path(&app_state.opts.docker, docker_host_mount);
    let container_name = format!("cleanup-{}", docker_host_mount.replace('/', "-"));

    // Run rm -rf inside a container so that podman's UID mapping handles
    // the mapped UIDs/GIDs that the host user cannot delete directly.
    let host_config = bollard::models::HostConfig {
      auto_remove: Some(true),
      mounts: Some(vec![bollard::models::Mount {
        target: Some("/cleanup".to_string()),
        source: Some(full_mount_path.clone()),
        typ: Some(bollard::models::MountTypeEnum::BIND),
        read_only: Some(false),
        ..Default::default()
      }]),
      ..Default::default()
    };

    let container = app_state
      .docker
      .create_container(
        Some(bollard::query_parameters::CreateContainerOptions {
          name: Some(container_name.as_str().into()),
          ..Default::default()
        }),
        bollard::models::ContainerCreateBody {
          image: Some("docker.io/library/fedora:latest".to_string()),
          cmd: Some(vec!["rm".to_string(), "-rf".to_string(), "/cleanup".to_string()]),
          host_config: Some(host_config),
          ..Default::default()
        },
      )
      .await
      .map_err(|e| JaniumError::msg(format!("Failed to create cleanup container for {full_mount_path}: {e}")))?;

    app_state
      .docker
      .start_container(
        &container.id,
        Some(bollard::query_parameters::StartContainerOptions::default()),
      )
      .await
      .map_err(|e| JaniumError::msg(format!("Failed to start cleanup container for {full_mount_path}: {e}")))?;

    // Wait for the container to finish
    let mut stream = app_state
      .docker
      .wait_container(&container.id, None::<bollard::query_parameters::WaitContainerOptions>);
    while let Some(result) = futures::StreamExt::next(&mut stream).await {
      match result {
        Ok(exit) => {
          if exit.status_code != 0 {
            return Err(JaniumError::msg(format!(
              "Cleanup container exited with status {} for {full_mount_path}",
              exit.status_code
            )));
          }
        }
        Err(e) => {
          return Err(JaniumError::msg(format!(
            "Error waiting for cleanup container for {full_mount_path}: {e}"
          )));
        }
      }
    }

    // Remove the container (may already be gone if auto_remove worked)
    app_state
      .docker
      .remove_container(
        &container.id,
        Some(
          bollard::query_parameters::RemoveContainerOptionsBuilder::new()
            .force(true)
            .v(true)
            .build(),
        ),
      )
      .await
      .ok();

    // Remove the now-empty host directory
    tokio::fs::remove_dir_all(&full_mount_path).await.ok();

    Ok(())
  }

  fn full_mount_path(opts: &crate::config::DockerOptions, docker_host_mount: &str) -> StdString {
    format!("{}/{docker_host_mount}", opts.base_container_dir)
  }

  fn container_name(&self) -> &str {
    if self.docker_id.is_empty() {
      &self.docker_container_name
    } else {
      &self.docker_id
    }
  }

  pub async fn stop(&self) -> Result<()> {
    Self::stop_inner(&self.docker, self.container_name()).await
  }
  async fn stop_inner(docker: &bollard::Docker, name: &str) -> Result<()> {
    let stop_result = docker
      .stop_container(
        name,
        Some(
          bollard::query_parameters::StopContainerOptionsBuilder::new()
            .t(10)
            .build(),
        ),
      )
      .await;
    let remove_result = docker
      .remove_container(
        name,
        Some(
          bollard::query_parameters::RemoveContainerOptionsBuilder::new()
            .force(true)
            .v(true)
            .build(),
        ),
      )
      .await;
    stop_result?;
    // Keeping for now because containers should be self removed.
    remove_result.ok();
    Ok(())
  }
  pub async fn start(&mut self, docker_options: &crate::config::DockerOptions) -> Result<()> {
    let mut port_bindings = std::collections::HashMap::new();
    port_bindings.insert(
      "3000/tcp".to_string(),
      Some(vec![bollard::secret::PortBinding {
        host_port: Some(self.container_service_port.to_string()),
        host_ip: Some("127.0.0.1".to_string()),
      }]),
    );
    port_bindings.insert(
      "9515/tcp".to_string(),
      Some(vec![bollard::secret::PortBinding {
        host_port: Some(self.chromedriver_port.to_string()),
        host_ip: Some("127.0.0.1".to_string()),
      }]),
    );
    port_bindings.insert(
      "10000/tcp".to_string(),
      Some(vec![bollard::secret::PortBinding {
        host_port: Some(self.xpra_http_port.to_string()),
        host_ip: Some("127.0.0.1".to_string()),
      }]),
    );

    let username = &self.docker_username;
    let full_mount_path = Self::full_mount_path(docker_options, &self.docker_host_mount);
    let source = format!("{full_mount_path}/home");
    std::fs::create_dir_all(&source)?;
    // Container is removed so it is ok to do this.
    std::fs::remove_file(format!("{source}/.config/BraveSoftware/Brave-Browser/SingletonLock")).ok();
    let mounts = vec![
      bollard::models::Mount {
        target: Some(format!("/home/{username}")),
        source: Some(source),
        typ: Some(bollard::models::MountTypeEnum::BIND),
        consistency: Some("consistent".to_string()),
        read_only: Some(false),
        ..Default::default()
      },
      bollard::models::Mount {
        target: Some("/tmp".to_string()),
        typ: Some(bollard::models::MountTypeEnum::TMPFS),
        ..Default::default()
      },
    ];
    let host_config = bollard::models::HostConfig {
      shm_size: Some(1024 * 1024 * 1024), // 1 GB
      port_bindings: Some(port_bindings),
      auto_remove: Some(true),
      mounts: Some(mounts),
      memory: Some(DEFAULT_MEMORY_LIMIT as i64),
      nano_cpus: Some(2_000_000_000), // 2 cpus
      ..Default::default()
    };
    let xpra_opts = std::env::var("XPRA_OPTS").unwrap_or_default();

    let xpra_opts = format!(
      "XPRA_OPTS={xpra_opts} --minimal --html=on --sharing=yes --use-display=no --clipboard=yes --start-new-commands=yes --websocket-upgrade=yes --pings=15 "
    );
    let mut env = vec![
      format!("USERNAME={username}"),
      format!("TZ={}", self.timezone.get().as_ref()),
      xpra_opts,
    ];
    if let Some(proxy_url) = &self.proxy_url {
      env.push(format!("PROXY_URL={proxy_url}"));
    }
    let container = self
      .docker
      .create_container(
        Some(bollard::query_parameters::CreateContainerOptions {
          name: Some(self.docker_container_name.as_str().into()),
          ..Default::default()
        }),
        bollard::models::ContainerCreateBody {
          image: Some("janium-xpra".to_string()),
          env: Some(env),
          hostname: Some(self.docker_hostname.clone().into_string()),
          host_config: Some(host_config),
          stop_timeout: Some(20),
          ..Default::default()
        },
      )
      .await?;
    tracing::info!(id = &container.id, warnings = ?container.warnings, "created container");
    self
      .docker
      .start_container(
        &container.id,
        Some(bollard::query_parameters::StartContainerOptions::default()),
      )
      .await?;
    self.docker_id = container.id.into();
    // wait one second before starting to check ports
    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
    // wait until container is running
    let result = tokio::time::timeout(std::time::Duration::from_secs(10), async {
      let client = reqwest::Client::new();
      for port in [self.container_service_port, self.chromedriver_port, self.xpra_http_port] {
        tracing::trace!("waiting for port {port}");
        let addr = format!("http://localhost:{port}");
        'inner: loop {
          match client.get(&addr).send().await {
            Ok(response) => {
              tracing::trace!("port {port} is open with response {response:?}");
              break 'inner;
            }
            Err(e) => {
              tracing::trace!("waiting for port {port}: {e}");
              tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
          }
        }
      }
    })
    .await;
    if let Err(e) = result {
      return Err(JaniumError::msg(format!("Container did not start after {e}")));
    }
    // TODO: spawn off logs stream for tracing
    Ok(())
  }

  #[expect(dead_code)]
  pub async fn inspect(&self) -> Result<bollard::models::ContainerInspectResponse> {
    self
      .docker
      .inspect_container(
        &self.docker_id,
        Some(bollard::query_parameters::InspectContainerOptions::default()),
      )
      .await
      .map_err(|e| e.into())
  }

  #[expect(dead_code)]
  pub fn logs(
    &self,
    options: bollard::query_parameters::LogsOptions,
  ) -> impl Stream<Item = Result<bollard::container::LogOutput, bollard::errors::Error>> + use<> {
    self.docker.logs(self.container_name(), Some(options))
  }

  /// Get a single stats snapshot: returns `(used_bytes, limit_bytes)`.
  pub async fn memory_usage(&self) -> Result<(u64, u64)> {
    use futures::StreamExt;
    let mut stream = self.docker.stats(
      self.container_name(),
      Some(bollard::query_parameters::StatsOptions {
        stream: false,
        one_shot: true,
      }),
    );
    let stats = stream
      .next()
      .await
      .ok_or_else(|| JaniumError::msg("No stats returned"))?
      .map_err(JaniumError::from)?;
    let mem = stats.memory_stats.unwrap_or_default();
    let used = mem.usage.unwrap_or(0);
    let limit = mem.limit.unwrap_or(0);
    Ok((used, limit))
  }

  /// Update the container's memory limit (in bytes) without restarting.
  pub async fn update_memory_limit(&self, memory_bytes: u64) -> Result<()> {
    self
      .docker
      .update_container(
        self.container_name(),
        bollard::models::ContainerUpdateBody {
          memory: Some(memory_bytes as i64),
          ..Default::default()
        },
      )
      .await?;
    tracing::info!(
      container = %self.docker_container_name,
      memory_limit_mb = memory_bytes / 1024 / 1024,
      "Updated container memory limit"
    );
    Ok(())
  }

  /// Memory watchdog: call periodically from the runner tick loop.
  /// - When `memory_intensive`, bumps the limit if headroom is low (up to `MAX_MEMORY_LIMIT`).
  /// - When not intensive, logs a warning if headroom is low (possible leak),
  ///   and restores the default limit if it was previously bumped and usage has dropped.
  pub async fn check_memory(self: Arc<Self>) {
    let Ok((used, limit)) = self.memory_usage().await else {
      return;
    };

    let free = limit.saturating_sub(used);
    let intensive = self.memory_intensive.load(std::sync::atomic::Ordering::Relaxed);

    if free < MEMORY_HEADROOM {
      if intensive {
        let new_limit = (limit + MEMORY_BUMP).min(MAX_MEMORY_LIMIT);
        if new_limit == limit {
          tracing::error!(
            used_mb = used / 1024 / 1024,
            limit_mb = limit / 1024 / 1024,
            "Memory headroom low but already at max limit"
          );
          return;
        }
        tracing::warn!(
          used_mb = used / 1024 / 1024,
          limit_mb = limit / 1024 / 1024,
          new_limit_mb = new_limit / 1024 / 1024,
          "Memory headroom low, bumping limit"
        );
        self.update_memory_limit(new_limit).await.ok();
      } else {
        tracing::warn!(
          used_mb = used / 1024 / 1024,
          limit_mb = limit / 1024 / 1024,
          free_mb = free / 1024 / 1024,
          "Memory headroom low during non-intensive action (possible leak)"
        );
      }
    } else if !intensive && limit > DEFAULT_MEMORY_LIMIT && used < (DEFAULT_MEMORY_LIMIT - MEMORY_HEADROOM) {
      tracing::info!(
        used_mb = used / 1024 / 1024,
        current_limit_mb = limit / 1024 / 1024,
        default_limit_mb = DEFAULT_MEMORY_LIMIT / 1024 / 1024,
        "Usage below default threshold, restoring default memory limit"
      );
      self.update_memory_limit(DEFAULT_MEMORY_LIMIT).await.ok();
    }
  }
}
