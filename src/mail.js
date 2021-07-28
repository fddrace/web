#!/usr/bin/env node

const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: 'mail.zillyhuhn.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'chillerdragon',
    pass: process.env.EMAIL_PASSWORD
  }
})

const sendMail = (toAddr, token) => {
  const mailOptions = {
    from: '"Chiller Dragon" <chillerdragon@zillyhuhn.com>',
    to: toAddr,
    subject: 'F-DDrace password reset',
    text: `Click here to reset your password: https://f.zillyhuhn.com/userId/${token}`,
    html: `Click here to reset your password: https://f.zillyhuhn.com/userId/${token}`
  }

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error)
    }
    console.log('Message sent: %s', info.messageId)
  })
}

module.exports = {
  sendMail
}
