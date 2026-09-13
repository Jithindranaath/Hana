import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * viem can only decode a revert into a named error if that error is in the ABI of the contract
 * you called — but `LoanManager.makePayment` can revert with an *IUSDC* error (via
 * `SafeERC20.safeTransferFrom`), which isn't in `LoanManager`'s own ABI. Un-decoded, viem falls
 * back to a bare "An unknown RPC error occurred." Recognize the handful of ERC20 errors users can
 * actually hit here (confirmed live: `ERC20InsufficientBalance` triggers this exact fallback)
 * and give them a real message instead.
 */
const FRIENDLY_ERRORS: Record<string, string> = {
  ERC20InsufficientBalance: "Insufficient iUSDC balance for this transaction.",
  ERC20InsufficientAllowance: "Insufficient iUSDC allowance — please try again.",
};

export function formatTxError(err: unknown): string {
  if (err instanceof BaseError) {
    const revertError = err.walk((e) => e instanceof ContractFunctionRevertedError) as
      | ContractFunctionRevertedError
      | undefined;
    if (revertError) {
      const errorName = revertError.data?.errorName;
      if (errorName && FRIENDLY_ERRORS[errorName]) return FRIENDLY_ERRORS[errorName];
      if (revertError.reason) return revertError.reason;
      if (errorName && errorName !== "unknown") return `Transaction reverted: ${errorName}`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}
