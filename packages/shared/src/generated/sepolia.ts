// AUTO-GENERATED — do not edit by hand. Written by hana-ctc-contracts/scripts/export-abis.ts
// and hana-ctc-attestor/scripts/export-abis.ts (each merges into the same file).
export const chainId = 11155111;
export const contracts = {
  "HanaCreditAttestor": {
    "address": "0x89D15677c532eccDf5c8eBff69e38DB13ce966C5",
    "abi": [
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "initialOwner",
            "type": "address"
          }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
      },
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "owner",
            "type": "address"
          }
        ],
        "name": "OwnableInvalidOwner",
        "type": "error"
      },
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "account",
            "type": "address"
          }
        ],
        "name": "OwnableUnauthorizedAccount",
        "type": "error"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "internalType": "address",
            "name": "subject",
            "type": "address"
          },
          {
            "indexed": false,
            "internalType": "uint64",
            "name": "loansCompleted",
            "type": "uint64"
          },
          {
            "indexed": false,
            "internalType": "uint64",
            "name": "onTimePayments",
            "type": "uint64"
          },
          {
            "indexed": false,
            "internalType": "uint64",
            "name": "latePayments",
            "type": "uint64"
          },
          {
            "indexed": false,
            "internalType": "uint64",
            "name": "defaults",
            "type": "uint64"
          },
          {
            "indexed": false,
            "internalType": "uint128",
            "name": "cumulativeBorrowedWei",
            "type": "uint128"
          },
          {
            "indexed": false,
            "internalType": "uint64",
            "name": "firstActivityTimestamp",
            "type": "uint64"
          },
          {
            "indexed": false,
            "internalType": "uint64",
            "name": "snapshotNonce",
            "type": "uint64"
          }
        ],
        "name": "CreditSnapshot",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "internalType": "address",
            "name": "subject",
            "type": "address"
          }
        ],
        "name": "HistorySeeded",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "internalType": "address",
            "name": "previousOwner",
            "type": "address"
          },
          {
            "indexed": true,
            "internalType": "address",
            "name": "newOwner",
            "type": "address"
          }
        ],
        "name": "OwnershipTransferred",
        "type": "event"
      },
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "subject",
            "type": "address"
          }
        ],
        "name": "getLedger",
        "outputs": [
          {
            "components": [
              {
                "internalType": "uint64",
                "name": "loansCompleted",
                "type": "uint64"
              },
              {
                "internalType": "uint64",
                "name": "onTimePayments",
                "type": "uint64"
              },
              {
                "internalType": "uint64",
                "name": "latePayments",
                "type": "uint64"
              },
              {
                "internalType": "uint64",
                "name": "defaults",
                "type": "uint64"
              },
              {
                "internalType": "uint128",
                "name": "cumulativeBorrowedWei",
                "type": "uint128"
              },
              {
                "internalType": "uint64",
                "name": "firstActivityTimestamp",
                "type": "uint64"
              },
              {
                "internalType": "uint64",
                "name": "snapshotNonce",
                "type": "uint64"
              }
            ],
            "internalType": "struct HanaCreditAttestor.Ledger",
            "name": "",
            "type": "tuple"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "internalType": "address",
            "name": "",
            "type": "address"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "renounceOwnership",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "subject",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "loansCompleted",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "onTimePayments",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "latePayments",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "defaults",
            "type": "uint64"
          },
          {
            "internalType": "uint128",
            "name": "cumulativeBorrowedWei",
            "type": "uint128"
          },
          {
            "internalType": "uint64",
            "name": "firstActivityTimestamp",
            "type": "uint64"
          }
        ],
        "name": "seedHistory",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "snapshot",
        "outputs": [
          {
            "internalType": "uint64",
            "name": "snapshotNonce",
            "type": "uint64"
          }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "newOwner",
            "type": "address"
          }
        ],
        "name": "transferOwnership",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ]
  }
} as const;
