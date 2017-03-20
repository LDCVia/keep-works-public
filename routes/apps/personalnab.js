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
var XLSXWriter = require('xlsx-writestream');
var mailgun = require('mailgun-js')({apiKey: config.mailgunapikey, domain: config.mailgundomain});
var count = 30;

module.exports = function(app){
  app.get('/personalnab/index/:db', login.requiresLogin, function(req, res, next){
    renderIndex(req, res, 1);
  })

  app.get('/personalnab/index/:db/:pageno', login.requiresLogin, function(req, res, next){
    renderIndex(req, res, req.params.pageno);
  })

  function renderIndex(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/collections/" + req.params.db + "/Person?sortasc=LastName&count=" + count + "&start=" + (count * (pageno - 1)),
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
            var pages = Math.ceil((data.count / count));
            if (pages == 0){
              pages = 1;
            }
            if (nextpage > pages){
              nextpage = pages;
            }
            if (previouspage < 1){
              previouspage = 1;
            }
            res.render('personalnab/index', {
              template: 'personalnab',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              menuitems: [
                {link: "/personalnab/index/" + req.params.db, icon: "fa-home", label: dbinfo.title, active: true},
                {link: "/personalnab/newperson/" + req.params.db, icon: "fa-pencil", label: "New Person"},
                {link: "/personalnab/exportpeople/" + req.params.db, icon: 'fa-file-excel-o', label: "Export to Excel"}
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

  app.get('/personalnab/groups/:db', login.requiresLogin, function(req, res, next){
    renderGroups(req, res, 1);
  })

  app.get('/personalnab/groups/:db/:pageno', login.requiresLogin, function(req, res, next){
    renderGroups(req, res, req.params.pageno);
  })

  function renderGroups(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/collections/" + req.params.db + "/Group?sortasc=ListName&count=" + count + "&start=" + (count * (pageno - 1)),
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
            var pages = Math.ceil((data.count / count));
            if (pages == 0){
              pages = 1;
            }
            if (nextpage > pages){
              nextpage = pages;
            }
            if (previouspage < 1){
              previouspage = 1;
            }
            res.render('personalnab/groups', {
              template: 'personalnab',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              menuitems: [
                {link: "/personalnab/groups/" + req.params.db, icon: "fa-home", label: dbinfo.title, active: true},
                {link: "/personalnab/newgroup/" + req.params.db, icon: "fa-pencil", label: "New Group"}
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

  app.get('/personalnab/person/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/Person/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.__unid){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            var address = [
              data.StreetAddress,
              data.City,
              data.State,
              data.Zip,
              data.Country
            ]
            data.address = address.clean("");
            data.address = data.address.clean(undefined);
            var officeaddress = [
              data.OfficeStreetAddress,
              data.OfficeCity,
              data.OfficeState,
              data.OfficeZip,
              data.OfficeCountry
            ]
            data.officeaddress = officeaddress.clean("");
            data.officeaddress = data.officeaddress.clean(undefined);
            var otheraddress = [
              data.OtherStreetAddress,
              data.OtherCity,
              data.OtherState,
              data.OtherZip,
              data.OtherCountry
            ]
            data.otheraddress = otheraddress.clean("");
            data.otheraddress = data.otheraddress.clean(undefined);
            res.render('personalnab/person', {
              template: 'personalnab',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              breadcrumbs: [
                {title: dbinfo.title, link: "/personalnab/index/" + dbinfo.db},
                {title: data.FullName}
              ],
              menuitems: [
                {link: "/personalnab/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/personalnab/newperson/" + req.params.db, icon: "fa-pencil", label: "New Person"}
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

  app.get('/personalnab/personedit/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/Person/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.__unid){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            data.NewCategories = "";
            res.render('personalnab/personedit', {
              template: 'personalnab',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              breadcrumbs: [
                {title: dbinfo.title, link: "/personalnab/index/" + dbinfo.db},
                {title: data.FullName}
              ],
              menuitems: [
                {link: "/personalnab/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/personalnab/newperson/" + req.params.db, icon: "fa-pencil", label: "New Person"}
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

  app.get('/personalnab/persondelete/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getDbInfo(req, false, function(dbinfo){
      restler.del(
        config.apihost + "/document/" + req.params.db + "/Person/" + req.params.unid,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(){
        res.send('/personalnab/index/' + req.params.db);
      })
    })
  })

  app.get('/personalnab/newperson/:db', login.requiresLogin, function(req, res, next){
    renderNewPerson(req, res, {
      __unid: "new"
    });
  })

  function renderNewPerson(req, res, seeddata, error){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        res.render('personalnab/personedit', {
          template: 'personalnab',
          sitetitle: config.sitetitle,
          pagetitle: dbinfo.title,
          dbicon: '/getdbicon/' + req.params.db,
          dbinfo: dbinfo,
          isAdmin: userdetails.isAdmin,
          breadcrumbs: [
            {title: dbinfo.title, link: "/personalnab/index/" + dbinfo.db},
            {title: "New Person"}
          ],
          menuitems: [
            {link: "/personalnab/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
            {link: "/personalnab/newperson/" + req.params.db, icon: "fa-pencil", label: "New Person", active: true}
          ],
          db: req.params.db,
          document: seeddata,
          error: error
        })
      })
    })
  }

  app.post('/personalnab/personedit/:db/:unid', upload.single('upload'), function(req, res, next){
    var url = config.apihost + "/document/" + req.params.db + "/Person";
    if (req.params.unid != "new"){
      url += "/" + req.params.unid;
    }
    var data = req.body;
    var fullname = "";
    if (data.FirstName && data.FirstName != ""){
      fullname = data.FirstName;
    }
    if (data.MiddleInitial && data.MiddleInitial != ""){
      if (fullname != ""){
        fullname += " ";
      }
      fullname += data.MiddleInitial;
    }
    if (data.LastName && data.LastName != ""){
      if (fullname != ""){
        fullname += " ";
      }
      fullname += data.LastName;
    }
    data.FullName = fullname;
    data.From = req.signedCookies.email;
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
    data.__form = "Person";
    if (req.params.unid == "new"){
      data.history = [req.signedCookies.email + ' created document at ' + moment().format('DD MMM YYYY HH:mm')];
      restler.putJson(
        url,
        data,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(data, response){
        if (data == "Maximum number of databases reached or exceeded"){
          renderNewPerson(req, res, req.body, data);
        }else{
          res.redirect("/personalnab/index/" + req.params.db);
        }
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
      .on('complete', function(data, response){
        res.redirect("/personalnab/index/" + req.params.db);
      })
    }
  })

  app.get('/personalnab/group/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/Group/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.__unid){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            res.render('personalnab/group', {
              template: 'personalnab',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              breadcrumbs: [
                {title: dbinfo.title, link: "/personalnab/groups/" + dbinfo.db},
                {title: data.ListName}
              ],
              menuitems: [
                {link: "/personalnab/groups/" + req.params.db, icon: "fa-home", label: dbinfo.title, active: true},
                {link: "/personalnab/newgroup/" + req.params.db, icon: "fa-pencil", label: "New Group"}
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

  app.get('/personalnab/groupedit/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/document/" + req.params.db + "/Group/" + req.params.unid + "?all",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if (!data.__unid){
            res.redirect("/login?redirectto=" + req.url);
          }else{
            data.NewCategories = "";
            res.render('personalnab/groupedit', {
              template: 'personalnab',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              breadcrumbs: [
                {title: dbinfo.title, link: "/personalnab/groups/" + dbinfo.db},
                {title: data.ListName}
              ],
              menuitems: [
                {link: "/personalnab/groups/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/personalnab/newgroup/" + req.params.db, icon: "fa-pencil", label: "New Group"}
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

  app.get('/personalnab/groupdelete/:db/:unid', login.requiresLogin, function(req, res, next){
    cache.getDbInfo(req, false, function(dbinfo){
      restler.del(
        config.apihost + "/document/" + req.params.db + "/Group/" + req.params.unid,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(){
        res.send('/personalnab/groups/' + req.params.db);
      })
    })
  })

  app.get('/personalnab/newgroup/:db', login.requiresLogin, function(req, res, next){
    renderNewGroup(req, res, {
      __unid: "new"
    });
  })

  function renderNewGroup(req, res, seeddata, error){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        res.render('personalnab/groupedit', {
          template: 'personalnab',
          sitetitle: config.sitetitle,
          pagetitle: dbinfo.title,
          dbinfo: dbinfo,
          dbicon: '/getdbicon/' + req.params.db,
          isAdmin: userdetails.isAdmin,
          breadcrumbs: [
            {title: dbinfo.title, link: "/personalnab/groups/" + dbinfo.db},
            {title: "New Group"}
          ],
          menuitems: [
            {link: "/personalnab/groups/" + req.params.db, icon: "fa-home", label: dbinfo.title},
            {link: "/personalnab/newgroup/" + req.params.db, icon: "fa-pencil", label: "New Group", active: true}
          ],
          db: req.params.db,
          document: seeddata,
          error: error
        })
      })
    })
  }

  app.post('/personalnab/groupedit/:db/:unid', upload.single('upload'), function(req, res, next){
    var url = config.apihost + "/document/" + req.params.db + "/Group";
    if (req.params.unid != "new"){
      url += "/" + req.params.unid;
    }
    var data = req.body;
    data.From = req.signedCookies.email;
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
    data.__form = "Group";
    if (req.params.unid == "new"){
      data.history = [req.signedCookies.email + ' created document at ' + moment().format('DD MMM YYYY HH:mm')];
      restler.putJson(
        url,
        data,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(data, response){
        res.redirect("/personalnab/groups/" + req.params.db);
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
      .on('complete', function(data, response){
        if (data == "Maximum number of databases reached or exceeded"){
          renderNewGroup(req, res, req.body, data);
        }else{
          res.redirect("/personalnab/groups/" + req.params.db);
        }
      })
    }
  })

  app.get('/personalnab/file/:db/:collection/:unid/:filename', login.requiresLogin, function(req, res, next){
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

  app.get('/personalnab/search/:db', login.requiresLogin, function(req, res, next){
    renderSearch(req, res, 1);
  })

  app.get('/personalnab/search/:db/:pageno', login.requiresLogin, function(req, res, next){
    renderSearch(req, res, req.params.pageno);
  })

  function renderSearch(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.postJson(
          config.apihost + "/search/" + req.params.db + "/Person?count=" + count + "&start=" + (count * (pageno - 1)),
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
                res.redirect('/personalnab/search/' + req.params.db + "?keywords=" + req.query.keywords);
              })
            }else{
              res.redirect("/opendatabase/" + req.params.db);
            }
          }else{
            var nextpage = parseInt(pageno, 10) + 1;
            var previouspage = pageno - 1;
            var pages = Math.floor((data.count / count));
            if (pages == 0){
              pages = 1;
            }
            if (nextpage > pages){
              nextpage = pages;
            }
            if (previouspage < 1){
              previouspage = 1;
            }
            res.render('personalnab/search', {
              template: 'personalnab',
              sitetitle: config.sitetitle,
              pagetitle: dbinfo.title,
              dbicon: '/getdbicon/' + req.params.db,
              dbinfo: dbinfo,
              isAdmin: userdetails.isAdmin,
              breadcrumbs: [
                {title: dbinfo.title, link: "/personalnab/index/" + dbinfo.db},
                {title: "Search: " + req.query.keywords}
              ],
              menuitems: [
                {link: "/personalnab/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                {link: "/personalnab/newperson/" + req.params.db, icon: "fa-pencil", label: "New Person"}
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

  app.get('/personalnab/exportpeople/:db', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/collections/" + req.params.db + "/Person?count=5000",
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
              delete document.__unid;
              delete document.__href;
              delete document.__noteid;
              delete document.__created;
              delete document.__modified;
              delete document.__authors;
              delete document.__form;
              delete document.__readerrole;
              delete document.__authorrole;
              delete document._id;
              delete document.Type;
              delete document.SavedUpdate;
              delete document._id;

              writer.addRow(document)
            }
          }
          writer.finalize();
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
Array.prototype.clean = function(deleteValue) {
  for (var i = 0; i < this.length; i++) {
    if (this[i] == deleteValue) {
      this.splice(i, 1);
      i--;
    }
  }
  return this;
};
