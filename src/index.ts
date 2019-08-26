import * as env from 'dotenv';
env.config();
import * as bodyParser from 'body-parser';
import * as connectRedis from 'connect-redis';
import * as crypto from 'crypto';
import * as express from 'express';
import * as rateLimit from 'express-rate-limit';
import * as session from 'express-session';
import * as mongodb from 'mongodb';
import nodeFetch from 'node-fetch';
import * as path from 'path';
import * as querystring from 'querystring';
import * as redis from 'redis';
import * as favicon from 'serve-favicon';

class BiometricDiaryServer
{
	/**
	 * Static vars
	 */
	private static PORT = process.env.PORT || 5000;
	private static SESSION_SECRET = process.env.SESSION_SECRET || 'session secret';
	private static REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
	private static MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric-diary';
	private static MONGODB_DBNAME = process.env.MONGODB_DBNAME || 'biometric-diary';
	
	private static TYPINGDNA_APIKEY = process.env.TYPINGDNA_APIKEY;
	private static TYPINGDNA_APISECRET = process.env.TYPINGDNA_APISECRET;
	
	private static TYPINGDNA_MIN_SCORE = 50; // 0 - 100
	private static MIN_FIRST_NOTE_LENGTH = 150; // # of characters
	
	private static DEBUG = BiometricDiaryServer.SESSION_SECRET === 'debug';
	
	private static THEME = process.env.THEME || '';
	private static ALLOWED_THEMES = ['alt-theme'];

	private static NOTES_REQUEST_LIMIT = 2;

	/**
	 * Member vars
	 */
	private app: express.Express;
	private redisSessionStore: connectRedis.RedisStore;
	private loginDataDb: mongodb.Collection;

	constructor()
	{
		this.Initialize();
	}

	private Initialize(): void
	{		
		const redisStore = connectRedis(session);
		const redisClient = redis.createClient(BiometricDiaryServer.REDIS_URL);
		this.redisSessionStore = new redisStore({
			client: redisClient,
			ttl: 3600,
		});

		this.app = express();
		this.app.use(session({
			secret: BiometricDiaryServer.SESSION_SECRET, 
			store: this.redisSessionStore,
			saveUninitialized: false, 
			resave: true,
		}));
		
		this.app.use(bodyParser.json());
		this.app.use(bodyParser.urlencoded({ extended: true }));
		this.app.use(favicon(`${__dirname}/images/favicon.ico`));
		this.app.use('/stylesheets', express.static(path.join(__dirname, 'stylesheets')));
		this.app.use('/js', express.static(path.join(__dirname, 'client')));
		this.app.use('/images', express.static(path.join(__dirname, 'images')));

		// Rate limit api methods
		// @ts-ignore
		const apiLimiter = rateLimit({
			windowMs: 15 * 60 * 1000, // 15 minutes
			max: BiometricDiaryServer.DEBUG ? 1000 : 10,
			message: { error: 'Too many login requests. Please wait 15 minutes and try again.' },
		});
		this.app.use('/login', apiLimiter);
		
		this.app.set('views', __dirname);
		this.app.set('view engine', 'ejs');
		this.app.set('trust proxy', 1);
		
		this.app.get('/', (req, res) => 
		{
			let theme = BiometricDiaryServer.THEME;
			if (req.query.theme && typeof(req.query.theme) === 'string' && BiometricDiaryServer.ALLOWED_THEMES.includes(req.query.theme))
				theme = req.query.theme;

			res.render('pages/index', { theme });
		});

		this.SetupRouting();

		// set up mongodb before starting this.app.listening
		const mongodbClient = mongodb.MongoClient;
		mongodbClient.connect(BiometricDiaryServer.MONGODB_URI, { useNewUrlParser: true }, (err, client) =>
		{
			if (err)
			{
				console.error(err);
				client.close();
				process.exit(1);
			}

			const db = client.db(BiometricDiaryServer.MONGODB_DBNAME);
			this.loginDataDb = db.collection('user_data');

			this.app.listen(BiometricDiaryServer.PORT, () => console.log(`Listening on ${ BiometricDiaryServer.PORT }`));

		});

	}

	private SetupRouting(): void
	{
		this.app.post('/login', async (req, res) => this.OnLoginReq(req, res));
		this.app.post('/authenticate-note', async (req, res) => this.OnAuthenticateNoteReq(req, res));
		this.app.post('/create-account', async (req, res) => this.OnCreateAccountReq(req, res));
		this.app.post('/get-notes', async (req, res) => this.OnNotesReq(req, res));
		this.app.post('/save-notes', async (req, res) => this.OnSaveNotesReq(req, res));
		this.app.post('/logout', async (req, res) => this.OnLogoutReq(req, res));
	}

	private async OnLoginReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session)
			return res.status(500).send(); // Is redis running?
				
		const loginInput = req.body.loginId;
		const typingPattern = req.body.typingPattern;
		
		// Prevent mongo injection attacks
		if (typeof loginInput !== 'string' || loginInput.startsWith('$'))
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.failure });
		
		// check if user exists
		let userData;
		try 
		{
			userData = await this.loginDataDb.findOne({ _id: loginInput.toLowerCase() });
		}
		catch (err)
		{
			console.error('Error attempting to find user id in db in login call:');
			console.error(err);
			return res.status(500).send();
		}
		
		if (!userData || !userData.id_patterns || userData.id_patterns.length < 2)
		{
			req.session.key = loginInput;
			req.session.loginQuality = 1;
			req.session.typingPattern = typingPattern;
			return res.send({ authenticationStatus: AuthenticationStatus.userNotFound });
		}
		
		const recentIdLoginPatterns = userData.id_patterns[userData.id_patterns.length - 1];
		// TODO: calling TypingDNA's match with more than one previous pattern results in 445, invalid typing pattern.
		// 		 are the patterns not being concatenated correctly?
		// for (let i = userData.id_patterns.length - 2; i >= 0 && i > userData.id_patterns.length - 5; i--)
		// 	recentIdLoginPatterns += ';' + userData.id_patterns;
		
		let matchResult;
		try
		{
			if (BiometricDiaryServer.DEBUG)
				matchResult = { status: 200, score: 100 };
			else
				matchResult = await this.MatchTypingString(typingPattern, recentIdLoginPatterns);
		}
		catch (err)
		{
			console.error('Error attempting to match typing string in a login call:');
			console.error(err);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}
		
		if (matchResult.status !== 200)
		{
			console.error(`Match typing string in login call returned ${matchResult.status}:`);
			console.error(`${matchResult.name}:${matchResult.message}`);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}
		
		if (matchResult.score < BiometricDiaryServer.TYPINGDNA_MIN_SCORE)
			return res.send({ authenticationStatus: AuthenticationStatus.failure });
		
		// Successful login, save new typing pattern to account
		try
		{
			if (typingPattern != null)
				await this.loginDataDb.updateOne({ _id: loginInput.toLowerCase() }, { $push: { id_patterns: typingPattern } });
		}
		catch (err)
		{
			console.error('Error attempting to save new account to db in login call:');
			console.error(err);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}
		
		req.session.key = loginInput;
		req.session.loginQuality = matchResult.score;
		
		// TODO: get rid of this
		// Cache user's data in session so that we don't have to hit the db on later requests
		req.session.userData = userData;
		
		return res.send({ authenticationStatus: AuthenticationStatus.success });
	}
	
	private async OnAuthenticateNoteReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session || !req.session.key || req.session.loginQuality < 1 ||
			!req.body.typingPattern || !req.body.noteContents)
			return res.status(500).send();
				
		const typingPattern = req.body.typingPattern;
		const noteContents = req.body.noteContents;
		const userData = req.session.userData;

		// TODO: refactor this and the block below into a single db update/value return method
		if (!userData.note_patterns || userData.note_patterns.length < 1)
		{
			if (noteContents.length >= BiometricDiaryServer.MIN_FIRST_NOTE_LENGTH)
			{
				// Save the very first note taken's typing pattern and contents, then return a successful authentication
				try
				{
					await this.loginDataDb.updateOne({ _id: req.session.key.toLowerCase() }, { $push: { note_pattern: typingPattern } });
				}
				catch (err)
				{
					console.error('Error attempting to save note taking pattern to db in authenticate-note call:');
					console.error(err);
					return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
				}

				const noteData = {
					Id: this.GenerateUuid(),
					Content: noteContents,
					Index: -1,
					DateCreated: new Date().valueOf(),
					DateUpdated: new Date().valueOf(),
				} as INote;

				try
				{
					await this.SaveNote(req.session.key, noteData);
				}
				catch (err)
				{
					console.error('Error attempting to save note contents to db in authenticate-note call:');
					console.error(err);
					return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
				}
				
				req.session.loginQuality = 2;		
				return res.send({ 
					noteData,
					authenticationStatus: AuthenticationStatus.success,
					authenticationProgress: 1,
				});
			}

			return res.send({ 
				authenticationStatus: AuthenticationStatus.failure,
				authenticationProgress: noteContents.length / BiometricDiaryServer.MIN_FIRST_NOTE_LENGTH,
			});
		}

		const recentNoteTakingPatterns = userData.note_patterns[userData.note_patterns.length - 1];
		// TODO: calling TypingDNA's match with more than one previous pattern results in 445, invalid typing pattern.
		// 		 are the patterns not being concatenated correctly?
		// for (let i = userData.note_patterns.length - 2; i >= 0 && i > userData.note_patterns.length - 5; i--)
		// 	recentIdLoginPatterns += ';' + userData.note_patterns;

		let matchResult;
		try
		{
			if (BiometricDiaryServer.DEBUG)
				matchResult = { status: 200, score: 100 };
			else
				matchResult = await this.MatchTypingString(typingPattern, recentNoteTakingPatterns);
		}
		catch (err)
		{
			console.error('Error attempting to match typing string in an authenticate-note call:');
			console.error(err);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}

		if (matchResult.status !== 200)
		{
			console.error(`Match typing string in login call returned ${matchResult.status}:`);
			console.error(`${matchResult.name}:${matchResult.message}`);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}
		
		if (matchResult.score < BiometricDiaryServer.TYPINGDNA_MIN_SCORE)
		{
			return res.send({ 
				authenticationStatus: AuthenticationStatus.failure,
				authenticationProgress: BiometricDiaryServer.TYPINGDNA_MIN_SCORE / matchResult.score,
			});
		}

		// Successful authentication, save the new typing pattern to the user's account
		try
		{
			await this.loginDataDb.updateOne({ _id: req.session.key.toLowerCase() }, { $push: { note_pattern: typingPattern } });
		}
		catch (err)
		{
			console.error('Error attempting to save note taking pattern to db in authenticate-note call:');
			console.error(err);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}

		// Then save the first note's contents to the user's account
		const noteData = {
			Id: this.GenerateUuid(),
			Index: 1,
			Content: noteContents,
			DateCreated: new Date().valueOf(),
			DateUpdated: new Date().valueOf(),
		} as INote;

		try
		{
			await this.SaveNote(req.session.key, noteData);
		}
		catch (err)
		{
			console.error('Error attempting to save note contents to db in authenticate-note call:');
			console.error(err);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}

		req.session.loginQuality = 2;
		return res.send({ 
			noteData,
			authenticationStatus: AuthenticationStatus.success,
			authenticationProgress: 1,
		});
	}

	private async OnCreateAccountReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session)
			return res.status(500).send();
				
		const typingPattern = req.body.typingPattern;
		const previousTypingPattern = req.session.typingPattern;

		let matchResult;
		try
		{
			if (BiometricDiaryServer.DEBUG)
				matchResult = { status: 200, score: 100 };
			else
				matchResult = await this.MatchTypingString(typingPattern, previousTypingPattern);
		}
		catch (err)
		{
			console.error('Error attempting to match typing string in a create-account call:');
			console.error(err);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}

		if (matchResult.status !== 200)
		{
			console.error(`Match typing string in a create-account call returned ${matchResult.status}:`);
			console.error(`${matchResult.name}:${matchResult.message}`);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}
		
		if (matchResult.score < BiometricDiaryServer.TYPINGDNA_MIN_SCORE)
			return res.send({ authenticationStatus: AuthenticationStatus.failure });

		// Successful initial username creation, save new account
		try
		{
			await this.loginDataDb.insertOne({ 
				_id: req.session.key.toLowerCase(),
				id_patterns: [previousTypingPattern, typingPattern],
			});
		}
		catch (err)
		{
			console.error('Error attempting to save new account to db in create-account call:');
			console.error(err);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}

		req.session.loginQuality = 1;
		return res.send({ authenticationStatus: AuthenticationStatus.success });
	}

	private async OnNotesReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session || req.session.loginQuality < 2 || 
			!req.body.beforeIndex || typeof(req.body.beforeIndex) !== 'number')
			return res.status(500).send();

		let retrievedNotesCursor; 
		try 
		{
			retrievedNotesCursor = await this.loginDataDb.aggregate([{ 
				$project: { 
					'notes._id': 1, 
					'notes.index': 1, 
					'notes.date_created': 1, 
					'notes.date_updated': 1, 
					'notes.content': 1, 
				} }, { 
					$unwind: '$notes',
				}, {
					$sort: { 'notes.index': -1 },
				}, { 
					$match: { 
					   'notes.index' : { $lt: req.body.beforeIndex },
					},
				}, {
					$limit: BiometricDiaryServer.NOTES_REQUEST_LIMIT,
				},
			]);

			const retrievedData = await retrievedNotesCursor.toArray();
			const retrievedNotes: INote[] = [];
			retrievedData.forEach(element => retrievedNotes.push({
				Id: element.notes._id,
				Index: element.notes.index,
				Content: element.notes.content,
				DateCreated: element.notes.date_created,
				DateUpdated: element.notes.date_updated,
			} as INote));

			const notesResponse: INotesRequest = {
				retrievedNotes,
				noAdditionalNotes: retrievedNotes.length < BiometricDiaryServer.NOTES_REQUEST_LIMIT,
			};

			return res.send(notesResponse);
		}
		catch (err)
		{
			console.error('Error attempting to retrieve user\'s notes from db in get-notes call:');
			console.error(err);
			return res.status(500).send();
		}
	}

	private async OnSaveNotesReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session || !req.session.key || req.session.loginQuality < 2)
			return res.status(500).send();

		const notesToSave: INote[] = req.body.notesToSave;
		const savingNotes: Promise<any>[] = [];
		notesToSave.forEach((noteData) => 
		{
			savingNotes.push(this.SaveNote(req.session.key, noteData, false));
		});

		await Promise.all(savingNotes);

		return res.send();
	}

	private async OnLogoutReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session)
			return res.status(500).send();

		req.session.destroy(() => res.send());
	}

	private async MatchTypingString(newTypingPattern: string, oldTypingPattern: string, quality = 2): Promise<any>
	{
		return await (await nodeFetch('https://api.typingdna.com/match', {
			method: 'POST',
			headers: {
				'Content-Type': 'this.application/x-www-form-urlencoded',
				'Cache-Control': 'no-cache',
				Authorization: `Basic ${Buffer.from(`${BiometricDiaryServer.TYPINGDNA_APIKEY}:${BiometricDiaryServer.TYPINGDNA_APISECRET}`).toString('base64')}`,
			},
			body: querystring.stringify({
				tp1 : newTypingPattern,
				tp2 : oldTypingPattern,
				quality : quality.toString(),
			}),
		})).json();
	}

	private async SaveNote(userId: string, noteData: INote, firstNote = false): Promise<any>
	{
		// Check if the note exists already
		const existingNote = await this.loginDataDb.findOne({ 
			_id: userId.toLowerCase(),
			notes: { _id: noteData.Id },
		}, { projection: { notes: 1 } });

		let highestIndex = 0;
		if (!firstNote || noteData.Index === -1)
		{
			const highestIndexCursor = await this.loginDataDb.aggregate([
				{ $project: { 
					'notes.index': 1, 
				} }, { 
					$unwind: '$notes',
				}, { 
					$sort: { 'notes.index': -1 },
				}, { 
					$limit: 1,
				},
			]);

			highestIndex = (await highestIndexCursor.toArray())[0].notes.index;
		}
		
		if (noteData.Index === -1 || firstNote)
			noteData.Index = highestIndex + 1;

		if (!existingNote)
		{
			// Insert new note
			await this.loginDataDb.updateOne({ _id: userId.toLowerCase() }, { $push: { 
				notes: {
					_id: noteData.Id,
					index: noteData.Index,
					date_created: noteData.DateCreated,
					date_updated: noteData.DateUpdated,
					content: noteData.Content,
				},
			}});
		}
		else
		{
			// Update existing note
			await this.loginDataDb.updateOne({ 
				_id: userId.toLowerCase(), 
				notes: { _id: noteData.Id }, 
			}, { 
				notes: {
					_id: noteData.Id,
					index: noteData.Index,
					date_updated: noteData.DateUpdated,
					content: noteData.Content,
				},
			});
		}
	}

	// From https://gist.github.com/jed/982883
	private GenerateUuid(): string
	{
		return (([1e7] as any + -1e3 + -4e3 + -8e3 + -1e11) as string).replace(/[018]/g, c =>
			(c as any ^ crypto.randomBytes(1)[0] % 16 >> (c as any) / 4).toString(16),
		);
	}
}

// Start Server
const biometricDiaryServer = new BiometricDiaryServer();

interface INote {
	Id: string;
	Index: number;
	Content: string;
	DateCreated: number;
	DateUpdated: number;
}

interface INotesRequest {
	retrievedNotes: INote[];
	noAdditionalNotes: boolean;
}

enum AuthenticationStatus {
	success,
	userNotFound,
	accountCreated,
	accountNotCreated,
	failure,
	error,
}
