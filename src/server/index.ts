import * as env from "dotenv";
import * as express from "express";
import * as favicon from "serve-favicon";

env.config();
const PORT = process.env.PORT || 5000;

express.static("images");
express.static("stylesheets");

const app = express();
app.use(favicon(__dirname + "/images/favicon.ico"));
app.use("/", express.static("stylesheets"));
app.set("views", __dirname);
app.set("view engine", "ejs");
app.get("/", (req, res) => res.render("pages/index"));
app.listen(PORT, () => console.log(`Listening on ${ PORT }`));
