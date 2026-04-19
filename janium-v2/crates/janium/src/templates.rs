use crate::prelude::*;
use compact_str::CompactString;
use liquid::Template as LiquidTemplate;

pub fn scalar(value: impl Into<liquid::model::ScalarCow<'static>>) -> liquid::model::Value {
  liquid::model::Value::scalar(value)
}

#[expect(dead_code)]
pub fn scalar_or_nil(value: Option<impl Into<liquid::model::ScalarCow<'static>>>) -> liquid::model::Value {
  match value {
    Some(value) => scalar(value),
    None => liquid::model::Value::Nil,
  }
}

pub struct Template {
  string: CompactString,
  template: LiquidTemplate,
}

impl core::fmt::Debug for Template {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    self.string.fmt(f)
  }
}

impl Clone for Template {
  fn clone(&self) -> Self {
    Self {
      string: self.string.clone(),
      template: liquid::ParserBuilder::with_stdlib()
        .build()
        .unwrap()
        .parse(&self.string)
        .unwrap(),
    }
  }
}

impl core::hash::Hash for Template {
  fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
    self.string.hash(state);
  }
}

impl Template {
  pub fn new(string: impl Into<CompactString>) -> Result<Self> {
    let string = string.into();
    let template = liquid::ParserBuilder::with_stdlib().build()?.parse(&string)?;
    Ok(Self { string, template })
  }
  pub fn string(&self) -> &str {
    &self.string
  }
  pub fn render(&self, context: &dyn liquid::ObjectView) -> Result<String> {
    let value = self.template.render(context)?;
    if value.contains(['{', '}']) {
      return Err(JaniumError::ext_msg(format!(
        "Template contains unused {{ or }} characters: {value}",
      )));
    }
    Ok(value)
  }
}

impl serde::Serialize for Template {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    serializer.serialize_str(&self.string)
  }
}

impl<'de> serde::Deserialize<'de> for Template {
  fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
  where
    D: serde::Deserializer<'de>,
  {
    let string = String::deserialize(deserializer)?;
    Self::new(string).map_err(serde::de::Error::custom)
  }
}

impl sqlx::Type<sqlx::Postgres> for Template {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <&str as sqlx::Type<sqlx::Postgres>>::type_info()
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for Template {
  fn encode_by_ref(
    &self,
    buf: &mut sqlx::postgres::PgArgumentBuffer,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    <&str as sqlx::Encode<'_, sqlx::Postgres>>::encode(self.string(), buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for Template {
  fn decode(value: sqlx::postgres::PgValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    let string = <CompactString as sqlx::Decode<'_, sqlx::Postgres>>::decode(value)?;
    Self::new(string).map_err(Into::into)
  }
}

gql::scalar!(Template);
