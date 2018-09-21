module.exports = {
  Status: {
    OK: "ok",
    UNKNOWN_ERROR: "Unknown error",
    Account: {
      INSUFFICIENT_BOND: "Insufficient bond shares",
      INVALID_CUBE_SIG: "Invalid cube signature"
    },
    Validator: {
      REACH_MAX_AMT: "Validator has reached its declared max amount CMTs to be staked",
      NOT_EXISTS: "Validator does not exist for that address",
      NO_DELEGATION: "No delegation"
    }
  },
  Constants: {
    DELEGATE_AMOUNT: 10,
    WITHDRAW_PERC: 0.2,
    PARALLEL_LIMIT: 20,
    FAUCET: {
      addr: "0x7eff122b94897ea5b0e2a9abf47b86337fafebdc",
      pkey: "0ce9f0b80483fbae111ac7df48527d443594a902b00fc797856e35eb7b12b4be"
    },
    CHECK_INTERVAL: 1000
  },
  Context: {
    Provider: "http://localhost:8545",
    ChainID: 1234,
    Accounts: [],
    Validators: [],
    Delegations: {}
  }
}
