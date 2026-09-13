// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title iUSDC — Hana test-net settlement asset
/// @notice Mock USD stablecoin, 6 decimals, with a rate-limited public faucet.
contract IUSDC is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 10_000 * 10 ** 6;
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint256) public lastFaucet;

    event Faucet(address indexed to, uint256 amount);

    constructor(address initialOwner) ERC20("Hana USD Coin", "iUSDC") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Mint yourself test funds, at most once per cooldown window.
    function faucet() external {
        require(block.timestamp >= lastFaucet[msg.sender] + FAUCET_COOLDOWN, "faucet: cooldown");
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit Faucet(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Owner mint, for seeding pools / demo fixtures.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
