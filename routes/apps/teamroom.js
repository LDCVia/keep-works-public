var express = require('express');
var router = express.Router();
var config = require('../../config/config');
var cache = require('../../controllers/cache');
var login = require('../../routes/login');
var auth = require('../../routes/auth');
var restler = require('restler');
var cookie = require('cookie');
var _ = require("underscore");
var sanitizeHtml = require("sanitize-html");
var multer = require('multer');
var storage = multer.memoryStorage();
var upload = multer({
  storage: storage
});
var http = require('http');
var util = require('util');
var moment = require('moment');
var async = require('async');
var validator = require('validator');
var mailgun = require('mailgun-js')({
  apiKey: config.mailgunapikey,
  domain: config.mailgundomain
});

module.exports = function(app) {
  app.get('/teamroom/index/:db', login.requiresLogin, function(req, res, next) {
    renderIndex(req, res, 1);
  })

  app.get('/teamroom/index/:db/:pageno', login.requiresLogin, function(req, res, next) {
    renderIndex(req, res, req.params.pageno);
  })

  function renderIndex(req, res, pageno){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/collections/" + req.params.db + "/MainTopic?sortdesc=__created&count=" + config.count + "&start=" + (config.count * (pageno - 1)), {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.next_page) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              var nextpage = parseInt(pageno, 10) + 1;
              var previouspage = pageno - 1;
              var pages = Math.ceil((data.count / config.count));
              if (pages == 0) {
                pages = 1;
              }
              if (nextpage > pages) {
                nextpage = pages;
              }
              if (previouspage < 1) {
                previouspage = 1;
              }
              res.render('teamroom/index', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title,
                  active: true
                }, {
                  link: "/teamroom/newtopic/" + req.params.db,
                  icon: "fa-pencil",
                  label: "New Topic",
                  dataintro: "Click the New Topic button to add a new topic"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members"
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams"
                }, {
                  link: "/teamroom/events/" + req.params.db,
                  icon: "fa-calendar",
                  label: "Events"
                }],
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                db: req.params.db,
                data: data,
                pageno: pageno,
                pages: pages,
                nextpage: nextpage,
                previouspage: previouspage
              });
            }
          })
      })
    })
  }

  app.get('/teamroom/document/:db/:unid', login.requiresLogin, function(req, res, next) {
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/document/" + req.params.db + "/MainTopic/" + req.params.unid + "?all", {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.__unid) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              restler.get(
                  config.apihost + "/responses/" + req.params.db + "/MainTopic/" + req.params.unid + "?expand=true&threaded=true", {
                    headers: {
                      'cookie': getCookies(req)
                    }
                  }
                )
                .on('complete', function(data2, response) {
                  res.render('teamroom/document', {
                    template: 'teamroom',
                    sitetitle: config.sitetitle,
                    pagetitle: dbinfo.title,
                    dbicon: '/getdbicon/' + req.params.db,
                    breadcrumbs: [{
                      title: dbinfo.title,
                      link: "/teamroom/index/" + dbinfo.db
                    }, {
                      title: data.Subject
                    }],
                    menuitems: [{
                      link: "/teamroom/index/" + req.params.db,
                      icon: "fa-home",
                      label: dbinfo.title
                    }, {
                      link: "/teamroom/newtopic/" + req.params.db,
                      icon: "fa-pencil",
                      label: "New Topic",
                      dataintro: "Click the New Topic button to add a new topic"
                    }, {
                      link: "/teamroom/participants/" + req.params.db,
                      icon: "fa-user",
                      label: "Team Members"
                    }, {
                      link: "/teamroom/subteams/" + req.params.db,
                      icon: "fa-group",
                      label: "Subteams"
                    }, {
                      link: "/teamroom/events/" + req.params.db,
                      icon: "fa-calendar",
                      label: "Events"
                    }],
                    dbinfo: dbinfo,
                    isAdmin: userdetails.isAdmin,
                    db: req.params.db,
                    document: data,
                    responses: data2.data
                  })
                })
            }
          })
      })
    })
  })

  app.get('/teamroom/documentedit/:db/:unid', login.requiresLogin, function(req, res, next) {
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        cache.getCategories(req, "MainTopic", "Categories", function(categories) {
          restler.get(
              config.apihost + "/document/" + req.params.db + "/MainTopic/" + req.params.unid + "?all", {
                headers: {
                  'cookie': getCookies(req)
                }
              }
            )
            .on('complete', function(data, response) {
              renderNewTopic(req, res, data);
            })
        })
      })
    })
  })

  app.get('/teamroom/documentdelete/:db/:unid', login.requiresLogin, function(req, res, next) {
    cache.getDbInfo(req, false, function(dbinfo) {
      restler.del(
          config.apihost + "/document/" + req.params.db + "/MainTopic/" + req.params.unid, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function() {
          res.send('/teamroom/index/' + req.params.db);
        })
    })
  })

  app.get('/teamroom/newtopic/:db', login.requiresLogin, function(req, res, next) {
    renderNewTopic(req, res, {
      __unid: "new",
      DocType: "Discussion",
      AIPriority: "3",
      Subject: "",
      Categories: [],
      NewCategories: "",
      Body__parsed: "",
      Location: "",
      Duration: ""
    });
  })

  function renderNewTopic(req, res, seeddata, error) {
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        cache.getCategories(req, "MainTopic", "Categories", function(categories) {
          cache.getCategories(req, "MainTopic", "DocType", function(doctypes) {
            var requireddoctypes = ["Action Item", "Discussion", "Meeting", "Reference"];
            for (var i=0; i<requireddoctypes.length; i++){
              if(doctypes.indexOf(requireddoctypes[i]) == -1){
                doctypes.push(requireddoctypes[i]);
              }
            }
            cache.getCategories(req, "Event", "Subject", function(milestones) {
              cache.getCategories(req, "Subteam", "STName", function(subteams) {
                cache.getCategories(req, "ParticipantProfile", "Who", function(participants) {
                  res.render('teamroom/documentedit', {
                    template: 'teamroom',
                    sitetitle: config.sitetitle,
                    pagetitle: dbinfo.title,
                    dbicon: '/getdbicon/' + req.params.db,
                    dbinfo: dbinfo,
                    isAdmin: userdetails.isAdmin,
                    breadcrumbs: [{
                      title: dbinfo.title,
                      link: "/teamroom/index/" + dbinfo.db
                    }, {
                      title: "New Topic"
                    }],
                    menuitems: [{
                      link: "/teamroom/index/" + req.params.db,
                      icon: "fa-home",
                      label: dbinfo.title
                    }, {
                      link: "/teamroom/newtopic/" + req.params.db,
                      icon: "fa-pencil",
                      label: "New Topic", active: true
                    }, {
                      link: "/teamroom/participants/" + req.params.db,
                      icon: "fa-user",
                      label: "Team Members"
                    }, {
                      link: "/teamroom/subteams/" + req.params.db,
                      icon: "fa-group",
                      label: "Subteams"
                    }, {
                      link: "/teamroom/events/" + req.params.db,
                      icon: "fa-calendar",
                      label: "Events"
                    }],
                    db: req.params.db,
                    document: seeddata,
                    CategoryOptions: categories,
                    DocTypes: doctypes,
                    Milestones: milestones,
                    Subteams: subteams,
                    Participants: participants,
                    priorities: [{
                      label: "1 (Highest)",
                      value: "1"
                    }, {
                      label: "2",
                      value: "2"
                    }, {
                      label: "3",
                      value: "3"
                    }, {
                      label: "4",
                      value: "4"
                    }, {
                      label: "5 (Lowest)",
                      value: "5"
                    }],
                    error: error
                  })
                })
              })
            })
          })
        })
      })
    })
  }

  app.post('/teamroom/documentedit/:db/:unid', upload.single('upload'), function(req, res, next) {
    var url = config.apihost + "/document/" + req.params.db + "/MainTopic";
    if (req.params.unid != "new") {
      url += "/" + req.params.unid;
    }
    var data = req.body;
    if(data.From){
      data.From = req.signedCookies.email;
      data.AbbreviateFrom = req.signedCookies.email;
      data.AltFrom = req.signedCookies.email;
    }
    data.LastModifiedBy = req.signedCookies.email;
    if (req.body.MarkPrivate == "1"){
      data.readers = [data.From, data.AbbreviateFrom, data.AltFrom, data.LastModifiedBy];
    }else{
      data.readers = "";
    }
    data.Body__parsed = req.body.Body;
    if (req.file) {
      data.upload = {
        "type": "multipart",
        "content": [{
          "contentType": req.file.mimetype + "; name=\"" + req.file.originalname + "\"",
          "contentDisposition": "attachment; filename=\"" + req.file.originalname + "\"",
          "contentTransferEncoding": "base64",
          "data": req.file.buffer.toString("base64")
        }]
      }
    }
    data.Categories = req.body.Categories;
    if (req.body.NewCategories != "") {
      if (!data.Categories) {
        data.Categories = [];
      }
      if (req.body.NewCategories.indexOf(",") > -1) {
        var newcategories = req.body.NewCategories.split(",");
        for (var i = 0; i < newcategories; i++) {
          req.body.Categories.push(newcategories[i].trim());
        }
      } else {
        data.Categories.push(req.body.NewCategories);
      }
    }
    data.__form = "MainTopic";
    if (req.params.unid == "new") {
      if (!data.history) {
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' created Document at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.putJson(
          url,
          data, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function(resdata, response) {
          if (data == "Maximum number of databases reached or exceeded") {
            renderNewTopic(req, res, req.body, data);
          } else {
            afterEditHandling(req, res, resdata, data);
          }
        })
    } else {
      if (!data.history) {
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' modified Document at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.postJson(
          url,
          data, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function(resdata, response) {
          afterEditHandling(req, res, resdata, data);
        })
    }
  })

  function afterEditHandling(req, res, result, postdata){
    if (result == "Maximum number of databases reached or exceeded"){
      renderNewTopic(req, res, req.body, postdata);
    }else{
      res.redirect("/teamroom/index/" + req.params.db);
      //Get the document, if there are org users who haven't been notified, then do so
      var url = config.apihost + "/document/" + req.params.db + "/MainTopic/" + req.params.unid;
      if (req.params.unid == "new"){
        url += resdata;
      }
      restler.get(
        url,
        {headers:
          {'cookie': getCookies(req)}
        }
      ).on('complete', function(document, response){

        //Explode out team members
        var subteams = [];
        if (document.SubteamInterest){
          if (!Array.isArray(document.SubteamInterest)){
            document.SubteamInterest = [document.SubteamInterest];
          }
          for (var i=0; i<document.SubteamInterest.length; i++){
            if (document.SubteamInterest[i] != ""){
              subteams.push(document.SubteamInterest[i]);
            }
          }
        }
        if (document.Subteam1){
          if (!Array.isArray(document.Subteam1)){
            document.Subteam1 = [document.Subteam1];
          }
          for (var i=0; i<document.Subteam1.length; i++){
            if (document.Subteam1[i] != ""){
              subteams.push(document.Subteam1[i]);
            }
          }
        }
        var peopletonotify = [];
        async.eachSeries(subteams, function(subteam, callback){
          restler.postJson(
            config.apihost + "/search/" + req.params.db + "/Subteam",
            {"filters": [
              {
                "operator": "equals",
                "field": "STName",
                "value": subteam
              }
            ]},
            {headers: { 'apikey': config.adminapikey }}
          )
          .on('complete', function(subteamdata, response){
            console.log("Got data for " + subteam);
            try{
              for (var i=0; i<subteamdata.data.length; i++){
                var st = subteamdata.data[i];
                if (st.STMembers){
                  if (!Array.isArray(st.STMembers)){
                    st.STMembers = [st.STMembers];
                  }
                  console.log("Adding " + st.STMembers);
                  peopletonotify = peopletonotify.concat(st.STMembers);
                }
              }
              callback();
            }catch(e){
              console.log(e);
              callback();
            }
          })
        }, function(err){
          console.log("Got all subteam members");
          if (!document.notified){
            document.notified = [];
          }
          //First notify individuals named on the document
          if (document.PriNameSelection){
            if (!Array.isArray(document.PriNameSelection)){
              if (document.PriNameSelection != ""){
                document.PriNameSelection = [document.PriNameSelection];
              }
            }
            if (Array.isArray(document.PriNameSelection)){
              peopletonotify = peopletonotify.concat(document.PriNameSelection);
            }
          }

          var bUpdated = false;
          async.each(peopletonotify, function(reviewer, callback){
            if (document.notified.indexOf(reviewer) == -1){
              console.log("Sending message to " + reviewer);
              bUpdated = true;
              document.notified.push(reviewer);
              var subject = "You have been added as a participant: " + document.Subject;
              var body = "You have been added as a participant on the keep.works document \"" + document.Subject + "\". To open the document, click here: <link>";
              body = body.replace('<link>', config.apphost + 'teamroom/document/' + req.params.db + "/" + document.__unid);
              var email = {
                from: 'keep.works support <support@keep.works>',
                to: reviewer,
                subject: subject,
                text: body
              }
              if (validator.isEmail(email.to)){
                mailgun.messages().send(email, function(error, body){
                  if (error){
                    console.log(error);
                  }
                  callback();
                })
              }else{
                console.log("Not sending email to old style Notes Names. TODO: Resolve Notes Names to Via user");
                callback();
              }
            }else{
              console.log("Already notified " + reviewer);
              callback();
            }
          }, function(err){
            if (err){
              console.log(err);
            }
            if (bUpdated){
              restler.postJson(
                url,
                document,
                {headers:
                  {'cookie': getCookies(req)}
                }
              )
            }
          })
        })
      })
    }
  }

  app.post('/teamroom/replyedit/:db/:parentunid/:unid', upload.single('upload'), function(req, res, next) {
    var url = config.apihost + "/document/" + req.params.db + "/Response";
    if (req.params.unid != "new") {
      url += "/" + req.params.unid;
    }
    var data = {};
    data.From = req.signedCookies.email;
    data.AbbreviateFrom = req.signedCookies.email;
    data.AltFrom = req.signedCookies.email;
    data.Body__parsed = req.body.Body;
    data.__parentid = req.params.parentunid;
    if (req.file) {
      data.upload = {
        "type": "multipart",
        "content": [{
          "contentType": req.file.mimetype + "; name=\"" + req.file.originalname + "\"",
          "contentDisposition": "attachment; filename=\"" + req.file.originalname + "\"",
          "contentTransferEncoding": "base64",
          "data": req.file.buffer.toString("base64")
        }]
      }
    }
    data.Subject = req.body.Subject;
    data.__form = "Response";
    if (req.params.unid == "new") {
      if (!data.history) {
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' created Response at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.putJson(
          url,
          data, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function(data, response) {

          //Send an email to people involved in the thread
          restler.get(
              config.apihost + "/document/" + req.params.db + "/MainTopic/" + req.params.parentunid, {
                headers: {
                  'cookie': getCookies(req)
                }
              }
            )
            .on('complete', function(maindoc) {
              var sendmail = false;
              if (maindoc.From.indexOf('@') > -1) {
                if (maindoc.From != req.signedCookies.email) {
                  sendmail = true;
                }
              }
              if (sendmail) {
                cache.getDbInfo(req, false, function(dbinfo) {
                  var subject = config.newreply.subject;
                  subject = subject.replace('<from>', req.signedCookies.email);
                  subject = subject.replace('<db>', dbinfo.title);
                  subject = subject.replace('<maintopic>', maindoc.Subject);
                  var body = config.newreply.body;
                  body = body.replace('<link>', config.apphost + 'document/' + req.params.db + "/" + req.params.parentunid);
                  var email = {
                    from: 'keep.works support <support@keep.works>',
                    to: maindoc.From,
                    subject: subject,
                    text: body
                  }
                  mailgun.messages().send(email, function(error, body) {
                    res.redirect("/teamroom/document/" + req.params.db + "/" + req.params.parentunid);
                  })
                })
              } else {
                res.redirect("/teamroom/document/" + req.params.db + "/" + req.params.parentunid);
              }
            })
        })
    } else {
      if (!data.history) {
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' updated Response at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.postJson(
          url,
          data, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function(data, response) {
          res.redirect("/teamroom/document/" + req.params.db + "/" + req.params.parentunid);
        })
    }
  })

  app.get('/teamroom/participants/:db', login.requiresLogin, function(req, res, next) {
    renderParticipants(req, res, 1);
  })

  app.get('/teamroom/participants/:db/:pageno', login.requiresLogin, function(req, res, next) {
    renderParticipants(req, res, req.params.pageno);
  })

  function renderParticipants(req, res, pageno){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/collections/" + req.params.db + "/ParticipantProfile?sortasc=Who&count=" + config.count + "&start=" + (config.count * (pageno - 1)), {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.next_page) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              var nextpage = parseInt(pageno, 10) + 1;
              var previouspage = pageno - 1;
              var pages = Math.ceil((data.count / config.count));
              if (pages == 0) {
                pages = 1;
              }
              if (nextpage > pages) {
                nextpage = pages;
              }
              if (previouspage < 1) {
                previouspage = 1;
              }
              res.render('teamroom/participants', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title
                }, {
                  link: "/teamroom/newparticipant/" + req.params.db,
                  icon: "fa-pencil",
                  label: "New Team Member"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members", active: true
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams"
                }, {
                  link: "/teamroom/events/" + req.params.db,
                  icon: "fa-calendar",
                  label: "Events"
                }],
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                db: req.params.db,
                data: data,
                pageno: pageno,
                pages: pages,
                nextpage: nextpage,
                previouspage: previouspage
              });
            }
          })
      })
    })
  }

  app.get('/teamroom/participant/:db/:unid', login.requiresLogin, function(req, res, next) {
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/document/" + req.params.db + "/ParticipantProfile/" + req.params.unid + "?all", {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.__unid) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              res.render('teamroom/participant', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                breadcrumbs: [{
                  title: dbinfo.title,
                  link: "/teamroom/participants/" + dbinfo.db
                }, {
                  title: data.Subject
                }],
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title
                }, {
                  link: "/teamroom/newparticipant/" + req.params.db,
                  icon: "fa-pencil",
                  label: "New Team Member"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members"
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams"
                }, {
                  link: "/teamroom/events/" + req.params.db,
                  icon: "fa-calendar",
                  label: "Events"
                }],
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                db: req.params.db,
                document: data
              })
            }
          })
      })
    })
  })

  app.get('/teamroom/participantedit/:db/:unid', function(req, res, next){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/document/" + req.params.db + "/ParticipantProfile/" + req.params.unid + "?all", {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            renderNewParticipant(req, res, data);
          }
        )
      })
    })
  })

  app.get('/teamroom/newparticipant/:db', function(req, res, next){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        renderNewParticipant(req, res, {
          __unid: "new",
          Who: "",
          Department: "",
          Location: "",
          Email: "",
          Phone: "",
          JobTitle: ""
        });
      })
    })
  })

  function renderNewParticipant(req, res, seeddata, error) {
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        res.render('teamroom/participantedit', {
          template: 'teamroom',
          sitetitle: config.sitetitle,
          pagetitle: dbinfo.title,
          dbicon: '/getdbicon/' + req.params.db,
          dbinfo: dbinfo,
          isAdmin: userdetails.isAdmin,
          breadcrumbs: [{
            title: dbinfo.title,
            link: "/teamroom/participants/" + dbinfo.db
          }, {
            title: "New Participant"
          }],
          menuitems: [{
            link: "/teamroom/index/" + req.params.db,
            icon: "fa-home",
            label: dbinfo.title
          }, {
            link: "/teamroom/newparticipant/" + req.params.db,
            icon: "fa-pencil",
            label: "New Participant", active: true
          }, {
            link: "/teamroom/participants/" + req.params.db,
            icon: "fa-user",
            label: "Team Members"
          }, {
            link: "/teamroom/subteams/" + req.params.db,
            icon: "fa-group",
            label: "Subteams"
          }, {
            link: "/teamroom/events/" + req.params.db,
            icon: "fa-calendar",
            label: "Events"
          }],
          db: req.params.db,
          document: seeddata,
          error: error
        })
      })
    })
  }

  app.post('/teamroom/participantedit/:db/:unid', upload.single('upload'), function(req, res, next) {
    var url = config.apihost + "/document/" + req.params.db + "/ParticipantProfile";
    if (req.params.unid != "new") {
      url += "/" + req.params.unid;
    }
    var data = req.body;
    data.From = req.signedCookies.email;
    data.AbbreviateFrom = req.signedCookies.email;
    data.AltFrom = req.signedCookies.email;
    if (req.file) {
      data.upload = {
        "type": "multipart",
        "content": [{
          "contentType": req.file.mimetype + "; name=\"" + req.file.originalname + "\"",
          "contentDisposition": "attachment; filename=\"" + req.file.originalname + "\"",
          "contentTransferEncoding": "base64",
          "data": req.file.buffer.toString("base64")
        }]
      }
    }
    data.__form = "ParticipantProfile";
    if (req.params.unid == "new") {
      if (!data.history) {
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' created Participant at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.putJson(
          url,
          data, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function(data, response) {
          restler.get(
              config.apihost + "/document/" + req.params.db + "/ParticipantProfile/" + req.params.parentunid, {
                headers: {
                  'cookie': getCookies(req)
                }
              }
            )
            .on('complete', function(maindoc) {
              res.redirect("/teamroom/participants/" + req.params.db);
            })
        })
    } else {
      if (!data.history) {
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' updated Participant at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.postJson(
          url,
          data, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function(data, response) {
          res.redirect("/teamroom/participants/" + req.params.db);
        })
    }
  })

  app.get('/teamroom/participantdelete/:db/:unid', login.requiresLogin, function(req, res, next) {
    cache.getDbInfo(req, false, function(dbinfo) {
      restler.del(
          config.apihost + "/document/" + req.params.db + "/ParticipantProfile/" + req.params.unid, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function() {
          res.send('/teamroom/participants/' + req.params.db);
        })
    })
  })

  app.get('/teamroom/subteams/:db', login.requiresLogin, function(req, res, next) {
    renderSubteams(req, res, 1);
  })

  app.get('/teamroom/subteams/:db/:pageno', login.requiresLogin, function(req, res, next) {
    renderSubteams(req, res, req.params.pageno);
  })

  function renderSubteams(req, res, pageno){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/collections/" + req.params.db + "/Subteam?sortasc=STName&count=" + config.count + "&start=" + (config.count * (pageno - 1)), {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.next_page) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              var nextpage = parseInt(pageno, 10) + 1;
              var previouspage = pageno - 1;
              var pages = Math.ceil((data.count / config.count));
              if (pages == 0) {
                pages = 1;
              }
              if (nextpage > pages) {
                nextpage = pages;
              }
              if (previouspage < 1) {
                previouspage = 1;
              }
              res.render('teamroom/subteams', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title
                }, {
                  link: "/teamroom/newsubteam/" + req.params.db,
                  icon: "fa-pencil",
                  label: "New Subteam"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members"
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams", active: true
                }, {
                  link: "/teamroom/events/" + req.params.db,
                  icon: "fa-calendar",
                  label: "Events"
                }],
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                db: req.params.db,
                data: data,
                pageno: pageno,
                pages: pages,
                nextpage: nextpage,
                previouspage: previouspage
              });
            }
          })
      })
    })
  }

  app.get('/teamroom/subteam/:db/:unid', login.requiresLogin, function(req, res, next) {
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/document/" + req.params.db + "/Subteam/" + req.params.unid + "?all", {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.__unid) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              res.render('teamroom/subteam', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                breadcrumbs: [{
                  title: dbinfo.title,
                  link: "/teamroom/subteams/" + dbinfo.db
                }, {
                  title: data.STName
                }],
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title
                }, {
                  link: "/teamroom/newsubteam/" + req.params.db,
                  icon: "fa-pencil",
                  label: "New Subteam"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members"
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams"
                }, {
                  link: "/teamroom/events/" + req.params.db,
                  icon: "fa-calendar",
                  label: "Events"
                }],
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                db: req.params.db,
                document: data
              })
            }
          })
      })
    })
  })

  app.get('/teamroom/subteamedit/:db/:unid', function(req, res, next){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/document/" + req.params.db + "/Subteam/" + req.params.unid + "?all", {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            renderNewSubteam(req, res, data);
          }
        )
      })
    })
  })

  app.get('/teamroom/newsubteam/:db', function(req, res, next){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        renderNewSubteam(req, res, {
          __unid: "new",
          STName: "",
          STMembers: "",
          Position: ""
        });
      })
    })
  })

  function renderNewSubteam(req, res, seeddata, error) {
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        cache.getCategories(req, "ParticipantProfile", "Who", function(participants) {
          res.render('teamroom/subteamedit', {
            template: 'teamroom',
            sitetitle: config.sitetitle,
            pagetitle: dbinfo.title,
            dbicon: '/getdbicon/' + req.params.db,
            dbinfo: dbinfo,
            isAdmin: userdetails.isAdmin,
            breadcrumbs: [{
              title: dbinfo.title,
              link: "/teamroom/subteams/" + dbinfo.db
            }, {
              title: "New Subteam"
            }],
            menuitems: [{
              link: "/teamroom/index/" + req.params.db,
              icon: "fa-home",
              label: dbinfo.title
            }, {
              link: "/teamroom/newsubteam/" + req.params.db,
              icon: "fa-pencil",
              label: "New Subteam", active: true
            }, {
              link: "/teamroom/participants/" + req.params.db,
              icon: "fa-user",
              label: "Team Members"
            }, {
              link: "/teamroom/subteams/" + req.params.db,
              icon: "fa-group",
              label: "Subteams"
            }, {
              link: "/teamroom/events/" + req.params.db,
              icon: "fa-calendar",
              label: "Events"
            }],
            db: req.params.db,
            document: seeddata,
            Participants: participants,
            error: error
          })
        })
      })
    })
  }

  app.post('/teamroom/subteamedit/:db/:unid', upload.single('upload'), function(req, res, next) {
    var url = config.apihost + "/document/" + req.params.db + "/Subteam";
    if (req.params.unid != "new") {
      url += "/" + req.params.unid;
    }
    var data = req.body;
    data.From = req.signedCookies.email;
    data.AbbreviateFrom = req.signedCookies.email;
    data.AltFrom = req.signedCookies.email;
    if (req.file) {
      data.upload = {
        "type": "multipart",
        "content": [{
          "contentType": req.file.mimetype + "; name=\"" + req.file.originalname + "\"",
          "contentDisposition": "attachment; filename=\"" + req.file.originalname + "\"",
          "contentTransferEncoding": "base64",
          "data": req.file.buffer.toString("base64")
        }]
      }
    }
    data.__form = "Subteam";
    if (req.params.unid == "new") {
      if (!data.history) {
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' created Subteam at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.putJson(
          url,
          data, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function(data, response) {
          restler.get(
              config.apihost + "/document/" + req.params.db + "/Subteam/" + req.params.parentunid, {
                headers: {
                  'cookie': getCookies(req)
                }
              }
            )
            .on('complete', function(maindoc) {
              res.redirect("/teamroom/subteams/" + req.params.db);
            })
        })
    } else {
      if (!data.history) {
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' updated Subteam at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.postJson(
          url,
          data, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function(data, response) {
          res.redirect("/teamroom/subteams/" + req.params.db);
        })
    }
  })

  app.get('/teamroom/subteamdelete/:db/:unid', login.requiresLogin, function(req, res, next) {
    cache.getDbInfo(req, false, function(dbinfo) {
      restler.del(
          config.apihost + "/document/" + req.params.db + "/Subteam/" + req.params.unid, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function() {
          res.send('/teamroom/subteams/' + req.params.db);
        })
    })
  })

  app.get('/teamroom/events/:db', login.requiresLogin, function(req, res, next) {
    renderEvents(req, res, 1);
  })

  app.get('/teamroom/events/:db/:pageno', login.requiresLogin, function(req, res, next) {
    renderEvents(req, res, req.params.pageno);
  })

  function renderEvents(req, res, pageno){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/collections/" + req.params.db + "/Event?sortasc=EventDate&count=" + config.count + "&start=" + (config.count * (pageno - 1)), {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.next_page) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              var nextpage = parseInt(pageno, 10) + 1;
              var previouspage = pageno - 1;
              var pages = Math.ceil((data.count / config.count));
              if (pages == 0) {
                pages = 1;
              }
              if (nextpage > pages) {
                nextpage = pages;
              }
              if (previouspage < 1) {
                previouspage = 1;
              }
              res.render('teamroom/events', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title
                }, {
                  link: "/teamroom/newevent/" + req.params.db,
                  icon: "fa-calendar-plus-o",
                  label: "New Event"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members"
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams"
                }, {
                  link: "/teamroom/events/" + req.params.db,
                  icon: "fa-calendar",
                  label: "Events", active: true
                }],
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                db: req.params.db,
                data: data,
                pageno: pageno,
                pages: pages,
                nextpage: nextpage,
                previouspage: previouspage
              });
            }
          })
      })
    })
  }

  app.get('/teamroom/event/:db/:unid', login.requiresLogin, function(req, res, next) {
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/document/" + req.params.db + "/Event/" + req.params.unid + "?all", {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.__unid) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              res.render('teamroom/event', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                breadcrumbs: [{
                  title: dbinfo.title,
                  link: "/teamroom/events/" + dbinfo.db
                }, {
                  title: data.STName
                }],
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title
                }, {
                  link: "/teamroom/newevent/" + req.params.db,
                  icon: "fa-calendar-plus-o",
                  label: "New Event"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members"
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams"
                }, {
                  link: "/teamroom/events/" + req.params.db,
                  icon: "fa-calendar",
                  label: "Events"
                }],
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                db: req.params.db,
                document: data
              })
            }
          })
      })
    })
  })

  app.get('/teamroom/eventedit/:db/:unid', function(req, res, next){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.get(
            config.apihost + "/document/" + req.params.db + "/Event/" + req.params.unid + "?all", {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            renderNewEvent(req, res, data);
          }
        )
      })
    })
  })

  app.get('/teamroom/newevent/:db', function(req, res, next){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        renderNewEvent(req, res, {
          __unid: "new",
          EventSummary: "",
          EventDate: "",
          EventDetail: ""
        });
      })
    })
  })

  function renderNewEvent(req, res, seeddata, error) {
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        res.render('teamroom/eventedit', {
          template: 'teamroom',
          sitetitle: config.sitetitle,
          pagetitle: dbinfo.title,
          dbicon: '/getdbicon/' + req.params.db,
          dbinfo: dbinfo,
          isAdmin: userdetails.isAdmin,
          breadcrumbs: [{
            title: dbinfo.title,
            link: "/teamroom/events/" + dbinfo.db
          }, {
            title: "New Event"
          }],
          menuitems: [{
            link: "/teamroom/index/" + req.params.db,
            icon: "fa-home",
            label: dbinfo.title
          }, {
            link: "/teamroom/newevent/" + req.params.db,
            icon: "fa-calendar-plus-o",
            label: "New Event", active: true
          }, {
            link: "/teamroom/participants/" + req.params.db,
            icon: "fa-user",
            label: "Team Members"
          }, {
            link: "/teamroom/subteams/" + req.params.db,
            icon: "fa-group",
            label: "Subteams"
          }, {
            link: "/teamroom/events/" + req.params.db,
            icon: "fa-calendar",
            label: "Events"
          }],
          db: req.params.db,
          document: seeddata,
          error: error
        })
      })
    })
  }

  app.post('/teamroom/eventedit/:db/:unid', upload.single('upload'), function(req, res, next) {
    var url = config.apihost + "/document/" + req.params.db + "/Event";
    if (req.params.unid != "new") {
      url += "/" + req.params.unid;
    }
    var data = req.body;
    data.From = req.signedCookies.email;
    data.AbbreviateFrom = req.signedCookies.email;
    data.AltFrom = req.signedCookies.email;
    if (req.file) {
      data.upload = {
        "type": "multipart",
        "content": [{
          "contentType": req.file.mimetype + "; name=\"" + req.file.originalname + "\"",
          "contentDisposition": "attachment; filename=\"" + req.file.originalname + "\"",
          "contentTransferEncoding": "base64",
          "data": req.file.buffer.toString("base64")
        }]
      }
    }
    data.__form = "Event";
    if (req.params.unid == "new") {
      if (!data.history) {
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' created Event at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.putJson(
          url,
          data, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function(data, response) {
          restler.get(
              config.apihost + "/document/" + req.params.db + "/Event/" + req.params.parentunid, {
                headers: {
                  'cookie': getCookies(req)
                }
              }
            )
            .on('complete', function(maindoc) {
              res.redirect("/teamroom/events/" + req.params.db);
            })
        })
    } else {
      if (!data.history) {
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' updated Event at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.postJson(
          url,
          data, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function(data, response) {
          res.redirect("/teamroom/events/" + req.params.db);
        })
    }
  })

  app.get('/teamroom/eventdelete/:db/:unid', login.requiresLogin, function(req, res, next) {
    cache.getDbInfo(req, false, function(dbinfo) {
      restler.del(
          config.apihost + "/document/" + req.params.db + "/Event/" + req.params.unid, {
            headers: {
              'cookie': getCookies(req)
            }
          }
        )
        .on('complete', function() {
          res.send('/teamroom/events/' + req.params.db);
        })
    })
  })

  app.get('/teamroom/file/:db/:collection/:unid/:filename', login.requiresLogin, function(req, res, next) {
    restler.get(
        config.apihost + "/attachment/" + req.params.db + "/" + req.params.collection + "/" + req.params.unid + "/" + req.params.filename, {
          headers: {
            'cookie': getCookies(req)
          }
        }
      )
      .on('complete', function(data, response) {
        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Content-Length', response.headers['content-length']);
        res.setHeader('Content-Disposition', response.headers['content-disposition']);
        res.send(response.raw);
      })
  })

  app.delete('/teamroom/file/:db/:collection/:unid/:filename', login.requiresLogin, function(req, res, next) {
    restler.del(
        config.apihost + "/attachment/" + req.params.db + "/" + req.params.collection + "/" + req.params.unid + "/" + req.params.filename, {
          headers: {
            'cookie': getCookies(req)
          }
        }
      )
      .on('complete', function(data, response) {
        res.send("ok");
      })
  })

  app.get('/teamroom/search/:db', login.requiresLogin, function(req, res, next) {
    renderSearch(req, res, 0);
  })

  app.get('/teamroom/search/:db/:pageno', login.requiresLogin, function(req, res, next) {
    renderSearch(req, res, req.params.pageno);
  })

  function renderSearch(req, res, pageno){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.postJson(
            config.apihost + "/search/" + req.params.db + "/MainTopic?count=" + config.count + "&start=" + (config.count * pageno), {
              "fulltext": req.query.keywords
            }, {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.data) {
              if (data.name && data.name == 'SearchError' && data['$err'] && data['$err'] == 'The collection must be full text indexed'){
                //Make sure the FT index is created
                restler.postJson(
                  config.apihost + "/database/" + req.params.db,
                  {
                    indexed: true
                  },
                  {headers: { 'apikey': config.adminapikey }}
                ).on('complete', function(){
                  res.redirect('/teamroom/search/' + req.params.db + "?keywords=" + req.query.keywords);
                })
              }else{
                res.redirect("/opendatabase/" + req.params.db);
              }
            } else {
              var nextpage = parseInt(pageno, 10) + 1;
              var previouspage = pageno - 1;
              var pages = Math.floor((data.count / config.count));
              if (pages == 0) {
                pages = 1;
              }
              if (nextpage > pages) {
                nextpage = pages;
              }
              if (previouspage < 1) {
                previouspage = 1;
              }
              res.render('teamroom/search', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                dbinfo: dbinfo,
                breadcrumbs: [{
                  title: dbinfo.title,
                  link: "/teamroom/index/" + dbinfo.db
                }, {
                  title: "Search: " + req.query.keywords
                }],
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title
                }, {
                  link: "/teamroom/newtopic/" + req.params.db,
                  icon: "fa-pencil",
                  label: "New Topic"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members"
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams"
                }],
                query: req.query.keywords,
                db: req.params.db,
                data: data,
                pageno: pageno,
                pages: pages,
                nextpage: nextpage,
                previouspage: previouspage
              });
            }
          })
      })
    })
  }

  app.get('/teamroom/user/:db/:user', login.requiresLogin, function(req, res, next) {
    renderUser(req, res, 0);
  })

  app.get('/teamroom/user/:db/:user/:pageno', login.requiresLogin, function(req, res, next) {
    renderUser(req, res, req.params.pageno);
  })

  function renderUser(req, res, pageno){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.postJson(
            config.apihost + "/search/" + req.params.db + "/MainTopic?count=" + config.count + "&start=" + (config.count * pageno), {
              "filters": [{
                "operator": "equals",
                "field": "AltFrom",
                "value": req.params.user
              }, {
                "operator": "equals",
                "field": "From",
                "value": req.params.user
              }]
            }, {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.next_page && !data.data) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              var nextpage = parseInt(pageno, 10) + 1;
              var previouspage = pageno - 1;
              var pages = Math.floor((data.count / config.count));
              if (pages == 0) {
                pages = 1;
              }
              if (nextpage > pages) {
                nextpage = pages;
              }
              if (previouspage < 1) {
                previouspage = 1;
              }
              res.render('teamroom/user', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                breadcrumbs: [{
                  title: dbinfo.title,
                  link: "/teamroom/index/" + dbinfo.db
                }, {
                  title: "User: " + formatNotesName(req.params.user)
                }],
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title
                }, {
                  link: "/teamroom/newtopic/" + req.params.db,
                  icon: "fa-pencil",
                  label: "New Topic"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members"
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams"
                }],
                user: req.params.user,
                db: req.params.db,
                data: data,
                pageno: pageno,
                pages: pages,
                nextpage: nextpage,
                previouspage: previouspage
              });
            }
          })
      })
    })
  }

  app.get('/teamroom/category/:db/:category', login.requiresLogin, function(req, res, next) {
    renderCategory(req, res, 0);
  })

  app.get('/teamroom/category/:db/:category/:pageno', login.requiresLogin, function(req, res, next) {
    renderCategory(req, res, req.params.pageno);
  })

  function renderCategory(req, res, pageno){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.postJson(
            config.apihost + "/search/" + req.params.db + "/MainTopic?count=" + config.count + "&start=" + (config.count * pageno), {
              "filters": [{
                "operator": "equals",
                "field": "Categories",
                "value": req.params.category
              }]
            }, {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.next_page && !data.data) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              var nextpage = parseInt(pageno, 10) + 1;
              var previouspage = pageno - 1;
              var pages = Math.floor((data.count / config.count));
              if (pages == 0) {
                pages = 1;
              }
              if (nextpage > pages) {
                nextpage = pages;
              }
              if (previouspage < 1) {
                previouspage = 1;
              }
              res.render('teamroom/category', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                breadcrumbs: [{
                  title: dbinfo.title,
                  link: "/teamroom/index/" + dbinfo.db
                }, {
                  title: "Category: " + req.params.category
                }],
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title
                }, {
                  link: "/teamroom/newtopic/" + req.params.db,
                  icon: "fa-pencil",
                  label: "New Topic"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members"
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams"
                }],
                category: req.params.category,
                db: req.params.db,
                data: data,
                pageno: pageno,
                pages: pages,
                nextpage: nextpage,
                previouspage: previouspage
              });
            }
          })
      })
    })
  }

  app.get('/teamroom/type/:db/:type', login.requiresLogin, function(req, res, next) {
    renderType(req, res, 0);
  })

  app.get('/teamroom/type/:db/:type/:pageno', login.requiresLogin, function(req, res, next) {
    renderType(req, res, req.params.pageno);
  })

  function renderType(req, res, pageno){
    cache.getUserDetails(req, function(userdetails) {
      cache.getDbInfo(req, false, function(dbinfo) {
        restler.postJson(
            config.apihost + "/search/" + req.params.db + "/MainTopic?count=" + config.count + "&start=" + (config.count * pageno), {
              "filters": [{
                "operator": "equals",
                "field": "DocType",
                "value": req.params['type']
              }]
            }, {
              headers: {
                'cookie': getCookies(req)
              }
            }
          )
          .on('complete', function(data, response) {
            if (!data.next_page && !data.data) {
              res.redirect("/login?redirectto=" + req.url);
            } else {
              var nextpage = parseInt(pageno, 10) + 1;
              var previouspage = pageno - 1;
              var pages = Math.floor((data.count / config.count));
              if (pages == 0) {
                pages = 1;
              }
              if (nextpage > pages) {
                nextpage = pages;
              }
              if (previouspage < 1) {
                previouspage = 1;
              }
              res.render('teamroom/type', {
                template: 'teamroom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                breadcrumbs: [{
                  title: dbinfo.title,
                  link: "/teamroom/index/" + dbinfo.db
                }, {
                  title: "Type: " + req.params.type
                }],
                menuitems: [{
                  link: "/teamroom/index/" + req.params.db,
                  icon: "fa-home",
                  label: dbinfo.title
                }, {
                  link: "/teamroom/newtopic/" + req.params.db,
                  icon: "fa-pencil",
                  label: "New Topic"
                }, {
                  link: "/teamroom/participants/" + req.params.db,
                  icon: "fa-user",
                  label: "Team Members"
                }, {
                  link: "/teamroom/subteams/" + req.params.db,
                  icon: "fa-group",
                  label: "Subteams"
                }],
                type: req.params.type,
                db: req.params.db,
                data: data,
                pageno: pageno,
                pages: pages,
                nextpage: nextpage,
                previouspage: previouspage
              });
            }
          })
      })
    })
  }

}

function formatNotesName(input) {
  try {
    input = input.replace("CN=", "");
    input = input.replace("OU=", "");
    input = input.replace("O=", "");
    input = input.replace("C=", "");
  } catch (e) {}
  return input;
}
String.prototype.replaceAll = function(search, replacement) {
  var target = this;
  return target.replace(new RegExp(search, 'g'), replacement);
};
var getCookies = function(req) {
  var cookies = _.map(req.cookies, function(val, key) {
    if (key == "connect.sid") {
      return key + "=" + val['connect.sid'];
    }
  }).join("; ");
  return cookies;
}
