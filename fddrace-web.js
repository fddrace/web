const fetch = require('node-fetch')
const express = require('express')
const session = require('express-session')
const fs = require('fs')
const redis = require('redis')
const { v4: uuidv4 } = require('uuid')
const app = express()
const dotenv = require('dotenv')
const redisStore = require('connect-redis')(session)
const redisClient = redis.createClient()
dotenv.config()

const { sendMailPassword, sendMailVerify } = require('./src/mail')
const { loginAccount, getAccsByEmail } = require('./src/account')
const { execCmd, testEcon } = require('./src/api')
const { insertSurvey, updateSurvey, getDb } = require('./src/survey')
const logger = require('./src/logger')

const port = 5690

// Add headers
// https://stackoverflow.com/a/18311469
app.use(function (req, res, next) {
  // TODO: make this more dynamic and decide on a front end port (9090 for now)
  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:9090')

  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')

  // Set to true if you need the website to include cookies in the requests sent
  // res.setHeader('Access-Control-Allow-Credentials', true);

  // Pass to next layer of middleware
  next()
})

app.use(
  express.urlencoded({
    extended: true
  })
)

const isCaptcha = process.env.CAPTCHA_BACKEND && process.env.CAPTCHA_BACKEND !== ''
const captchaData = {}

app.use(session({
  secret: process.env.SESSION_SECRET,
  /* eslint-disable new-cap */
  store: new redisStore({ host: 'localhost', port: 6379, client: redisClient, ttl: 260 }),
  /* eslint-enable new-cap */
  saveUninitialized: true,
  resave: true
}))

app.set('view engine', 'ejs')

const sanitizeGmail = email => {
  if (email.endsWith('gmail.com')) {
    return email.toLowerCase().replace(/@gmail.com$/, '').replaceAll('.', '') + '@gmail.com'
  } else if (email.endsWith('googlemail.com')) {
    return email.toLowerCase().replace(/@googlemail.com$/, '').replaceAll('.', '') + '@googlemail.com'
  }
  return email
}

app.get('/', (req, res) => {
  res.render('index', {
    ipAddr: (req.header('x-forwarded-for') || req.socket.remoteAddress).split(',')[0],
    data: req.session.data,
    token: process.env.CAPTCHA_TOKEN,
    hostname: process.env.HOSTNAME,
    captchaBackend: process.env.CAPTCHA_BACKEND
  })
})

app.get('/login', (req, res) => {
  const token = uuidv4()
  let errMsg = false
  if (req.query.login === 'fail') {
    errMsg = 'Failed to login.'
  } else if (req.query.login === 'robot') {
    errMsg = 'Failed to login. Are you a robot?'
  } else if (req.query.login === 'token') {
    errMsg = 'Failed to login. Invalid alpha token.'
  }
  res.render('login', {
    messageGreen: req.query.password === 'success' ? 'Password reset successfully' : false,
    messageRed: errMsg,
    token: token,
    isCaptcha: isCaptcha,
    hostname: process.env.HOSTNAME,
    captchaBackend: process.env.CAPTCHA_BACKEND
  })
})

app.get('/account', (req, res) => {
  if (req.session.data) {
    getDb().get('SELECT * FROM Answers WHERE username = ?', req.session.data.username, (err, rows) => {
      if (err) {
        throw err
      }
      if (rows) {
        res.render('account', {
          voted: true,
          data: req.session.data,
          messageGreen: req.query.mail === 'success' ? 'E-Mail verified' : false
        })
      } else {
        res.render('account', {
          voted: false,
          data: req.session.data,
          messageGreen: req.query.mail === 'success' ? 'E-Mail verified' : false
        })
      }
    })
  } else {
    res.redirect('/login')
  }
})

app.post('/account', (req, res) => {
  if (!req.session.data || !req.session.data.username || req.session.data.username === '') {
    res.redirect('/login')
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/html' })
  const token = uuidv4()
  if (!req.body.email || req.body.email === '' || !req.body.email.match(/^[a-zA-Z0-9.\-@]+$/)) {
    res.end('<html>Invalid mail.<a href="account">back</a></html>')
    return
  }
  if (!req.session.data.security_pin.match(/[0-9]+/)) {
    res.end('<html>Please set a pin. Check /pin in game<a href="account">back</a></html>')
    return
  }
  const email = req.body.email.trim().toLowerCase()
  redisClient.get(sanitizeGmail(email), (err, reply) => {
    if (err) throw err
    if (reply !== null) {
      const emailData = JSON.parse(reply)
      if (req.body.pin !== req.session.data.security_pin) {
        if (Object.prototype.hasOwnProperty.call(emailData, 'pinExpire')) {
          const today = new Date().toISOString().split('T')[0]
          if (emailData.pinExpire > today) {
            res.end('<html>Ratelimited pin attempts. Try again tomorrow.<a href="account">back</a></html>')
            return
          }
        }
        if (Object.prototype.hasOwnProperty.call(emailData, 'pinAttempts')) {
          emailData.pinAttempts += 1
        } else {
          emailData.pinAttempts = 0
        }

        if (emailData.pinAttempts >= 3) {
          emailData.pinAttempts = 0
          // ban 1 day after 3 attempts
          const expireDate = new Date()
          expireDate.setTime(expireDate.getTime() + 1 * 86400000)
          emailData.pinExpire = expireDate.toISOString().split('T')[0]
          redisClient.set(sanitizeGmail(email), JSON.stringify(emailData), (err, reply) => {
            if (err) throw err

            logger.log('email-update', `email='${email}' pin attempts=${emailData.pinAttempts} (banned) redis response: ${reply}`)
          })
        }
        redisClient.set(sanitizeGmail(email), JSON.stringify(emailData), (err, reply) => {
          if (err) throw err

          logger.log('email-update', `email='${email}' pin attempts=${emailData.pinAttempts} redis response: ${reply}`)
        })
        res.end('<html>Invalid pin. Check /pin in game<a href="account">back</a></html>')
        return
      }
    }
    if (req.body.pin !== req.session.data.security_pin) {
      redisClient.set(sanitizeGmail(email), JSON.stringify({ pinAttempts: 0 }), (err, reply) => {
        if (err) throw err

        logger.log('email-update', `email='${email}' pin attempts=0 redis response: ${reply}`)
      })
      res.end('<html>Invalid pin. Check /pin in game<a href="account">back</a></html>')
      return
    }

    const acc = getAccsByEmail(email)[0]
    if (acc) {
      res.end('<html>Email already in use.<a href="account">back</a></html>')
      return
    }
    redisClient.get(sanitizeGmail(email), (err, reply) => {
      if (err) throw err
      if (reply !== null) {
        const emailData = JSON.parse(reply)
        if (Object.prototype.hasOwnProperty.call(emailData, 'expire')) {
          const today = new Date().toISOString().split('T')[0]
          if (emailData.expire > today) {
            logger.log('email-update', `Error: email ratelimit email=${email} expire=${emailData.expire} today=${today}`)
            res.end('<html>Email already pending. Try again later.<a href="account">back</a></html>')
            return
          }
        }
      }
      const username = req.session.data.username
      const expireDate = new Date()
      expireDate.setTime(expireDate.getTime() + 3 * 86400000)
      redisClient.set(token, JSON.stringify({ username: username, email: email, expire: expireDate.toISOString().split('T')[0] }), (err, reply) => {
        if (err) throw err

        logger.log('email-update', `email='${email}' username='${username}' redis response: ${reply}`)
      })
      sendMailVerify(email, token)
      res.end('<html>Check your mail. (also in spam folder -.-)<a href="account">back</a></html>')
    })
  })
})

app.get('/verify-email', async (req, res) => {
  const { token } = req.query
  redisClient.get(token, async (err, reply) => {
    if (err || reply === null) {
      res.end('Invalid token.')
      return
    }

    const data = JSON.parse(reply)
    const today = new Date().toISOString().split('T')[0]
    if (data.expire <= today) {
      redisClient.del(token, (err, reply) => {
        if (err) throw err
      })
      logger.log('verify-email', `Error: expired token username=${data.username} expire=${data.expire} today=${today}`)
      res.end('Expired token')
      return
    }

    const username = data.username
    const email = data.email
    if (!username || !email) {
      res.end('Something went wrong.')
      return
    }
    const loggedIn = await loginAccount(username, null)
    if (!loggedIn) {
      res.end('Something went horribly wrong')
      return
    }
    execCmd('econ', `acc_edit ${username} email "${email}"`)
    req.session.data = loggedIn
    req.session.data.email = email
    redisClient.del(token, (err, reply) => {
      if (err) throw err
    })
    res.redirect('/account?mail=success')
  })
})

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      logger.log('logout', err)
    } else {
      res.redirect('/')
    }
  })
})

const loginCaptchaPassed = async (req, res) => {
  if (process.env.ALPHA_TOKEN && req.body.alphatoken !== process.env.ALPHA_TOKEN) {
    res.redirect('/login?login=fail-token')
    return
  }
  // tokens are one use only
  delete captchaData[req.body.token]
  const loggedIn = await loginAccount(req.body.username, req.body.password)
  if (typeof loggedIn === 'string' || loggedIn instanceof String) {
    res.end(`<html>${loggedIn} <a href="login">back</a></html>`)
  } else if (loggedIn) {
    req.session.data = loggedIn
    logger.log('login', `'${req.body.username}' logged in addr=${req.header('x-forwarded-for') || req.socket.remoteAddress}`)
    res.redirect('/account')
  } else {
    res.redirect('/login?login=fail')
  }
}

app.post('/login', async (req, res) => {
  if (!req.body.token) {
    res.redirect('/login?login=robot')
    return
  }
  const hexKey = Buffer.from(process.env.IP_ADDR + process.env.HOSTNAME + req.body.token, 'utf8').toString('hex')
  const captchaUrl = `${process.env.CAPTCHA_BACKEND}/score/${hexKey}`
  if (isCaptcha) {
    if (captchaData[req.body.token] !== 1) {
      fetch(captchaUrl)
        .then(data => data.text())
        .then(text => {
          logger.log('login', 'captcha data:')
          logger.log('login', text)
          const result = JSON.parse(text)
          if (result.score !== 1) {
            res.redirect('/login?login=robot')
          } else {
            loginCaptchaPassed(req, res)
          }
        })
      return
    }
  }
  loginCaptchaPassed(req, res)
})

app.post('/new-password', (req, res) => {
  const { password, password2, token } = req.body
  if (password !== password2) {
    res.end('Passwords do not match')
    return
  }
  if (typeof token !== 'string') {
    res.end('Invalid token.')
    return
  }
  logger.log('new-password', `get token='${token}'`)
  redisClient.get(token, (err, reply) => {
    if (err || reply === null) {
      res.end('Invalid token.')
      return
    }

    const data = JSON.parse(reply)
    logger.log('new-pasword', data)
    const today = new Date().toISOString().split('T')[0]
    if (data.expire <= today) {
      redisClient.del(token, (err, reply) => {
        if (err) throw err
      })
      logger.log('new-password', `Error: expired token username=${data.username} expire=${data.expire} today=${today}`)
      res.end('Expired token')
      return
    }
    execCmd('econ', `acc_edit ${data.username} password "${password}"`)
    redisClient.del(token, (err, reply) => {
      if (err) throw err
    })
    res.redirect('/login?password=success')
  })
})

app.get('/new-password', (req, res) => {
  const { token } = req.query
  redisClient.get(token, (err, reply) => {
    if (err || reply === null) {
      res.end('Invalid token.')
      return
    }

    logger.log('new-password', reply)
    res.render('new-password', { username: JSON.parse(reply).username, token: token })
  })
})

app.get('/survey', async (req, res) => {
  if (!req.session.data) {
    res.redirect('/login')
    return
  }
  if (req.session.data.level < 10) {
    res.end('<html>You have to be at least level 10 to take part in the survey.<a href="/">okay</a></html>')
    return
  }
  const questions = JSON.parse(fs.readFileSync('survey.json', 'UTF-8'))
  const userIp = req.header('x-forwarded-for') || req.socket.remoteAddress
  getDb().get('SELECT * FROM Answers WHERE username = ?', req.session.data.username, (err, rows) => {
    if (err) {
      throw err
    }
    if (rows) {
      logger.log('survey', `'${req.session.data.username}' started editing the survey`)
      res.render('survey', { data: req.session.data, questions: questions, answers: rows, isEdit: true })
    } else {
      getDb().get('SELECT COUNT(*) AS count FROM Answers WHERE ip = ?', userIp, (err, rows) => {
        if (err) {
          throw err
        }
        if (rows && rows.count > 2) {
          logger.log('survey', `'${req.session.data.username}' could not vote due to ip limit reach`)
          res.end('<html>You already voted with another account.<br><a href="/">back</a><br><a href="/survey_result">results</a></html>')
        } else {
          if (rows) {
            logger.log('survey', `'${req.session.data.username}' ip_votes=${rows.count} started doing the survey`)
          } else {
            logger.log('survey', `'${req.session.data.username}' started doing the survey`)
          }
          res.render('survey', { data: req.session.data, questions: questions, answers: [], isEdit: false })
        }
      })
    }
  })
})

const getSurveyResult = (index) => {
  return new Promise(resolve => {
    getDb().get(`
    SELECT question${index}, COUNT(question${index}) AS c
    FROM Answers
    WHERE question${index} != ''
    GROUP BY question${index}
    ORDER BY c DESC;
  `, (err, rows) => {
      if (err) {
        throw err
      }
      resolve(rows)
    })
  })
}

app.get('/survey_result', async (req, res) => {
  const questions = JSON.parse(fs.readFileSync('survey.json', 'UTF-8'))
  const results = []
  for (let i = 0; i < questions.length; i++) {
    const row = await getSurveyResult(i)
    if (row) {
      results.push(row)
    }
  }
  res.render('survey_result', { data: req.session.data, results: results, questions: questions })
})

app.post('/survey', async (req, res) => {
  if (!req.session.data) {
    res.redirect('/login')
    return
  }
  if (req.session.data.level < 10) {
    res.end('<html>You have to be at least level 10 to take part in the survey.<a href="/">okay</a></html>')
    return
  }
  const userIp = req.header('x-forwarded-for') || req.socket.remoteAddress
  getDb().get('SELECT * FROM Answers WHERE username = ?', req.session.data.username, (err, rows) => {
    if (err) {
      throw err
    }
    if (rows) {
      logger.log('survey', `'${req.session.data.username}' updated his vote: ${req.body.questions}`)
      updateSurvey(
        req.session.data.username,
        req.body.questions
      )
      res.redirect('/survey_result')
    } else {
      if (req.body.questions.every(q => q === '' || !q)) {
        logger.log('survey', `'${req.session.data.username}' skipping empty vote`)
        res.redirect('/survey_result')
        return
      }
      getDb().get('SELECT COUNT(*) AS count FROM Answers WHERE ip = ?', userIp, (err, rows) => {
        if (err) {
          throw err
        }
        if (rows && rows.count > 2) {
          logger.log('survey', `'${req.session.data.username}' could not vote due to ip limit reach`)
          res.end('<html>You already voted with another account.<a href="/">okay</a></html>')
        } else {
          if (rows) {
            console.log(rows.count)
            logger.log('survey', `'${req.session.data.username}' ip_votes=${rows.count} voted: ${req.body.questions}`)
          } else {
            logger.log('survey', `'${req.session.data.username}' voted: ${req.body.questions}`)
          }
          insertSurvey(
            req.session.data.username,
            userIp,
            req.body.questions
          )
          res.redirect('/survey_result')
        }
      })
    }
  })
})

app.get('/reset', (req, res) => {
  res.render('reset')
})

app.post('/reset', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  const token = uuidv4()
  if (!req.body.email || req.body.email === '' || !req.body.email.match(/^[a-zA-Z0-9.\-@]+$/)) {
    res.end('<html>Invalid mail.<a href="reset">back</a></html>')
    return
  }
  const email = req.body.email.trim().toLowerCase()
  const acc = getAccsByEmail(email)[0]
  if (!acc) {
    // keep same message here as in happy path
    // to not leak emails
    // but tbh when setting the email it shows a error if others already use it so ye...
    res.end('<html>Check your mail. (also in spam folder -.-)<a href="reset">back</a></html>')
    return
  }
  redisClient.get(sanitizeGmail(email), (err, reply) => {
    if (err) throw err
    if (reply !== null) {
      const emailData = JSON.parse(reply)
      if (Object.prototype.hasOwnProperty.call(emailData, 'expire')) {
        const today = new Date().toISOString().split('T')[0]
        if (emailData.expire > today) {
          logger.log('password-reset', `Error: email ratelimit email=${email} expire=${emailData.expire} today=${today}`)
          res.end('<html>Password reset already pending. Try again later.<a href="reset">back</a></html>')
          return
        }
      }
    }

    const expireDate = new Date()
    expireDate.setTime(expireDate.getTime() + 3 * 86400000)
    const username = acc.username
    redisClient.set(token, JSON.stringify({ username: username, expire: expireDate.toISOString().split('T')[0] }), (err, reply) => {
      if (err) throw err

      logger.log('password-reset', `token email='${email}' username='${username}' redis response: ${reply}`)
    })
    redisClient.set(sanitizeGmail(email), JSON.stringify({ expire: expireDate.toISOString().split('T')[0] }), (err, reply) => {
      if (err) throw err

      logger.log('password-reset', `email email='${email}' username='${username}' redis response: ${reply}`)
    })
    sendMailPassword(email, token)
    res.end('<html>Check your mail. (also in spam folder -.-)<a href="reset">back</a></html>')
  })
})

app.use(express.json())

app.set('trust proxy', true)

app.post('/', (req, res) => {
  const reqHost = `${req.protocol}://${req.header('Host')}`
  const reqAddr = `${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`.split(',')[0]
  const isOwnAddr = reqAddr === process.env.IP_ADDR
  const isCaptchaAddr = reqAddr === process.env.CAPTCHA_BACKEND_IP
  if (reqHost !== process.env.CAPTCHA_BACKEND && !isOwnAddr && !isCaptchaAddr) {
    logger.log('captcha', `blocked post from invalid host='${reqHost}' addr='${reqAddr}' expected='${process.env.CAPTCHA_BACKEND}'`)
    res.end('ERROR')
    return
  }
  const score = req.body.score
  if (score === 1) {
    // do not save robot scores to save memory
    captchaData[req.body.token] = score
    logger.log('captcha', `result=hooman ip=${req.ip}`)
  } else {
    logger.log('captcha', `result=robot ip=${req.ip}`)
  }
  res.end('OK')
})

/*
  /players/:player

  seves a text file like players.txt as an array
  using the url parameter :player to search for entries
  the file is expected to be in the unix 'sort -nr' format
  the file does not have to be sorted
  so the importance of the player followed by its name:

  100   nameless tee
  65    brainless tee
  10    (1)nameless tee
  200   unsorted_also_works

  This file can be generated from server logs using this script
  https://github.com/lib-crash/lib-teeworlds/blob/master/bin/tw_get_unique_names
*/
app.get('/api/players/:player', (req, res) => {
  const player = decodeURIComponent(req.params.player)
  const players = []
  if (!process.env.PLAYER_NAMES_PATH) {
    res.end('[]')
    return []
  }
  if (!fs.existsSync(process.env.PLAYER_NAMES_PATH)) {
    res.end('[]')
    return []
  }
  fs.readFileSync(process.env.PLAYER_NAMES_PATH, 'UTF-8')
    .split(/\r?\n/)
    .filter(data => data.toLowerCase().includes(player.toLowerCase()))
    .forEach(line => {
      const data = line.trim().split(' ')
      players.push([parseInt(data[0], 10), data.slice(1).join(' ').trim()])
    })
  players.sort((p1, p2) => p2[0] - p1[0])
  res.send(JSON.stringify(players.map(player => player[1]).slice(0, 10)))
})

app.use(express.static('static'))

app.listen(port, () => {
  logger.log('server', `App running on http://localhost:${port}.`)
  testEcon()
})
