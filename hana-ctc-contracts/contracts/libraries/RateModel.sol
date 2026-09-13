// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title RateModel
/// @notice Kinked utilization interest-rate curve. Gentle slope up to the kink, steep beyond.
/// @dev All values are in basis points. Utilization is 0..10_000 (= 0%..100%).
library RateModel {
    uint256 internal constant BPS = 10_000;

    struct Params {
        uint256 baseRateBps; // APR at 0% utilization
        uint256 slope1Bps; // APR added linearly from 0 utilization to the kink
        uint256 slope2Bps; // APR added linearly from the kink to 100% utilization
        uint256 kinkBps; // utilization at which the slope steepens (e.g. 8_000 = 80%)
    }

    /// @return borrow APR in basis points for the given utilization.
    function borrowRateBps(Params memory p, uint256 utilBps) internal pure returns (uint256) {
        if (utilBps > BPS) utilBps = BPS;
        if (utilBps <= p.kinkBps) {
            return p.baseRateBps + (p.slope1Bps * utilBps) / BPS;
        }
        uint256 belowKink = (p.slope1Bps * p.kinkBps) / BPS;
        uint256 excessUtil = utilBps - p.kinkBps;
        return p.baseRateBps + belowKink + (p.slope2Bps * excessUtil) / BPS;
    }
}
