const environment = process.env.NODE_ENV || 'development';

if (environment !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// require('dotenv').config();
const express = require('express');
const {httpLogger} = require('./middlewares');
const {logger} = require('./utils');
const app = express();
app.use(express.json());
app.use(httpLogger);

const port = 3000;
const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client(process.env.CLIENT_ID);
const format = require('pg-format');
const HLC = require('./hlc');
const clock = new HLC(Math.round(new Date().getTime() / 1000), 'server', 0);

const Pool = require('pg').Pool;
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: true
});

let verify = async token => {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.CLIENT_ID
    });
    const payload = ticket.getPayload();
    return payload['email'];
  } catch (err) {
    logger.error(err);
    return undefined;
  }
};

app.post('/login', async (req, res) => {
  let [_, token] = req.headers.authorization.split(' ');
  if (!token) {
    return res.status(404).json({
      error: `Token is empty or not using Bearer format`
    });
  }

  let email = await verify(token);

  if (!email) {
    return res.status(404).json({
      error: `Email is ${email}`
    });
  }

  // check email query
  const checkEmail = await pool.query(
    'SELECT email FROM accounts WHERE email = $1',
    [email]
  );

  // else, create account
  if (checkEmail.rowCount === 0) {
    const response = await pool.query(
      'INSERT INTO accounts(email) VALUES($1) RETURNING *',
      [email]
    );
  }

  const fetchData = await pool.query(
    'SELECT * from table_event WHERE email = $1',
    [email]
  );

  return res.json({email, data: fetchData.rows});
});

app.post('/sync', async (req, res) => {
  // let [_, token] = req.headers.authorization.split(' ');
  // if (!token) {
  //   return res.status(404).json({
  //     error: `Token is empty or not using Bearer format`
  //   });
  // }

  // let email = await verify(token);
  let email = "adz.arsym@gmail.com"

  if (!email) {
    return res.status(404).json({
      error: `Email is ${email}`
    });
  }

  let {data} = req.body;

  if (data.length != 0) {
    data.map(value => {
      let {ts, count, node} = HLC.fromString(value.hlc);
      let remoteHlc = new HLC(ts, node, count);
      let syncHlc = clock.receive(
        remoteHlc,
        Math.round(new Date().getTime() / 1000)
      );
      value.hlc = new HLC(syncHlc.ts, syncHlc.node, syncHlc.count);
    });x

    data.sort((a, b) => a.hlc.compare(b.hlc));

    let serverTime = Math.round(new Date().getTime() / 1000);

    data.map(value => {
      value.hlc = value.hlc.toString();
      value.sync_at = serverTime;
    });

    let bulkInsertFormat = data.map(value => [
      value.email,
      value.data,
      value.stream_id,
      value.hlc,
      value.name,
      value.sync_at
    ]);

    let bulkInsertQuery = format(
      'INSERT INTO table_event (email, data, stream_id, hlc, name, sync_at) VALUES %L',
      bulkInsertFormat
    );

    const response = await pool.query(bulkInsertQuery, []);
  }

  const getAllEventResponse = await pool.query(
    'SELECT * FROM table_event WHERE email = $1',
    [email]
  );

  return res.json({data: getAllEventResponse.rows});
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
  ``;
});
