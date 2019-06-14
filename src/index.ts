import * as env from 'dotenv';
import * as express from 'express';
import * as session from 'express-session';
import * as redis from 'redis';
import * as connectRedis from 'connect-redis';
import * as rateLimit from 'express-rate-limit';
import * as bodyParser from 'body-parser';
import * as path from 'path';
import * as favicon from 'serve-favicon';
import * as mongodb from 'mongodb';
import fetch from 'node-fetch';
import * as querystring from 'querystring';

env.config();
const PORT = process.env.PORT || 5000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'session secret';
const REDIS_URL = process.env.REDIS_URL || 'localhost:6379';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric-diary';
const MONGODB_DBNAME = process.env.MONGODB_DBNAME || 'biometric-diary';

const TYPINGDNA_APIKEY = process.env.TYPINGDNA_APIKEY;
const TYPINGDNA_APISECRET = process.env.TYPINGDNA_APISECRET;

const TYPINGDNA_MIN_SCORE = 50;

const DEBUG = SESSION_SECRET === 'debug';

let loginDataDb: mongodb.Collection;

const RedisStore = connectRedis(session);
const redisClient = redis.createClient(REDIS_URL);
const redisSessionStore = new RedisStore({
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
app.use(favicon(__dirname + '/images/favicon.ico'));
app.use('/stylesheets', express.static(path.join(__dirname, 'stylesheets')));
app.use('/js', express.static(path.join(__dirname, 'client')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// Rate limit api methods
// @ts-ignore
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: DEBUG ? 1000 : 10,
	message: { error: 'Too many login requests. Please wait 15 minutes and try again.' }
});
app.use('/login', apiLimiter);

app.set('views', __dirname);
app.set('view engine', 'ejs');
app.set('trust proxy', 1);

app.get('/', (req, res) => res.render('pages/index'));

app.post('/login', async (req, res) => {
	if (!req.session)
			return res.status(500).send();
			
	const loginInput = req.body.loginId;
	const typingPattern = req.body.typingPattern;
	
	// Prevent mongo injection attacks
	if (typeof loginInput !== 'string' || loginInput.startsWith('$'))
		return res.status(401).send({ loginStatus: LoginStatus.failure });

	// check if user exists
	let userLoginData;
	try 
	{
		userLoginData = await loginDataDb.findOne({ _id: loginInput.toLowerCase() });
	}
	catch (err)
	{
		console.error('Error attempting to find user id in db in login call:');
		console.error(err);
        return res.status(500).send();
	}

	if (!userLoginData || !userLoginData.id_patterns || userLoginData.id_patterns.length < 2)
	{
		req.session.key = loginInput;
		req.session.loginQuality = 0;
		req.session.typingPattern = typingPattern;
		return res.send({ loginStatus: LoginStatus.userNotFound });
	}

	let recentIdLoginPatterns = userLoginData.id_patterns[userLoginData.id_patterns.length - 1];
	// TODO: calling TypingDNA's match with more than one previous pattern results in 445, invalid typing pattern.
	// 		 are the patterns not being concatenated correctly?
	// for (let i = userLoginData.id_patterns.length - 2; i >= 0 && i > userLoginData.id_patterns.length - 5; i--)
	// 	recentIdLoginPatterns += ';' + userLoginData.id_patterns;

	let matchResult;
	try
	{
		if (DEBUG)
			matchResult = { status: 200, score: 100 }
		else
			matchResult = await matchTypingString(typingPattern, recentIdLoginPatterns);
	}
	catch(err)
	{
		console.error('Error attempting to match typing string in a login call:');
		console.error(err);
		return res.status(500).send({ loginStatus: LoginStatus.error });
	}

	if (matchResult.status != 200)
	{
		console.error(`Match typing string in login call returned ${matchResult.status}:`);
		console.error(`${matchResult.name}:${matchResult.message}`);
		return res.status(500).send({ loginStatus: LoginStatus.error });
	}
	else if (matchResult.score < TYPINGDNA_MIN_SCORE)
	{
		return res.status(401).send({ loginStatus: LoginStatus.failure });
	}

	// Successful login, save new typing pattern to account
	try
	{
		const userLoginData = await loginDataDb.updateOne({ _id: loginInput.toLowerCase() }, { $push: { id_patterns: typingPattern }});
	}
	catch(err)
	{
		console.error('Error attempting to save new account to db in login call:');
		console.error(err);
		return res.status(500).send({ loginStatus: LoginStatus.error });
	}

	req.session.key = loginInput;
	req.session.successfulLogin = true;
	req.session.loginQuality = matchResult.score;
	return res.send({ loginStatus: LoginStatus.success });
});

app.post('/create-account', async (req, res) => {
	if (!req.session)
			return res.status(500).send();
			
	const typingPattern = req.body.typingPattern;
	const previousTypingPattern = req.session.typingPattern;

	let matchResult;
	try
	{
		if (DEBUG)
			matchResult = { status: 200, score: 100 }
		else
			matchResult = await matchTypingString(typingPattern, previousTypingPattern);
	}
	catch(err)
	{
		console.error('Error attempting to match typing string in a create-account call:');
		console.error(err);
		return res.status(500).send({ loginStatus: LoginStatus.error });
	}

	if (matchResult.status != 200)
	{
		console.error(`Match typing string in a create-account call returned ${matchResult.status}:`);
		console.error(`${matchResult.name}:${matchResult.message}`);
		return res.status(500).send({ loginStatus: LoginStatus.error });
	}
	else if (matchResult.score < TYPINGDNA_MIN_SCORE)
	{
		return res.status(401).send({ loginStatus: LoginStatus.failure });
	}
	
	// Successful initial username creation, save new account
	try
	{
		const userLoginData = await loginDataDb.insertOne({ 
				_id: req.session.key.toLowerCase(),
				id_patterns: [previousTypingPattern, typingPattern],
			});
	}
	catch(err)
	{
		console.error('Error attempting to save new account to db in create-account call:');
		console.error(err);
		return res.status(500).send({ loginStatus: LoginStatus.error });
	}

	req.session.successfulLogin = true;
	req.session.loginQuality = 1;
	return res.send({ loginStatus: LoginStatus.success });
});

app.post('/logout', async (req, res) => {
	if (!req.session)
			return res.status(500).send();

	req.session.destroy(() => res.send());
});

// set up mongodb before starting app.listening
const mongodbClient = mongodb.MongoClient;
mongodbClient.connect(MONGODB_URI, { useNewUrlParser: true }, (err, client) =>
{
	if (err)
	{
		console.error(err);
		client.close();
		process.exit(1);
	}

	const db = client.db(MONGODB_DBNAME);
	loginDataDb = db.collection('login_data');

	app.listen(PORT, () => console.log(`Listening on ${ PORT }`));
});


async function matchTypingString(newTypingPattern: string, oldTypingPattern: string, quality = 2)
{
	return await (await fetch('https://api.typingdna.com/match', {
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