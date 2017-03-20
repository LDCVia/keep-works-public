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
var upload = multer({ storage: storage });
var http = require('http');
var util = require('util');
var moment = require('moment');
var async = require('async');
var XLSXWriter = require('xlsx-writestream');
var PDFDocument = require('pdfkit');
var mailgun = require('mailgun-js')({apiKey: config.mailgunapikey, domain: config.mailgundomain});

module.exports = function(app){
  app.get('/doclibrary/index/:db', login.requiresLogin, function(req, res, next){
    renderIndex(req, res, 1);
  })

  app.get('/doclibrary/index/:db/:pageno', login.requiresLogin, function(req, res, next){
    renderIndex(req, res, req.params.pageno);
  })

  function renderIndex(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/collections/" + req.params.db + "/Document?sortdesc=__modified&count=" + config.count + "&start=" + (config.count * (pageno - 1)),
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.next_page){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            var nextpage = parseInt(pageno, 10) + 1;
            var previouspage = pageno - 1;
            var pages = Math.ceil((data.count / config.count));
            if (pages == 0){
              pages = 1;
            }
            if (nextpage > pages){
              nextpage = pages;
            }
            if (previouspage < 1){
              previouspage = 1;
            }
            res.render('doclibrary/index', {
              template: 'doclibrary',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db, 
              menuitems: [
                {link: "/doclibrary/index/" + req.params.db, icon: "fa-home", label: dbinfo.title, active: true},
                {link: "/doclibrary/newtopic/" + req.params.db, icon: "fa-pencil", label: "New Topic", dataintro: "Click here to add a new document"},
                {link: "/doclibrary/exporttopics/" + req.params.db, icon: 'fa-file-excel-o', label: "Export to Excel"}
              ],
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

  app.get('/doclibrary/document/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/Document/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.__unid){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            restler.get(
              config.apihost + "/responses/" + req.params.db + "/Document/" + req.params.unid + "?expand=true&threaded=true",
              {headers:
                {'cookie': getCookies(req)}
              }
            )
            .on('complete', function(data2, response){
              res.render('doclibrary/document', {
                template: 'doclibrary',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                breadcrumbs: [
                  {title: dbinfo.title, link: "/doclibrary/index/" + dbinfo.db},
                  {title: data.Subject}
                ],
                menuitems: [
                  {link: "/doclibrary/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                  {link: "/doclibrary/newtopic/" + req.params.db, icon: "fa-pencil", label: "New Topic"},
                  {link: "/doclibrary/exportdocument/" + req.params.db + "/" + req.params.unid, icon: "fa-file-pdf-o", label: "Export to PDF"}
                ],
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

  app.get('/doclibrary/documentedit/:db/:unid', login.requiresLogin, function(req, res, next){
    restler.get(
      config.apihost + "/document/" + req.params.db + "/Document/" + req.params.unid + "?all",
      {headers:
        {'cookie': getCookies(req)}
      }
    )
    .on('complete', function(data, response){
      if (!data.__unid){
        res.redirect("/login?redirectto=" + req.url);
      }else{
        renderNewTopic(req, res, data);
      }
    })
  })

  app.get('/doclibrary/documentdelete/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getDbInfo(req, false, function(dbinfo){
      restler.del(
        config.apihost + "/document/" + req.params.db + "/Document/" + req.params.unid,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(){
        res.send('/doclibrary/index/' + req.params.db);
      })
    })
  })

  app.get('/doclibrary/newtopic/:db', login.requiresLogin, function(req, res, next){
    renderNewTopic(req, res, {
      __unid: "new",
      Subject: "",
      Categories: [],
      NewCategories: "",
      Body__parsed: ""
    });
  })

  function renderNewTopic(req, res, seeddata, error){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        cache.getCategories(req, "Document", "Categories", function(categories){
          cache.getOrgUsers(req, userdetails.customerid, false, function(usersdata){
            if (seeddata.ReviewerList){
              if (Array.isArray(seeddata.ReviewerList)){
                for (var i=0; i<seeddata.ReviewerList.length; i++){
                  if (usersdata.indexOf(seeddata.ReviewerList[i]) == -1){
                    usersdata.push(seeddata.ReviewerList[i]);
                  }
                }
              }else{
                if (usersdata.indexOf(seeddata.ReviewerList) == -1){
                  usersdata.push(seeddata.ReviewerList);
                }
              }
            }
            res.render('doclibrary/documentedit', {
              template: 'doclibrary',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              dbinfo: dbinfo,
              isAdmin: userdetails.isAdmin,
              breadcrumbs: [
                {title: dbinfo.title, link: "/doclibrary/index/" + dbinfo.db},
                {title: "New Topic"}
              ],
              menuitems: [
                {link: "/doclibrary/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/doclibrary/newtopic/" + req.params.db, icon: "fa-pencil", label: "New Topic", active: true}
              ],
              db: req.params.db,
              document: seeddata,
              CategoryOptions: categories,
              orgusers: usersdata,
              error: error
            })
          })
        })
      })
    })
  }

  app.post('/doclibrary/documentedit/:db/:unid', upload.single('upload'), function(req, res, next){
    var url = config.apihost + "/document/" + req.params.db + "/Document";
    if (req.params.unid != "new"){
      url += "/" + req.params.unid;
    }
    var data = {};
    if(!data.From){
      data.From = req.signedCookies.email;
      data.AbbreviateFrom = req.signedCookies.email;
      data.AltFrom = req.signedCookies.email;
    }
    data.LastModifiedBy = req.signedCookies.email;
    if (req.body.MarkPrivate == "1"){
      data.readers = [data.From, data.AbbreviateFrom, data.AltFrom, data.LastModifiedBy];
      if (req.body.ReviewerList){
        if (Array.isArray(req.body.ReviewerList)){
          for(var i=0; i<req.body.ReviewerList.length; i++){
            data.readers.push(req.body.ReviewerList[i]);
          }
        }else{
          data.readers.push(req.body.ReviewerList);
        }
      }
    }else{
      data.readers = "";
    }
    data.ReviewerList = req.body.ReviewerList;
    data.Body__parsed = req.body.Body;
    if (req.file){
      data.upload = {
        "type": "multipart",
        "content": [
          {
            "contentType": req.file.mimetype + "; name=\"" + req.file.originalname + "\"",
            "contentDisposition": "attachment; filename=\"" + req.file.originalname + "\"",
            "contentTransferEncoding": "base64",
            "data": req.file.buffer.toString("base64")
          }
        ]
      }
    }
    data.Categories = req.body.Categories;
    if (req.body.NewCategories != ""){
      if (!data.Categories){
        data.Categories = [];
      }else if(!Array.isArray(data.Categories)){
        data.Categories = [data.Categories];
      }
      if (req.body.NewCategories.indexOf(",") > -1){
        var newcategories = req.body.NewCategories.split(",");
        for(var i=0; i<newcategories; i++){
          req.body.Categories.push(newcategories[i].trim());
        }
      }else{

        data.Categories.push(req.body.NewCategories);
      }
    }
    data.Subject = req.body.Subject;
    data.__form = "Document";
    if (req.params.unid == "new"){
      data.history = [req.signedCookies.email + ' created document at ' + moment().format('DD MMM YYYY HH:mm')];
      restler.putJson(
        url,
        data,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(resdata, response){
        afterEditHandling(req, res, resdata, data);
      })
    }else{
      if (!data.history){
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' modified document at ' + moment().format('DD MMM YYYY HH:mm'));
      restler.postJson(
        url,
        data,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(resdata, response){
        afterEditHandling(req, res, resdata, data);
      })
    }
  })

  function afterEditHandling(req, res, result, postdata){
    if (result == "Maximum number of databases reached or exceeded"){
      renderNewTopic(req, res, req.body, postdata);
    }else{
      res.redirect("/doclibrary/index/" + req.params.db);
      //Get the document, if there are org users who haven't been notified, then do so
      var url = config.apihost + "/document/" + req.params.db + "/Document/" + req.params.unid;
      if (req.params.unid == "new"){
        url += result;
      }
      restler.get(
        url,
        {headers:
          {'cookie': getCookies(req)}
        }
      ).on('complete', function(document, response){
        if (!document.notified){
          document.notified = [];
        }
        if (document.ReviewerList){
          if (!Array.isArray(document.ReviewerList)){
            if (document.ReviewerList != ""){
              document.ReviewerList = [document.ReviewerList];
            }
          }
          if (Array.isArray(document.ReviewerList)){
            var bUpdated = false;
            async.each(document.ReviewerList, function(reviewer, callback){
              if (document.notified.indexOf(reviewer) == -1){
                bUpdated = true;
                document.notified.push(reviewer);
                var subject = "You have been added as a reviewer: " + document.Subject;
                var body = "You have been added as a reviewer on the keep.works document \"" + document.Subject + "\". To open the document, click here: <link>";
                body = body.replace('<link>', config.apphost + 'doclibrary/document/' + req.params.db + "/" + document.__unid);
                var email = {
                  from: 'keep.works support <support@keep.works>',
                  to: reviewer,
                  subject: subject,
                  text: body
                }
                mailgun.messages().send(email, function(error, body){
                  callback();
                })
              }else{
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
          }
        }
      })
    }
  }

  app.post('/doclibrary/replyedit/:db/:parentunid/:unid', upload.single('upload'), function(req, res, next){
    var url = config.apihost + "/document/" + req.params.db + "/Response";
    if (req.params.unid != "new"){
      url += "/" + req.params.unid;
    }
    var data = {};
    data.From = req.signedCookies.email;
    data.AbbreviateFrom = req.signedCookies.email;
    data.AltFrom = req.signedCookies.email;
    data.Body__parsed = req.body.Body;
    data.__parentid = req.params.parentunid;
    if (req.file){
      data.upload = {
        "type": "multipart",
        "content": [
          {
            "contentType": req.file.mimetype + "; name=\"" + req.file.originalname + "\"",
            "contentDisposition": "attachment; filename=\"" + req.file.originalname + "\"",
            "contentTransferEncoding": "base64",
            "data": req.file.buffer.toString("base64")
          }
        ]
      }
    }
    data.Subject = req.body.Subject;
    data.__form = "Response";
    if (req.params.unid == "new"){
      if (!data.history){
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' created Response at ' + moment().format('DD MMM YYYY HH:mm'));
      restler.putJson(
        url,
        data,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(data, response){

        //Send an email to people involved in the thread
        restler.get(
          config.apihost + "/document/" + req.params.db + "/Document/" + req.params.parentunid,
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(maindoc){
          var sendmail = false;
          if (maindoc.From.indexOf('@') > -1){
            if (maindoc.From != req.signedCookies.email){
              sendmail = true;
            }
          }
          if (sendmail){
            cache.getDbInfo(req, false, function(dbinfo){
              var subject = config.newreply.subject;
              subject = subject.replace('<from>', req.signedCookies.email);
              subject = subject.replace('<db>', dbinfo.title);
              subject = subject.replace('<Document>', maindoc.Subject);
              var body = config.newreply.body;
              body = body.replace('<link>', config.apphost + 'document/' + req.params.db + "/" + req.params.parentunid);
              var email = {
                from: 'keep.works support <support@keep.works>',
                to: maindoc.From,
                subject: subject,
                text: body
              }
              mailgun.messages().send(email, function(error, body){
                res.redirect("/doclibrary/document/" + req.params.db + "/" + req.params.parentunid);
              })
            })
          }else{
            res.redirect("/doclibrary/document/" + req.params.db + "/" + req.params.parentunid);
          }
        })
      })
    }else{
      restler.postJson(
        url,
        data,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(data, response){
        res.redirect("/doclibrary/document/" + req.params.db + "/" + req.params.parentunid);
      })
    }
  })

  app.get('/doclibrary/file/:db/:collection/:unid/:filename', login.requiresLogin, function(req, res, next){
    restler.get(
      config.apihost + "/attachment/" + req.params.db + "/" + req.params.collection + "/" + req.params.unid + "/" + req.params.filename,
      {headers:
        {'cookie': getCookies(req)}
      }
    )
    .on('complete', function(data, response){
      res.setHeader('Content-Type', response.headers['content-type']);
      res.setHeader('Content-Length', response.headers['content-length']);
      res.setHeader('Content-Disposition', response.headers['content-disposition']);
      res.send(response.raw);
    })
  })

  app.delete('/doclibrary/file/:db/:collection/:unid/:filename', login.requiresLogin, function(req, res, next){
    restler.del(
      config.apihost + "/attachment/" + req.params.db + "/" + req.params.collection + "/" + req.params.unid + "/" + req.params.filename,
      {headers:
        {'cookie': getCookies(req)}
      }
    )
    .on('complete', function(data, response){
      res.send("ok");
    })
  })

  app.get('/doclibrary/search/:db', login.requiresLogin, function(req, res, next){
    renderSearch(req, res, 1);
  })

  app.get('/doclibrary/search/:db/:pageno', login.requiresLogin, function(req, res, next){
    renderSearch(req, res, req.params.pageno);
  })

  function renderSearch(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.postJson(
          config.apihost + "/search/" + req.params.db + "/Document?count=" + config.count + "&start=" + (config.count * (pageno - 1)),
          {"fulltext": req.query.keywords},
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.data){
            if (data.name && data.name == 'SearchError' && data['$err'] && data['$err'] == 'The collection must be full text indexed'){
              //Make sure the FT index is created
              restler.postJson(
                config.apihost + "/database/" + req.params.db,
                {
                  indexed: true
                },
                {headers: { 'apikey': config.adminapikey }}
              ).on('complete', function(){
                res.redirect('/doclibrary/search/' + req.params.db + "?keywords=" + req.query.keywords);
              })
            }else{
              res.redirect("/opendatabase/" + req.params.db);
            }
          }else{
            var nextpage = parseInt(pageno, 10) + 1;
            var previouspage = pageno - 1;
            var pages = Math.floor((data.count / config.count));
            if (pages == 0){
              pages = 1;
            }
            if (nextpage > pages){
              nextpage = pages;
            }
            if (previouspage < 1){
              previouspage = 1;
            }
            res.render('doclibrary/search', {
              template: 'doclibrary',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              dbinfo: dbinfo,
              isAdmin: userdetails.isAdmin,
              breadcrumbs: [
                {title: dbinfo.title, link: "/doclibrary/index/" + dbinfo.db},
                {title: "Search: " + req.query.keywords}
              ],
              menuitems: [
                {link: "/doclibrary/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/doclibrary/newtopic/" + req.params.db, icon: "fa-pencil", label: "New Topic"}
              ],
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

  app.get('/doclibrary/user/:db/:user', login.requiresLogin, function(req, res, next){
    renderUser(req, res, 1);
  })

  app.get('/doclibrary/user/:db/:user/:pageno', login.requiresLogin, function(req, res, next){
    renderUser(req, res, req.params.pageno);
  })

  function renderUser(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.postJson(
          config.apihost + "/search/" + req.params.db + "/Document?count=" + config.count + "&start=" + (config.count * (pageno - 1)),
          {"filters": [
            {
              "operator": "equals",
              "field": "AltFrom",
              "value": req.params.user
            },
            {
              "operator": "equals",
              "field": "From",
              "value": req.params.user
            }
          ]},
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.next_page && !data.data){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            var nextpage = parseInt(pageno, 10) + 1;
            var previouspage = pageno - 1;
            var pages = Math.floor((data.count / config.count));
            if (pages == 0){
              pages = 1;
            }
            if (nextpage > pages){
              nextpage = pages;
            }
            if (previouspage < 1){
              previouspage = 1;
            }
            res.render('doclibrary/user', {
              template: 'doclibrary',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              dbinfo: dbinfo,
              isAdmin: userdetails.isAdmin,
              breadcrumbs: [
                {title: dbinfo.title, link: "/doclibrary/index/" + dbinfo.db},
                {title: "User: " + formatNotesName(req.params.user)}
              ],
              menuitems: [
                {link: "/doclibrary/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/doclibrary/newtopic/" + req.params.db, icon: "fa-pencil", label: "New Topic"}
              ],
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

  app.get('/doclibrary/category/:db/:category', login.requiresLogin, function(req, res, next){
    renderCategory(req, res, 0);
  })

  app.get('/doclibrary/category/:db/:category/:pageno', login.requiresLogin, function(req, res, next){
    renderCategory(req, res, req.params.pageno);
  })

  function renderCategory(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.postJson(
          config.apihost + "/search/" + req.params.db + "/Document?count=" + config.count + "&start=" + (config.count * pageno),
          {"filters": [
            {
              "operator": "equals",
              "field": "Categories",
              "value": req.params.category
            }
          ]},
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.next_page && !data.data){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            var nextpage = parseInt(pageno, 10) + 1;
            var previouspage = pageno - 1;
            var pages = Math.floor((data.count / config.count));
            if (pages == 0){
              pages = 1;
            }
            if (nextpage > pages){
              nextpage = pages;
            }
            if (previouspage < 1){
              previouspage = 1;
            }
            res.render('doclibrary/category', {
              template: 'doclibrary',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbinfo: dbinfo,
              dbicon: '/getdbicon/' + req.params.db,
              isAdmin: userdetails.isAdmin,
              breadcrumbs: [
                {title: dbinfo.title, link: "/doclibrary/index/" + dbinfo.db},
                {title: "Category: " + req.params.category}
              ],
              menuitems: [
                {link: "/doclibrary/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/doclibrary/newtopic/" + req.params.db, icon: "fa-pencil", label: "New Topic"}
              ],
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

  app.get('/doclibrary/exporttopics/:db', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/collections/" + req.params.db + "/Document?sortdesc=__created&count=5000",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          res.writeHead(200, {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Access-Control-Allow-Origin': '*',
            'Content-Disposition': 'attachment; filename=' + dbinfo.title + '.xlsx'
          });
          var writer = new XLSXWriter(dbinfo.title + ".xlsx", {});
          writer.getReadStream().pipe(res);
          if (data.data){
            for (var i=0; i<data.data.length; i++){
              var document = data.data[i];
              writer.addRow({
                "Subject": document.Subject?document.Subject:'',
                "Categories": Array.isArray(document.Categories)?document.Categories.join(', '):document.Categories,
                "Body": sanitizeHtml(document.Body__parsed, {allowedTags: []}),
                "Created": moment(document.__created).format(config.datetimeformat),
                "Created By": formatNotesName(document.From),
                "Files": Array.isArray(document._files)?document._files.join(", "):document._files,
                "Link": {value: "Open in keep.works", hyperlink: config.apphost + "doclibrary/document/" + req.params.db + "/" + document.__unid}
              })
            }
          }
          writer.finalize();
        })
      })
    })
  })

  app.get('/doclibrary/exportdocument/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/Document/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(document, response){
          if (!document.__unid){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            restler.get(
              config.apihost + "/responses/" + req.params.db + "/Document/" + req.params.unid + "?expand=true",
              {headers:
                {'cookie': getCookies(req)}
              }
            )
            .on('complete', function(responses, response){
              res.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Access-Control-Allow-Origin': '*',
                'Content-Disposition': 'attachment; filename=' + req.params.unid + '.pdf'
              });
              var doc = new PDFDocument;
              doc.registerFont('Raleway', 'public/fonts/Raleway/Raleway-Medium.ttf', 'Raleway');
              doc.registerFont('Raleway-Bold', 'public/fonts/Raleway/Raleway-Bold.ttf', 'Raleway-Bold');
              doc.title = "keep.works document export: " + dbinfo.title + " | " + document.Subject;
              doc.author = req.signedCookies.email;
              doc.subject = "keep.works document export: " + dbinfo.title + " | " + document.Subject;
              doc.pipe(res);

              doc.fontSize(16).font('Raleway-Bold').text(document.Subject);
              doc.fontSize(14).font('Raleway').text(moment(document.__created).format("DD MMMM YYYY HH:mm"));
              doc.fontSize(14).font('Raleway').text(formatNotesName(document.From));
              doc.fontSize(14).font('Raleway').text("    ");
              if(document.Categories){
                doc.fontSize(10).font("Raleway-Bold").text('Categories');
                doc.fontSize(12).font("Raleway").text(Array.isArray(document.Categories)?document.Categories.join(", "):document.Categories);
                doc.fontSize(6).font('Raleway').text("    ");
              }
              if(document.Body__parsed){
                doc.fontSize(10).font("Raleway-Bold").text('Body');
                var html = sanitizeHtml(document.Body__parsed, {
                  allowedTags: ['br'],
                });
                html = html.replace(/<br\s*[\/]?>/gi, "\n");
                doc.fontSize(12).font("Raleway").text(html);
                doc.fontSize(6).font('Raleway').text("    ");
              }
              if(document._files){
                doc.fontSize(10).font("Raleway-Bold").text('Files: ');
                doc.fontSize(12).font("Raleway").text(Array.isArray(document._files)?document._files.join(", "):document._files);
                doc.fontSize(6).font('Raleway').text("    ");
              }
              if (responses.data.length > 0){
                doc.fontSize(16).font('Raleway-Bold').text("Responses");
                for(var i=0; i<responses.data.length; i++){
                  var response = responses.data[i];
                  doc.fontSize(14).font('Raleway-Bold').text(response.Subject);
                  doc.fontSize(14).font('Raleway').text(moment(response.__created).format("DD MMMM YYYY HH:mm"));
                  doc.fontSize(14).font('Raleway').text(formatNotesName(response.From));
                  doc.fontSize(14).font('Raleway').text("    ");
                  if(response.Body){
                    doc.fontSize(10).font("Raleway-Bold").text('Body');
                    var html = sanitizeHtml(response.Body__parsed);
                    html = html.replace(/<br\s*[\/]?>/gi, "\n");
                    doc.fontSize(12).font("Raleway").text(html);
                    doc.fontSize(6).font('Raleway').text("    ");
                  }
                  if(response._files){
                    doc.fontSize(10).font("Raleway-Bold").text('Files: ');
                    doc.fontSize(12).font("Raleway").text(Array.isArray(response._files)?response._files.join(", "):response._files);
                    doc.fontSize(6).font('Raleway').text("    ");
                  }
                }
              }
              doc.end();
            })
          }
        })
      })
    })
  })
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
