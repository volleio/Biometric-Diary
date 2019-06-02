import * as env from "dotenv";
import * as express from "express";
import * as session from "express-session";
import * as bodyParser from "body-parser";
import * as path from "path";
import * as favicon from "serve-favicon";

env.config();
const PORT = process.env.PORT || 5000;
const SESSION_SECRET = process.env.SESSION_SECRET || "session secret";

let sess;

const app = express();
app.use(session({ secret: SESSION_SECRET, saveUninitialized: false, resave: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(favicon(__dirname + "/images/favicon.ico"));
app.use("/stylesheets", express.static(path.join(__dirname, "stylesheets")));
app.use("/js", express.static(path.join(__dirname, "client")));

app.set("views", __dirname);
app.set("view engine", "ejs");

app.get("/", (req, res) => res.render("pages/index"));

app.post("/login", (req, res) => 
	{
		sess = (req as any).session;
		const loginInput = req.body.loginId;
		const typingPattern = req.body.typingPattern;
		
		if (true)
		{
			sess.loginId = loginInput;

			const returnData = { loginId: loginInput };
			res.send(returnData);
		}
		else
		{
			res.status(401).send({ error: "Authentication failed." });
		}
	});

app.listen(PORT, () => console.log(`Listening on ${ PORT }`));
