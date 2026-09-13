// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title IPenguinSwapRouter
/// @notice Minimal Uniswap-V2-style AMM router surface — the standard shape PenguinSwap, Creditcoin's
///         ecosystem DEX, exposes. On testnet `LoanManager.swapRouter` points at
///         `MockPenguinSwapRouter`; on mainnet the real PenguinSwap router address drops in via
///         `LoanManager.setSwapRouter`, no redeployment needed.
interface IPenguinSwapRouter {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}
