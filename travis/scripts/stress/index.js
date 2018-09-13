const Utils = require("./utils")
const Globals = require("./globals")
const logger = require("./logger")(module)

const STATUS = Utils.STATUS
const INTERVAL = 10000 // seconds
const CMT10 = 100

// For every 10s, each of the accounts will stake 10 CMTs to a random node.
// If a node reaches 100,000 CMT stake, an error will be thrown and we will ignore that error.
function step1() {
  logger.info("step1 start...")
  let done = true
  for (let i = 0; i < Globals.Accounts.length; ++i) {
    let account = Globals.Accounts[i]
    if (account.status != STATUS.OK) {
      continue
    }
    let validator = Utils.randomValidator()
    if (!validator) {
      // no more validator available
      done = true
      break
    }
    // at least one account and validator available
    done = false
    Utils.delegate(account, validator, CMT10)
  }
  if (!done) {
    setTimeout(step1, INTERVAL)
  } else {
    // done
    Object.keys(Globals.Delegations).forEach(val => {
      let dele = Globals.Delegations[val]
      Object.keys(dele).forEach(acc => {
        let delegator = dele[acc]
        delegator.batch =
          delegator.amount > 0 ? Number(delegator.amount * 0.2) : 0
      })
    })
    logger.info("step1 done. \n" + JSON.stringify(Globals, null, 2))
    Utils.reset()
    setTimeout(step2, INTERVAL)
  }
}

// Every 10s choose a random validator or backup validator and unstake 20 % of all its delegators.
// Do not touch self stake.
function step2() {
  logger.info("step2 start...")
  let hasDelegated = Object.keys(Globals.Delegations).length > 0
  let validator = Utils.randomValidator()
  if (validator && validator.valPubKey && hasDelegated) {
    let dele = Globals.Delegations[validator.addr]
    if (dele) {
      let done = true
      Object.keys(dele).forEach(acc => {
        if (dele[acc].amount <= 0) return
        let account = Globals.Accounts.find(a => a.addr == acc)
        if (!account) {
          logger.error(`account not found: ${acc}`)
          return
        }
        let amount = dele[acc].batch
        if (dele[acc].amount <= dele[acc].batch) {
          //last batch
          amount = Utils.getShares(acc, validator.valPubKey)
        }
        done = false
        Utils.withdraw(account, validator, amount)
      })
      if (done) {
        validator.status = STATUS.VALIDATOR.NO_DELEGATION
      }
    } else {
      logger.error(`delegation not found: ${validator.addr}`)
      validator.status = STATUS.VALIDATOR.NO_DELEGATION
    }
    setTimeout(step2, INTERVAL)
  } else {
    // done
    logger.info("step2 done. \n" + JSON.stringify(Globals, null, 2))
    // Utils.reset()
    // step1()
  }
}

async function main() {
  await Utils.init().then(() => {
    step1()
  })
}

main().catch(console.error)
