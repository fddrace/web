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
const { execCmd } = require('./src/api')
const { hasVoted, insertSurvey, getDb } = require('./src/survey')

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

app.get('/', (req, res) => {
  res.render('index', {
    token: process.env.CAPTCHA_TOKEN,
    hostname: process.env.HOSTNAME,
    captchaBackend: process.env.CAPTCHA_BACKEND
  })
})

app.get('/login', (req, res) => {
  const token = uuidv4()
  res.render('login', {
    messageGreen: req.query.password === 'success' ? 'Password reset successfully' : false,
    token: token,
    isCaptcha: isCaptcha,
    hostname: process.env.HOSTNAME,
    captchaBackend: process.env.CAPTCHA_BACKEND
  })
})

app.get('/account', (req, res) => {
  if (req.session.data) {
    res.render('account', { data: req.session.data, messageGreen: req.query.mail === 'success' ? 'E-Mail verified' : false })
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
  if (req.body.pin !== req.session.data.security_pin) {
    res.end('<html>Invalid pin. Check /pin in game<a href="account">back</a></html>')
    return
  }

  const email = req.body.email.trim().toLowerCase()
  const acc = getAccsByEmail(email)[0]
  if (acc) {
    res.end('<html>Email already in use.<a href="account">back</a></html>')
    return
  }
  redisClient.get(email, (err, reply) => {
    if (err) throw err
    if (reply !== null) {
      const today = new Date().toISOString().split('T')[0]
      if (reply > today) {
        console.log(`[email-update] Error: email ratelimit email=${email} expire=${reply} today=${today}`)
        res.end('<html>Email already pending. Try again later.<a href="account">back</a></html>')
        return
      }
    }
    const username = req.session.data.username
    const expireDate = new Date()
    expireDate.setTime(expireDate.getTime() + 3 * 86400000)
    redisClient.set(token, JSON.stringify({ username: username, email: email, expire: expireDate.toISOString().split('T')[0] }), (err, reply) => {
      if (err) throw err

      console.log(`[email-update] email='${email}' username='${username}' redis response: ${reply}`)
    })
    sendMailVerify(email, token)
    res.end('<html>Check your mail.<a href="account">back</a></html>')
  })
})

app.get('/verify-email', async (req, res) => {
  const { token } = req.query
  redisClient.get(token, async (err, reply) => {
    if (err || reply === null) {
      res.end('Invalid token.')
      return
    }

    console.log(reply)
    const data = JSON.parse(reply)
    const today = new Date().toISOString().split('T')[0]
    if (data.expire <= today) {
      redisClient.del(token, (err, reply) => {
        if (err) throw err

        console.log(reply)
      })
      console.log(`[verify-email] Error: expired token username=${data.username} expire=${data.expire} today=${today}`)
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

      console.log(reply)
    })
    res.redirect('/account?mail=success')
  })
})

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.log(err)
    } else {
      res.redirect('/')
    }
  })
})

app.post('/login', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  if (isCaptcha) {
    if (captchaData[req.body.token] !== 1) {
      res.end('<html>Failed to login. Are you a robot?<a href="login">back</a></html>')
      return
    }
  }
  if (process.env.ALPHA_TOKEN && req.body.alphatoken !== process.env.ALPHA_TOKEN) {
    res.end('<html>Failed to login. Invalid alpha token.<a href="login">back</a></html>')
    return
  }
  // tokens are one use only
  delete captchaData[req.body.token]
  const loggedIn = await loginAccount(req.body.username, req.body.password)
  if (typeof loggedIn === 'string' || loggedIn instanceof String) {
    res.end(`<html>${loggedIn} <a href="login">back</a></html>`)
  } else if (loggedIn) {
    req.session.data = loggedIn
    res.end('<html>Sucessfully logged in. <a href="account">ok</a></html>')
  } else {
    res.end('<html>Failed to login. <a href="login">back</a></html>')
  }
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
  console.log(`redisClient get token='${token}'`)
  redisClient.get(token, (err, reply) => {
    if (err || reply === null) {
      res.end('Invalid token.')
      return
    }

    const data = JSON.parse(reply)
    console.log(data)
    const today = new Date().toISOString().split('T')[0]
    if (data.expire <= today) {
      redisClient.del(token, (err, reply) => {
        if (err) throw err

        console.log(reply)
      })
      console.log(`[password-reset] Error: expired token username=${data.username} expire=${data.expire} today=${today}`)
      res.end('Expired token')
      return
    }
    execCmd('econ', `acc_edit ${data.username} password "${password}"`)
    redisClient.del(token, (err, reply) => {
      if (err) throw err

      console.log(reply)
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

    console.log(reply)
    res.render('new-password', { username: JSON.parse(reply).username, token: token })
  })
})

app.get('/survey', (req, res) => {
  if (!req.session.data) {
    res.redirect('/login')
    return
  }
  if (req.session.data.level < 10) {
    res.end('<html>You have to be at least level 10 to take part in the survey.<a href="/">okay</a></html>')
    return
  }
  res.render('survey')
})

app.get('/survey_result', (req, res) => {
  const questions = []
  for (let i = 0; i < 2; i++) {
    getDb().get(`
      SELECT question${i}, COUNT(question${i}) AS c
      FROM Answers
      GROUP BY question${i}
      ORDER BY c;
    `, (err, rows) => {
      if (err) {
        throw err
      }
      console.log(rows)
      questions.push(rows)
    })
  }
  res.render('survey_result', { questions: questions })
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
  getDb().get('SELECT * FROM Answers WHERE username = ?', req.session.data.username, (err, rows) => {
    if (err) {
      throw err
    }
    if (rows) {
      res.end('<html>You already voted <a href="survey">back</a></html>')
    }
    else {
      insertSurvey(
        req.session.data.username,
        [req.body.question1, req.body.question2]
      )
      res.end('<html>OK <a href="survey">back</a></html>')
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
    res.end('<html>Check your mail.<a href="reset">back</a></html>')
    return
  }
  redisClient.get(email, (err, reply) => {
    if (err) throw err
    if (reply !== null) {
      const today = new Date().toISOString().split('T')[0]
      if (reply > today) {
        console.log(`[password-reset] Error: email ratelimit email=${email} expire=${reply} today=${today}`)
        res.end('<html>Password reset already pending. Try again later.<a href="reset">back</a></html>')
        return
      }
    }
    const expireDate = new Date()
    expireDate.setTime(expireDate.getTime() + 3 * 86400000)
    const username = acc.username
    redisClient.set(token, JSON.stringify({ username: username, expire: expireDate.toISOString().split('T')[0] }), (err, reply) => {
      if (err) throw err

      console.log(`[password-reset] token email='${email}' username='${username}' redis response: ${reply}`)
    })
    redisClient.set(email, expireDate.toISOString().split('T')[0], (err, reply) => {
      if (err) throw err

      console.log(`[password-reset] email email='${email}' username='${username}' redis response: ${reply}`)
    })
    sendMailPassword(email, token)
    res.end('<html>Check your mail.<a href="reset">back</a></html>')
  })
})

app.use(express.json())

app.set('trust proxy', true)

app.post('/', (req, res) => {
  const reqHost = `${req.protocol}://${req.header('Host')}`
  const reqAddr = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  const isOwnAddr = reqAddr === process.env.IP_ADDR
  if (reqHost !== process.env.CAPTCHA_BACKEND && !isOwnAddr) {
    console.log(`[captcha] blocked post from invalid host='${reqHost}' addr='${reqAddr}' expected='${process.env.CAPTCHA_BACKEND}'`)
    res.end('ERROR')
    return
  }
  const score = req.body.score
  if (score === 1) {
    // do not save robot scores to save memory
    captchaData[req.body.token] = score
    console.log(`[captcha] result=hooman ip=${req.ip}`)
  } else {
    console.log(`[captcha] result=robot ip=${req.ip}`)
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
*/
app.get('/api/players/:player', (req, res) => {
  const player = decodeURIComponent(req.params.player)
  const players = []
  if (!process.env.PLAYER_NAMES_PATH) {
    return []
  }
  if (!fs.existsSync(process.env.PLAYER_NAMES_PATH)) {
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
  console.log(`App running on http://localhost:${port}.`)
})
