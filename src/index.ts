import * as express from "express";
import * as path from "path";
import * as favicon from "serve-favicon";

const PORT = process.env.PORT;

express.static("images");
express.static("stylesheets");

const app = express();
app.use(favicon(__dirname + "/images/favicon.ico"));
app.use(express.static(path.join(__dirname, "public")));
app.set("views", __dirname);
app.set("view engine", "ejs");
app.get("/", (req, res) => res.render("pages/index"));
app.listen(PORT, () => console.log(`Listening on ${ PORT }`));
