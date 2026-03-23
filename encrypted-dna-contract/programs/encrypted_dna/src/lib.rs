use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::{CallbackAccount, CircuitSource, OffChainCircuitSource};

mod constants;
mod contexts;
mod error;
mod events;
mod types;

use crate::constants::MAX_DNA_LENGTH;
use crate::contexts::*;
use crate::error::ErrorCode;
use crate::events::*;
use crate::types::*;

declare_id!("HHeZ8EQH84fdD4pNBqMvR9dpFp6xFq4Nv1dioexEZLrU");

#[arcium_program]
pub mod encrypted_dna {
    use super::*;

    // ─────────────────────────────────────────────────────────────────────────
    // register_user
    // ─────────────────────────────────────────────────────────────────────────
    pub fn register_user(
        ctx: Context<RegisterUser>,
        enc_pubkey: [u8; 32],
        nonce: u128,
        dna_cts: [[u8; 32]; MAX_DNA_LENGTH],
    ) -> Result<()> {
        let profile = &mut ctx.accounts.user_profile;
        profile.owner = ctx.accounts.owner.key();
        profile.is_registered = true;
        profile.enc_pubkey = enc_pubkey;
        profile.nonce = nonce;
        profile.dna_cts = dna_cts;
        profile.bump = ctx.bumps.user_profile;

        emit!(UserRegistered {
            user: ctx.accounts.owner.key(),
        });

        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // update_dna
    // ─────────────────────────────────────────────────────────────────────────
    pub fn update_dna(
        ctx: Context<UpdateDna>,
        enc_pubkey: [u8; 32],
        nonce: u128,
        dna_cts: [[u8; 32]; MAX_DNA_LENGTH],
    ) -> Result<()> {
        require!(ctx.accounts.user_profile.is_registered, ErrorCode::UserNotRegistered);

        let profile = &mut ctx.accounts.user_profile;
        profile.enc_pubkey = enc_pubkey;
        profile.nonce = nonce;
        profile.dna_cts = dna_cts;

        emit!(DnaUpdated {
            user: ctx.accounts.owner.key(),
        });

        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // init_dna_comp_def
    //
    // One-time setup: registers the dna_match_v1 circuit with the Arcium MXE.
    // ─────────────────────────────────────────────────────────────────────────
    pub fn init_dna_comp_def(ctx: Context<InitDnaCompDef>) -> Result<()> {
        let source = CircuitSource::OffChain(OffChainCircuitSource {
            source: "https://raw.githubusercontent.com/DuyVo96/arcium-circuits/main/dna_match_v2.arcis"
                .to_string(),
            hash: arcium_macros::circuit_hash!("dna_match_v2"),
        });
        init_comp_def(ctx.accounts, Some(source), None)?;
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // request_match
    //
    // Queues a privacy-preserving DNA similarity computation in the Arcium MXE.
    // Both profiles' encrypted markers are passed via ArgBuilder.
    // The MXE TEE decrypts, compares, and calls dna_match_v1_callback.
    // ─────────────────────────────────────────────────────────────────────────
    pub fn request_match(
        ctx: Context<RequestMatch>,
        computation_offset: u64,
    ) -> Result<()> {
        require!(ctx.accounts.user_profile_a.is_registered, ErrorCode::UserNotRegistered);
        require!(ctx.accounts.user_profile_b.is_registered, ErrorCode::UserNotRegistered);
        require!(
            ctx.accounts.user_profile_a.owner != ctx.accounts.user_profile_b.owner,
            ErrorCode::SelfMatchNotAllowed
        );

        // Capture profile data before mutable borrows
        let owner_a = ctx.accounts.user_profile_a.owner;
        let owner_b = ctx.accounts.user_profile_b.owner;
        let enc_pubkey_a = ctx.accounts.user_profile_a.enc_pubkey;
        let nonce_a = ctx.accounts.user_profile_a.nonce;
        let dna_cts_a = ctx.accounts.user_profile_a.dna_cts;
        let enc_pubkey_b = ctx.accounts.user_profile_b.enc_pubkey;
        let nonce_b = ctx.accounts.user_profile_b.nonce;
        let dna_cts_b = ctx.accounts.user_profile_b.dna_cts;

        // Capture match_result key for callback before mutable borrow
        let match_result_key = ctx.accounts.match_result.key();

        // Initialise (or reset) MatchResult PDA
        let match_result = &mut ctx.accounts.match_result;
        match_result.user_a = owner_a;
        match_result.user_b = owner_b;
        match_result.enc_score = [0u8; 32];
        match_result.score_nonce = [0u8; 16];
        match_result.is_computed = false;
        match_result.last_computation_offset = computation_offset;
        if match_result.bump == 0 {
            match_result.bump = ctx.bumps.match_result;
        }

        // Arcium signer PDA bump (required by queue_computation)
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Build encrypted input arguments:
        //   user_a: x25519_pubkey | nonce | m0 | m1 | m2 | m3
        //   user_b: x25519_pubkey | nonce | m0 | m1 | m2 | m3
        let args = ArgBuilder::new()
            .x25519_pubkey(enc_pubkey_a)
            .plaintext_u128(nonce_a)
            .encrypted_u8(dna_cts_a[0])
            .encrypted_u8(dna_cts_a[1])
            .encrypted_u8(dna_cts_a[2])
            .encrypted_u8(dna_cts_a[3])
            .x25519_pubkey(enc_pubkey_b)
            .plaintext_u128(nonce_b)
            .encrypted_u8(dna_cts_b[0])
            .encrypted_u8(dna_cts_b[1])
            .encrypted_u8(dna_cts_b[2])
            .encrypted_u8(dna_cts_b[3])
            .build();

        // Pass match_result as a writable extra account so the callback can update it
        let callback_ix = DnaMatchV2Callback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: match_result_key,
                is_writable: true,
            }],
        )?;

        queue_computation(ctx.accounts, computation_offset, args, vec![callback_ix], 1, 0)?;

        emit!(MatchRequested {
            requester: ctx.accounts.requester.key(),
            user_a: owner_a,
            user_b: owner_b,
            computation_offset,
        });

        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // dna_match_v1_callback
    //
    // Called exclusively by the Arcium TEE after the circuit completes.
    // remaining_accounts[0] = match_result (writable MatchResult PDA)
    // ─────────────────────────────────────────────────────────────────────────
    #[arcium_callback(encrypted_ix = "dna_match_v2")]
    pub fn dna_match_v2_callback(
        ctx: Context<DnaMatchV2Callback>,
        output: SignedComputationOutputs<DnaMatchV2Output>,
    ) -> Result<()> {
        let field_0 = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(DnaMatchV2Output { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };

        let enc_score = field_0.ciphertexts[0];
        let score_nonce = field_0.nonce.to_le_bytes();

        // Update MatchResult (remaining_accounts[0])
        let match_result_info = ctx
            .remaining_accounts
            .get(0)
            .ok_or(ErrorCode::InvalidComputationOutput)?;

        let (user_a, user_b) = {
            let mut data = match_result_info.try_borrow_mut_data()?;
            let mut result = MatchResult::try_deserialize(&mut data.as_ref())?;
            let user_a = result.user_a;
            let user_b = result.user_b;
            result.enc_score = enc_score;
            result.score_nonce = score_nonce;
            result.is_computed = true;
            // Write back serialized data into the account buffer
            let mut buf: Vec<u8> = Vec::with_capacity(data.len());
            result.try_serialize(&mut buf)?;
            data[..buf.len()].copy_from_slice(&buf);
            (user_a, user_b)
        };

        emit!(MatchCompleted {
            user_a,
            user_b,
            enc_score,
            score_nonce,
        });

        Ok(())
    }
}
