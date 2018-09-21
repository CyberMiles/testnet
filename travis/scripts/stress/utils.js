const async = require("async")
const fs = require("fs")
const parse = require("csv-parse/lib/sync")
const Web3 = require("web3-cmt")
const { Constants, Context, Status } = require("./globals")
const logger = require("./logger")(module)

const http = require("http")
http.globalAgent.keepAlive = true
http.globalAgent.keepAliveMsecs = 60000

// web3 setup before all
let web3 = new Web3(new Web3.providers.HttpProvider(Context.Provider))
if (!web3 || !web3.isConnected()) throw new Error("cannot connect to server. ")
exports.web3 = web3

exports.init = async () => {
  logger.info("initialize...")
  Context.ChainID = web3.net.id
  await loadAccounts()
  await loadValidators()
  await getNonce()
  logger.info("initialize: done.")
}

exports.reset = () => {
  Context.Accounts.forEach(v => (v.status = Status.OK))
  Context.Validators.forEach(v => (v.status = Status.OK))
}

// random integer between two numbers low (inclusive) and high (exclusive) ([low, high))
exports.randomInt = (low, high) => {
  return Math.floor(Math.random() * (high - low) + low)
}

async function loadAccounts() {
  if (Context.Accounts.length == 0) {
    let data = await loadCSV("data/accounts.csv", ["addr", "pkey"])
    data.forEach(d => {
      d.status = Status.OK
      d.nonce = 0
    })
    Context.Accounts = data
  }
}

async function loadValidators() {
  if (Context.Validators.length == 0) {
    let data = await loadCSV("data/validators.csv", ["addr", "pkey"])
    let result = web3.cmt.stake.validator.list()
    if (!result || !result.data) throw new Error("no validators at all. ")

    data.forEach(d => {
      let val = result.data.find(r => r.owner_address.toLowerCase() == d.addr)
      if (val) {
        d.valPubKey = val.pub_key.value
        d.status = Status.OK
      } else {
        d.status = Status.Validator.NOT_EXISTS
      }
    })
    Context.Validators = data
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

async function getNonce() {
  return new Promise((resolve, reject) => {
    async.eachLimit(
      Context.Accounts,
      20,
      (account, cb) => {
        let acc = account.addr
        web3.cmt.getTransactionCount(acc, (err, res) => {
          let d = Context.Accounts.find(a => a.addr == acc)
          d.nonce = res
          cb(err)
        })
      },
      err => {
        if (err) {
          logger.error(err)
          reject(err)
        } else {
          logger.debug(`get nonce done.`)
          resolve()
        }
      }
    )
  })
}

exports.getKeyByValue = (obj, value) => {
  return Object.keys(obj).find(key => obj[key] == value)
}

exports.timeout = ms => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

exports.checkInterval = () => {
  logger.info(`start at height ${web3.cmt.blockNumber}...`)

  let processed = 0
  let lastBlock = -1

  let interval = setInterval(() => {
    let currentBlock = web3.cmt.blockNumber
    if (lastBlock == currentBlock) return

    let block = web3.cmt.getCmtBlock(currentBlock)
    let numTxs = block.block.header.num_txs
    processed += numTxs
    lastBlock = currentBlock
    logger.info(`block height=${currentBlock}, txs=${numTxs}, total=${processed}`)
  }, Constants.CHECK_INTERVAL)

  return interval
}
