import * as env from "dotenv";
import * as express from "express";
import * as session from "express-session";
import * as redis from "redis";
import * as connectRedis from "connect-redis";
import * as rateLimit from "express-rate-limit";
import * as bodyParser from "body-parser";
import * as path from "path";
import * as favicon from "serve-favicon";
import * as mongodb from "mongodb";
import fetch from "node-fetch";
import * as querystring from "querystring";

env.config();
const PORT = process.env.PORT || 5000;
const SESSION_SECRET = process.env.SESSION_SECRET || "session secret";
const REDIS_URL = process.env.REDIS_URL || "localhost:6379";
const MONGODB_URL = process.env.MONGODB_URL || "mongodb://localhost:27017/biometric-diary";

const TYPINGDNA_APIKEY = process.env.TYPINGDNA_APIKEY;
const TYPINGDNA_APISECRET = process.env.TYPINGDNA_APISECRET;

const TYPINGDNA_MIN_SCORE = 50;

let loginDataDb: mongodb.Collection;

const RedisStore = connectRedis(session);
const redisClient = redis.createClient();
const redisSessionStore = new RedisStore({
	url: REDIS_URL,
	client: redisClient,
	ttl: 3600
});

const app = express();
app.use(session({ 
		secret: SESSION_SECRET, 
		store: redisSessionStore,
		saveUninitialized: false, 
		resave: true,
	}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(favicon(__dirname + "/images/favicon.ico"));
app.use("/stylesheets", express.static(path.join(__dirname, "stylesheets")));
app.use("/js", express.static(path.join(__dirname, "client")));

// Rate limit api methods
// @ts-ignore
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10,
	message: { error: 'Too many login requests. Please wait 15 minutes and try again.' }
});
app.use("/login", apiLimiter);

app.set("views", __dirname);
app.set("view engine", "ejs");
app.set('trust proxy', 1);

app.get("/", (req, res) => res.render("pages/index"));

app.post("/login", async (req, res) => {
	const loginInput = req.body.loginId;
	const typingPattern = req.body.typingPattern;
	
	// check if user exists
	const userLoginData = await loginDataDb.findOne({ id: loginInput });
	if (!userLoginData)
	{
		req.session.key = loginInput;
		req.session.loginQuality = 0;
		req.session.typingPattern = typingPattern;
		return res.send({ loginStatus: LoginStatus.userNotFound });
	}

	if (true)
	{
		req.session.key = loginInput;
		req.session.loginQuality = 1;

		return res.send({ loginStatus: LoginStatus.success });
	}
	else
	{
		return res.status(401).send({ loginStatus: LoginStatus.failure });
	}
});

app.post("/create-account", async (req, res) => {
	const loginInput = req.body.loginId;
	const typingPattern = req.body.typingPattern;
	const previousTypingPattern = req.session.typingPattern;

	try
	{
		const matchResult = await matchTypingString(typingPattern, previousTypingPattern);
		if (matchResult.status != 200)
		{
			console.error(`Match typing string in a create-account call returned ${matchResult.status}:`);
			console.error(`${matchResult.name}:${matchResult.message}`);
			return res.status(401).send({ loginStatus: LoginStatus.failure });
		}
		else if (matchResult.score < TYPINGDNA_MIN_SCORE)
		{
			return res.status(401).send({ loginStatus: LoginStatus.failure });
		}
		
		return res.send({ loginStatus: LoginStatus.success });
	}
	catch(err)
	{
		console.error("Error attempting to match typing string in a create-account call:");
		console.error(err);
		return res.status(401).send({ loginStatus: LoginStatus.failure });
	}
});

// set up mongodb before starting app.listening
const mongodbClient = mongodb.MongoClient;
mongodbClient.connect(MONGODB_URL, { useNewUrlParser: true }, (err, client) =>
{
	if (err)
	{
		console.error(err);
		client.close();
		process.exit(1);
	}

	const db = client.db("biometric-diary");
	loginDataDb = db.collection("login_data");

	app.listen(PORT, () => console.log(`Listening on ${ PORT }`));
});


async function matchTypingString(newTypingPattern: string, oldTypingPattern: string, quality = 2)
{
	return await (await fetch("https://api.typingdna.com/match", {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cache-Control': 'no-cache',
			'Authorization': 'Basic ' + Buffer.from(TYPINGDNA_APIKEY + ':' + TYPINGDNA_APISECRET).toString('base64'),
		},
		body: querystring.stringify({
			tp1 : newTypingPattern,
			tp2 : oldTypingPattern,
			quality : quality.toString(),
		})
	})).json();
}


enum LoginStatus {
	success,
	userNotFound,
	accountCreated,
	accountNotCreated,
	failure,
	error
}