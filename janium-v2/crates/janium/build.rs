fn main() {
  let git_version = std::process::Command::new("git")
    .args(["rev-parse", "HEAD"])
    .output()
    .unwrap()
    .stdout;
  let git_version = String::from_utf8(git_version).unwrap();
  println!("cargo:rustc-env=GIT_VERSION={}", git_version);
}
