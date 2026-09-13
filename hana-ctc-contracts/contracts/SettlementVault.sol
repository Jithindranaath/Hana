// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISettlementVault} from "./interfaces/ISettlementVault.sol";

/// @title SettlementVault
/// @notice Escrows merchant settlement funds under immediate, time-locked, or conditional release.
contract SettlementVault is ISettlementVault, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    address public loanManager;

    struct Settlement {
        address merchant;
        uint256 amount;
        ReleaseType releaseType;
        uint64 releaseTime;
        bool conditionMet;
        bool claimed;
        bool exists;
    }

    mapping(bytes32 => Settlement) public settlements;

    event LoanManagerSet(address indexed loanManager);

    modifier onlyLoanManager() {
        require(msg.sender == loanManager, "vault: not loan manager");
        _;
    }

    constructor(IERC20 asset_, address initialOwner) Ownable(initialOwner) {
        asset = asset_;
    }

    function setLoanManager(address v) external onlyOwner {
        require(v != address(0), "vault: lm=0");
        loanManager = v;
        emit LoanManagerSet(v);
    }

    function registerSettlement(
        bytes32 billHash,
        address merchant,
        uint256 amount,
        ReleaseType releaseType,
        uint64 releaseTime
    ) external onlyLoanManager {
        require(!settlements[billHash].exists, "vault: bill exists");
        require(merchant != address(0), "vault: merchant=0");
        settlements[billHash] = Settlement({
            merchant: merchant,
            amount: amount,
            releaseType: releaseType,
            releaseTime: releaseTime,
            conditionMet: false,
            claimed: false,
            exists: true
        });
        emit SettlementRegistered(billHash, merchant, amount, releaseType, releaseTime);
    }

    function markConditionMet(bytes32 billHash) external onlyLoanManager {
        Settlement storage s = settlements[billHash];
        require(s.exists, "vault: unknown bill");
        if (!s.conditionMet) {
            s.conditionMet = true;
            emit ConditionMet(billHash);
        }
    }

    function claimable(bytes32 billHash) public view returns (bool) {
        Settlement storage s = settlements[billHash];
        if (!s.exists || s.claimed) return false;
        if (s.releaseType == ReleaseType.IMMEDIATE) return true;
        if (s.releaseType == ReleaseType.TIMELOCK) return block.timestamp >= s.releaseTime;
        return s.conditionMet; // CONDITIONAL
    }

    /// @notice Anyone may trigger the payout, but funds always go to the registered merchant.
    function claim(bytes32 billHash) external nonReentrant {
        Settlement storage s = settlements[billHash];
        require(claimable(billHash), "vault: not claimable");
        s.claimed = true;
        asset.safeTransfer(s.merchant, s.amount);
        emit Claimed(billHash, s.merchant, s.amount);
    }

    function refund(bytes32 billHash, address to) external onlyLoanManager nonReentrant {
        Settlement storage s = settlements[billHash];
        require(s.exists && !s.claimed, "vault: cannot refund");
        require(to != address(0), "vault: to=0");
        s.claimed = true;
        asset.safeTransfer(to, s.amount);
        emit Refunded(billHash, to, s.amount);
    }
}
