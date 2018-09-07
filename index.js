const express = require('express');
const path = require('path');
const PORT = process.env.PORT || 5000;

const favicon = require('express-favicon');



express()
	.static('images')
	.static('stylesheets')
	.use(favicon(__dirname + '/images/favicon.ico'))
	.use(express.static(path.join(__dirname, 'public')))
	.set('views', __dirname)
	.set('view engine', 'ejs')
	.get('/', (req, res) => res.render('pages/index'))
	.listen(PORT, () => console.log(`Listening on ${ PORT }`));
