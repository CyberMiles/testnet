const async = require("async")
const Tx = require("ethereumjs-tx")
const { Constants, Context, Status } = require("./globals")
const logger = require("./logger")(module)
const Utils = require("./utils")
const cubeSign = require("./cubeSign")
const Statistics = require("./statistics")

const web3 = Utils.web3

exports.generateDelegates = () => {
  let txs = []
  for (let i = 0; i < Context.Accounts.length; ++i) {
    let account = Context.Accounts[i]
    if (account.status != Status.OK) {
      continue
    }
    let validator = randomValidator()
    if (!validator) {
      // no more validator available
      break
    }
    let tx = delegateTx(account, validator, Constants.DELEGATE_AMOUNT)
    txs.push(tx)
  }
  return txs
}

exports.generateWithdraws = () => {
  if (Object.keys(Context.Delegations).length == 0) {
    logger.warn("no delegations. ")
    return []
  }

  while (true) {
    let validator = randomValidator()
    if (!validator) return []

    let dele = Context.Delegations[validator.addr]
    if (!dele || Object.keys(dele) == 0) {
      validator.status = Status.Validator.NO_DELEGATION
      continue
    }

    let txs = []
    Object.keys(dele).forEach(acc => {
      if (dele[acc].amount <= 0) return
      let account = Context.Accounts.find(a => a.addr == acc)
      if (!account) {
        logger.error(`account not found: ${acc}`)
        return
      }

      // let amount = dele[acc].batch
      // if (dele[acc].amount <= dele[acc].batch) {
      //   //last batch
      //   amount = getShares(acc, validator.valPubKey)
      // }
      let tx = withdrawTx(account, validator, dele[acc].batch)
      txs.push(tx)
    })

    if (txs.length == 0) {
      validator.status = Status.Validator.NO_DELEGATION
    } else {
      return txs
    }
  }
}

exports.send = async function(transactions, stats) {
  logger.info(`sending ${transactions.length} transactions...`)

  return new Promise((resolve, reject) => {
    async.eachLimit(
      transactions,
      Constants.PARALLEL_LIMIT,
      sendRawTx.bind(null, stats),
      err => {
        if (err) {
          logger.error(err)
          reject(err)
        } else {
          stats.stop()
          logger.info(`sending transactions done. ${stats}`)
          resolve()
        }
      }
    )
  })
}

function sendRawTx(stats, transaction, callback) {
  let { from, nonce, txInner, rawTx } = transaction
  web3.cmt.sendRawTx(rawTx, (err, resp) => {
    stats.incr(Statistics.Counter.sent)
    if (err) {
      logger.error(
        `send ${txInner.type} error, ${from}-${nonce}, ${err.message}`
      )
      callback(err)
    } else {
      logger.debug(`response, ${from}-${nonce}, ${JSON.stringify(resp)}`)

      let account = Context.Accounts.find(a => a.addr == from)
      let val = txInner.data.validator_address
      let validator = Context.Validators.find(v => v.addr == val)
      let amount = Number(web3.fromWei(txInner.data.amount, "CMT"))
      if (txInner.type == "stake/delegate") {
        if (resp.height > 0) {
          stats.incr(Statistics.Counter.succ)
          // add to Delegations
          let dele = Context.Delegations[val] || {}
          dele[from] = dele[from] || {}
          dele[from].amount = (dele[from].amount || 0) + amount
          Context.Delegations[val] = dele
          ++account.nonce
        } else {
          stats.incr(Statistics.Counter.fail)
          // check error
          let err = resp.check_tx.log
          if (err) {
            logger.error(
              `delegate error, ${from}-${nonce}, ${resp.check_tx.log}`
            )
            if (Utils.getKeyByValue(Status.Account, err)) {
              account.status = err
            } else if (Utils.getKeyByValue(Status.Validator, err)) {
              validator.status = err
            } else {
              account.status = Status.UNKNOWN_ERROR
            }
          }
        }
      } else if (txInner.type == "stake/withdraw") {
        if (resp.height > 0) {
          stats.incr(Statistics.Counter.succ)
          let dele = Context.Delegations[val]
          dele[from].amount = dele[from].amount - amount
          ++account.nonce
        } else {
          stats.incr(Statistics.Counter.fail)
          // check error
          logger.error(`withdraw error, ${from}-${nonce}, ${resp.check_tx.log}`)
          validator.status = Status.UNKNOWN_ERROR
        }
      } else {
        stats.incr(Statistics.Counter.fail)
        logger.error("unknown tx type. ")
        process.exit(1)
      }
      callback()
    }
  })
}

function delegateTx(account, validator, amount = 10) {
  let from = account.addr
  let pkey = new Buffer(account.pkey, "hex")
  let val = validator.addr
  let nonce = account.nonce
  let txInner = {
    type: "stake/delegate",
    data: {
      validator_address: val,
      amount: web3.toWei(amount, "CMT"),
      cube_batch: "01",
      sig: cubeSign(from, nonce)
    }
  }
  let rawTx = signTx(from, pkey, nonce, txInner)
  return { from, nonce, txInner, rawTx }
}

function withdrawTx(account, validator, amount) {
  let from = account.addr
  let pkey = new Buffer(account.pkey, "hex")
  let val = validator.addr
  let nonce = account.nonce
  let txInner = {
    type: "stake/withdraw",
    data: {
      validator_address: val,
      amount: web3.toWei(amount, "CMT")
    }
  }
  let rawTx = signTx(from, pkey, nonce, txInner)
  return { from, nonce, txInner, rawTx }
}

function signTx(from, pkey, nonce, txInner) {
  logger.debug(`signTx, ${from}-${nonce}, ${JSON.stringify(txInner)}`)
  let hexData = "0x" + new Buffer(JSON.stringify(txInner)).toString("hex")

  // client side sign
  let rawTx = {
    from: from,
    nonce: "0x" + nonce.toString(16),
    data: hexData,
    chainId: Context.ChainID
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
  return Number(web3.fromWei(shares, "CMT"))
}

function randomValidator() {
  let availables = Context.Validators.filter(v => v.status == Status.OK)
  if (availables.length == 0) {
    logger.warn("no available validators")
    return null
  }
  let idx = Utils.randomInt(0, availables.length)
  // return reference
  let validator = Context.Validators.find(v => v.addr == availables[idx].addr)
  return validator
}
