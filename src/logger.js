/* ChillerDragon's logger */

const log = (type, msg) => {
  const ts = new Date().toISOString().split('T').join(' ').split(':').join(':').split('.')[0]
  console.log(`[${ts}][${type}] ${msg}`)
}

module.exports = {
  log
}
