require('dotenv').config();
const express = require('express')
const bodyParser = require('body-parser')
const logger = require('./logger');
const app = express();

// init logger
const myconsole = new logger.transports.Console();
logger.add(myconsole);
logger.level = process.env.LOG_LEVEL;

app.use(bodyParser.json());

const handler = require('./handler');

// route
app.post('/handle', handler);

app.listen(process.env.PORT, () => logger.log('info', 'server started'));