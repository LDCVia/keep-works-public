var config = require('./config/config');
var express = require('express');
var helmet = require('helmet')
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var fs=require("fs");
var forceSsl = require('force-ssl-heroku');
var app = express();


app.use(helmet())

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
console.log("LDC VIA API host: " + config.apihost);
app.set('recaptcha-key', config.recaptcha.key);
app.set('recaptcha-secret', config.recaptcha.secret);

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json({limit: '16mb'}));
app.use(bodyParser.urlencoded({ extended: false, limit: '16mb' }));
app.use(cookieParser("supersecret"));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/bower_components', express.static(path.join(__dirname, '/bower_components')));


/* At the top, with other redirect methods before other routes */
app.use(forceSsl);
require('./routes/login.js');
require('./routes/auth.js')(app);
require('./routes/homepages.js')(app);
require('./routes/apps/custom.js')(app);
require('./routes/apps/discussion.js')(app);
require('./routes/apps/doclibrary.js')(app);
require('./routes/apps/journal.js')(app);
require('./routes/apps/mail.js')(app);
require('./routes/apps/personalnab.js')(app);
require('./routes/apps/teamroom.js')(app);

app.locals.version = require('./package').version;
app.locals.nodeenv = process.env.NODE_ENV || 'beta';
app.locals.moment = require('moment');
app.locals.config = config;
app.locals.formatNotesName = function (input) {
  try{
    input = input.replace("CN=", "");
    input = input.replace("OU=", "");
    input = input.replace("O=", "");
    input = input.replace("C=", "");
  }catch(e){
  }
  return input;
}
app.locals.sanitizeHtml = require('sanitize-html');
app.locals.sanitiseFieldLabel = function(input){
  try{
    input = input.replace("__", "");
  }catch(e){
  }
  return input;
}


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      sitetitle: config.sitetitle,
      pagetitle: "Error",
      menuitems: [
        {link: "/selectdatabase", icon: "fa-folder", label: "Workspace"}
      ],
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    sitetitle: config.sitetitle,
    pagetitle: "Error",
    menuitems: [
      {link: "/selectdatabase", icon: "fa-folder", label: "Workspace"}
    ],
    message: err.message,
    error: err
  });
});

module.exports = app;
