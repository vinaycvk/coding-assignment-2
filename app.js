const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());

let bcrypt = require("bcrypt");
let jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status = 400;
      response.send("Password is too short");
    } else {
      const createUserQuery = `
      INSERT INTO 
        user (username, password, name, gender) 
      VALUES 
        (
          '${username}', 
          '${hashedPassword}',
          '${name}', 
          '${gender}'
        )`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send(`User created successfully`);
    }
  } else {
    response.status = 400;
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getQuery = `
    select user.username as username, tweet.tweet as tweet, tweet.date_time as dateTime
    from( tweet inner join follower on tweet.user_id = follower.follower_user_id) 
    as T inner join user on T.user_id = user.user_id order by date_time desc limit  4;`;
  const dbResponse = await db.all(getQuery);
  response.send(dbResponse);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const dbQuery = `select * from user where username = '${username}';`;
  const userIdResponse = await db.get(dbQuery);
  const userId = userIdResponse.user_id;

  const getQuery = `
  select user.name as name from 
  (user inner join follower on user.user_id = follower.following_user_id)
  where follower.follower_user_id = ${userId};`;

  const dbResponse = await db.all(getQuery);
  response.send(dbResponse);
});

app.get("/user/follower/", authenticateToken, async (request, response) => {
  const { username } = request;
  const dbQuery = `select * from user where username = '${username}';`;
  const userIdResponse = await db.get(dbQuery);
  const userId = userIdResponse.user_id;

  const getQuery = `
  select user.name as name from 
  (user inner join follower on user.user_id = follower.follower_id)
  where follower.following_user_id = ${userId};`;

  const dbResponse = await db.all(getQuery);
  response.send(dbResponse);
});
