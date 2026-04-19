pub use crate::Result;
use crate::prelude::*;
use thirtyfour::prelude::*;

mod download_inbox;
mod download_li_profile;
mod download_messages;
mod find_elements;
mod navigation;
mod process_sales_nav_url;
pub mod runner;
mod send_connection_request;
mod send_message;
mod sn_profile;
mod sync_connections;
mod utils;
pub mod vision;
mod withdraw_cr;

pub struct Automator {
  #[allow(unused)]
  webdriver_url: String,
  #[allow(unused)]
  home_dir: String,
  pub driver: WebDriver,
  /// The window handle captured when the WebDriver session was created.
  /// Used to reliably identify the automation tab vs idle tabs.
  /// May be reassigned if the original window is closed externally.
  pub main_window: thirtyfour::WindowHandle,
  pub container_service_client: container_service::Client,
  /// SyncSender ensures we never block waiting on the LinkedIn actor, preventing deadlocks
  linked_in: SyncSender<LinkedIn>,
  /// Application state for access to config, services, etc.
  pub app_state: AppState,
  /// Team ID for the LinkedIn account
  pub team_id: Id<Team>,
  /// Team timezone (matches container TZ, used by LinkedIn for display)
  pub timezone: ArcSwap<TimeZone>,
  /// The LinkedIn account owner's contact ID. `Id::nil()` until owner detection runs.
  /// Shared via ArcSwap so it can be updated during scraping and read without re-querying.
  pub owner_contact_id: ArcSwap<Id<Contact>>,
  /// Cache of Sales Navigator profile ID → contact ID, shared across actions to
  /// avoid repeated DB lookups for the same sender. Cleared at the start of each
  /// download_inbox run to avoid serving stale IDs after contact merges.
  pub sn_id_to_contact_cache: std::collections::HashMap<String, Id<Contact>>,
}

impl core::ops::Deref for Automator {
  type Target = WebDriver;

  fn deref(&self) -> &Self::Target {
    &self.driver
  }
}

impl Automator {
  pub async fn new(
    webdriver_url: String,
    container_service_port: u16,
    home_dir: &str,
    linked_in: SyncSender<LinkedIn>,
    app_state: AppState,
    team_id: Id<Team>,
    timezone: ArcSwap<TimeZone>,
    owner_contact_id: ArcSwap<Id<Contact>>,
  ) -> Result<Self> {
    let container_service_client = container_service::Client::new("localhost", container_service_port).await?;
    let driver = Self::new_webdriver_inner(webdriver_url.clone(), home_dir).await?;
    let main_window = driver.window().await?;
    Ok(Self {
      webdriver_url,
      home_dir: home_dir.to_string(),
      linked_in,
      driver,
      main_window,
      container_service_client,
      app_state,
      team_id,
      timezone,
      owner_contact_id,
      sn_id_to_contact_cache: std::collections::HashMap::new(),
    })
  }

  #[expect(dead_code)]
  pub async fn new_webdriver(&mut self) -> Result<&WebDriver> {
    let driver = Self::new_webdriver_inner(self.webdriver_url.clone(), &self.home_dir).await?;
    self.main_window = driver.window().await?;
    self.driver = driver;
    Ok(&self.driver)
  }

  async fn new_webdriver_inner(webdriver_url: String, home_dir: &str) -> Result<WebDriver> {
    tracing::info!("Setting up driver");

    let mut caps = DesiredCapabilities::chrome();

    caps.insert_browser_option("excludeSwitches", ["enable-automation"])?;
    caps.insert_browser_option("useAutomationExtension", false)?;
    caps.add_arg("--enable-unsafe-swiftshader")?;
    caps.add_arg("--allow-pre-commit-input")?;
    caps.add_arg("--disable-blink-features=AutomationControlled")?;
    caps.add_arg("--disable-gpu-sandbox")?;
    caps.add_arg("--disable-gpu-sandbox-sandbox-extension")?;
    caps.add_arg("--no-first-run")?;
    caps.add_arg("--remote-debugging-port=0")?;
    caps.add_arg("--start-maximized")?;
    caps.add_arg(&format!(
      "--user-data-dir={home_dir}/.config/BraveSoftware/Brave-Browser"
    ))?;
    caps.add_arg("--proxy-server=127.0.0.1:7769")?;
    caps.set_binary("/usr/sbin/brave-browser")?;
    caps.set_disable_gpu()?;
    caps.set_no_sandbox()?;

    let driver = WebDriver::new(webdriver_url, caps).await?;
    driver.maximize_window().await?;

    let dev_tools = thirtyfour::extensions::cdp::ChromeDevTools::new(driver.handle.clone());

    dev_tools
      .execute_cdp_with_params(
        "Page.addScriptToEvaluateOnNewDocument",
        serde_json::json!({
          "source": r#"{
  Object.defineProperty(Navigator.prototype, 'webdriver', {
    set: undefined,
    enumerable: true,
    configurable: true,
    get: new Proxy(
        Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver').get,
        { apply: (target, thisArg, args) => {
            // emulate getter call validation
            Reflect.apply(target, thisArg, args);
            return false;
        }}
    )
  });
}"#,
        }),
      )
      .await?;
    Ok(driver)
  }

  #[expect(dead_code)]
  pub async fn quit(self) -> Result<()> {
    // poll both at same time so they both have a chance to complete
    let (f1, f2) = futures::join!(self.container_service_client.close(), self.driver.quit());
    // raise errors if they occur
    f1?;
    f2?;
    Ok(())
  }
}

#[cfg(test)]
#[expect(dead_code)]
pub async fn assert_automator_is_undetectable(automator: &Automator) {
  automator.goto("https://bot.sannysoft.com/").await.unwrap();
  // let html = automator.driver.source().await.unwrap();
  // println!("html: {:?}", html);
  // taken from https://stackoverflow.com/questions/33225947/can-a-website-detect-when-you-are-using-selenium-with-chromedriver
  let bot_detection =automator.execute(r#"
    var documentDetectionKeys = [
        "__webdriver_evaluate",
        "__selenium_evaluate",
        "__webdriver_script_function",
        "__webdriver_script_func",
        "__webdriver_script_fn",
        "__fxdriver_evaluate",
        "__driver_unwrapped",
        "__webdriver_unwrapped",
        "__driver_evaluate",
        "__selenium_unwrapped",
        "__fxdriver_unwrapped",
    ];

    var windowDetectionKeys = [
        "_phantom",
        "__nightmare",
        "_selenium",
        "callPhantom",
        "callSelenium",
        "_Selenium_IDE_Recorder",
    ];

    for (const windowDetectionKey in windowDetectionKeys) {
        const windowDetectionKeyValue = windowDetectionKeys[windowDetectionKey];
        if (window[windowDetectionKeyValue]) {
            return true;
        }
    };
    for (const documentDetectionKey in documentDetectionKeys) {
        const documentDetectionKeyValue = documentDetectionKeys[documentDetectionKey];
        if (window['document'][documentDetectionKeyValue]) {
            return true;
        }
    };

    for (const documentKey in window['document']) {
        if (documentKey.match(/\$[a-z]dc_/) && window['document'][documentKey]['cache_']) {
            return true;
        }
    }

    if (window['external'] && window['external'].toString() && (window['external'].toString()['indexOf']('Sequentum') != -1)) return true;

    if (window['document']['documentElement']['getAttribute']('selenium')) return true;
    if (window['document']['documentElement']['getAttribute']('webdriver')) return true;
    if (window['document']['documentElement']['getAttribute']('driver')) return true;

    // Check to ensure that webdriver fix works
    if (navigator['webdriver']) return true;

    var cdpDetected = false;
    var e = new Error();
    Object.defineProperty(e, 'stack', {
      get() {
        cdpDetected = true;
      }
    });

    // This is part of the detection, the console.log shouldn't be removed!
    console.log(e);

    if (cdpDetected) {
        return true;
    }

    return false;
  "#, []).await.unwrap();
  assert!(!bot_detection.json().as_bool().unwrap());

  utils::Delay::Ms(30000).await;
}

#[test]
#[ignore]
fn test_automator_is_undetectable() {
  crate::test::app_state_test(20, async |_app_state| {
    // let mut container = ContainerHandle::new_test(&app_state).await.unwrap();
    // let automator = container.create_automator().await.unwrap();
    // assert_automator_is_undetectable(automator).await;
    // container.stop().await.unwrap();
  });
}
