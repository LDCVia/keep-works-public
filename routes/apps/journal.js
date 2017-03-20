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
var mailgun = require('mailgun-js')({apiKey: config.mailgunapikey, domain: config.mailgundomain});
var moment = require('moment');

module.exports = function(app){

  app.get('/journal/entries/:db', login.requiresLogin, function(req, res, next){
    renderEntries(req, res, 1);
  })

  app.get('/journal/entries/:db/:pageno', login.requiresLogin, function(req, res, next){
    renderEntries(req, res, req.params.pageno);
  })

  function renderEntries(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/collections/" + req.params.db + "/JournalEntry?sortdesc=DiaryDate&count=" + config.count + "&start=" + (config.count * (pageno - 1)),
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
            res.render('journal/entries', {
              template: 'journal',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              menuitems: [
                {link: "/journal/entries/" + req.params.db, icon: "fa-home", label: dbinfo.title, active: true},
                {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry"},
                {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet"}
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

  app.get('/journal/entry/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/JournalEntry/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.__unid){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            res.render('journal/entry', {
              template: 'journal',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              breadcrumbs: [
                {title: dbinfo.title + " Entries", link: "/journal/entries/" + dbinfo.db},
                {title: data.Subject}
              ],
              menuitems: [
                {link: "/journal/entries/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry"},
                {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet"}
              ],
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

  app.get('/journal/entryedit/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        cache.getCategories(req, "JournalEntry", "Categories", function(categories){
          restler.get(
            config.apihost + "/document/" + req.params.db + "/JournalEntry/" + req.params.unid + "?all",
            {headers:
              {'cookie': getCookies(req)}
            }
          )
          .on('complete', function(data, response){
            if (!data.__unid){
              res.redirect("/login?redirectto=" + req.url);
            }else{
              data.NewCategories = "";
              res.render('journal/entryedit', {
                template: 'journal',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                breadcrumbs: [
                  {title: dbinfo.title + " Entries", link: "/journal/entries/" + dbinfo.db},
                  {title: data.Subject}
                ],
                menuitems: [
                  {link: "/journal/entries/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                  {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry"},
                  {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet"}
                ],
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                db: req.params.db,
                document: data,
                CategoryOptions: categories
              })
            }
          })
        })
      })
    })
  })

  app.get('/journal/entrydelete/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getDbInfo(req, false, function(dbinfo){
      restler.del(
        config.apihost + "/document/" + req.params.db + "/JournalEntry/" + req.params.unid,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(){
        res.send('/journal/entries/' + req.params.db);
      })
    })
  })

  app.get('/journal/newentry/:db', login.requiresLogin, function(req, res, next){
    renderNewEntry(req, res, {
      __unid: "new",
      Subject: "",
      Categories: [],
      NewCategories: "",
      Body__parsed: "",
      DiaryDate: moment().format("DD MMM YYYY")
    })
  })

  function renderNewEntry(req, res, seeddata, error){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        cache.getCategories(req, "JournalEntry", "Categories", function(categories){
          res.render('journal/entryedit', {
            template: 'journal',
            sitetitle: config.sitetitle,
            pagetitle: dbinfo.title,
            dbicon: '/getdbicon/' + req.params.db,
            dbinfo: dbinfo,
            isAdmin: userdetails.isAdmin,
            breadcrumbs: [
              {title: dbinfo.title + " Entries", link: "/journal/entries/" + dbinfo.db},
              {title: "New Entry"}
            ],
            menuitems: [
              {link: "/journal/entries/" + req.params.db, icon: "fa-home", label: dbinfo.title},
              {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry", active: true},
              {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet"}
            ],
            db: req.params.db,
            document: seeddata,
            CategoryOptions: categories,
            error: error
          })
        })
      })
    })
  }

  app.post('/journal/entryedit/:db/:unid', upload.single('upload'), function(req, res, next){
    var url = config.apihost + "/document/" + req.params.db + "/JournalEntry";
    if (req.params.unid != "new"){
      url += "/" + req.params.unid;
    }
    var data = {};
    data.From = req.signedCookies.email;
    data.AbbreviateFrom = req.signedCookies.email;
    data.AltFrom = req.signedCookies.email;
    data.Body__parsed = req.body.Body;
    data.DiaryDate = moment(req.body.DiaryDate).format();
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
    data.__form = "JournalEntry";
    if (req.params.unid == "new"){
      if (!data.history){
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' created Document at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.putJson(
        url,
        data,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(data, response){
        if (data == "Maximum number of databases reached or exceeded"){
          renderNewEntry(req, res, req.body, data);
        }else{
          res.redirect("/journal/entries/" + req.params.db);
        }
      })
    }else{
      if (!data.history){
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' updated Document at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.postJson(
        url,
        data,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(data, response){
        res.redirect("/journal/entries/" + req.params.db);
      })
    }
  })

  app.get('/journal/file/:db/:collection/:unid/:filename', login.requiresLogin, function(req, res, next){
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

  app.delete('/journal/file/:db/:collection/:unid/:filename', login.requiresLogin, function(req, res, next){
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

  app.get('/journal/search/:db', login.requiresLogin, function(req, res, next){
    renderSearch(req, res, 1);
  })

  app.get('/journal/search/:db/:pageno', login.requiresLogin, function(req, res, next){
    renderSearch(req, res, req.params.pageno);
  })

  function renderSearch(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.postJson(
          config.apihost + "/search/" + req.params.db + "/JournalEntry?count=" + config.count + "&start=" + (config.count * (pageno - 1)),
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
                res.redirect('/journal/search/' + req.params.db + "?keywords=" + req.query.keywords);
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
            res.render('journal/search', {
              template: 'journal',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              dbinfo: dbinfo,
              isAdmin: userdetails.isAdmin,
              breadcrumbs: [
                {title: dbinfo.title + " Entries", link: "/journal/entries/" + dbinfo.db},
                {title: "Search: " + req.query.keywords}
              ],
              menuitems: [
                {link: "/journal/entries/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry"},
                {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet"}
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

  app.get('/journal/category/:db/:category', login.requiresLogin, function(req, res, next){
    renderCategory(req, res, 1);
  })

  app.get('/journal/category/:db/:category/:pageno', login.requiresLogin, function(req, res, next){
    renderCategory(req, res, req.params.pageno);
  })

  function renderCategory(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.postJson(
          config.apihost + "/search/" + req.params.db + "/JournalEntry?count=" + config.count + "&start=" + (config.count * (pageno - 1)),
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
            res.redirect("/journal/entries/" + req.params.db);
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
            res.render('journal/category', {
              template: 'journal',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              dbinfo: dbinfo,
              isAdmin: userdetails.isAdmin,
              breadcrumbs: [
                {title: dbinfo.title + " Entries", link: "/journal/entries/" + dbinfo.db},
                {title: "Category: " + req.params.category}
              ],
              menuitems: [
                {link: "/journal/entries/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry"},
                {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet"}
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

  app.get('/journal/cleansheets/:db', login.requiresLogin, function(req, res, next){
    renderCleanSheets(req, res, 1);
  })

  app.get('/journal/cleansheets/:db/:pageno', login.requiresLogin, function(req, res, next){
    renderCleanSheets(req, res, req.params.pageno);
  })

  function renderCleanSheets(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/collections/" + req.params.db + "/CleanSheet?sortdesc=DiaryDate&count=" + config.count + "&start=" + (config.count * (pageno - 1)),
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
            res.render('journal/cleansheets', {
              template: 'journal',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              menuitems: [
                {link: "/journal/cleansheets/" + req.params.db, icon: "fa-home", label: dbinfo.title, active: true},
                {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry", dataintro: "Click here to add a new entry"},
                {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet", dataintro: "Click here to add a new clean sheet"}
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

  app.get('/journal/searchcleansheets/:db', login.requiresLogin, function(req, res, next){
    renderSearchCleansheets(req, res, 1);
  })

  app.get('/journal/searchcleansheets/:db/:pageno', login.requiresLogin, function(req, res, next){
    renderSearchCleansheets(req, res, req.params.pageno);
  })

  function renderSearchCleansheets(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.postJson(
          config.apihost + "/search/" + req.params.db + "/CleanSheet?count=" + config.count + "&start=" + (config.count * (pageno - 1)),
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
                res.redirect('/journal/searchcleansheets/' + req.params.db + "?keywords=" + req.query.keywords);
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
            res.render('journal/searchcleansheets', {
              template: 'journal',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              dbinfo: dbinfo,
              isAdmin: userdetails.isAdmin,
              breadcrumbs: [
                {title: dbinfo.title + " Entries", link: "/journal/cleansheets/" + dbinfo.db},
                {title: "Search: " + req.query.keywords}
              ],
              menuitems: [
                {link: "/journal/cleansheets/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry"},
                {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet"}
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

  app.get('/journal/cleansheet/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/CleanSheet/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.__unid){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            res.render('journal/cleansheet', {
              template: 'journal',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              breadcrumbs: [
                {title: dbinfo.title + " Clean Sheets", link: "/journal/cleansheets/" + dbinfo.db},
                {title: "Clean Sheet"}
              ],
              menuitems: [
                {link: "/journal/cleansheets/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry"},
                {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet"}
              ],
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

  app.get('/journal/cleansheetedit/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/CleanSheet/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.__unid){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            data.NewCategories = "";
            res.render('journal/cleansheetedit', {
              template: 'journal',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              breadcrumbs: [
                {title: dbinfo.title + " Clean Sheets", link: "/journal/cleansheets/" + dbinfo.db},
                {title: "Clean Sheet"}
              ],
              menuitems: [
                {link: "/journal/cleansheets/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry"},
                {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet"}
              ],
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

  app.get('/journal/cleansheetdelete/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getDbInfo(req, false, function(dbinfo){
      restler.del(
        config.apihost + "/document/" + req.params.db + "/CleanSheet/" + req.params.unid,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(){
        res.send('/journal/cleansheets/' + req.params.db);
      })
    })
  })

  app.get('/journal/newcleansheet/:db', login.requiresLogin, function(req, res, next){
    renderNewCleanSheet(req, res, {
      __unid: "new",
      Body__parsed: "",
      DiaryDate: moment().format("DD MMM YYYY")
    })
  })

  function renderNewCleanSheet(req, res, seeddata, error){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        res.render('journal/cleansheetedit', {
          template: 'journal',
          sitetitle: config.sitetitle,
          pagetitle: dbinfo.title,
          dbicon: '/getdbicon/' + req.params.db,
          dbinfo: dbinfo,
          isAdmin: userdetails.isAdmin,
          breadcrumbs: [
            {title: dbinfo.title + " Clean Sheets", link: "/journal/cleansheets/" + dbinfo.db},
            {title: "New Clean Sheet"}
          ],
          menuitems: [
            {link: "/journal/cleansheets/" + req.params.db, icon: "fa-home", label: dbinfo.title},
            {link: "/journal/newentry/" + req.params.db, icon: "fa-pencil", label: "New Entry"},
            {link: "/journal/newcleansheet/" + req.params.db, icon: "fa-pencil-square-o", label: "New Clean Sheet", active: true}
          ],
          db: req.params.db,
          document: seeddata,
          error: error
        })
      })
    })
  }

  app.post('/journal/cleansheetedit/:db/:unid', upload.single('upload'), function(req, res, next){
    var url = config.apihost + "/document/" + req.params.db + "/CleanSheet";
    if (req.params.unid != "new"){
      url += "/" + req.params.unid;
    }
    var data = {};
    data.From = req.signedCookies.email;
    data.AbbreviateFrom = req.signedCookies.email;
    data.AltFrom = req.signedCookies.email;
    data.Body__parsed = req.body.Body;
    data.DiaryDate = moment(req.body.DiaryDate).format();
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
    data.__form = "CleanSheet";
    if (req.params.unid == "new"){
      if (!data.history){
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' created Document at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.putJson(
        url,
        data,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(data, response){
        if (data == "Maximum number of databases reached or exceeded"){
          renderNewCleanSheet(req, res, req.body, data);
        }else{
          res.redirect("/journal/cleansheets/" + req.params.db);
        }
      })
    }else{
      if (!data.history){
        data.history = [];
      }
      data.history.push(req.signedCookies.email + ' updated Document at ' + moment().format('DD MMM YYYY HH:mm'));

      restler.postJson(
        url,
        data,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(data, response){
        res.redirect("/journal/cleansheets/" + req.params.db);
      })
    }
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
