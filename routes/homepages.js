var express = require('express');
var config = require('../config/config');
var cache = require('../controllers/cache');
var router = express.Router();
var login = require('../routes/login');
var auth = require('../routes/auth');
var homepages = require('../routes/homepages');
var restler = require('restler');
var cookie = require('cookie');
var _ = require("underscore");
var sanitizeHtml = require("sanitize-html");
var multer = require('multer');
var storage = multer.memoryStorage();
var upload = multer({ storage: storage });
var http = require('http');
var util = require('util');
var moment = require('moment');
var mailgun = require('mailgun-js')({apiKey: config.mailgunapikey, domain: config.mailgundomain});
var zendesk = require('node-zendesk');
var async = require('async');

module.exports = function(app){

  app.get('/', function(req, res, next){
    cache.getXRates(function(xrates){
      if (typeof xrates == 'string'){
        try{
          xrates = JSON.parse(xrates);
        }catch(e){
          xrates = null;
        }
      }
      res.render('static/index',
        {
          sitetitle: config.sitetitle,
          pagetitle: "Home",
          couponrequired: config.couponrequired,
          email: req.signedCookies.email,
          xrates: xrates,
          enableregistration: config.enableregistration,
          recaptchakey: config.recaptcha.key
        }
      );
    })
  })

  app.post('/registerinterest', function(req, res, next){
    if (req.body.email){
      restler.putJson(
        config.apihost + "/document/" + config.admindb + "/interest",
        {"email": req.body.email},
        {headers: { 'apikey': config.adminapikey }}
      ).on('complete', function(result){
        //Send email to support@ldcvia.com
        var message = "<p>A new user has registered interest for keep.works: " + req.body.email + "</p>";
        var subject = "KEEP.WORKS - New Interest Received - " + req.body.email;
        var email = {
          from: 'keep.works support <support@keep.works>',
          to: "support@ldcvia.com",
          subject: subject,
          html: message
        }
        mailgun.messages().send(email, function(error, body){

        })
        //Send email to user
        var message = "<p>Thank you for showing interest in KEEP.WORKS. We will contact you as soon as you are able to register.</p>";
        message += "<p>In the meantime, you can follow us to updates on <a href=\"https://twitter.com/keep_works\">Twitter</a> ";
        message += "and <a href=\"https://www.facebook.com/keepdotworks/\">Facebook</a></p>";
        var subject = "KEEP.WORKS - Thanks for registering your interest";
        var email = {
          from: 'keep.works support <support@keep.works>',
          to: req.body.email,
          subject: subject,
          html: message
        }
        mailgun.messages().send(email, function(error, body){

        })
        //Redirect user to thanks page
        res.redirect("/thanks");
      })
    }else{
      res.redirect('/');
    }
  })

  app.get('/thanks', function(req, res, next){
    res.render('static/thanks',
      {
        sitetitle: config.sitetitle,
        pagetitle: "Thanks for registering your interest"
      }
    );
  })

  app.get('/support', function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      if (!userdetails){
        userdetails = {email: ""};
      }
      res.render('support',
        {
          sitetitle: config.sitetitle,
          pagetitle: 'Support',
          user: userdetails,
          isAdmin: userdetails.isAdmin,
          menuitems: [
            {link: "/selectdatabase", icon: "fa-home", label: "Workspace"},
            {link: "/support", icon: "fa-question", label: "Support", active: true}
          ]
        }
      )
    })
  })

  app.post('/support', function(req, res, next){
    var ticket = {
      "ticket": {
        "requester": {
          "name": req.body.email,
          "email": req.body.email
        },
        "subject": req.body.subject,
        "comment": {
          "body": req.body.question
        }
      }
    }
    var client = zendesk.createClient(config.zendesk);
    client.tickets.create(ticket, function(err, clientreq, result){
      if (err){
        console.log(err);
      }else{
        console.log(JSON.stringify(result));
      }
      cache.getUserDetails(req, function(userdetails){
        if (userdetails){
          res.redirect('/selectdatabase');
        }else{
          res.redirect("/");
        }
      })
    })
  })

  app.get('/supportsuggestion', function(req, res, next){
    try{
      var client = zendesk.createClient({
        username: config.zendesk.username,
        password: config.zendesk.token,
        remoteUri: config.zendesk.remoteUri + "/help_center",
        helpcenter: true
      });
      //console.log(client);
      client.search.searchArticles("keep.works " + req.query.q, function(err, clientreq, result){
        if (err){
          console.log(err);
        }
        res.send(result);
      })
    }catch(e){
      console.log(e);
      res.send({error: "Error getting suggestions"});
    }
  })

  app.get('/terms', function(req, res, next){
    res.render('static/terms',
      {
        sitetitle: config.sitetitle,
        pagetitle: "Terms & Conditions"
      }
    );
  })

  app.get('/sla', function(req, res, next){
    res.render('static/sla',
      {
        sitetitle: config.sitetitle,
        pagetitle: "SLA"
      }
    );
  })

  app.get('/selectdatabase', login.requiresLogin, function(req, res, next) {
    cache.getUserDetails(req, function(userdetails){
      restler.get(
        config.apihost + "/databases",
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(databases, response){
        if (!testValidAPIKeyResponse(databases)){
          res.redirect("/login?redirectto=" + req.url);
        }else{
          if (Array.isArray(databases)){
            databases = databases.sort(dynamicSort("title"));
          }
          if (databases.length == 0){
            res.redirect("/importdatabase")
          }else{
            var dbnames = [];
            async.each(databases, function(database, callback){
              dbnames.push(database.name);
              callback();
            }, function(err){
              restler.postJson(
                config.apihost + "/stats",
                {"databases": dbnames},
                {headers:
                  {'cookie': getCookies(req)}
                }
              ).on('complete', function(stats, resp){
                for(var i=0; i<stats.length; i++){
                  for(var k=0; k<databases.length; k++){
                    if (databases[k].name == stats[i].database){
                      databases[k].count = stats[i].count;
                      if (stats[i].template){
                        databases[k].template = stats[i].template;
                      }
                      break;
                    }
                  }
                }
                res.render('choosedatabase', {
                  sitetitle: config.sitetitle,
                  pagetitle: "Select a database to open",
                  databases: databases,
                  user: userdetails,
                  isAdmin: userdetails.isAdmin,
                  menuitems: [
                    {link: "/selectdatabase", icon: "fa-home", label: "Workspace", active: true},
                    {link: "/importdatabase", icon: "fa-database", label: "Import Database", dataintro: "Click to here to import a new database"},
                    {link: "/newdatabase", icon: "fa-pencil", label: "New Database", dataintro: "Click here to create a new blank database"}
                  ]
                });
              })
            })
          }
        }
      })
    });
  });

  app.get('/importdatabase', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getOrgDetails(userdetails.customerid, function(orgdata){
        if (!orgdata || !orgdata.subscription){
          res.redirect('/registercc');
        }
        var maxdbs = 2;
        for (var i=0; i<config.subscriptions.length; i++){
          if (config.subscriptions[i].id == orgdata.subscription.plan.id){
            maxdbs = config.subscriptions[i].dblimit;
          }
        }
        restler.get(
          config.apihost + "/userdetails",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(userdata, response){
          if (!userdata.email){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            restler.get(
              config.apihost + "/databases",
              {headers:
                {'cookie': getCookies(req)}
              }
            )
            .on('complete', function(databases, response){
              restler.get(
                config.uploadhost + "uploadstatus.xsp?apikey=" + userdata.apikey
              ).on('complete', function(uploadstatus){
                res.render('importdatabase', {
                  sitetitle: config.sitetitle,
                  pagetitle: "Import Database",
                  uploadurl: config.uploadurl,
                  apikey: userdata.apikey,
                  email: userdata.email,
                  isAdmin: userdetails.isAdmin,
                  maxdbs: maxdbs,
                  databases: databases,
                  uploadstatus: uploadstatus,
                  menuitems: [
                    {link: "/selectdatabase", icon: "fa-folder", label: "Workspace"},
                    {link: "/importdatabase", icon: "fa-database", label: "Import Database", active: true},
                    {link: "/newdatabase", icon: "fa-pencil", label: "New Database"}
                  ]
                })
              })
            })
          }
        })
      })
    })
  })

  app.get('/newdatabase', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getOrgDetails(userdetails.customerid, function(orgdata){
        var maxdbs = 2;
        for (var i=0; i<config.subscriptions.length; i++){
          if (config.subscriptions[i].id == orgdata.subscription.plan.id){
            maxdbs = config.subscriptions[i].dblimit;
          }
        }
        restler.get(
          config.apihost + "/userdetails",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(userdata, response){
          if (!userdata.email){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            restler.get(
              config.apihost + "/databases",
              {headers:
                {'cookie': getCookies(req)}
              }
            )
            .on('complete', function(databases, response){
              res.render('newdatabase', {
                sitetitle: config.sitetitle,
                pagetitle: "New Database",
                isAdmin: userdetails.isAdmin,
                maxdbs: maxdbs,
                databases: databases,
                menuitems: [
                  {link: "/selectdatabase", icon: "fa-folder", label: "Workspace"},
                  {link: "/importdatabase", icon: "fa-database", label: "Import Database"},
                  {link: "/newdatabase", icon: "fa-pencil", label: "New Database", active: true}
                ]
              })
            })
          }
        })
      })
    })
  })

  app.get('/checknewdatabase', login.requiresLogin, function(req, res, next){
    var invalidchars = [' ', '$', '@', '£', '#', '%', '^', '&', '*', '(', ')', '\'', '"', '\\', ':', ';', '?', '/', '<', '>', ',', '.', '`', '~'];
    var formattedDbName = req.query.db.toLowerCase();
    for(var i=0; i<invalidchars.length; i++){
      formattedDbName = formattedDbName.split(invalidchars[i]).join('');
    }
    if (formattedDbName != ""){
      restler.get(
        config.apihost + "/database/" + formattedDbName,
        {headers:
          {'cookie': getCookies(req)}
        }
      ).on('complete', function(data, response){
        if(response.statusCode == 404){
          res.send({"valid": true});
        }else{
          res.send({"valid": false});
        }
      })
    }else{
      res.send({"valid": false});
    }
  })

  app.get('/newdatabase/:template/:db', login.requiresLogin, function(req, res, next){
    var invalidchars = [' ', '$', '@', '£', '#', '%', '^', '&', '*', '(', ')', '\'', '"', '\\', ':', ';', '?', '/', '<', '>', ',', '.', '`', '~'];
    var formattedDbName = req.params.db.toLowerCase();
    for(var i=0; i<invalidchars.length; i++){
      formattedDbName = formattedDbName.split(invalidchars[i]).join('');
    }
    if (formattedDbName != ""){
      cache.getUserDetails(req, function(userdetails){
        if (!userdetails.isAdmin){
          res.redirect('/newdatabase');
        }
        cache.getOrgDetails(userdetails.customerid, function(orgdata){
          var maxdbs = 2;
          for (var i=0; i<config.subscriptions.length; i++){
            if (config.subscriptions[i].id == orgdata.subscription.plan.id){
              maxdbs = config.subscriptions[i].dblimit;
            }
          }
          restler.get(
            config.apihost + "/userdetails",
            {headers:
              {'cookie': getCookies(req)}
            }
          )
          .on('complete', function(userdata, response){
            if (!userdata.email){
              res.redirect("/login?redirectto=" + req.url);
            }else{
              restler.get(
                config.apihost + "/databases",
                {headers:
                  {'cookie': getCookies(req)}
                }
              )
              .on('complete', function(databases, response){
                if (databases.length >= maxdbs ){
                  res.redirect('/newdatabase');
                }else{
                  //Create a dummy document and then delete it to reserve the database
                  restler.putJson(
                    config.apihost + "/document/" + formattedDbName + "/reserve",
                    {"placeholder": 1},
                    {headers:
                      {'cookie': getCookies(req)}
                    }
                  ).on('complete', function(response){
                    //Now Delete the reserve collection
                    restler.del(
                      config.apihost + "/collections/" + formattedDbName + "/reserve",
                      {headers:
                        {'cookie': getCookies(req)}
                      }
                    ).on('complete', function(delresponse){
                      //Now update the database with the correct template, and create the FT index
                      restler.postJson(
                        config.apihost + "/database/" + formattedDbName,
                        {
                          indexed: true,
                          template: req.params.template,
                          title: req.query.title
                        },
                        {headers: { 'apikey': config.adminapikey }}
                      ).on('complete', function(){
                        res.redirect('/opendatabase/' + formattedDbName);
                      })
                    })
                  })
                }
              })
            }
          })
        })
      })
    }else{
      res.redirect('/newdatabase');
    }
  })

  app.get('/editdatabase/:db', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, true, function(dbinfo){
        cache.getDbUsers(req, req.params.db, true, function(dbusers){
          if (!testValidAPIKeyResponse(dbusers)){
            res.redirect("/selectdatabase");
          }
          cache.getOrgUsers(req, userdetails.customerid, false, function(orgusers){
            restler.get(
              config.apihost + "/collections/" + req.params.db,
              {headers:
                {'cookie': getCookies(req)}
              }
            ).on('complete', function(collections){
              var colldata = [];
              for (var i=0; i<collections.length; i++){
                colldata.push({label: collections[i].collection + ' - ' + collections[i].count, value: collections[i].count})
              }

              //Now get activity data
              var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              var dates = [];
              var x = new Date();
              for (var i=0; i<6; i++){
                dates.push(new Date(x));
                x.setMonth(x.getMonth() - 1, 1);
              }
              var data = [];
              var ykeys = [];
              async.eachSeries(dates, function(date, callback) {
                var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
                var lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
                var postdata = {
                  "startdate": {
                    "year": firstDay.getFullYear(),
                    "month": firstDay.getMonth(),
                    "day": firstDay.getDate()
                  },
                  "enddate": {
                    "year": lastDay.getFullYear(),
                    "month": lastDay.getMonth(),
                    "day": lastDay.getDate()
                  }
                };
                restler.postJson(
                  config.apihost + '/activity/' + req.params.db + '?count=1',
                  postdata,
                  {headers: { 'apikey': config.adminapikey }}
                ).on('complete', function(res){
                  var dispdate = months[firstDay.getMonth()] + "-" + firstDay.getFullYear();
                  for (var key in res) {
                    var match = false;
                    for (var i = 0; i < ykeys.length; i++) {
                      if (ykeys[i] == key) {
                        match = true;
                      }
                    }
                    if (!match) {
                      ykeys.push(key);
                    }
                  }
                  delete res.docs;
                  res.y = dispdate;
                  data.push({month: res.y, value: res.count});
                  callback()
                })
              }, function(err) {
                if (err) {
                  data = [];
                }else{
                  data = data.reverse();
                }
                var menuitems = [];
                if (dbinfo.template){
                  for(var i=0; i<config.defaultmenus.length; i++){
                    if (config.defaultmenus[i].template == dbinfo.template){
                      menuitems = config.defaultmenus[i].defaultmenu;
                      for (var menuitem=0; menuitem<menuitems.length; menuitem++){
                        menuitems[menuitem].link = menuitems[menuitem].link.replaceAll('__db__', req.params.db);
                        menuitems[menuitem].label = menuitems[menuitem].label.replaceAll('__title__', dbinfo.title);
                      }
                    }
                  }
                }
                res.render(
                  'editdatabase',
                  {
                    sitetitle: config.sitetitle,
                    pagetitle: dbinfo.title + " - Edit Database Settings",
                    dbinfo: dbinfo,
                    db: req.params.db,
                    dbusers: dbusers,
                    orgusers: orgusers,
                    collections: colldata,
                    userdetails: userdetails,
                    isAdmin: userdetails.isAdmin || userdetails.customerid == "via-customer",
                    activity: data,
                    menuitems: menuitems,
                    editdatabase: true
                  }
                )
              });
            })
          })
        })
      })
    })
  })

  app.post('/editdatabase/:db', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      if(userdetails.isAdmin || userdetails.customerid == "via-customer"){
        cache.getDbInfo(req, true, function(dbinfo){
          dbinfo.title = req.body.title;
          dbinfo.template = req.body.template;
          if(dbinfo.meta){
            dbinfo.meta.security = req.body.security=="1"?"1":"0";
          }else{
            dbinfo.meta = {security: req.body.security=="1"?"1":"0"};
          }
          restler.postJson(
            config.apihost + "/database/" + req.params.db,
            dbinfo,
            {headers:
              {'cookie': getCookies(req)}
            }
          ).on('complete', function(response){

            if (req.body.security == "1"){
              enableSecurity(req);
            }else{
              disableSecurity(req)
            }
            res.redirect("/editdatabase/" + req.params.db);
          })
        })
      }else{
        res.redirect('/editdatabase/' + req.params.db);
      }
    })
  })

  app.get('/getdbicon/:db', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, true, function(dbinfo){
        try{
          if (dbinfo.meta && dbinfo.meta.icon){
            var data = dbinfo.meta.icon;
            data = data.substr(22);
            var img = new Buffer(data, 'base64');
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Length', img.length);
            if (req.query.filename){
              res.setHeader('Content-Disposition', 'attachment; filename="' + req.query.filename + '.png"');
            }
            res.end(img);
          }else{
            res.redirect('/images/blank.gif');
          }
        }catch(e){

        }
      })
    })
  })

  app.post('/setdbicon/:db', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      if(userdetails.isAdmin || userdetails.customerid == "via-customer"){
        cache.getDbInfo(req, true, function(dbinfo){
          if(dbinfo.meta){
            dbinfo.meta.icon = req.body.imagedata;
          }else{
            dbinfo.meta = {icon: req.body.imagedata};
          }
          restler.postJson(
            config.apihost + "/database/" + req.params.db,
            dbinfo,
            {headers:
              {'cookie': getCookies(req)}
            }
          ).on('complete', function(response){
            cache.getDbInfo(req, true, function(dbinfo){
              res.redirect("/editdatabase/" + req.params.db);
            })
          })
        })
      }else{
        res.redirect('/editdatabase/' + req.params.db);
      }
    })
  })

  app.get('/deletedbicon/:db', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      if(userdetails.isAdmin || userdetails.customerid == "via-customer"){
        cache.getDbInfo(req, true, function(dbinfo){
          if(dbinfo.meta && dbinfo.meta.icon){
            delete dbinfo.meta.icon;
          }
          restler.postJson(
            config.apihost + "/database/" + req.params.db,
            dbinfo,
            {headers:
              {'cookie': getCookies(req)}
            }
          ).on('complete', function(response){
            cache.getDbInfo(req, true, function(dbinfo){
              res.send({"result": "ok"});
            })
          })
        })
      }else{
        res.send({"result": "error", "message": "Not allowed to modify database settings"});
      }
    })
  })

  function enableSecurity(req){
    var collections = [];
    if (req.body.template == "discussion"){
      collections.push({name: "MainTopic", data: {readers: "Readers", "readers_key": false, "readers_position": 1, "readers_label": "Readers"}});
    }else if(req.body.template == "doclibrary"){
      collections.push({name: "Document", data: {readers: "Readers", "readers_key": false, "readers_position": 1, "readers_label": "Readers"}});
    }else if(req.body.template == "journal"){
      //Do nothing
    }else if(req.body.template == "mail"){
      //Do nothing
    }else if(req.body.template == "personalnab"){
      //Do nothing
    }else if(req.body.template == "teamroom"){
      collections.push({name: "MainTopic", data: {
        readers: "Readers", "readers_key": false, "readers_position": 1, "readers_label": "Readers"
      }});
    }
    if(collections.length > 0){
      async.eachSeries(collections, function(collection, callback){
        restler.postJson(
          config.apihost + "/metadata/" + req.params.db + "/" + collection.name,
          collection.data,
          {
            headers:{'cookie': getCookies(req)}
          }
        ).on('complete', function(result){
          console.log("Enabled Security for " + req.params.db + " - " + collection.name);
          callback();
        })
      }, function(err){

      })
    }
  }

  function disableSecurity(req){
    var collections = [];
    if (req.body.template == "discussion"){
      collections.push({name: "MainTopic", data: {readers: "text", "readers_key": false, "readers_position": 1, "readers_label": "Readers"}});
    }else if(req.body.template == "doclibrary"){
      collections.push({name: "Document", data: {readers: "text", "readers_key": false, "readers_position": 1, "readers_label": "Readers"}});
    }else if(req.body.template == "journal"){
      //Do nothing
    }else if(req.body.template == "mail"){
      //Do nothing
    }else if(req.body.template == "personalnab"){
      //Do nothing
    }else if(req.body.template == "teamroom"){
      collections.push({name: "MainTopic", data: {
        readers: "text", "readers_key": false, "readers_position": 1, "readers_label": "Readers",
        Editors: "text", "Editors_key": false, "Editors_position": 1, "Editors_label": "Editors"
      }});
      collections.push({name: "ParticipantProfile", data: {
        Authors: "text", "Authors_key": false, "Authors_position": 1, "Authors_label": "Authors"
      }});
    }
    if(collections.length > 0){
      async.eachSeries(collections, function(collection, callback){
        restler.postJson(
          config.apihost + "/metadata/" + req.params.db + "/" + collection.name,
          collection.data,
          {
            headers:{'cookie': getCookies(req)}
          }
        ).on('complete', function(result){
          console.log("Disabled Security for " + req.params.db + " - " + collection.name);
          callback();
        })
      }, function(err){

      })
    }
  }

  app.delete('/editdatabase/:db', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      if(userdetails.isAdmin){
        restler.del(
          config.apihost + "/database/" + req.params.db,
          {headers:
            {'cookie': getCookies(req)}
          }
        ).on('complete', function(response){
          res.send({"response": response});
        })
      }
    })
  })

  app.get('/opendatabase/:db', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        if(!dbinfo.template && req.query.template){
          dbinfo.template = req.query.template;
        }
        if (dbinfo.template){
          if (dbinfo.template == "journal"){
            res.redirect('/' + dbinfo.template + '/entries/' + req.params.db);
          }else{
            res.redirect('/' + dbinfo.template + '/index/' + req.params.db);
          }
        }else{
          res.redirect('/editdatabase/' + req.params.db);
        }
      })
    })
  })

  app.get('/reskin', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getOrgDetails(userdetails.customerid, function(orgdata){
        var customcss = "";
        if (orgdata.customcss){
          customcss = orgdata.customcss;
        }
        res.render(
          'reskin',
          {
            sitetitle: config.sitetitle,
            pagetitle: "Re-skin Site",
            userdetails: userdetails,
            isAdmin: userdetails.isAdmin || userdetails.customerid == "via-customer",
            customcss: customcss,
            menuitems: [
              {link: "/selectdatabase", icon: "fa-folder", label: "Workspace"},
              {link: "/importdatabase", icon: "fa-database", label: "Import Database"},
              {link: "/newdatabase", icon: "fa-pencil", label: "New Database"}
            ]
          }
        )
      })
    })
  })

  app.post('/reskin', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getOrgDetails(userdetails.customerid, function(orgdata){
        orgdata.customcss = req.body.customcss;
        restler.postJson(
          config.apihost + "/document/" + config.admindb + "/organisations/" + orgdata.__unid,
          orgdata,
          {headers: { 'apikey': config.adminapikey }}
        ).on('complete', function(response){
          cache.getOrgDetails(userdetails.customerid, function(orgdata){
            res.redirect('/reskin');
          }, true);
        })
      })
    })
  })

  app.get('/custom.css', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getOrgDetails(userdetails.customerid, function(orgdata){
        var customcss = "/* Custom CSS Defined in " + config.apphost + "reskin */\n";
        if (orgdata && orgdata.customcss){
          customcss += orgdata.customcss;
        }
        res.setHeader('Content-Type', 'text/css');
        res.setHeader('Content-Length', customcss.length);
        res.end(customcss);

      })
    })
  })

  function testValidAPIKeyResponse(response){
    if (response == "valid api key required in http headers" || response == 'Invalid API Key In Header' || (response.error && response.error == 'Invalid API Key In Header')){
      return false;
    }else{
      return true;
    }
  }
}

function formatNotesName (input) {
  try{
    input = input.replace("CN=", "");
    input = input.replace("OU=", "");
    input = input.replace("O=", "");
    input = input.replace("C=", "");
  }catch(e){
  }
  return input;
}
String.prototype.replaceAll = function(search, replacement) {
  var target = this;
  return target.replace(new RegExp(search, 'g'), replacement);
};
var getCookies = function(req){
  var cookies = _.map(req.cookies, function(val, key) {
    if(key == "connect.sid"){
      return key + "=" + val['connect.sid'];
    }
  }).join("; ");
  return cookies;
}
function dynamicSort(property) {
    var sortOrder = 1;
    if(property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a,b) {
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}
