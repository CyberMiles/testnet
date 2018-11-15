const winston = require("winston")
const { combine, timestamp, label, printf, colorize } = winston.format

function getLabel(callingModule) {
  if (!callingModule) return ""
  let parts = callingModule.filename.split("/")
  return parts[parts.length - 2] + "/" + parts.pop()
}

module.exports = function(callingModule) {
  return winston.createLogger({
    level: "info",
    format: combine(
      colorize(),
      timestamp(),
      // label({ label: getLabel(callingModule) }),
      printf(info => {
        // return `${info.timestamp} [${info.level}] ${info.label} - ${
        return `${info.timestamp} [${info.level}] - ${info.message}`
      })
    ),
    transports: [new winston.transports.Console()]
  })
}
