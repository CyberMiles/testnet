const { Constants, Context } = require("./globals")
const logger = require("./logger")(module)
const Utils = require("./utils")
const Tx = require("./tx")
const Statistics = require("./statistics")

// For every 10s, each of the accounts will stake 10 CMTs to a random node.
// If a node reaches 100,000 CMT stake, an error will be thrown and we will ignore that error.
async function step1(stats) {
  let txs = Tx.generateDelegates()
  if (txs.length == 0) {
    stats.stop()
    logger.info(`STEP1 done. ${stats}`)
    Object.keys(Context.Delegations).forEach(val => {
      let dele = Context.Delegations[val]
      Object.keys(dele).forEach(acc => {
        let delegator = dele[acc]
        delegator.batch =
          delegator.amount > 0 ? Math.floor(delegator.amount * Constants.WITHDRAW_PERC) : 0
      })
    })
    logger.debug(JSON.stringify(Context, null, 2))
    Utils.reset()

    // continue to step 2
    logger.info("STEP2 start...")
    stats.reset()
    await step2(stats)
  } else {
    // send transactions and wait for responses
    let txStats = new Statistics(stats)
    await Tx.send(txs, txStats)
    // start next round
    await step1(stats)
  }
}

// Every 10s choose a random validator or backup validator and unstake 20 % of all its delegators.
// Do not touch self stake.
async function step2(stats) {
  let txs = Tx.generateWithdraws()
  if (txs.length == 0) {
    stats.stop()
    logger.info(`STEP2 done. ${stats}`)
    logger.debug(JSON.stringify(Context, null, 2))
    Utils.reset()

    // go back to step 1
    logger.info("STEP1 start...")
    stats.reset()
    await step1(stats)
  } else {
    // send transactions and wait for responses
    let txStats = new Statistics(stats)
    await Tx.send(txs, txStats)
    // start next round
    await step2(stats)
  }
}

async function main() {
  await Utils.init()
  Utils.checkInterval()

  logger.info("STEP1 start...")
  let stats = new Statistics()
  await step1(stats)
}

main().catch(console.error)
