// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ScoreModel
/// @notice Pure credit-scoring math. Composite score 300..850 from three 0..1000 sub-scores.
/// @dev Imported (cross-chain) aggregates are always weighted BELOW native activity via `importWeightBps`.
///      Volume math works in a normalized 1e18 "USD-equivalent" unit; the registry scales native
///      6-dp asset amounts up by 1e12 before calling in, and the attestor emits imported volume
///      already normalized to 1e18.
library ScoreModel {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant DIM_MAX = 1_000;
    uint256 internal constant SCORE_MIN = 300;
    uint256 internal constant SCORE_MAX = 850;
    uint256 private constant U = 1e18;

    struct Weights {
        uint256 repaymentBps; // sub-score weights, must sum to 10_000
        uint256 volumeBps;
        uint256 tenureBps;
    }

    struct LimitCurve {
        uint256 floorScore; // score <= floorScore => 0 limit
        uint256 maxLimit; // limit at score == 850, in asset units
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    /// @notice On-time payments vs. weighted bad marks (late = 2x, default = 5x). Imported marks scaled by importWeightBps.
    function repaymentSubscore(
        uint64 nativeOnTime,
        uint64 nativeLate,
        uint64 nativeDefault,
        uint64 importedOnTime,
        uint64 importedLate,
        uint64 importedDefault,
        uint256 importWeightBps
    ) internal pure returns (uint16) {
        uint256 good = uint256(nativeOnTime) * BPS + uint256(importedOnTime) * importWeightBps;
        uint256 bad = (uint256(nativeLate) * 2 + uint256(nativeDefault) * 5) *
            BPS +
            (uint256(importedLate) * 2 + uint256(importedDefault) * 5) *
            importWeightBps;
        uint256 total = good + bad;
        if (total == 0) return 0;
        return uint16((good * DIM_MAX) / total);
    }

    /// @notice Tiered curve on effective cumulative borrow volume (native + weighted imported), 1e18 units.
    function volumeSubscore(
        uint256 nativeBorrowed1e18,
        uint256 importedBorrowed1e18,
        uint256 importWeightBps
    ) internal pure returns (uint16) {
        uint256 eff = nativeBorrowed1e18 + (importedBorrowed1e18 * importWeightBps) / BPS;
        if (eff >= 1_000_000 * U) return uint16(DIM_MAX);
        if (eff >= 250_000 * U) return uint16(850 + ((eff - 250_000 * U) * 150) / (750_000 * U));
        if (eff >= 50_000 * U) return uint16(650 + ((eff - 50_000 * U) * 200) / (200_000 * U));
        if (eff >= 10_000 * U) return uint16(450 + ((eff - 10_000 * U) * 200) / (40_000 * U));
        if (eff >= 1_000 * U) return uint16(200 + ((eff - 1_000 * U) * 250) / (9_000 * U));
        return uint16((eff * 200) / (1_000 * U));
    }

    /// @notice Wallet/protocol tenure, linear to 1000 over ~730 days, plus a capped LP-deposit bonus.
    function tenureSubscore(
        uint64 firstActivityTs,
        uint64 nowTs,
        uint256 lpBonus
    ) internal pure returns (uint16) {
        if (firstActivityTs == 0 || nowTs <= firstActivityTs) {
            return uint16(_min(lpBonus, DIM_MAX));
        }
        uint256 ageDays = (uint256(nowTs) - firstActivityTs) / 1 days;
        uint256 base = ageDays >= 730 ? DIM_MAX : (ageDays * DIM_MAX) / 730;
        return uint16(_min(base + lpBonus, DIM_MAX));
    }

    /// @notice Blend the three sub-scores and map 0..1000 -> 300..850.
    function composite(uint16 rep, uint16 vol, uint16 ten, Weights memory w) internal pure returns (uint16) {
        uint256 weighted = (uint256(rep) *
            w.repaymentBps +
            uint256(vol) *
            w.volumeBps +
            uint256(ten) *
            w.tenureBps) / BPS;
        if (weighted > DIM_MAX) weighted = DIM_MAX;
        return uint16(SCORE_MIN + (weighted * (SCORE_MAX - SCORE_MIN)) / DIM_MAX);
    }

    /// @notice Piecewise-linear credit limit from composite score.
    function creditLimit(uint16 score, LimitCurve memory c) internal pure returns (uint256) {
        if (uint256(score) <= c.floorScore) return 0;
        uint256 span = SCORE_MAX - c.floorScore;
        uint256 pos = uint256(score) >= SCORE_MAX ? span : (uint256(score) - c.floorScore);
        return (c.maxLimit * pos) / span;
    }
}
