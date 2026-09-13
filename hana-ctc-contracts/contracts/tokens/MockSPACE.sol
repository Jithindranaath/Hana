// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockSPACE — testnet stand-in for SpaceRouter's $SPACE token
/// @notice 18-decimal ERC20 with a rate-limited public faucet, mirroring `IUSDC`'s faucet shape.
///         Testnet only; the real $SPACE token address drops in wherever this is referenced on mainnet.
contract MockSPACE is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 1_000 * 1e18;
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint256) public lastFaucet;

    event Faucet(address indexed to, uint256 amount);

    constructor(address initialOwner) ERC20("Mock SPACE", "SPACE") Ownable(initialOwner) {}

    /// @notice Mint yourself test funds, at most once per cooldown window.
    function faucet() external {
        require(block.timestamp >= lastFaucet[msg.sender] + FAUCET_COOLDOWN, "faucet: cooldown");
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit Faucet(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Owner mint, for seeding the credit-line reserve and staking yield reserve.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
