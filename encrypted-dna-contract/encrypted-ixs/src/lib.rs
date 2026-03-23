use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Four SNP markers per user: 0=A, 1=T, 2=G, 3=C.
    /// All four are encrypted under a single shared X25519 key.
    pub struct DnaMarkers {
        m0: u8,
        m1: u8,
        m2: u8,
        m3: u8,
    }

    /// Compares two users' 4-marker DNA profiles inside the TEE.
    /// Returns an encrypted similarity score: 0, 25, 50, 75, or 100.
    /// The score is encrypted for the owner of markers_a's shared key.
    #[instruction]
    pub fn dna_match_v2(
        markers_a: Enc<Shared, DnaMarkers>,
        markers_b: Enc<Shared, DnaMarkers>,
    ) -> Enc<Shared, u8> {
        let a = markers_a.to_arcis();
        let b = markers_b.to_arcis();

        let mut score: u8 = 0;
        if a.m0 == b.m0 {
            score += 25;
        }
        if a.m1 == b.m1 {
            score += 25;
        }
        if a.m2 == b.m2 {
            score += 25;
        }
        if a.m3 == b.m3 {
            score += 25;
        }

        markers_a.owner.from_arcis(score)
    }
}
