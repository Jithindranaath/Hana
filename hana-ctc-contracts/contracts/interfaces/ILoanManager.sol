// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ISettlementVault} from "./ISettlementVault.sol";

/// @title ILoanManager
/// @notice Loan controller across all four loan types.
interface ILoanManager {
    enum LoanType {
        INSTALLMENT, // BNPL: equal payments on a fixed schedule
        REVOLVING, // credit line: draw/repay anytime up to a limit
        TERM, // bullet: full principal + interest at maturity
        OVERCOLLATERALIZED // no credit score required; backed by collateral
    }

    enum LoanStatus {
        ACTIVE,
        COMPLETED,
        DEFAULTED,
        LIQUIDATED
    }

    struct OriginateParams {
        LoanType loanType;
        uint256 principal;
        uint32 installmentCount; // INSTALLMENT
        uint256 termDays; // INSTALLMENT / TERM / OVERCOLLATERALIZED
        bytes32 billHash; // 0 => cash loan disbursed to borrower
        address merchant; // required when billHash != 0
        ISettlementVault.ReleaseType releaseType;
        uint64 releaseTime;
        address collateralAsset; // OVERCOLLATERALIZED
        uint256 collateralAmount; // OVERCOLLATERALIZED
    }

    event LoanOriginated(
        uint256 indexed loanId,
        address indexed borrower,
        LoanType loanType,
        uint256 principal,
        uint256 aprBps,
        bytes32 billHash
    );
    event PaymentMade(uint256 indexed loanId, address indexed payer, uint256 principal, uint256 interest, bool late);
    event Drawn(uint256 indexed loanId, uint256 amount);
    event LoanCompleted(uint256 indexed loanId, address indexed borrower);
    event LoanLiquidated(uint256 indexed loanId, address indexed keeper, uint256 owed);

    function originate(OriginateParams calldata params) external returns (uint256 loanId);

    function makePayment(uint256 loanId, uint256 amount) external;

    function draw(uint256 loanId, uint256 amount) external;

    function liquidate(uint256 loanId) external;

    function amountDue(uint256 loanId) external view returns (uint256 principal, uint256 interest);
}
