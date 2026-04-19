// This is all done with bits to avoid using vectors. This is a tradeoff between performance and readability.

use serde::{Deserialize, Serialize, ser::SerializeSeq};
use strum::IntoEnumIterator;

#[derive(
  Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, strum::EnumIter, gql::Enum, Serialize, Deserialize,
)]
#[repr(u8)]
pub enum Privilege {
  SuperAdmin = 0,
  TeamAdmin = 1,
  TeamMember = 2,
  TeamViewer = 3,
}

impl Privilege {
  fn implied_privileges(self) -> &'static [Privilege] {
    match self {
      Privilege::SuperAdmin => &[Privilege::TeamAdmin],
      Privilege::TeamAdmin => &[Privilege::TeamMember],
      Privilege::TeamMember => &[Privilege::TeamViewer],
      Privilege::TeamViewer => &[],
    }
  }
  #[expect(dead_code)]
  fn from_bit(bit: u8) -> Option<Self> {
    let privilege = match bit {
      0b1 => Privilege::SuperAdmin,
      0b10 => Privilege::TeamAdmin,
      0b100 => Privilege::TeamMember,
      0b1000 => Privilege::TeamViewer,
      _ => return None,
    };
    Some(privilege)
  }
  fn as_bits(self) -> u8 {
    let mut bit = self.as_bit();
    let implied = self.implied_privileges();
    bit |= implied.iter().copied().fold(0, |acc, p| acc | p.as_bits());
    bit
  }
  fn as_bit(self) -> u8 {
    1_u8 << (self as u8)
  }
}

impl gql::Guard for Privilege {
  async fn check(&self, _ctx: &gql::Context<'_>) -> gql::Result<()> {
    // Use CLAIMS here to avoid adding a gql extension and boxing every single future that it runs
    let privileges = crate::auth::CLAIMS.with(|claims| claims.privileges);
    if privileges.allows(*self) {
      Ok(())
    } else {
      Err(gql::Error::new("Unauthorized"))
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Privileges(u8);

impl Privileges {
  pub fn new(privileges: impl IntoIterator<Item = Privilege>) -> Self {
    Self(privileges.into_iter().fold(0, |acc, p| acc | p.as_bit()))
  }
  pub fn empty() -> Self {
    Self(0)
  }
  pub fn is_empty(&self) -> bool {
    self.0 == 0
  }
  fn implied_bits(self) -> u8 {
    self.granted_privileges().fold(0, |acc, p| acc | p.as_bits())
  }
  pub const fn granted_bits(self) -> u8 {
    self.0
  }
  pub const fn from_bits(bits: u8) -> Self {
    Self(bits)
  }
  pub fn granted_privileges(self) -> impl Iterator<Item = Privilege> {
    Privilege::iter().filter(move |p| p.as_bit() & self.0 != 0)
  }
  pub fn implied_privileges(self) -> impl Iterator<Item = Privilege> {
    let bits = self.implied_bits();
    Privilege::iter().filter(move |p| p.as_bit() & bits != 0)
  }
  pub fn allows(self, privilege: Privilege) -> bool {
    self.implied_bits() & privilege.as_bit() != 0
  }
  pub fn or(self, other: Self) -> Self {
    Self(self.0 | other.0)
  }
  pub fn and(self, other: Self) -> Self {
    Self(self.0 & other.0)
  }
}

impl From<Privilege> for Privileges {
  fn from(privilege: Privilege) -> Self {
    Self::new([privilege])
  }
}

impl sqlx::Type<sqlx::Postgres> for Privileges {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <i16 as sqlx::Type<sqlx::Postgres>>::type_info()
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for Privileges {
  fn encode(
    self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    <i16 as sqlx::Encode<'_, sqlx::Postgres>>::encode(self.0 as i16, buf)
  }

  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    <i16 as sqlx::Encode<'_, sqlx::Postgres>>::encode(self.0 as i16, buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for Privileges {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    let bits = <i16 as sqlx::Decode<sqlx::Postgres>>::decode(value)?;
    Ok(Self(bits as u8))
  }
}

impl Serialize for Privileges {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    let granted_privileges = self.granted_privileges().count();
    let mut array = serializer.serialize_seq(Some(granted_privileges))?;
    for privilege in self.granted_privileges() {
      array.serialize_element(&privilege)?;
    }
    array.end()
  }
}

impl<'de> Deserialize<'de> for Privileges {
  fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
  where
    D: serde::Deserializer<'de>,
  {
    let array = Vec::<Privilege>::deserialize(deserializer)?;
    Ok(Self::new(array))
  }
}

gql::scalar!(Privileges);

pub mod serde_bits {

  use crate::prelude::*;

  pub fn serialize<S>(value: &Privileges, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    serializer.serialize_u8(value.granted_bits())
  }

  pub fn deserialize<'de, D>(deserializer: D) -> Result<Privileges, D::Error>
  where
    D: serde::Deserializer<'de>,
  {
    let bits = u8::deserialize(deserializer)?;
    Ok(Privileges::from_bits(bits))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_privileges() {
    let super_admin = Privileges::new([Privilege::SuperAdmin]);
    let team_admin = Privileges::new([Privilege::TeamAdmin]);
    let team_member = Privileges::new([Privilege::TeamMember]);
    let team_viewer = Privileges::new([Privilege::TeamViewer]);
    let team_admin_and_member = Privileges::new([Privilege::TeamAdmin, Privilege::TeamMember]);
    let team_admin_and_viewer = Privileges::new([Privilege::TeamAdmin, Privilege::TeamViewer]);
    let team_member_and_viewer = Privileges::new([Privilege::TeamMember, Privilege::TeamViewer]);
    let team_admin_and_member_and_viewer =
      Privileges::new([Privilege::TeamAdmin, Privilege::TeamMember, Privilege::TeamViewer]);

    assert_eq!(super_admin.granted_bits(), 0b1);
    assert_eq!(team_admin.granted_bits(), 0b10);
    assert_eq!(team_member.granted_bits(), 0b100);
    assert_eq!(team_viewer.granted_bits(), 0b1000);
    assert_eq!(team_admin_and_member.granted_bits(), 0b0110);
    assert_eq!(team_admin_and_viewer.granted_bits(), 0b1010);
    assert_eq!(team_member_and_viewer.granted_bits(), 0b1100);
    assert_eq!(team_admin_and_member_and_viewer.granted_bits(), 0b1110);

    assert_eq!(super_admin.implied_bits(), 0b1111);
    assert_eq!(team_admin.implied_bits(), 0b1110);
    assert_eq!(team_member.implied_bits(), 0b1100);
    assert_eq!(team_viewer.implied_bits(), 0b1000);
    assert_eq!(team_admin_and_member.implied_bits(), 0b1110);
    assert_eq!(team_admin_and_viewer.implied_bits(), 0b1110);
    assert_eq!(team_member_and_viewer.implied_bits(), 0b1100);
    assert_eq!(team_admin_and_member_and_viewer.implied_bits(), 0b1110);

    assert!(super_admin.allows(Privilege::SuperAdmin));
    assert!(super_admin.allows(Privilege::TeamAdmin));
    assert!(super_admin.allows(Privilege::TeamMember));
    assert!(super_admin.allows(Privilege::TeamViewer));
    assert!(!team_admin.allows(Privilege::SuperAdmin));
    assert!(team_admin.allows(Privilege::TeamAdmin));
    assert!(team_admin.allows(Privilege::TeamMember));
    assert!(team_admin.allows(Privilege::TeamViewer));
    assert!(!team_member.allows(Privilege::SuperAdmin));
    assert!(!team_member.allows(Privilege::TeamAdmin));
    assert!(team_member.allows(Privilege::TeamMember));
    assert!(team_member.allows(Privilege::TeamViewer));
    assert!(!team_viewer.allows(Privilege::SuperAdmin));
    assert!(!team_viewer.allows(Privilege::TeamAdmin));
    assert!(!team_viewer.allows(Privilege::TeamMember));
    assert!(team_viewer.allows(Privilege::TeamViewer));
    assert!(!team_admin_and_member.allows(Privilege::SuperAdmin));
    assert!(team_admin_and_member.allows(Privilege::TeamAdmin));
    assert!(team_admin_and_member.allows(Privilege::TeamMember));
    assert!(team_admin_and_member.allows(Privilege::TeamViewer));
    assert!(!team_admin_and_viewer.allows(Privilege::SuperAdmin));
    assert!(team_admin_and_viewer.allows(Privilege::TeamAdmin));
    assert!(team_admin_and_viewer.allows(Privilege::TeamMember));
    assert!(team_admin_and_viewer.allows(Privilege::TeamViewer));
    assert!(!team_member_and_viewer.allows(Privilege::SuperAdmin));
    assert!(!team_member_and_viewer.allows(Privilege::TeamAdmin));
    assert!(team_member_and_viewer.allows(Privilege::TeamMember));
    assert!(team_member_and_viewer.allows(Privilege::TeamViewer));
    assert!(!team_admin_and_member_and_viewer.allows(Privilege::SuperAdmin));
    assert!(team_admin_and_member_and_viewer.allows(Privilege::TeamAdmin));
    assert!(team_admin_and_member_and_viewer.allows(Privilege::TeamMember));
    assert!(team_admin_and_member_and_viewer.allows(Privilege::TeamViewer));
    assert_eq!(team_viewer.or(team_member), team_member_and_viewer);
    assert_eq!(team_member_and_viewer.or(team_viewer), team_member_and_viewer);
    assert_eq!(team_admin_and_member_and_viewer.and(team_viewer), team_viewer);
  }

  #[test]
  fn test_privileges_serde() {
    let privileges = Privileges::new([
      Privilege::SuperAdmin,
      Privilege::TeamAdmin,
      Privilege::TeamMember,
      Privilege::TeamViewer,
    ]);
    let serialized = serde_json::to_string(&privileges).unwrap();
    assert_eq!(serialized, r#"["SuperAdmin","TeamAdmin","TeamMember","TeamViewer"]"#);
    let privileges = serde_json::from_str::<Privileges>(&serialized).unwrap();
    assert_eq!(
      privileges,
      Privileges::new([
        Privilege::SuperAdmin,
        Privilege::TeamAdmin,
        Privilege::TeamMember,
        Privilege::TeamViewer
      ])
    );
  }
}
