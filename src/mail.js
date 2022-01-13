#!/usr/bin/env node

const nodemailer = require('nodemailer')

const logger = require('./logger')

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
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
      return logger.log('mail', error)
    }
    logger.log('mail', `Message sent: ${info.messageId}`)
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
      return logger.log('mail', error)
    }
    logger.log('mail', `Message sent: ${info.messageId}`)
  })
}

module.exports = {
  sendMailPassword,
  sendMailVerify
}
