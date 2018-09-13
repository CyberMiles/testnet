const fs = require("fs")
const parse = require("csv-parse/lib/sync")
const Tx = require("ethereumjs-tx")
const Web3 = require("web3-cmt")
const Globals = require("./globals")
const logger = require("./logger")(module)
const cubeSign = require("./cubeSign")

// web3 setup before all
let web3 = new Web3(new Web3.providers.HttpProvider(Globals.Provider))
if (!web3 || !web3.isConnected()) throw new Error("cannot connect to server. ")

const STATUS = {
  OK: "ok",
  UNKNOWN_ERROR: "Unknown error",
  ACCOUNT: {
    INSUFFICIENT_BOND: "Insufficient bond shares"
  },
  VALIDATOR: {
    REACH_MAX_AMT:
      "Validator has reached its declared max amount CMTs to be staked",
    NOT_EXISTS: "Validator does not exist for that address",
    NO_DELEGATION: "No delegation"
  }
}

function delegate(account, validator, amount = 10) {
  let acc = account.addr
  let pkey = new Buffer(account.pkey, "hex")
  let val = validator.addr
  let nonce = web3.cmt.getTransactionCount(acc)
  let txInner = {
    type: "stake/delegate",
    data: {
      validator_address: val,
      amount: web3.toWei(amount, "CMT"),
      cube_batch: "01",
      sig: cubeSign(acc, nonce)
    }
  }
  let signed = signTx(acc, pkey, nonce, txInner)
  web3.cmt.sendRawTx(signed, function(err, resp) {
    if (err) {
      logger.error(`delegate send error, ${acc}-${nonce}, ${err.message}`)
      return
    }
    logger.info(`delegate resp, ${acc}-${nonce}, ${JSON.stringify(resp)}`)
    if (resp.height > 0) {
      // add to Delegations
      let dele = Globals.Delegations[val] || {}
      dele[acc] = dele[acc] || {}
      dele[acc].amount = (dele[acc].amount || 0) + amount
      Globals.Delegations[val] = dele
    } else {
      // check error
      switch (resp.check_tx.log) {
        case null:
          break
        case STATUS.VALIDATOR.REACH_MAX_AMT:
        case STATUS.VALIDATOR.NOT_EXISTS:
          validator.status = resp.check_tx.log
          break
        case STATUS.ACCOUNT.INSUFFICIENT_BOND:
          account.status = resp.check_tx.log
          break
        default:
          logger.error(`delegate error, ${acc}-${nonce}, ${resp.check_tx.log}`)
          break
      }
    }
  })
}

function withdraw(account, validator, amount) {
  let acc = account.addr
  let pkey = new Buffer(account.pkey, "hex")
  let val = validator.addr
  let nonce = web3.cmt.getTransactionCount(acc)
  let txInner = {
    type: "stake/withdraw",
    data: {
      validator_address: val,
      amount: web3.toWei(amount, "CMT")
    }
  }
  let signed = signTx(acc, pkey, nonce, txInner)
  web3.cmt.sendRawTx(signed, function(err, resp) {
    if (err) {
      logger.error(`withdraw send error, ${acc}-${nonce}, ${err.message}`)
      return
    }
    logger.info(`withdraw resp, ${acc}-${nonce}, ${JSON.stringify(resp)}`)
    if (resp.height > 0) {
      let dele = Globals.Delegations[val]
      dele[acc].amount = dele[acc].amount - amount
    } else {
      // check error
      logger.error(`withdraw error, ${acc}-${nonce}, ${resp.check_tx.log}`)
    }
  })
}

function signTx(from, pkey, nonce, txInner) {
  logger.info(`tx, ${from}-${nonce}, ${JSON.stringify(txInner)}`)
  let hexData = "0x" + new Buffer(JSON.stringify(txInner)).toString("hex")

  // client side sign
  let rawTx = {
    from: from,
    nonce: "0x" + nonce.toString(16),
    data: hexData,
    chainId: Globals.ChainId
  }
  let tx = new Tx(rawTx)
  tx.sign(pkey)
  let signed = "0x" + tx.serialize().toString("hex")
  return signed
}

function getShares(acc, valPubKey) {
  let shares = 0
  let result = web3.cmt.stake.delegator.query(acc)
  if (result && result.data) {
    let data = result.data.find(d => d.pub_key.value == valPubKey)
    if (data) {
      shares = web3
        .toBigNumber(data.delegate_amount)
        .plus(data.award_amount)
        .minus(data.withdraw_amount)
        .minus(data.slash_amount)
    }
  }
  return web3.fromWei(shares, "CMT")
}

async function init() {
  Globals.ChainId = web3.net.id
  await loadAccounts()
  await loadValidators()
  logger.debug(JSON.stringify(Globals))
}

async function loadAccounts() {
  if (Globals.Accounts.length == 0) {
    let data = await loadCSV("data/accounts.csv", ["addr", "pkey"])
    data.forEach(d => {
      d.status = STATUS.OK
    })
    Globals.Accounts = data
  }
}
async function loadValidators() {
  if (Globals.Validators.length == 0) {
    let data = await loadCSV("data/validators.csv", ["addr", "pkey"])
    let result = web3.cmt.stake.validator.list()
    if (!result || !result.data) throw new Error("no validators at all. ")

    data.forEach(d => {
      let val = result.data.find(r => r.owner_address.toLowerCase() == d.addr)
      if (val) {
        d.valPubKey = val.pub_key.value
        d.status = STATUS.OK
      } else {
        d.status = STATUS.VALIDATOR.NOT_EXISTS
      }
    })
    Globals.Validators = data
  }
}

function loadCSV(file, columns) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, function(err, data) {
      if (err) reject()
      data = parse(data.toString(), { columns: columns })
      resolve(data)
    })
  })
}

function randomValidator() {
  let availables = Globals.Validators.filter(v => v.status == STATUS.OK)
  if (availables.length == 0) {
    logger.warn("no available validators")
    return null
  }
  let idx = randomInt(0, availables.length)
  // return reference
  let validator = Globals.Validators.find(v => v.addr == availables[idx].addr)
  return validator
}

// random integer between two numbers low (inclusive) and high (exclusive) ([low, high))
function randomInt(low, high) {
  return Math.floor(Math.random() * (high - low) + low)
}

function availableAccounts() {
  let accounts = Globals.Accounts.filter(a => a.status == STATUS.OK)
  if (accounts.length == 0) {
    logger.warn("no available accounts")
    return []
  }
  return accounts
}

function reset(arr) {
  Globals.Accounts.forEach(v => (v.status = STATUS.OK))
  Globals.Validators.forEach(v => (v.status = STATUS.OK))
}

module.exports = {
  STATUS,
  init,
  randomValidator,
  availableAccounts,
  reset,
  delegate,
  withdraw,
  getShares
}
