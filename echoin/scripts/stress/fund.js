const async = require("async")
const { Constants, Context, Status } = require("./globals")
const logger = require("./logger")(module)
const Utils = require("./utils")

const web3 = Utils.web3

generateTxs = () => {
  let txs = []
  for (let i = 0; i < Context.Accounts.length; ++i) {
    let account = Context.Accounts[i]
    if (account.status != Status.OK) {
      continue
    }
    let tx = {
      from: Constants.FAUCET.addr,
      to: account.addr,
      gasPrice: web3.toWei(5, "gwei"),
      value: web3.toHex(web3.toWei(1000, "EC"))
    }
    txs.push(tx)
  }
  return txs
}

sendTxs = async function(transactions) {
  logger.info(`sending funds to ${transactions.length} accounts...`)

  return new Promise((resolve, reject) => {
    async.eachLimit(
      transactions,
      Constants.PARALLEL_LIMIT,
      web3.ec.sendTransaction,
      err => {
        if (err) {
          logger.error(err)
          reject(err)
        } else {
          logger.info("done.")
          resolve()
        }
      }
    )
  })
}

async function main() {
  await Utils.init()

  let txs = generateTxs()

  web3.personal.unlockAccount(Constants.FAUCET.addr, "1234")
  await sendTxs(txs)
}

main().catch(console.error)
