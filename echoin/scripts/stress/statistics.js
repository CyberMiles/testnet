function Statistics(parent) {
  this.parent = parent

  let sent = 0
  let succ = 0
  let fail = 0

  let startTime = new Date()
  let endTime = new Date()

  this.start = () => {
    startTime = new Date()
  }
  this.stop = () => {
    endTime = new Date()
  }

  this.reset = () => {
    startTime = new Date()
    endTime = new Date()
    sent = 0
    succ = 0
    fail = 0
  }

  this.incr = counter => {
    switch (counter) {
      case Statistics.Counter.sent:
        ++sent
        break
      case Statistics.Counter.succ:
        ++succ
        break
      case Statistics.Counter.fail:
        ++fail
        break
    }
    if (parent) {
      parent.incr(counter)
    }
  }

  this.toString = () => {
    if (!startTime || !endTime) return ""

    let elapsed = (endTime - startTime) / 1000
    return `start time: ${startTime.toISOString()}, end time: ${endTime.toISOString()}, elapsed: ${elapsed}s. sent: ${sent}, succ: ${succ}, fail: ${fail}. `
  }
}

Statistics.Counter = { sent: 0, succ: 1, fail: 2 }
module.exports = Statistics
