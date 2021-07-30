const fetch = require('node-fetch')

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
      console.log('failed to reach api:')
      console.log(err)
    })
}

module.exports = {
  execCmd
}
