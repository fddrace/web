#!/usr/bin/env node

const fs = require('fs')
const crypto = require('crypto')
const logger = require('./logger')

const parseAccData = data => {
  let i = 0
  return {
    port: parseInt(data[i++], 10),
    logged_in: parseInt(data[i++], 10),
    disabled: parseInt(data[i++], 10),
    password: data[i++],
    username: data[i++],
    client_id: parseInt(data[i++], 10),
    level: parseInt(data[i++], 10),
    xp: parseInt(data[i++], 10),
    money: parseInt(data[i++], 10),
    kills: parseInt(data[i++], 10),
    deaths: parseInt(data[i++], 10),
    police_level: parseInt(data[i++], 10),
    survival_kills: parseInt(data[i++], 10),
    survival_wins: parseInt(data[i++], 10),
    spooky_ghost: parseInt(data[i++], 10),
    last_money_transaction_0: data[i++],
    last_money_transaction_1: data[i++],
    last_money_transaction_2: data[i++],
    last_money_transaction_3: data[i++],
    last_money_transaction_4: data[i++],
    vip: parseInt(data[i++], 10),
    block_points: parseInt(data[i++], 10),
    instagib_kills: parseInt(data[i++], 10),
    instagib_wins: parseInt(data[i++], 10),
    spawn_weapon_0: parseInt(data[i++], 10),
    spawn_weapon_1: parseInt(data[i++], 10),
    spawn_weapon_2: parseInt(data[i++], 10),
    ninjajetpack: parseInt(data[i++], 10),
    last_player_name: data[i++],
    survival_deaths: parseInt(data[i++], 10),
    instagib_deaths: parseInt(data[i++], 10),
    taser_level: parseInt(data[i++], 10),
    killing_spree_record: parseInt(data[i++], 10),
    euros: parseInt(data[i++], 10),
    expire_date_vip: data[i++],
    portal_rifle: parseInt(data[i++], 10),
    expire_date_portal_rifle: data[i++],
    version: parseInt(data[i++], 10),
    addr: data[i++],
    last_addr: data[i++],
    taser_battery: parseInt(data[i++], 10),
    contact: data[i++],
    timeout_code: data[i++],
    security_pin: data[i++],
    register_date: data[i++],
    last_login_date: data[i++],
    flags: data[i++],
    email: data[i++]
  }
}

const loginAccount = async (username, password) => {
  /* use null as password to force passwordless login */
  const ACC_PASSWORD = 3
  const ACC_VERSION = 37
  const accFile = `${process.env.FDDR_ACCOUNTS_PATH}/${username}.acc`
  if (password !== null) {
    if (password === undefined || password === '') {
      return false
    }
    if (password.length < 3) {
      return false
    }
  }
  if (!fs.existsSync(accFile)) {
    return false
  }
  const password256 = password ? crypto.createHash('sha256').update(password).digest('hex') : ''
  try {
    const data = fs.readFileSync(accFile, 'UTF-8')
    const lines = data.split(/\r?\n/)
    if (password !== null && lines[ACC_VERSION] <= 6) {
      return 'Your account is too old please login in game first to update.'
    }
    if (password256 === lines[ACC_PASSWORD] || password === null) {
      return parseAccData(lines)
    }
  } catch (err) {
    logger.log('account', err)
    return false
  }
}

const getAllAccFiles = () => {
  return fs.readdirSync(process.env.FDDR_ACCOUNTS_PATH, { withFileTypes: true })
    .filter(dirent => dirent.name.endsWith('.acc'))
    .map(dirent => dirent.name)
}

const getAccsByEmail = email => {
  let isGmail = false
  if (email.endsWith('gmail.com')) {
    email = email.replace(/@gmail.com$/, '').replaceAll('.', '') + '@gmail.com'
    isGmail = true
  } else if (email.endsWith('googlemail.com')) {
    email = email.replace(/@googlemail.com$/, '').replaceAll('.', '') + '@googlemail.com'
    isGmail = true
  }
  return getAllAccFiles().map(accFile => {
    return parseAccData(fs.readFileSync(`${process.env.FDDR_ACCOUNTS_PATH}/${accFile}`, 'UTF-8')
      .split(/\r?\n/))
  }).filter((data) => {
    if (!data.email) {
      return false
    }
    if (isGmail) {
      if (email.endsWith('gmail.com')) {
        return data.email.toLowerCase().replace(/@gmail.com$/, '').replaceAll('.', '') + '@gmail.com' === email
      } else if (email.endsWith('googlemail.com')) {
        return data.email.toLowerCase().replace(/@googlemail.com$/, '').replaceAll('.', '') + '@googlemail.com' === email
      }
      return false
    }
    return data.email.toLowerCase() === email
  })
}

module.exports = {
  loginAccount,
  getAccsByEmail
}
