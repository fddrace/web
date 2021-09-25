#!/usr/bin/env node

const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: 'mail.zillyhuhn.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
})

const sendMailPassword = (toAddr, token) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM_HEADER,
    to: toAddr,
    subject: 'F-DDrace password reset',
    text: `Click here to reset your password: ${process.env.HOSTNAME}new-password/?token=${token}`,
    html: `Click here to reset your password: ${process.env.HOSTNAME}new-password/?token=${token}`
  }

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error)
    }
    console.log('Message sent: %s', info.messageId)
  })
}

const sendMailVerify = (toAddr, token) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM_HEADER,
    to: toAddr,
    subject: 'F-DDrace verify email',
    text: `Click here to verify your email: ${process.env.HOSTNAME}verify-email/?token=${token}`,
    html: `Click here to verify your email: ${process.env.HOSTNAME}verify-email/?token=${token}`
  }

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error)
    }
    console.log('Message sent: %s', info.messageId)
  })
}

module.exports = {
  sendMailPassword,
  sendMailVerify
}
