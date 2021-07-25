#!/usr/bin/env node

const fs = require('fs')

const loginAccount = async (username, password) => {
  const ACC_PASSWORD = 3
  const accFile = `${process.env.FDDR_ACCOUNTS_PATH}/${username}.acc`
  if (password === undefined || password === '') {
    return false
  }
  if (password.length < 3) {
    return false
  }
  if (!fs.existsSync(accFile)) {
    return false
  }
  try {
    const data = fs.readFileSync(accFile, 'UTF-8')
    const lines = data.split(/\r?\n/)
    if (password === lines[ACC_PASSWORD]) {
      return lines
    }
  } catch (err) {
    console.log(err)
    return false
  }
}

module.exports = {
  loginAccount
}
