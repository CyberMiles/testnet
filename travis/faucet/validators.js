const request = require('request')
const fs = require('fs')
const path = require('path')
const dataFile = [process.cwd(), 'data', 'x.json'].join(path.sep)

fs.mkdir(process.cwd() + path.sep + 'data', () => {
})

const preUrl = process.env['TRAVIS_FAUCET_TM_URL']
const interval = 10 * 1000
const summCount = 100

var x = {
  currentHeight: 0,
  currentBlockTimestamp: 0,
  handledHeight: 0,
  count: 0,
  all: {}, // {addr, voting power, up block count, updated at, join at}
  latestSumm: {
    count: summCount,
    duration: 0,
    sumVP: 0,
    sumOnlineVP: 0,
    vpList: [] // len 100, {block time, sum voting power, sum online vp}
  }
}

function getCurrentHeight() {
  request.get(
    {
      url: preUrl + '/status'
    },
    (error, response, body) => {
      if (error) {
        console.error(error)
        return
      }
      if (!response || response.statusCode != 200) {
        console.error("Can't get net status")
        return
      }

      try {
        body = JSON.parse(body)
        x.currentHeight = body.result.latest_block_height || body.result.sync_info.latest_block_height
        let bt = body.result.latest_block_time || body.result.sync_info.latest_block_time
        x.currentBlockTimestamp = new Date(bt).getTime()
      } catch (e) {
        console.log(body)
        console.error('Failed get net status')
      }
    }
  )
}
getCurrentHeight()
setInterval(getCurrentHeight, interval);

// main
(() => {
  var blockTime = validators = onlineValidators = null
  var sumVP = sumOnlineVP = 0

  function main() {
    if (x.currentHeight < 2) {
      setTimeout(main, interval)
      return
    }

    getValidators(x.handledHeight + 1, (v) => {
      validators = v
      handle()
    })
    getOnlineValidators(x.handledHeight + 2, (t, v) => {
      blockTime = new Date(t).getTime()
      onlineValidators = v
      handle()
    })
  }

  function handle() {
    if (blockTime == null || validators == null || onlineValidators == null) {
      return
    }

    for (let i = 0; i < validators.length; i++) {
      let v = validators[i]
      let xv = x.all[v.address]
      if (typeof xv == 'undefined') {
        xv = {}
        xv.addr = v.address
        xv.joinAt = x.handledHeight + 1
        xv.upCount = 0
        x.all[v.address] = xv
        x.count++
      }
      xv.vp = v.voting_power
      xv.updatedAt = x.handledHeight + 1

      for (let j = 0; j < onlineValidators.length; j++) {
        let ov = onlineValidators[j]
        if (ov != null && ov.validator_address == xv.addr) {
          xv.upCount++
          sumOnlineVP += v.voting_power
          break
        }
      }

      sumVP += v.voting_power
    }

    let index = x.handledHeight % x.latestSumm.count
    if (x.handledHeight >= x.latestSumm.count) {
      let lastSummAtIndex = x.latestSumm.vpList[index]
      if (typeof lastSummAtIndex != 'undefined') {
        x.latestSumm.duration = blockTime - lastSummAtIndex.blockTime
        x.latestSumm.sumVP -= lastSummAtIndex.sumVP
        x.latestSumm.sumOnlineVP -= lastSummAtIndex.sumOnlineVP
      }
    }
    let newSumm = {}
    newSumm.blockTime = blockTime
    newSumm.sumVP = sumVP
    newSumm.sumOnlineVP = sumOnlineVP
    x.latestSumm.vpList[index] = newSumm
    x.latestSumm.sumVP += sumVP
    x.latestSumm.sumOnlineVP += sumOnlineVP

    x.handledHeight++
    blockTime = validators = onlineValidators = null
    sumVP = sumOnlineVP = 0

    fs.writeFile(dataFile, JSON.stringify(x), (err) => {
      if (!err) {
        if (x.handledHeight < x.currentHeight) {
          main()
        } else {
          setTimeout(main, interval + 2000)
        }
      } else {
        console.error(err)
        console.error('Writing file error, program will exit.')
      }
    })
  }

  fs.readFile(dataFile, (err, data) => {
    if (!err) {
      x = JSON.parse(data)
    }
    main()
  })
})()

function getValidators(height, received) {
  request.get(
    {
      url: preUrl + '/validators?height=' + height
    },
    (error, response, body) => {
      if (error) {
        console.error(error)
        getValidators(height, received)
        return
      }
      if (!response || response.statusCode != 200) {
        console.error("Can't get validators for height " + height)
        getValidators(height, received)
        return
      }

      try {
        body = JSON.parse(body)
        received(body.result.validators)
      } catch (e) {
        console.log(body)
        console.error('Failed get validators for height ' + height)
        console.error(e)
        getValidators(height, received)
      }
    }
  )
}

function getOnlineValidators(height, received) {
  request.get(
    {
      url: preUrl + '/block?height=' + height
    },
    (error, response, body) => {
      if (error) {
        console.error(error)
        getOnlineValidators(height, received)
        return
      }
      if (!response || response.statusCode != 200) {
        console.error("Can't get block for height " + height)
        getOnlineValidators(height, received)
        return
      }

      try {
        body = JSON.parse(body)
        received(body.result.block.header.time, body.result.block.last_commit.precommits)
      } catch (e) {
        console.log(body)
        console.error('Failed get online validators for height ' + height)
        console.error(e)
        getOnlineValidators(height, received)
      }
    }
  )
}

module.exports = () => {
  return x
}
