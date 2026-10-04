/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/reliefpool.json`.
 */
export type Reliefpool = {
  "address": "7vBwrt8cAfrNHWNfCddQPRVdhbdKV8VhgP2xgq6qWsj3",
  "metadata": {
    "name": "reliefpool",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "contribute",
      "discriminator": [
        82,
        33,
        68,
        131,
        32,
        0,
        205,
        95
      ],
      "accounts": [
        {
          "name": "contributor",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "contribution",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  105,
                  98,
                  117,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "contributor"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amountLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializePool",
      "discriminator": [
        95,
        180,
        10,
        172,
        84,
        174,
        232,
        40
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              },
              {
                "kind": "arg",
                "path": "regionId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "regionId",
          "type": "u16"
        },
        {
          "name": "threshold",
          "type": "u8"
        },
        {
          "name": "payoutCapLamports",
          "type": "u64"
        },
        {
          "name": "oracle",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "registerResponder",
      "discriminator": [
        45,
        24,
        91,
        133,
        239,
        208,
        166,
        226
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "pool",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "wallet",
          "type": "pubkey"
        },
        {
          "name": "shareBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "triggerPayout",
      "discriminator": [
        145,
        81,
        98,
        96,
        194,
        251,
        69,
        38
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "payoutRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  111,
                  117,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "arg",
                "path": "eventId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "eventId",
          "type": "string"
        },
        {
          "name": "riskScore",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "contribution",
      "discriminator": [
        182,
        187,
        14,
        111,
        72,
        167,
        242,
        212
      ]
    },
    {
      "name": "payoutRecord",
      "discriminator": [
        7,
        79,
        243,
        33,
        243,
        68,
        106,
        123
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not the admin (registration) or not the oracle (payout)."
    },
    {
      "code": 6001,
      "name": "tooManyResponders",
      "msg": "A pool has at most 5 responders."
    },
    {
      "code": 6002,
      "name": "invalidShares",
      "msg": "Responder shares are invalid or do not total 10,000 basis points."
    },
    {
      "code": 6003,
      "name": "belowThreshold",
      "msg": "The risk score is below the pool threshold."
    },
    {
      "code": 6004,
      "name": "insufficientFunds",
      "msg": "The vault cannot pay anything and stay rent-exempt."
    },
    {
      "code": 6005,
      "name": "zeroAmount",
      "msg": "Contribution amount must be greater than zero."
    },
    {
      "code": 6006,
      "name": "invalidThreshold",
      "msg": "Threshold must be from 0 to 100."
    },
    {
      "code": 6007,
      "name": "duplicateResponder",
      "msg": "This wallet is already a responder in the pool."
    }
  ],
  "types": [
    {
      "name": "contribution",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "contributor",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "payoutRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "eventId",
            "type": "string"
          },
          {
            "name": "riskScore",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "regionId",
            "type": "u16"
          },
          {
            "name": "threshold",
            "type": "u8"
          },
          {
            "name": "payoutCapLamports",
            "type": "u64"
          },
          {
            "name": "responders",
            "type": {
              "vec": {
                "defined": {
                  "name": "responderShare"
                }
              }
            }
          },
          {
            "name": "totalContributed",
            "type": "u64"
          },
          {
            "name": "totalPaidOut",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "responderShare",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "shareBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": []
      }
    }
  ]
};
