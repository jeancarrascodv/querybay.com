use std::collections::{BTreeMap, HashMap};

use rand::{SeedableRng, seq::SliceRandom};
// Used to generate code for the mappings in lib.rs
fn main() {
  let list = "abcdefghijklmno";
  // let mut seed = [0; 32];
  // rand::rng().fill_bytes(&mut seed);
  // println!("{:?}", seed);
  let seed = [
    194, 6, 150, 56, 40, 5, 59, 31, 61, 26, 229, 25, 138, 150, 237, 55, 128, 70, 127, 47, 68, 193, 95, 215, 170, 213,
    188, 15, 249, 106, 45, 14,
  ];
  let mut rng = rand_chacha::ChaCha20Rng::from_seed(seed);
  let mut buckets = BTreeMap::new();
  for char in list.chars() {
    buckets.insert(char, [0; 15]);
  }
  for i in 0..256 {
    let mut bytes = list.to_string();
    unsafe { bytes.as_mut_vec() }.shuffle(&mut rng);
    // println!("{:?}", bytes);
    let mut pairs = HashMap::new();
    bytes.as_bytes().chunks(2).for_each(|pair| {
      let (l, r) = (pair[0], pair.get(1).copied().unwrap_or_else(|| pair[0]));
      pairs.insert(l, r);
      pairs.insert(r, l);
    });
    let mut output = String::with_capacity(list.len() * 2);
    for (place, char) in bytes.as_bytes().iter().enumerate() {
      let pair = pairs.get(char).unwrap();
      output.push(*pair as char);
      output.push(',');
      buckets.get_mut(&(*char as char)).unwrap()[place] += 1;
    }
    println!("{i} => [{}p],", output);
  }
  dbg!(&buckets);
  // ends with d,h,k,a,g,m,e,b,i,n,c,o,f,j,l,p
}
