// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPenguinSwapRouter} from "../interfaces/IPenguinSwapRouter.sol";

/// @title MockPenguinSwapRouter
/// @notice Testnet stand-in for PenguinSwap. Fixed, owner-set exchange rate per direct token pair and
///         an owner-funded liquidity reserve — deliberately simple, no pricing curve or fees. Only
///         direct (2-hop) paths are supported, which is all `LoanManager` ever needs.
contract MockPenguinSwapRouter is IPenguinSwapRouter, Ownable {
    using SafeERC20 for IERC20;

    /// @notice `tokenOut` units received per 1e18 of `tokenIn`, i.e. rate[in][out] scaled 1e18.
    mapping(address => mapping(address => uint256)) public rate;

    event RateUpdated(address indexed tokenIn, address indexed tokenOut, uint256 rate1e18);
    event ReserveFunded(address indexed token, address indexed from, uint256 amount);
    event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setRate(address tokenIn, address tokenOut, uint256 rate1e18) external onlyOwner {
        rate[tokenIn][tokenOut] = rate1e18;
        emit RateUpdated(tokenIn, tokenOut, rate1e18);
    }

    /// @notice Top up the reserve that pays out swaps. Callable by anyone; typically the owner.
    function fundReserve(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveFunded(token, msg.sender, amount);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        require(path.length == 2, "router: only direct pairs supported");
        uint256 r = rate[path[0]][path[1]];
        require(r > 0, "router: no rate set for pair");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = (amountIn * r) / 1e18;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(block.timestamp <= deadline, "router: expired");
        require(path.length == 2, "router: only direct pairs supported");
        uint256 r = rate[path[0]][path[1]];
        require(r > 0, "router: no rate set for pair");

        uint256 amountOut = (amountIn * r) / 1e18;
        require(amountOut >= amountOutMin, "router: insufficient output amount");

        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(path[1]).safeTransfer(to, amountOut);
        emit Swapped(path[0], path[1], amountIn, amountOut);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }
}
