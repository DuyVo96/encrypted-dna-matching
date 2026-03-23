use arcium_anchor::prelude::comp_def_offset;

/// Number of SNP markers per DNA profile.
/// Each marker is one encrypted u8: 0=A, 1=T, 2=G, 3=C.
pub const MAX_DNA_LENGTH: usize = 4;

/// Arcium circuit name — must match the function name in encrypted-ixs/src/lib.rs.
pub const MATCH_CIRCUIT_NAME: &str = "dna_match_v2";

/// Precomputed comp_def PDA offset for the dna_match_v2 circuit.
/// Used in `derive_comp_def_pda!()` in both RequestMatch and DnaMatchV2Callback.
pub const COMP_DEF_OFFSET_DNA_MATCH: u32 = comp_def_offset("dna_match_v2");
