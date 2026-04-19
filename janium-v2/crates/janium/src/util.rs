use crate::Result;
pub use dates::*;
pub use keep_alive::*;
use std::hash::{Hash, Hasher};
use std::io::Read;

mod dates;
mod keep_alive;

pub struct YesIAmInASelectBlock;

#[derive(Debug, Copy, Clone)]
#[repr(u8)]
enum CompressionAlgo {
  Brotli = 1,
}

impl CompressionAlgo {
  fn compress(self, mut r: impl Read) -> Result<Vec<u8>> {
    let mut output = Vec::with_capacity(4096);
    output.push(self as u8);
    let brotli_options = brotli::enc::BrotliEncoderParams {
      mode: brotli::enc::backward_references::BrotliEncoderMode::BROTLI_MODE_TEXT,
      ..Default::default()
    };
    let size = brotli::enc::BrotliCompress(&mut std::io::BufReader::new(&mut r), &mut output, &brotli_options)
      .inspect_err(|error| tracing::error!(?error, %error, "Error compressing"))?;
    if output.len() != size + 1 {
      return Err(crate::JaniumError::msg("Unable to compress file for storage"));
    }
    Ok(output)
  }

  fn decompress(self, bytes: &[u8]) -> Result<Vec<u8>> {
    let mut output = Vec::with_capacity(4096);
    match self {
      Self::Brotli => brotli::BrotliDecompress(&mut std::io::Cursor::new(bytes), &mut output)?,
    }
    Ok(output)
  }

  fn decompress_reader<'a>(self, bytes: &'a [u8]) -> impl Read + use<'a> {
    brotli::reader::Decompressor::new(std::io::Cursor::new(bytes), 4096)
  }
}

pub fn compress(r: impl Read) -> Result<Vec<u8>> {
  CompressionAlgo::Brotli.compress(r)
}

pub fn decompress(bytes: &[u8]) -> Result<Vec<u8>> {
  let compression_algo = match bytes.first() {
    Some(1) => CompressionAlgo::Brotli,
    _ => return Err(crate::JaniumError::msg("Unable to decompress file")),
  };
  compression_algo.decompress(&bytes[1..])
}

pub fn decompress_reader<'a>(bytes: &'a [u8]) -> Result<impl Read + use<'a>> {
  let compression_algo = match bytes.first() {
    Some(1) => CompressionAlgo::Brotli,
    _ => return Err(crate::JaniumError::msg("Unable to decompress file")),
  };
  Ok(compression_algo.decompress_reader(&bytes[1..]))
}

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct HashValue {
  hashes: [u64; 4],
}

impl HashValue {
  pub fn is_default(&self) -> bool {
    self.hashes.iter().all(|h| *h == 0)
  }
}

// In debug mode testing this function averaged about 6ns for around 40 bytes
pub fn hash(h: impl Hash) -> HashValue {
  let seahash = || {
    let mut seahash = seahash::SeaHasher::default();
    h.hash(&mut seahash);
    seahash.finish()
  };
  let ahash = || {
    let mut ahash = ahash::AHasher::default();
    h.hash(&mut ahash);
    ahash.finish()
  };
  let wyhash = || {
    let mut wyhash = wyhash::WyHash::with_seed(0x8769a5b4c3d2e1f0);
    h.hash(&mut wyhash);
    wyhash.finish()
  };
  let t1ha = || {
    let mut t1ha = t1ha::T1haHasher::with_seed(0x0f1e2d3c4b5a6978);
    h.hash(&mut t1ha);
    t1ha.finish()
  };
  HashValue {
    hashes: [seahash(), ahash(), wyhash(), t1ha()],
  }
}

#[test]
fn test_hash_is_consistent() {
  let value = "test with a string";
  let hash1 = hash(value);
  let hash2 = hash(value);
  assert_eq!(hash1, hash2);
  let value = 0xdeadbeefface0123_u64;
  let hash1 = hash(value);
  let hash2 = hash(value);
  assert_eq!(hash1, hash2);
}

#[test]
fn test_hashes_differ() {
  let hash1 = hash("test with a string");
  let hash2 = hash("test with b string");
  assert_ne!(hash1, hash2);
  let hash1 = hash(0xdeadbeefface0123_u64);
  let hash2 = hash(0xdeadbeefface0124_u64);
  assert_ne!(hash1, hash2);
  let hash1 = hash(b"0xdeadbeefface0123_u64");
  let hash2 = hash(b"0xdeadbeefface0124_u64");
  assert_ne!(hash1, hash2);
}

#[derive(Debug, Clone)]
pub struct OptionPatch<T>(pub Option<Option<T>>);

impl<T> Default for OptionPatch<T> {
  fn default() -> Self {
    Self(None)
  }
}

impl<T: gql::InputType> gql::InputType for OptionPatch<T> {
  type RawValueType = T;

  fn type_name() -> std::borrow::Cow<'static, str> {
    Option::<T>::type_name()
  }

  fn create_type_info(registry: &mut gql::registry::Registry) -> String {
    Option::<T>::create_type_info(registry)
  }

  fn parse(value: Option<gql::Value>) -> gql::InputValueResult<Self> {
    if let Some(value) = value {
      let result = <Option<T>>::parse(Some(value)).map_err(gql::InputValueError::propagate)?;
      Ok(Self(Some(result)))
    } else {
      Ok(Self(None))
    }
  }

  fn to_value(&self) -> gql::Value {
    self.0.as_ref().map(|i| i.to_value()).unwrap_or(gql::Value::Null)
  }

  fn as_raw_value(&self) -> Option<&Self::RawValueType> {
    if let Some(Some(inner)) = self.0.as_ref() {
      Some(inner)
    } else {
      None
    }
  }
}
