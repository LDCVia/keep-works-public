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
var mailgun = require('mailgun-js')({apiKey: config.mailgunapikey, domain: config.mailgundomain});

module.exports = function(app){
  app.get('/mail/index/:db', login.requiresLogin, function(req, res, next){
    renderIndex(req, res, 1);
  })

  app.get('/mail/index/:db/:pageno', login.requiresLogin, function(req, res, next){
    renderIndex(req, res, req.params.pageno);
  })

  function renderIndex(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/collections/" + req.params.db + "/Memo?sortdesc=__created&count=" + config.count + "&start=" + (config.count * (pageno - 1)),
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
            res.render('mail/index', {
              template: 'mail',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              menuitems: [
                {link: "/mail/index/" + req.params.db, icon: "fa-home", label: dbinfo.title, active: true}
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

  app.get('/mail/document/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/Memo/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.__unid){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            restler.get(
              config.apihost + "/responses/" + req.params.db + "/Memo/" + req.params.unid + "?expand=true&threaded=true",
              {headers:
                {'cookie': getCookies(req)}
              }
            )
            .on('complete', function(data2, response){
              res.render('mail/document', {
                template: 'mail',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                breadcrumbs: [
                  {title: dbinfo.title, link: "/mail/index/" + dbinfo.db},
                  {title: data.Subject}
                ],
                menuitems: [
                  {link: "/mail/index/" + req.params.db, icon: "fa-home", label: dbinfo.title}
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

  app.get('/mail/response/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/Reply/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.__unid){
            res.redirect('/mail/document/' + req.params.db + "/" + req.params.unid);
          }else{
            res.render('mail/response', {
              template: 'mail',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              breadcrumbs: [
                {title: dbinfo.title, link: "/mail/index/" + dbinfo.db},
                {title: data.Subject}
              ],
              menuitems: [
                {link: "/mail/index/" + req.params.db, icon: "fa-home", label: dbinfo.title}
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

  app.get('/mail/file/:db/:collection/:unid/:filename', login.requiresLogin, function(req, res, next){
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

  app.get('/mail/search/:db', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.postJson(
          config.apihost + "/search/" + req.params.db + "/Memo?count=100",
          {"fulltext": req.query.keywords},
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(memos, response){
          if (!memos.data){
            if (memos.name && memos.name == 'SearchError' && memos['$err'] && memos['$err'] == 'The collection must be full text indexed'){
              //Make sure the FT index is created
              restler.postJson(
                config.apihost + "/database/" + req.params.db,
                {
                  indexed: true
                },
                {headers: { 'apikey': config.adminapikey }}
              ).on('complete', function(){
                res.redirect('/mail/search/' + req.params.db + "?keywords=" + req.query.keywords);
              })
            }else{
              res.redirect("/opendatabase/" + req.params.db);
            }
          }else{
            restler.postJson(
              config.apihost + "/search/" + req.params.db + "/Reply?count=100",
              {"fulltext": req.query.keywords},
              {headers:
                {'cookie': getCookies(req)}
              }
            )
            .on('complete', function(responses, response){
              if (!responses.data){
                responses = {count: 0, data: []}
              }
              res.render('mail/search', {
                template: 'mail',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                dbinfo: dbinfo,
                isAdmin: userdetails.isAdmin,
                breadcrumbs: [
                  {title: dbinfo.title, link: "/mail/index/" + dbinfo.db},
                  {title: "Search: " + req.query.keywords}
                ],
                menuitems: [
                  {link: "/mail/index/" + req.params.db, icon: "fa-home", label: dbinfo.title}
                ],
                query: req.query.keywords,
                db: req.params.db,
                memos: memos,
                responses: responses
              });

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
