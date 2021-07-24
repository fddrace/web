#!/usr/bin/env node

const fs = require('fs')

const loginAccount = (username, password) => {
  if (!fs.existsSync(`${process.env.FDDR_ACCOUNTS_PATH}/${username}.acc`)) {
    return false
  }
  return true
}

module.exports = {
  loginAccount
}
