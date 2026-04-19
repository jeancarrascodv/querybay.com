use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "UiInput")]
pub struct Ui {
  #[graphql(name = "box")]
  pub ui_box: UiBox,
}

impl sqlx::Type<sqlx::Postgres> for Ui {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <sqlx::types::Json<Ui> as sqlx::Type<sqlx::Postgres>>::type_info()
  }
  fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
    <sqlx::types::Json<Ui> as sqlx::Type<sqlx::Postgres>>::compatible(ty)
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for Ui {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    sqlx::types::Json::encode_by_ref(&sqlx::types::Json(crate::types::IdReverser(self)), buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for Ui {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    sqlx::types::Json::<crate::types::IdReverser<Ui>>::decode(value).map(|i| i.0.0)
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "UiBoxInput")]
pub struct UiBox {
  xmin: i32,
  xmax: i32,
  ymin: i32,
  ymax: i32,
}
