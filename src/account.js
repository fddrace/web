#!/usr/bin/env node

const fs = require('fs')

const parseAccData = data => {
  let i = 0
  return {
    port: data[i++],
    logged_in: data[i++],
    disabled: data[i++],
    password: data[i++],
    username: data[i++],
    client_id: data[i++],
    level: data[i++],
    xp: data[i++],
    money: data[i++],
    kills: data[i++],
    deaths: data[i++],
    police_level: data[i++],
    survival_kills: data[i++],
    survival_wins: data[i++],
    spooky_ghost: data[i++],
    last_money_transaction_0: data[i++],
    last_money_transaction_1: data[i++],
    last_money_transaction_2: data[i++],
    last_money_transaction_3: data[i++],
    last_money_transaction_4: data[i++],
    vip: data[i++],
    block_points: data[i++],
    instagib_kills: data[i++],
    instagib_wins: data[i++],
    spawn_weapon_0: data[i++],
    spawn_weapon_1: data[i++],
    spawn_weapon_2: data[i++],
    ninjajetpack: data[i++],
    last_player_name: data[i++],
    survival_deaths: data[i++],
    instagib_deaths: data[i++],
    taser_level: data[i++],
    killing_spree_record: data[i++],
    euros: data[i++],
    expire_date_vip: data[i++],
    portal_rifle: data[i++],
    expire_date_portal_rifle: data[i++],
    version: data[i++],
    addr: data[i++],
    last_addr: data[i++],
    taser_battery: data[i++],
    contact: data[i++],
    timeout_code: data[i++],
    security_pin: data[i++],
    register_date: data[i++],
    last_login_date: data[i++]
  }
}

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
      return parseAccData(lines)
    }
  } catch (err) {
    console.log(err)
    return false
  }
}

const getAllAccFiles = () => {
  return fs.readdirSync(process.env.FDDR_ACCOUNTS_PATH, { withFileTypes: true })
    .filter(dirent => dirent.name.endsWith('.acc'))
    .map(dirent => dirent.name)
}

const getAccsByEmail = email => {
  return getAllAccFiles().map(accFile => {
    return parseAccData(fs.readFileSync(`${process.env.FDDR_ACCOUNTS_PATH}/${accFile}`, 'UTF-8')
      .split(/\r?\n/))
  }).filter(data => data.contact && data.contact.toLowerCase() === email)
}

module.exports = {
  loginAccount,
  getAccsByEmail
}
