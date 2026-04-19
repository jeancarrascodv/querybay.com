use crate::prelude::*;
use openai_api_rs::v1::api::OpenAIClient;
use openai_api_rs::v1::chat_completion::chat_completion::ChatCompletionRequest;
use openai_api_rs::v1::chat_completion::{
  ChatCompletionMessage, Content, FinishReason, MessageRole, Tool, ToolChoiceType, ToolType,
};
use openai_api_rs::v1::types;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedName {
  pub first_name: Option<String>,
  pub middle_name: Option<String>,
  pub last_name: Option<String>,
  pub preferred_name: Option<String>,
}

/// Parses a scraped name from the internet into its components using OpenAI API.
/// Returns a JSON object with first_name, middle_name, and last_name fields.
pub async fn parse_name(mut name: String, app_state: AppState) -> Result<ParsedName> {
  let original_name = name.clone();
  for emoji in emojis::iter() {
    if let Some(skin_tones) = emoji.skin_tones() {
      for skin_tone in skin_tones {
        if name.contains(skin_tone.as_str()) {
          name = name.replace(skin_tone.as_str(), "");
        }
      }
    }
    if name.contains(emoji.as_str()) {
      name = name.replace(emoji.as_str(), "");
    }
  }
  name = name.replace("  ", " ").trim().to_string();
  if name.is_empty() {
    return Ok(ParsedName {
      first_name: None,
      middle_name: None,
      last_name: None,
      preferred_name: None,
    });
  }

  let mut client = OpenAIClient::builder()
    .with_api_key(
      app_state
        .opts
        .integrations
        .openai_api_key
        .as_ref()
        .ok_or_else(|| JaniumError::msg("openai_api_key not set"))?
        .as_ref(),
    )
    .build()
    .map_err(|e| JaniumError::msg(format!("Failed to create OpenAI client: {}", e)))?;

  // Define the JSON schema for ParsedName (cacheable - static structure)
  let mut properties = HashMap::new();

  properties.insert(
    "first_name".to_string(),
    Box::new(types::JSONSchemaDefine {
      schema_type: Some(types::JSONSchemaType::String),
      description: Some("The first name".to_string()),
      ..Default::default()
    }),
  );

  properties.insert(
    "middle_name".to_string(),
    Box::new(types::JSONSchemaDefine {
      schema_type: Some(types::JSONSchemaType::String),
      description: Some("The middle name, if present".to_string()),
      ..Default::default()
    }),
  );

  properties.insert(
    "last_name".to_string(),
    Box::new(types::JSONSchemaDefine {
      schema_type: Some(types::JSONSchemaType::String),
      description: Some("The last name".to_string()),
      ..Default::default()
    }),
  );

  properties.insert(
    "preferred_name".to_string(),
    Box::new(types::JSONSchemaDefine {
      schema_type: Some(types::JSONSchemaType::String),
      description: Some("The preferred name, if present".to_string()),
      ..Default::default()
    }),
  );

  // Build messages with system message (cacheable) and user message (non-cacheable)
  // This structure enables prompt caching: system message and tools are cached,
  // only the variable user message needs to be processed each time
  let messages = vec![
    ChatCompletionMessage {
      role: MessageRole::system,
      content: Content::Text(
        "Extract the first name, middle name (if present), and last name \
        ignoring emojis and any honorifics like Dr., MD, CPA, etc. from \
        the provided full name. Be as accurate as possible taking into account \
        different languages and cultures. If a name is unknown, use null for that field. \
        If there is a first name followed by a single character, that character should be part of the last name. \
        If the name appears to be a company name, do not provide a first name, middle name, last name, or preferred name."
          .to_string(),
      ),
      name: None,
      tool_calls: None,
      tool_call_id: None,
    },
    ChatCompletionMessage {
      role: MessageRole::user,
      content: Content::Text(name),
      name: None,
      tool_calls: None,
      tool_call_id: None,
    },
  ];

  let request = ChatCompletionRequest::new(app_state.opts.integrations.openai_model.as_ref().to_string(), messages)
    .tools(vec![Tool {
      r#type: ToolType::Function,
      function: types::Function {
        name: "parse_name".to_string(),
        description: Some("Parse a full name into its components: first_name, middle_name, and last_name.".to_string()),
        parameters: types::FunctionParameters {
          schema_type: types::JSONSchemaType::Object,
          properties: Some(properties),
          required: None, // All fields are optional
        },
      },
    }])
    .tool_choice(ToolChoiceType::Required);

  // Prompt caching is enabled through the message structure:
  // - System message (static instruction) is cacheable by OpenAI
  // - Tool definitions are cacheable
  // - Only the user message (variable name) needs to be processed each time
  // This structure reduces latency and costs for repeated requests with the same structure

  let mut error = None;
  for _ in 0..3 {
    let response = client
      .chat_completion(request.clone())
      .await
      .map_err(|e| JaniumError::any(e))?;

    // Extract the function call arguments from the tool call
    let choice = response
      .choices
      .first()
      .ok_or_else(|| JaniumError::msg("No choices in OpenAI response"))?;

    match &choice.finish_reason {
      Some(FinishReason::tool_calls) => {
        let tool_calls = choice
          .message
          .tool_calls
          .as_ref()
          .ok_or_else(|| JaniumError::msg("No tool calls in OpenAI response"))?;

        let tool_call = tool_calls
          .first()
          .ok_or_else(|| JaniumError::msg("No tool call found"))?;

        let arguments = tool_call
          .function
          .arguments
          .as_ref()
          .ok_or_else(|| JaniumError::msg("No arguments in tool call"))?;

        // Parse the JSON arguments into ParsedName
        let parsed = serde_json::from_str::<ParsedName>(arguments)
          .map_err(|e| JaniumError::msg(format!("Failed to parse tool call arguments as JSON: {}", e)))?;

        tracing::info!(original_name, "Parsed: {parsed:?}");
        if let Some(first_name) = &parsed.first_name
          && (!original_name.contains(first_name.as_str()) || &original_name == first_name)
        {
          tracing::info!("First name {} not found in original name, retrying", first_name);
          continue;
        }
        if let Some(last_name) = &parsed.last_name
          && (!original_name.contains(last_name.as_str()) || &original_name == last_name)
        {
          tracing::info!("Last name {} not found in original name, retrying", last_name);
          continue;
        }
        if let Some(middle_name) = &parsed.middle_name
          && (!original_name.contains(middle_name.as_str()) || &original_name == middle_name)
        {
          tracing::info!("Middle name {} not found in original name, retrying", middle_name);
          continue;
        }
        if let Some(preferred_name) = &parsed.preferred_name
          && (!original_name.contains(preferred_name.as_str()) || &original_name == preferred_name)
        {
          tracing::info!("Preferred name {} not found in original name, retrying", preferred_name);
          continue;
        }
        return Ok(parsed);
      }
      _ => {
        error = Some(JaniumError::msg(format!(
          "Expected tool_calls finish reason, got: {:?}",
          choice.finish_reason
        )));
      }
    }
  }
  Err(error.unwrap_or_else(|| JaniumError::msg("Failed to parse name after 3 attempts")))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test::app_state_test;

  #[test_log::test]
  // Ignore by default because it's slow and requires a paid OpenAI API key
  #[ignore]
  fn test_parse_name_with_honorifics_and_emojis() {
    app_state_test(240, async |app_state| {
      // Skip test if API key is not set
      if app_state.opts.integrations.openai_api_key.is_none() {
        tracing::warn!("Skipping test_parse_name_with_honorifics_and_emojis: OPENAI_API_KEY not set");
        return;
      }

      let name0 = "Tyler H.";
      let result0 = parse_name(name0.into(), app_state.clone())
        .await
        .expect("Failed to parse name");
      tracing::info!("Parsed '{}': {:?}", name0, result0);
      assert_eq!(result0.first_name, Some("Tyler".to_string()));
      assert_eq!(result0.middle_name, None);
      assert_eq!(result0.last_name, Some("H.".to_string()));
      assert_eq!(result0.preferred_name, None);

      // Test case 1: Name with Dr. honorific
      let name1 = "Dr. John Michael Smith";
      let result1 = parse_name(name1.into(), app_state.clone())
        .await
        .expect("Failed to parse name with Dr.");
      tracing::info!("Parsed '{}': {:?}", name1, result1);
      assert_eq!(result1.first_name, Some("John".to_string()));
      assert_eq!(result1.middle_name, Some("Michael".to_string()));
      assert_eq!(result1.last_name, Some("Smith".to_string()));
      assert_eq!(result1.preferred_name, None);

      // Test case 2: Name with MD suffix
      let name2 = "Jane Elizabeth Doe MD";
      let result2 = parse_name(name2.into(), app_state.clone())
        .await
        .expect("Failed to parse name with MD");
      tracing::info!("Parsed '{}': {:?}", name2, result2);
      assert_eq!(result2.first_name, Some("Jane".to_string()));
      assert_eq!(result2.middle_name, Some("Elizabeth".to_string()));
      assert_eq!(result2.last_name, Some("Doe".to_string()));
      assert_eq!(result2.preferred_name, None);

      // Test case 3: Name with emojis
      let name3 = "Alice 🎉 Marie 🌟 Johnson";
      let result3 = parse_name(name3.into(), app_state.clone())
        .await
        .expect("Failed to parse name with emojis");
      tracing::info!("Parsed '{}': {:?}", name3, result3);
      // Verify structure - emojis should be filtered out
      assert!(result3.first_name.is_some(), "First name should be present");
      assert!(result3.last_name.is_some(), "Last name should be present");
      assert_eq!(result3.first_name.as_deref(), Some("Alice"));
      assert_eq!(result3.middle_name.as_deref(), Some("Marie"));
      assert_eq!(result3.last_name.as_deref(), Some("Johnson"));
      assert_eq!(result3.preferred_name, None);

      // Test case 4: Name with both honorific and emoji
      let name4 = "Dr. Robert 👨‍⚕️ Williams";
      let result4 = parse_name(name4.into(), app_state.clone())
        .await
        .expect("Failed to parse name with Dr. and emoji");
      tracing::info!("Parsed '{}': {:?}", name4, result4);
      assert_eq!(result4.first_name, Some("Robert".to_string()));
      assert_eq!(result4.middle_name, None);
      assert_eq!(result4.last_name, Some("Williams".to_string()));
      assert_eq!(result4.preferred_name, None);

      // Test case 5: Name with multiple honorifics
      let name5 = "Dr. Sarah MD Anderson";
      let result5 = parse_name(name5.into(), app_state.clone())
        .await
        .expect("Failed to parse name with multiple honorifics");
      tracing::info!("Parsed '{}': {:?}", name5, result5);
      assert_eq!(result5.first_name, Some("Sarah".to_string()));
      assert_eq!(result5.middle_name, None);
      assert_eq!(result5.last_name, Some("Anderson".to_string()));
      assert_eq!(result5.preferred_name, None);

      // Test case 6: Name with emoji at the start
      let name6 = "🌟 Michael Brown";
      let result6 = parse_name(name6.into(), app_state.clone())
        .await
        .expect("Failed to parse name with leading emoji");
      tracing::info!("Parsed '{}': {:?}", name6, result6);
      assert_eq!(result6.first_name, Some("Michael".to_string()));
      assert_eq!(result6.middle_name, None);
      assert_eq!(result6.last_name, Some("Brown".to_string()));
      assert_eq!(result6.preferred_name, None);

      // Test case 7: Complex name with Dr., middle name, and emoji
      let name7 = "Dr. Emily 🏥 Grace Thompson";
      let result7 = parse_name(name7.into(), app_state.clone())
        .await
        .expect("Failed to parse complex name");
      tracing::info!("Parsed '{}': {:?}", name7, result7);
      assert_eq!(result7.first_name, Some("Emily".to_string()));
      assert_eq!(result7.middle_name, Some("Grace".to_string()));
      assert_eq!(result7.last_name, Some("Thompson".to_string()));
      assert_eq!(result7.preferred_name, None);

      // Test case 8: Spanish name with multiple surnames
      let name8 = "María García López";
      let result8 = parse_name(name8.into(), app_state.clone())
        .await
        .expect("Failed to parse Spanish name");
      tracing::info!("Parsed '{}': {:?}", name8, result8);
      assert_eq!(result8.first_name, Some("María".to_string()));
      assert_eq!(result8.middle_name, None);
      // Spanish names typically have two surnames - the last one should be captured
      assert!(result8.last_name.is_some(), "Last name should be present");
      assert!(
        result8.last_name.as_deref().unwrap().contains("López")
          || result8.last_name.as_deref().unwrap().contains("García")
      );
      assert_eq!(result8.preferred_name, None);

      // Test case 9: Spanish name with compound first name
      let name9 = "José María Fernández";
      let result9 = parse_name(name9.into(), app_state.clone())
        .await
        .expect("Failed to parse Spanish compound name");
      tracing::info!("Parsed '{}': {:?}", name9, result9);
      assert!(result9.first_name.as_ref().is_some_and(|name| name.contains("José")));
      assert!(
        result9.first_name.as_ref().is_some_and(|name| name.contains("María"))
          || result9.middle_name.as_ref().is_some_and(|name| name.contains("María"))
      );
      assert_eq!(result9.last_name, Some("Fernández".to_string()));
      assert_eq!(result9.preferred_name, None);

      // Test case 10: Arabic name with multiple parts
      let name10 = "Mohammed Ali Hassan";
      let result10 = parse_name(name10.into(), app_state.clone())
        .await
        .expect("Failed to parse Arabic name");
      tracing::info!("Parsed '{}': {:?}", name10, result10);
      assert_eq!(result10.first_name, Some("Mohammed".to_string()));
      assert_eq!(result10.middle_name, Some("Ali".to_string()));
      assert_eq!(result10.last_name, Some("Hassan".to_string()));
      assert_eq!(result10.preferred_name, None);

      // Test case 11: Indian name with multiple parts
      let name11 = "Rajesh Kumar Singh";
      let result11 = parse_name(name11.into(), app_state.clone())
        .await
        .expect("Failed to parse Indian name");
      tracing::info!("Parsed '{}': {:?}", name11, result11);
      assert_eq!(result11.first_name, Some("Rajesh".to_string()));
      assert_eq!(result11.middle_name, Some("Kumar".to_string()));
      assert_eq!(result11.last_name, Some("Singh".to_string()));
      assert_eq!(result11.preferred_name, None);

      // Test case 12: Portuguese name with "da" particle
      let name12 = "João da Silva Santos";
      let result12 = parse_name(name12.into(), app_state.clone())
        .await
        .expect("Failed to parse Portuguese name");
      tracing::info!("Parsed '{}': {:?}", name12, result12);
      assert_eq!(result12.first_name, Some("João".to_string()));
      // "da Silva" might be parsed as middle name or part of last name
      assert!(result12.last_name.is_some(), "Last name should be present");
      assert!(
        result12.last_name.as_deref().unwrap().contains("Santos")
          || result12.last_name.as_deref().unwrap().contains("Silva")
      );
      assert_eq!(result12.preferred_name, None);

      // Test case 13: Dutch name with "van der" particle
      let name13 = "Jan van der Berg";
      let result13 = parse_name(name13.into(), app_state.clone())
        .await
        .expect("Failed to parse Dutch name");
      tracing::info!("Parsed '{}': {:?}", name13, result13);
      assert_eq!(result13.first_name, Some("Jan".to_string()));
      // "van der" might be parsed as middle name or part of last name
      assert!(result13.last_name.is_some(), "Last name should be present");
      assert!(
        result13.last_name.as_deref().unwrap().contains("Berg")
          || result13.last_name.as_deref().unwrap().contains("van")
      );
      assert_eq!(result13.preferred_name, None);

      // Test case 14: Vietnamese name with multiple parts
      let name14 = "Nguyễn Văn An";
      let result14 = parse_name(name14.into(), app_state.clone())
        .await
        .expect("Failed to parse Vietnamese name");
      tracing::info!("Parsed '{}': {:?}", name14, result14);
      // Vietnamese names: family name first, then middle, then given name
      assert_eq!(result14.first_name, Some("An".to_string()));
      assert_eq!(result14.middle_name, Some("Văn".to_string()));
      assert_eq!(result14.last_name, Some("Nguyễn".to_string()));
      assert_eq!(result14.preferred_name, None);

      // Test case 15: Spanish name with honorific and emoji
      let name15 = "Dr. María 🌟 García López";
      let result15 = parse_name(name15.into(), app_state.clone())
        .await
        .expect("Failed to parse Spanish name with honorific and emoji");
      tracing::info!("Parsed '{}': {:?}", name15, result15);
      assert_eq!(result15.first_name, Some("María".to_string()));
      assert!(result15.last_name.is_some(), "Last name should be present");
      assert_eq!(result15.preferred_name, None);

      // Test case 16: Indian name with honorific
      let name16 = "Dr. Priya Devi Sharma";
      let result16 = parse_name(name16.into(), app_state.clone())
        .await
        .expect("Failed to parse Indian name with honorific");
      tracing::info!("Parsed '{}': {:?}", name16, result16);
      assert_eq!(result16.first_name, Some("Priya".to_string()));
      assert_eq!(result16.middle_name, Some("Devi".to_string()));
      assert_eq!(result16.last_name, Some("Sharma".to_string()));
      assert_eq!(result16.preferred_name, None);

      // Test case 17: Arabic name with emoji
      let name17 = "Fatima 👩 bint Ali";
      let result17 = parse_name(name17.into(), app_state.clone())
        .await
        .expect("Failed to parse Arabic name with emoji");
      tracing::info!("Parsed '{}': {:?}", name17, result17);
      assert_eq!(result17.first_name, Some("Fatima".to_string()));
      assert!(result17.last_name.is_some(), "Last name should be present");
      assert_eq!(result17.preferred_name, None);

      // Test case 18: Name with nickname in parentheses
      let name18 = "John (Johnny) Michael Smith";
      let result18 = parse_name(name18.into(), app_state.clone())
        .await
        .expect("Failed to parse name with nickname in parentheses");
      tracing::info!("Parsed '{}': {:?}", name18, result18);
      assert_eq!(result18.first_name, Some("John".to_string()));
      assert_eq!(result18.middle_name, Some("Michael".to_string()));
      assert_eq!(result18.last_name, Some("Smith".to_string()));
      assert_eq!(result18.preferred_name, Some("Johnny".to_string()));

      // Test case 19: Name with preferred name with quotes
      let name19 = "Robert 'Bob' Williams";
      let result19 = parse_name(name19.into(), app_state.clone())
        .await
        .expect("Failed to parse name with preferred name in quotes");
      tracing::info!("Parsed '{}': {:?}", name19, result19);
      assert_eq!(result19.first_name, Some("Robert".to_string()));
      assert_eq!(result19.middle_name, None);
      assert_eq!(result19.last_name, Some("Williams".to_string()));
      assert_eq!(result19.preferred_name, Some("Bob".to_string()));

      // Test case 20: Name with "aka" indicator
      let name20 = "William aka Bill Johnson";
      let result20 = parse_name(name20.into(), app_state.clone())
        .await
        .expect("Failed to parse name with aka indicator");
      tracing::info!("Parsed '{}': {:?}", name20, result20);
      assert_eq!(result20.first_name, Some("William".to_string()));
      assert_eq!(result20.middle_name, None);
      assert_eq!(result20.last_name, Some("Johnson".to_string()));
      assert_eq!(result20.preferred_name, Some("Bill".to_string()));
    })
  }
}
