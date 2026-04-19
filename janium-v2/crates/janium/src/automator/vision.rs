//! AI Vision fallback for LinkedIn automation.
//!
//! When DOM-based element detection fails (XPath/CSS selectors don't find elements),
//! this module provides vision-based fallback using Claude's vision capabilities.
//!
//! The vision system can:
//! - Find UI elements by visual appearance (buttons, textareas, modals)
//! - Return click coordinates for elements not in DOM
//! - Detect error states (rate limits, verification required)
//! - Verify action results (invitation sent, modal closed)
//!
//! Uses Claude's tool use feature to ensure properly structured JSON responses.
//!
//! The main analysis logic is implemented as methods on `Automator` in `mod.rs`.
//! This module contains the types, tool definitions, and response parsing.

use super::utils::Delay;
use crate::prelude::*;
use serde::{Deserialize, Serialize};

impl super::Automator {
  /// Click at absolute viewport coordinates (for vision-detected elements).
  /// Uses CDP Input.dispatchMouseEvent for precise clicking.
  pub async fn click_at_coordinates(&self, x: i32, y: i32) -> Result<()> {
    tracing::info!("[Vision] Clicking at coordinates ({}, {})", x, y);

    let dev_tools = thirtyfour::extensions::cdp::ChromeDevTools::new(self.driver.handle.clone());

    // Mouse move to position
    dev_tools
      .execute_cdp_with_params(
        "Input.dispatchMouseEvent",
        serde_json::json!({
          "type": "mouseMoved",
          "x": x,
          "y": y
        }),
      )
      .await?;

    Delay::Ms(100).await;

    // Mouse pressed
    dev_tools
      .execute_cdp_with_params(
        "Input.dispatchMouseEvent",
        serde_json::json!({
          "type": "mousePressed",
          "x": x,
          "y": y,
          "button": "left",
          "clickCount": 1
        }),
      )
      .await?;

    Delay::Ms(50).await;

    // Mouse released
    dev_tools
      .execute_cdp_with_params(
        "Input.dispatchMouseEvent",
        serde_json::json!({
          "type": "mouseReleased",
          "x": x,
          "y": y,
          "button": "left",
          "clickCount": 1
        }),
      )
      .await?;

    Delay::Click.await;

    Ok(())
  }

  /// Get the vision config if vision is enabled and API key is configured.
  /// Returns None if vision fallback is disabled or API key is missing.
  pub fn vision_config(&self) -> Option<&crate::config::VisionConfig> {
    let config = &self.app_state.opts.integrations.vision;
    if config.anthropic_api_key.is_some() {
      Some(config)
    } else {
      tracing::warn!("[Vision] Vision fallback is disabled or API key not configured");
      None
    }
  }

  /// Analyze the current screen using Claude vision API.
  /// Takes a screenshot and sends it to Claude with the specified task.
  pub async fn analyze_screen(&self, task: VisionTask, additional_context: Option<&str>) -> Result<VisionAnalysis> {
    let Some(config) = self.vision_config() else {
      return Ok(VisionAnalysis::default());
    };

    // Safe to unwrap since vision_config() only returns Some when api_key is set
    let api_key = config.anthropic_api_key.as_ref().unwrap();

    let base64_image = self.driver.screenshot_as_png_base64().await?;

    // Build the prompt
    let mut prompt = task.prompt().to_string();
    if let Some(ctx) = additional_context {
      prompt.push_str("\n\nAdditional context: ");
      prompt.push_str(ctx);
    }

    // Build the API request with tool use
    let request_body = serde_json::json!({
      "model": config.anthropic_vision_model.as_ref(),
      "max_tokens": 1024,
      "tools": [task.tool()],
      "tool_choice": {
        "type": "tool",
        "name": task.tool_name()
      },
      "messages": [{
        "role": "user",
        "content": [
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": "image/png",
              "data": base64_image
            }
          },
          {
            "type": "text",
            "text": prompt
          }
        ]
      }]
    });

    // Make the API call with retries
    let client = &self.app_state.reqwest_client;
    let mut last_error = None;

    for attempt in 0..=config.vision_max_retries {
      if attempt > 0 {
        tracing::info!("[Vision] Retry attempt {}/{}", attempt, config.vision_max_retries);
        tokio::time::sleep(std::time::Duration::from_millis(500 * (attempt as u64 + 1))).await;
      }

      let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key.as_ref())
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&request_body)
        .send()
        .await;

      match response {
        Ok(resp) => {
          if resp.status().is_success() {
            let body: serde_json::Value = resp.json().await.map_err(JaniumError::any)?;
            return parse_tool_use_response(&body, task);
          } else {
            let status = resp.status();
            let error_text = resp.text().await.unwrap_or_default();
            tracing::warn!("[Vision] API error {}: {}", status, error_text);
            last_error = Some(JaniumError::msg(format!("Vision API error {}: {}", status, error_text)));
          }
        }
        Err(e) => {
          tracing::warn!("[Vision] Request failed: {:?}", e);
          last_error = Some(JaniumError::any(e));
        }
      }
    }

    Err(last_error.unwrap_or_else(|| JaniumError::msg("Vision API failed after retries")))
  }

  /// High-level helper to find an element visually
  pub async fn find_element_visually(&self, task: VisionTask, context: Option<&str>) -> Result<VisionAnalysis> {
    if self.vision_config().is_none() {
      return Ok(VisionAnalysis {
        element_found: false,
        coordinates: None,
        confidence: 0.0,
        guidance: "Vision fallback is disabled or API key not configured".to_string(),
        error_detected: None,
      });
    }

    tracing::info!("[Vision] Analyzing screenshot for task: {:?}", task);
    let result = self.analyze_screen(task, context).await?;

    tracing::info!(
      "[Vision] Result: found={}, coords={:?}, confidence={:.2}, guidance={}",
      result.element_found,
      result.coordinates,
      result.confidence,
      result.guidance
    );

    Ok(result)
  }

  /// Verify if an action succeeded by analyzing the screen
  pub async fn verify_action_visually(&self, task: VisionTask) -> Result<VisionAnalysis> {
    if self.vision_config().is_none() {
      return Ok(VisionAnalysis::default());
    }

    tracing::info!("[Vision] Verifying action result for task: {:?}", task);
    self.analyze_screen(task, None).await
  }

  /// Check for errors in the current screen state
  pub async fn detect_errors_visually(&self) -> Result<VisionAnalysis> {
    if self.vision_config().is_none() {
      return Ok(VisionAnalysis::default());
    }

    tracing::info!("[Vision] Checking for error states");
    self.analyze_screen(VisionTask::DetectErrors, None).await
  }
}

/// Result of vision-based UI analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionAnalysis {
  /// Whether the requested element was found
  pub element_found: bool,
  /// Click coordinates (center of element) in viewport pixels
  pub coordinates: Option<(i32, i32)>,
  /// Confidence score (0.0 to 1.0)
  pub confidence: f32,
  /// Human-readable guidance or next step
  pub guidance: String,
  /// Detected error state, if any
  pub error_detected: Option<String>,
}

impl Default for VisionAnalysis {
  fn default() -> Self {
    Self {
      element_found: false,
      coordinates: None,
      confidence: 0.0,
      guidance: String::new(),
      error_detected: None,
    }
  }
}

/// Tool input schema for finding UI elements
#[derive(Debug, Clone, Serialize, Deserialize)]
struct FindElementResult {
  found: bool,
  x: Option<i32>,
  y: Option<i32>,
  confidence: f64,
  guidance: String,
}

/// Tool input schema for finding connection modal
#[derive(Debug, Clone, Serialize, Deserialize)]
struct FindConnectionModalResult {
  found: bool,
  element_type: Option<String>,
  x: Option<i32>,
  y: Option<i32>,
  confidence: f64,
  guidance: String,
}

/// Tool input schema for verifying invitation sent
#[derive(Debug, Clone, Serialize, Deserialize)]
struct VerifyInvitationResult {
  success: bool,
  evidence: String,
  error: Option<String>,
}

/// Tool input schema for detecting errors
#[derive(Debug, Clone, Serialize, Deserialize)]
struct DetectErrorsResult {
  error_detected: bool,
  error_type: Option<String>,
  message: Option<String>,
  guidance: String,
}

/// Get the tool definition for element finding tasks
fn get_find_element_tool() -> serde_json::Value {
  serde_json::json!({
    "name": "report_element_location",
    "description": "Report the location of a UI element found in the screenshot",
    "input_schema": {
      "type": "object",
      "properties": {
        "found": {
          "type": "boolean",
          "description": "Whether the element was found in the screenshot"
        },
        "x": {
          "type": ["integer", "null"],
          "description": "X coordinate of element center in viewport pixels, null if not found"
        },
        "y": {
          "type": ["integer", "null"],
          "description": "Y coordinate of element center in viewport pixels, null if not found"
        },
        "confidence": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "description": "Confidence score from 0.0 to 1.0"
        },
        "guidance": {
          "type": "string",
          "description": "Description of what was found or why element wasn't found"
        }
      },
      "required": ["found", "confidence", "guidance"]
    }
  })
}

/// Get the tool definition for connection modal finding
fn get_find_connection_modal_tool() -> serde_json::Value {
  serde_json::json!({
    "name": "report_connection_modal",
    "description": "Report the connection modal state and location of interactive elements",
    "input_schema": {
      "type": "object",
      "properties": {
        "found": {
          "type": "boolean",
          "description": "Whether a connection modal was found"
        },
        "element_type": {
          "type": ["string", "null"],
          "enum": ["add_note_button", "textarea", "send_button", null],
          "description": "Type of primary interactive element found"
        },
        "x": {
          "type": ["integer", "null"],
          "description": "X coordinate of element center in viewport pixels"
        },
        "y": {
          "type": ["integer", "null"],
          "description": "Y coordinate of element center in viewport pixels"
        },
        "confidence": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "description": "Confidence score from 0.0 to 1.0"
        },
        "guidance": {
          "type": "string",
          "description": "Description of the modal state"
        }
      },
      "required": ["found", "confidence", "guidance"]
    }
  })
}

/// Get the tool definition for invitation verification
fn get_verify_invitation_tool() -> serde_json::Value {
  serde_json::json!({
    "name": "report_invitation_status",
    "description": "Report whether a LinkedIn invitation was successfully sent",
    "input_schema": {
      "type": "object",
      "properties": {
        "success": {
          "type": "boolean",
          "description": "Whether the invitation was successfully sent"
        },
        "evidence": {
          "type": "string",
          "description": "What visual evidence supports this conclusion"
        },
        "error": {
          "type": ["string", "null"],
          "description": "Error message if an error was detected"
        }
      },
      "required": ["success", "evidence"]
    }
  })
}

/// Get the tool definition for error detection
fn get_detect_errors_tool() -> serde_json::Value {
  serde_json::json!({
    "name": "report_error_state",
    "description": "Report any error states or blocks visible on the LinkedIn page",
    "input_schema": {
      "type": "object",
      "properties": {
        "error_detected": {
          "type": "boolean",
          "description": "Whether an error state was detected"
        },
        "error_type": {
          "type": ["string", "null"],
          "enum": ["email_verification", "rate_limit", "captcha", "restriction", "auth_required", null],
          "description": "Type of error detected"
        },
        "message": {
          "type": ["string", "null"],
          "description": "The error message text if visible"
        },
        "guidance": {
          "type": "string",
          "description": "Suggested action to take"
        }
      },
      "required": ["error_detected", "guidance"]
    }
  })
}

/// Task-specific prompts for common LinkedIn scenarios
#[derive(Debug, Clone, Copy)]
pub enum VisionTask {
  /// Find connection modal with Add Note button or textarea
  FindConnectionModal,
  /// Find the "Add a note" button in connection modal
  FindAddNoteButton,
  /// Find textarea for typing connection message
  FindMessageTextarea,
  /// Find Send/Submit button in modal
  FindSendButton,
  /// Verify if invitation was sent successfully
  #[allow(unused)]
  VerifyInvitationSent,
  /// Detect any error messages or blocks
  DetectErrors,
  /// Find Connect button on profile
  #[expect(dead_code)]
  FindConnectButton,
}

impl VisionTask {
  /// Get the prompt text for this task (tool schema handles the response format)
  pub fn prompt(&self) -> &'static str {
    match self {
      Self::FindConnectionModal => {
        r#"Analyze this LinkedIn screenshot. Look for a connection request modal/dialog.

The modal typically contains:
- A title like "Add a note" or "Connect with [name]"
- An "Add a note" button OR a textarea for typing a message
- A "Send" or "Send without a note" button

If you find the modal, identify the most important interactive element:
1. If there's an "Add a note" button, report its center coordinates and set element_type to "add_note_button"
2. If there's a visible textarea, report its center coordinates and set element_type to "textarea"
3. If there's only a "Send" button, report its center coordinates and set element_type to "send_button"

Use the report_connection_modal tool to report your findings."#
      }
      Self::FindAddNoteButton => {
        r#"Find the "Add a note" button in this LinkedIn connection modal.

The button is typically:
- Located below the profile info in the modal
- Has text "Add a note" or similar
- May be styled as a secondary/link button

Report the CENTER coordinates of the button for clicking using the report_element_location tool."#
      }
      Self::FindMessageTextarea => {
        r#"Find the message textarea/input in this LinkedIn connection modal.

The textarea is typically:
- A multi-line text input
- Has placeholder text like "Add a note" or "Write a message"
- Located in the center of the modal

Report the CENTER coordinates for clicking to focus the textarea using the report_element_location tool."#
      }
      Self::FindSendButton => {
        r#"Find the Send/Submit button in this LinkedIn modal.

The button is typically:
- A primary/blue button
- Located at the bottom of the modal
- Has text like "Send", "Send invitation", or "Send without a note"

Report the CENTER coordinates for clicking using the report_element_location tool."#
      }
      Self::VerifyInvitationSent => {
        r#"Check if a LinkedIn connection invitation was sent successfully.

Look for:
- A success toast/notification saying "Invitation sent" or similar
- The modal has closed (no connection modal visible)
- A "Pending" badge/button appeared on the profile

Also check for error states:
- Rate limit messages
- "Try again" prompts
- Error toasts

Use the report_invitation_status tool to report your findings."#
      }
      Self::DetectErrors => {
        r#"Check this LinkedIn screenshot for any error states or blocks.

Look for:
- Email verification required (input asking for email)
- Rate limit messages ("You've reached the weekly limit")
- CAPTCHA challenges
- Account restrictions
- Error toasts or alerts
- Login/authentication walls

Use the report_error_state tool to report your findings."#
      }
      Self::FindConnectButton => {
        r#"Find the Connect button on this LinkedIn profile page.

The Connect button is typically:
- In the profile header area (top section)
- A button with text "Connect" or a connect icon
- May be inside a "More" dropdown menu

Do NOT confuse with:
- "Follow" button
- "Message" button
- Connect buttons in sidebar recommendations

Report the CENTER coordinates for clicking using the report_element_location tool."#
      }
    }
  }

  /// Get the tool definition for this task
  pub fn tool(&self) -> serde_json::Value {
    match self {
      Self::FindConnectionModal => get_find_connection_modal_tool(),
      Self::FindAddNoteButton | Self::FindMessageTextarea | Self::FindSendButton | Self::FindConnectButton => {
        get_find_element_tool()
      }
      Self::VerifyInvitationSent => get_verify_invitation_tool(),
      Self::DetectErrors => get_detect_errors_tool(),
    }
  }

  /// Get the expected tool name for this task
  pub fn tool_name(&self) -> &'static str {
    match self {
      Self::FindConnectionModal => "report_connection_modal",
      Self::FindAddNoteButton | Self::FindMessageTextarea | Self::FindSendButton | Self::FindConnectButton => {
        "report_element_location"
      }
      Self::VerifyInvitationSent => "report_invitation_status",
      Self::DetectErrors => "report_error_state",
    }
  }
}

/// Parse Claude's tool use response into a VisionAnalysis.
/// Called by Automator::analyze_screen after receiving the API response.
pub fn parse_tool_use_response(response: &serde_json::Value, task: VisionTask) -> Result<VisionAnalysis> {
  // Extract the tool use content from Claude's response
  // Response format: { "content": [{ "type": "tool_use", "name": "...", "input": {...} }] }
  let tool_input = response
    .get("content")
    .and_then(|c| c.as_array())
    .and_then(|arr| {
      arr
        .iter()
        .find(|item| item.get("type").and_then(|t| t.as_str()) == Some("tool_use"))
    })
    .and_then(|item| item.get("input"))
    .ok_or_else(|| {
      tracing::error!("[Vision] No tool_use found in response: {:?}", response);
      JaniumError::msg("Invalid vision API response: no tool_use content found")
    })?;

  tracing::debug!("[Vision] Tool input: {:?}", tool_input);

  // Build VisionAnalysis based on task type
  match task {
    VisionTask::FindConnectionModal => {
      let result: FindConnectionModalResult = serde_json::from_value(tool_input.clone())
        .map_err(|e| JaniumError::msg(format!("Failed to parse connection modal result: {}", e)))?;

      let coordinates = match (result.x, result.y) {
        (Some(x), Some(y)) => Some((x, y)),
        _ => None,
      };

      Ok(VisionAnalysis {
        element_found: result.found,
        coordinates,
        confidence: result.confidence as f32,
        guidance: result.guidance,
        error_detected: None,
      })
    }
    VisionTask::VerifyInvitationSent => {
      let result: VerifyInvitationResult = serde_json::from_value(tool_input.clone())
        .map_err(|e| JaniumError::msg(format!("Failed to parse invitation result: {}", e)))?;

      Ok(VisionAnalysis {
        element_found: result.success,
        coordinates: None,
        confidence: if result.success { 0.9 } else { 0.5 },
        guidance: result.evidence,
        error_detected: result.error,
      })
    }
    VisionTask::DetectErrors => {
      let result: DetectErrorsResult = serde_json::from_value(tool_input.clone())
        .map_err(|e| JaniumError::msg(format!("Failed to parse error detection result: {}", e)))?;

      let error_detected = if result.error_detected {
        result.error_type.or(result.message)
      } else {
        None
      };

      Ok(VisionAnalysis {
        element_found: result.error_detected,
        coordinates: None,
        confidence: if result.error_detected { 0.9 } else { 0.5 },
        guidance: result.guidance,
        error_detected,
      })
    }
    VisionTask::FindAddNoteButton
    | VisionTask::FindMessageTextarea
    | VisionTask::FindSendButton
    | VisionTask::FindConnectButton => {
      let result: FindElementResult = serde_json::from_value(tool_input.clone())
        .map_err(|e| JaniumError::msg(format!("Failed to parse element location result: {}", e)))?;

      let coordinates = match (result.x, result.y) {
        (Some(x), Some(y)) => Some((x, y)),
        _ => None,
      };

      Ok(VisionAnalysis {
        element_found: result.found,
        coordinates,
        confidence: result.confidence as f32,
        guidance: result.guidance,
        error_detected: None,
      })
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_parse_tool_use_find_element() {
    let response = serde_json::json!({
      "content": [{
        "type": "tool_use",
        "id": "toolu_123",
        "name": "report_element_location",
        "input": {
          "found": true,
          "x": 500,
          "y": 300,
          "confidence": 0.95,
          "guidance": "Found the Add a note button in the modal"
        }
      }]
    });

    let result = parse_tool_use_response(&response, VisionTask::FindAddNoteButton).unwrap();
    assert!(result.element_found);
    assert_eq!(result.coordinates, Some((500, 300)));
    assert!((result.confidence - 0.95).abs() < 0.01);
    assert!(result.guidance.contains("Add a note"));
  }

  #[test]
  fn test_parse_tool_use_connection_modal() {
    let response = serde_json::json!({
      "content": [{
        "type": "tool_use",
        "id": "toolu_456",
        "name": "report_connection_modal",
        "input": {
          "found": true,
          "element_type": "textarea",
          "x": 400,
          "y": 350,
          "confidence": 0.88,
          "guidance": "Found textarea in connection modal"
        }
      }]
    });

    let result = parse_tool_use_response(&response, VisionTask::FindConnectionModal).unwrap();
    assert!(result.element_found);
    assert_eq!(result.coordinates, Some((400, 350)));
    assert!((result.confidence - 0.88).abs() < 0.01);
  }

  #[test]
  fn test_parse_tool_use_verify_invitation() {
    let response = serde_json::json!({
      "content": [{
        "type": "tool_use",
        "id": "toolu_789",
        "name": "report_invitation_status",
        "input": {
          "success": true,
          "evidence": "Invitation sent toast visible at top of screen",
          "error": null
        }
      }]
    });

    let result = parse_tool_use_response(&response, VisionTask::VerifyInvitationSent).unwrap();
    assert!(result.element_found);
    assert!(result.guidance.contains("Invitation sent"));
    assert!(result.error_detected.is_none());
  }

  #[test]
  fn test_parse_tool_use_detect_errors() {
    let response = serde_json::json!({
      "content": [{
        "type": "tool_use",
        "id": "toolu_abc",
        "name": "report_error_state",
        "input": {
          "error_detected": true,
          "error_type": "rate_limit",
          "message": "You've reached the weekly invitation limit",
          "guidance": "Wait until next week to send more invitations"
        }
      }]
    });

    let result = parse_tool_use_response(&response, VisionTask::DetectErrors).unwrap();
    assert!(result.element_found);
    assert_eq!(result.error_detected, Some("rate_limit".to_string()));
    assert!(result.guidance.contains("Wait"));
  }

  #[test]
  fn test_parse_tool_use_not_found() {
    let response = serde_json::json!({
      "content": [{
        "type": "tool_use",
        "id": "toolu_xyz",
        "name": "report_element_location",
        "input": {
          "found": false,
          "x": null,
          "y": null,
          "confidence": 0.2,
          "guidance": "No Send button visible in the screenshot"
        }
      }]
    });

    let result = parse_tool_use_response(&response, VisionTask::FindSendButton).unwrap();
    assert!(!result.element_found);
    assert!(result.coordinates.is_none());
    assert!((result.confidence - 0.2).abs() < 0.01);
  }

  #[test]
  fn test_vision_analysis_default() {
    let analysis = VisionAnalysis::default();
    assert!(!analysis.element_found);
    assert!(analysis.coordinates.is_none());
    assert_eq!(analysis.confidence, 0.0);
  }

  #[test]
  fn test_tool_definitions_are_valid_json() {
    let tools = [
      get_find_element_tool(),
      get_find_connection_modal_tool(),
      get_verify_invitation_tool(),
      get_detect_errors_tool(),
    ];

    for tool in tools {
      assert!(tool.get("name").is_some());
      assert!(tool.get("description").is_some());
      assert!(tool.get("input_schema").is_some());
    }
  }
}
