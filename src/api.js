const fetch = require('node-fetch')

const logger = require('./logger')

const execCmd = (cmd, args, callback, callbackArg) => {
  const apiUrl = `${process.env.API_HOST}/?t=${process.env.API_TOKEN}`
  fetch(`${apiUrl}&cmd=${cmd}&args=${args}`)
    .then(r => r.json())
    .then(data => {
      if (callback) {
        callback(data.stdout, callbackArg)
      }
    })
    .catch(err => {
      logger.log('econ', 'failed to reach api:')
      logger.log('econ', err)
    })
}

module.exports = {
  execCmd
}
