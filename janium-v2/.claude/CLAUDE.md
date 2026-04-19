# Project Guidelines

## Rust Development

- Always run `cargo c` after making code changes and fix any errors before presenting changes as complete
- After making formatting-related changes, run `cargo fmt` rather than manually adjusting whitespace
- When modifying code across multiple files, grep for all existing usages of changed names/references before making changes to ensure nothing is missed

## Rust Style

- Prefer `map_or`, `unwrap_or_else`, etc. over `if let ... else` for simple Option/Result transformations
- Use `Mutation::new()` for simple actor state changes instead of creating dedicated message types. If something needs to be `.await`ed then send an `AsyncFnOnce`. Ex: `actor.send(async move |actor: &mut Actor, router: &Router, state: &mut ActorState| actor.run_func(&mut state).await`)
- Don't add `use` imports for items already in the prelude
- When using `replace_all` in edits, verify no unintended replacements occur (e.g. inside macro definitions)

## WebDriver / Selenium

- When searching for elements inside a known container, use `container.find()` / `container.find_all()` — not `self.driver.find()` which searches the entire page
- Don't guess CSS class names for LinkedIn elements — verify from existing code or ask
- JavaScript `setTimeout` is non-blocking — don't use it as a "sleep". For delayed actions in `setInterval` callbacks, use state tracking (e.g. `retryAt` timestamp) across ticks

## Testing

- Tests require `--lib` flag: `cargo test --package janium --lib -- 'test_name'`
- Use 60000ms (1 minute) or less for test command timeouts
- When running all tests never use a timeout greater than 2 minutes. All normal tests that run should be done within that timeframe and are deadlocked otherwise.
- When running tests, always capture the full output in a single run. Pipe through `tee` or redirect to a file so you have test names, failure messages, panic locations, and assertion values without needing to re-run. Example: `cargo test --package janium --lib 2>&1 | tee /tmp/test-output.txt` then grep the file for `FAILED`, `panicked`, `assertion`, etc.
- Never re-run the full test suite just to get different diagnostic info — extract what you need from the first run's output by writing the output to a temporary file and then working with that.
- For testing the scheduler, it needs to be enabled as it is disabled by default for tests (to avoid different interactions happening that don't have to do with the tests)
- Poll for completion (e.g. action request status in DB) instead of using fixed-duration sleeps
- Prefer `rstest` cases and `proptest` for standalone/pure functions whenever possible
- Use `cargo c` (not `cargo check`) for compilation checks
- Tests that require the dev server DB use `app_state_test_with_db` / `app_state_server_test_with_db` and are `#[ignore]`'d by default. Run them via `./run/dev-test.sh`

## Actor Model

- Actors must never `.await` when sending messages to other actors — this causes deadlocks. Use `SyncSender` (fire-and-forget) for inter-actor communication
- `.await` on actor responses is fine inside top-level GraphQL resolvers/mutations since they're not actors

## Database Migrations

- When adding a NOT NULL column to an existing table, use the three-step pattern: add the column as nullable, backfill existing rows, then set NOT NULL. Never use a DEFAULT to backfill — it locks the table on large datasets.

## Git Commits

- `cargo fmt`, `cargo c` and `cargo test` before committing work to ensure that it conforms

## General

- Never use perl for text replacement — use the Edit tool
- Consider actor lifecycle: disabling runtime behavior in tests must account for actors that schedule work at startup
