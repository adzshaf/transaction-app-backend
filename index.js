// require("dotenv").config();

const express = require("express");
const app = express();
app.use(express.json());

const port = 3000;
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.CLIENT_ID);
const format = require("pg-format");
const HLC = require("./hlc");
const clock = new HLC(Math.round(new Date().getTime() / 1000), "server", 0);

const Pool = require("pg").Pool;
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

let verify = async (token) => {
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return payload["email"];
};

app.post("/login", async (req, res) => {
  let [_, token] = req.headers.authorization.split(" ");
  let email = await verify(token).catch(console.error);

  // check email query
  const checkEmail = await pool.query(
    "SELECT email FROM accounts WHERE email = $1",
    [email]
  );

  // else, create account
  if (checkEmail.rowCount === 0) {
    const response = await pool.query(
      "INSERT INTO accounts(email) VALUES($1) RETURNING *",
      [email]
    );
  }

  const fetchData = await pool.query(
    "SELECT * from table_event WHERE email = $1",
    [email]
  );

  res.json({ email, data: fetchData.rows });
});

app.post("/sync", async (req, res) => {
  let [_, token] = req.headers.authorization.split(" ");
  let email = await verify(token).catch(console.error);

  let { data } = req.body;

  if (data.length != 0) {
    data.map((value) => {
      let { ts, count, node } = HLC.fromString(value.hlc);
      let remoteHlc = new HLC(ts, node, count);
      let syncHlc = clock.receive(
        remoteHlc,
        Math.round(new Date().getTime() / 1000)
      );
      value.hlc = new HLC(syncHlc.ts, syncHlc.node, syncHlc.count);
    });

    data.sort((a, b) => a.hlc.compare(b.hlc));

    let serverTime = Math.round(new Date().getTime() / 1000);

    data.map((value) => {
      value.hlc = value.hlc.toString();
      value.sync_at = serverTime;
    });

    let bulkInsertFormat = data.map((value) => [
      value.email,
      value.data,
      value.stream_id,
      value.hlc,
      value.name,
      value.sync_at,
    ]);

    let bulkInsertQuery = format(
      "INSERT INTO table_event (email, data, stream_id, hlc, name, sync_at) VALUES %L",
      bulkInsertFormat
    );

    const response = await pool.query(bulkInsertQuery, []);
  }

  const getAllEventResponse = await pool.query(
    "SELECT * FROM table_event WHERE email = $1",
    [email]
  );

  res.json({ data: getAllEventResponse.rows });
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
  ``;
});
