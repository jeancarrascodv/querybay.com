/// ```rust
/// use janium_derive_core::normalize;
/// assert_eq!("a1", normalize("A1()"));
/// ```
pub fn normalize(s: &str) -> String {
  s.to_lowercase().replace(
    |c: char| !(c.is_ascii_alphanumeric() || c == ' ' || c == '_' || c == ','),
    "",
  )
}

pub fn replace_aliases<'a>(
  header: &str,
  alias_roots: impl IntoIterator<Item = (&'a str, impl IntoIterator<Item = &'a str>)>,
) -> String {
  let mut field_alias_map = Vec::new();
  for (field_name, alias_root) in alias_roots {
    let aliases = generate_aliases(field_name, alias_root);
    for alias in aliases {
      if field_name != alias {
        field_alias_map.push((field_name, alias));
      }
    }
  }

  #[cfg(feature = "assertions")]
  {
    let mut all_aliases = std::collections::HashMap::new();
    for (field_name, alias) in &field_alias_map {
      assert_eq!(&field_name.to_lowercase(), *field_name, "{field_name} is not lowercase");
      assert!(!alias.contains(","), "alias `{alias}` contains a comma");
      let exists = all_aliases.insert(alias, field_name);
      if let Some(prev) = exists {
        panic!("alias `{alias}` is duplicated between fields `{field_name}` and `{prev}`");
      }
    }
  }

  field_alias_map.sort_unstable_by(|l, r| l.1.len().cmp(&r.1.len()).reverse().then_with(|| l.1.cmp(&r.1)));

  let mut header = normalize(header);

  // As long as we do the longest first then we don't have to work about partial replacements
  for (field_name, alias) in field_alias_map {
    if header.contains(&alias) {
      header = header.replacen(&alias, field_name, 1);
    }
  }

  header
}

fn generate_aliases<'a>(field_name: &str, variants: impl IntoIterator<Item = &'a str>) -> Vec<String> {
  let mut all_aliases = Vec::new();
  for variant in variants {
    let variant = normalize(variant);
    let aliases = [
      variant.replace("_", " "),
      variant.replace(" ", "_"),
      variant.replace(" ", ""),
      variant.replace("_", ""),
      variant.replace("_", "").replace(" ", ""),
      variant,
    ];
    all_aliases.extend(aliases);
  }

  all_aliases.sort_by(|l, r| r.len().cmp(&l.len()).then_with(|| l.cmp(r)));
  all_aliases.dedup();
  all_aliases.retain(|a| a != field_name);
  all_aliases
}
