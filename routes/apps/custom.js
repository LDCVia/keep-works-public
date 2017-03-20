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
var async = require('async');

var mailgun = require('mailgun-js')({apiKey: config.mailgunapikey, domain: config.mailgundomain});

module.exports = function(app){
  app.get('/custom/index/:db', login.requiresLogin, function(req, res, next){
    //Get the list of collections in the database and present as a grid
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/collections/" + req.params.db,
          {headers:
            {'cookie': getCookies(req)}
          }
        ).on('complete', function(data, response){
          if(!data){
            res.redirect('/login?redirectto=' + req.url);
          }
          //Merge in db meta data about each collection
          dbinfo.hiddencollections = false;
          if (dbinfo.meta && dbinfo.meta.collections){
            var dbmeta = dbinfo.meta.collections;
            for (var i=0; i<data.length; i++){
              for (var j=0; j<dbmeta.length; j++){
                if (dbmeta[j].name == data[i].collection){
                  if (dbmeta[j].title){
                    data[i].title = dbmeta[j].title;
                  }else{
                    data[i].title = dbmeta[j].name;
                  }
                  if (dbmeta[j].hidden){
                    dbinfo.hiddencollections = true;
                    data[i].hidden = dbmeta[j].hidden;
                  }else{
                    data[i].hidden = "0";
                  }
                }
              }
            }
            data = data.sort(function(a, b){
              return (a.title > b.title) ? 1 : ((b.title > a.title) ? -1 : 0);
            })
          }else{
            console.log('No dbinfo meta');
          }
          res.render('custom/index', {
            template: 'custom',
            sitetitle: config.sitetitle,
            pagetitle: dbinfo.title,
            dbicon: '/getdbicon/' + req.params.db,
            menuitems: [
              {link: "/custom/index/" + req.params.db, icon: "fa-home", label: dbinfo.title, active: true}
            ],
            dbinfo: dbinfo,
            isAdmin: userdetails.isAdmin || userdetails.customerid == "via-customer",
            db: req.params.db,
            collections: data
          });
        })
      })
    })
  })

  app.get('/custom/index/:db/:collection', login.requiresLogin, function(req, res, next){
    renderIndex(req, res, 1);
  })

  app.get('/custom/index/:db/:collection/:pageno', login.requiresLogin, function(req, res, next){
    renderIndex(req, res, req.params.pageno);
  })

  function renderIndex(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        var metaset = false;
        var dbmeta = {};
        if (dbinfo.meta && dbinfo.meta.collections){
          for (var i=0; i<dbinfo.meta.collections.length; i++){
            if (dbinfo.meta.collections[i].name == req.params.collection){
              metaset = true;
              dbmeta = dbinfo.meta.collections[i];
              break;
            }
          }
        }
        if (!metaset){
          res.redirect('/custom/editcollection/' + req.params.db + '/' + req.params.collection);
        }else{
          cache.getMetaData(req, req.params.db, req.params.collection, false, function(metadata){
            //Identify the parimary and secondary fields
            for (var i=0; i<metadata.fields.length; i++){
              if(metadata.fields[i].position == 1){
                dbmeta.primaryfield = metadata.fields[i];
              }else if(metadata.fields[i].position == 2){
                dbmeta.secondaryfield = metadata.fields[i];
              }
            }
            var sortfield = dbmeta.sortby;
            if (sortfield == "primary"){
              sortfield = dbmeta.primaryfield.fieldname;
            }
            var url = config.apihost + "/collections/" + req.params.db + "/" + req.params.collection + "?sort" + dbmeta.sortdirection + "=" + sortfield + "&count=" + config.count + "&start=" + (config.count * (pageno - 1));
            restler.get(
              url,
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
                var menuitems = [
                  {link: "/custom/index/" + req.params.db, icon: "fa-home", label: dbinfo.title}
                ];
                if (dbmeta.allowcreate && dbmeta.allowcreate == "1"){
                  menuitems.push({link: "/custom/editdocument/" + req.params.db + "/" + req.params.collection, icon: "fa-pencil", label: "New"})
                }
                menuitems.push({link: "/custom/editcollection/" + req.params.db + "/" + req.params.collection, icon: "fa-cog", label: "Collection Settings"})
                res.render('custom/collection', {
                  template: 'custom',
                  sitetitle: config.sitetitle,
                  pagetitle: dbinfo.title,
                  dbicon: '/getdbicon/' + req.params.db,
                  breadcrumbs: [
                    {title: dbinfo.title, link: "/custom/index/" + dbinfo.db},
                    {title: dbmeta.title}
                  ],
                  menuitems: menuitems,
                  dbinfo: dbinfo,
                  isAdmin: userdetails.isAdmin || userdetails.customerid == "via-customer",
                  db: req.params.db,
                  dbmeta: dbmeta,
                  collection: req.params.collection,
                  collectionmeta: metadata,
                  data: data,
                  pageno: pageno,
                  pages: pages,
                  nextpage: nextpage,
                  previouspage: previouspage
                });
              }
            })
          })
        }
      })
    })
  }

  app.get('/custom/export/:db/:collection', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        restler.get(
          config.apihost + "/collections/" + req.params.db + "/" + req.params.collection + "?sortasc=__created&count=5000",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          res.writeHead(200, {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Access-Control-Allow-Origin': '*',
            'Content-Disposition': 'attachment; filename=' + dbinfo.title + " " + req.params.collection + '.xlsx'
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

              writer.addRow(document)
            }
          }
          writer.finalize();
        })
      })
    })
  })

  app.get('/custom/document/:db/:collection/:unid', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        var metaset = false;
        var dbmeta = {};
        if (dbinfo.meta && dbinfo.meta.collections){
          for (var i=0; i<dbinfo.meta.collections.length; i++){
            if (dbinfo.meta.collections[i].name == req.params.collection){
              metaset = true;
              dbmeta = dbinfo.meta.collections[i];
              break;
            }
          }
        }
        if (!metaset){
          res.redirect('/custom/editcollection/' + req.params.db + '/' + req.params.collection);
        }else{
          cache.getMetaData(req, req.params.db, req.params.collection, false, function(metadata){
            if (!testValidAPIKeyResponse(metadata)){
              console.log('user not authenticated, redirecting to login');
              res.redirect('/login?redirectto=' + req.url);
              return;
            }
            //Identify the parimary and secondary fields
            for (var i=0; i<metadata.fields.length; i++){
              if(metadata.fields[i].position == 1){
                dbmeta.primaryfield = metadata.fields[i];
              }else if(metadata.fields[i].position == 2){
                dbmeta.secondaryfield = metadata.fields[i];
              }
            }
            //sort metadata by position
            metadata.fields = metadata.fields.sort(function(a,b) {
              return (a.position > b.position) ? 1 : ((b.position > a.position) ? -1 : 0);
            });
            restler.get(
              config.apihost + "/document/" + req.params.db + "/" + req.params.collection + "/" + req.params.unid + "?all",
              {headers:
                {'cookie': getCookies(req)}
              }
            ).on('complete', function(document, response){
              restler.get(
                config.apihost + "/responses/" + req.params.db + "/MainTopic/" + req.params.unid + "?expand=true",
                {headers:
                  {'cookie': getCookies(req)}
                }
              )
              .on('complete', function(responses, response){
                var responsemeta = [];
                var responsemetaindexes = [];
                async.eachSeries(responses.data, function(responsedoc, callback){
                  if (responsemetaindexes.indexOf(responsedoc['__form']) == -1){
                    restler.get(
                      config.apihost + "/metadata/" + req.params.db + "/" + responsedoc.__form,
                      {headers:
                        {'cookie': getCookies(req)}
                      }
                    ).on('complete', function(resmeta, response){
                      resmeta.fields = resmeta.fields.sort(function(a, b){
                        return (a.position > b.position) ? 1 : ((b.position > a.position) ? -1 : 0);
                      })
                      responsemeta.push(resmeta);
                      responsemetaindexes.push(responsedoc['__form']);
                      callback();
                    })
                  }else{
                    callback();
                  }
                }, function(err){
                  res.render('custom/document', {
                    template: 'custom',
                    sitetitle: config.sitetitle,
                    pagetitle: dbinfo.title,
                    dbicon: '/getdbicon/' + req.params.db,
                    breadcrumbs: [
                      {title: dbinfo.title, link: "/custom/index/" + dbinfo.db},
                      {title: dbmeta.title, link: "/custom/index/" + req.params.db + "/" + req.params.collection},
                      {title: document[dbmeta.primaryfield.fieldname]}
                    ],
                    menuitems: [
                      {link: "/custom/index/" + req.params.db, icon: "fa-home", label: dbinfo.title}
                    ],
                    dbinfo: dbinfo,
                    isAdmin: userdetails.isAdmin || userdetails.customerid == "via-customer",
                    db: req.params.db,
                    dbmeta: dbmeta,
                    document: document,
                    responses: responses,
                    metadata: metadata,
                    responsemeta: responsemeta,
                    responsemetaindexes: responsemetaindexes
                  });
                })
              })
            })
          })
        }
      })
    })
  })

  app.get('/custom/editcollection/:db/:collection', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      console.log(JSON.stringify(userdetails));
      cache.getDbInfo(req, true, function(dbinfo){
        var collectioninfo = {
          name: req.params.collection,
          title: req.params.collection,
          hidden: "0",
          sortby: "__created",
          sortdirection: "desc",
          allowedit: true,
          allowcreate: true,
          allowattachments: false,
          allowdeletions: false
        };
        if (dbinfo.meta && dbinfo.meta.collections){
          for (var i=0; i<dbinfo.meta.collections.length; i++){
            if (dbinfo.meta.collections[i].name == req.params.collection){
              collectioninfo = dbinfo.meta.collections[i];
            }
          }
        }
        cache.getMetaData(req, req.params.db, req.params.collection, true, function(metadata){
          if (!testValidAPIKeyResponse(metadata)){
            console.log('user not authenticated, redirecting to login');
            res.redirect('/login?redirectto=' + req.url);
          }
          //sort metadata by position
          if (metadata && metadata.fields){
            metadata.fields = metadata.fields.sort(function(a,b) {
              return (a.position > b.position) ? 1 : ((b.position > a.position) ? -1 : 0);
            });
          }
          res.render('custom/editcollection', {
            template: 'custom',
            sitetitle: config.sitetitle,
            pagetitle: dbinfo.title,
            dbicon: '/getdbicon/' + req.params.db,
            breadcrumbs: [
              {title: dbinfo.title, link: "/custom/index/" + dbinfo.db},
              {title: collectioninfo.title, link: "/custom/index/" + dbinfo.db + "/" + req.params.collection},
              {title: "Edit collection: " + req.params.collection}
            ],
            menuitems: [
              {link: "/custom/index/" + req.params.db, icon: "fa-home", label: dbinfo.title}
            ],
            dbinfo: dbinfo,
            collection: req.params.collection,
            collectioninfo: collectioninfo,
            isAdmin: userdetails.isAdmin || userdetails.customerid == "via-customer",
            db: req.params.db,
            metadata: metadata
          })
        })
      })
    })
  })

  app.post('/custom/editcollection/:db/:collection', login.requiresLogin, function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      if(userdetails.isAdmin || userdetails.customerid == "via-customer"){
        cache.getDbInfo(req, false, function(dbinfo){
          if (!dbinfo.meta){
            dbinfo.meta = {};
            dbinfo.meta.collections = [];
          }else if(!dbinfo.meta.collections){
            dbinfo.meta.collections = [];
          }
          var data = {
            name: req.params.collection,
            title: req.body.title,
            hidden: req.body.hidden,
            sortby: req.body.sortby,
            sortdirection: req.body.sortdirection,
            allowedit: req.body.allowedit,
            allowcreate: req.body.allowcreate,
            allowresponses: req.body.allowresponses,
            responsecollection: req.body.responsecollection,
            allowattachments: req.body.allowattachments,
            allowdeletions: req.body.allowdeletions
          }
          var found = false;
          for(var i=0; i<dbinfo.meta.collections.length; i++){
            if (dbinfo.meta.collections[i].name == req.params.collection){
              dbinfo.meta.collections[i] = data;
              found = true;
            }
          }
          if (!found){
            dbinfo.meta.collections.push(data);
          }
          console.log(JSON.stringify(dbinfo));
          restler.postJson(
            config.apihost + "/database/" + req.params.db,
            dbinfo,
            {headers:
              {'cookie': getCookies(req)}
            }
          ).on('complete', function(response){
            //Now update the actual meta data
            restler.postJson(
              config.apihost + "/metadata/" + req.params.db + "/" + req.params.collection,
              req.body,
              {headers:
                {'cookie': getCookies(req)}
              }
            ).on('complete', function(metaresponse, response){
              cache.getDbInfo(req, true, function(dbinfo){
                cache.getMetaData(req, req.params.db, req.params.collection, true, function(metadata){
                  res.redirect('/custom/index/' + req.params.db + '/' + req.params.collection);
                })
              })
            })
          })
        })
      }else{
        res.redirect('/custom/editcollection/' + req.params.db + '/' + req.params.collection);
      }
    })
  })

  app.get('/custom/file/:db/:collection/:unid/:filename', login.requiresLogin, function(req, res, next){
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

  app.get('/custom/search/:db/:collection', login.requiresLogin, function(req, res, next){
    renderSearch(req, res, 0);
  })

  app.get('/custom/search/:db/:collection/:pageno', login.requiresLogin, function(req, res, next){
    renderSearch(req, res, req.params.pageno);
  })

  function renderSearch(req, res, pageno){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        var metaset = false;
        var dbmeta = {};
        if (dbinfo.meta && dbinfo.meta.collections){
          for (var i=0; i<dbinfo.meta.collections.length; i++){
            if (dbinfo.meta.collections[i].name == req.params.collection){
              metaset = true;
              dbmeta = dbinfo.meta.collections[i];
              break;
            }
          }
        }
        if (!metaset){
          res.redirect('/custom/editcollection/' + req.params.db + '/' + req.params.collection);
        }else{
          cache.getMetaData(req, req.params.db, req.params.collection, false, function(metadata){
            if (!testValidAPIKeyResponse(metadata)){
              console.log('user not authenticated, redirecting to login');
              res.redirect('/login?redirectto=' + req.url);
            }
            //Identify the parimary and secondary fields
            for (var i=0; i<metadata.fields.length; i++){
              if(metadata.fields[i].position == 1){
                dbmeta.primaryfield = metadata.fields[i];
              }else if(metadata.fields[i].position == 2){
                dbmeta.secondaryfield = metadata.fields[i];
              }
            }
            //sort metadata by position
            metadata.fields = metadata.fields.sort(function(a,b) {
              return (a.position > b.position) ? 1 : ((b.position > a.position) ? -1 : 0);
            });
            restler.postJson(
              config.apihost + "/search/" + req.params.db + "/" + req.params.collection + "?count=" + config.count + "&start=" + (config.count * pageno),
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
                    res.redirect('/custom/search/' + req.params.db + "/" + req.params.collection + "?keywords=" + req.query.keywords);
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
                res.render('custom/search', {
                  template: 'custom',
                  sitetitle: config.sitetitle,
                  pagetitle: dbinfo.title,
                  dbicon: '/getdbicon/' + req.params.db,
                  dbinfo: dbinfo,
                  breadcrumbs: [
                    {title: dbinfo.title, link: "/custom/index/" + dbinfo.db},
                    {title: dbmeta.title, link: "/custom/index/" + req.params.db + "/" + req.params.collection},
                    {title: "Search: " + req.query.keywords}
                  ],
                  menuitems: [
                    {link: "/discussion/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                    {link: "/discussion/newtopic/" + req.params.db, icon: "fa-pencil", label: "New Topic"}
                  ],
                  query: req.query.keywords,
                  db: req.params.db,
                  collection: req.params.collection,
                  dbmeta: dbmeta,
                  metadata: metadata,
                  data: data,
                  pageno: pageno,
                  pages: pages,
                  nextpage: nextpage,
                  previouspage: previouspage
                });
              }
            })
          })
        }
      })
    })
  }

  //New document
  app.get('/custom/editdocument/:db/:collection', login.requiresLogin, function(req, res, next){
    var data = {__unid: 'new'};
    if(req.query.parentid){
      data.__parentid = req.query.parentid;
    }
    renderEditDocument(req, res, data);
  })

  app.get('/custom/editdocument/:db/:collection/:unid', login.requiresLogin, function(req, res, next){
    restler.get(
      config.apihost + "/document/" + req.params.db + "/" + req.params.collection + "/" + req.params.unid + "?all",
      {headers:
        {'cookie': getCookies(req)}
      }
    ).on('complete', function(document, response){
      renderEditDocument(req, res, document);
    })
  })

  function renderEditDocument(req, res, seeddata, error){
    cache.getUserDetails(req, function(userdetails){
      cache.getDbInfo(req, false, function(dbinfo){
        var metaset = false;
        var dbmeta = {};
        if (dbinfo.meta && dbinfo.meta.collections){
          for (var i=0; i<dbinfo.meta.collections.length; i++){
            if (dbinfo.meta.collections[i].name == req.params.collection){
              metaset = true;
              dbmeta = dbinfo.meta.collections[i];
              break;
            }
          }
        }
        if (!metaset){
          res.redirect('/custom/editcollection/' + req.params.db + '/' + req.params.collection);
        }else{
          cache.getMetaData(req, req.params.db, req.params.collection, false, function(metadata){
            if (!testValidAPIKeyResponse(metadata)){
              console.log('user not authenticated, redirecting to login');
              res.redirect('/login?redirectto=' + req.url);
            }
            //Identify the parimary and secondary fields
            for (var i=0; i<metadata.fields.length; i++){
              if(metadata.fields[i].position == 1){
                dbmeta.primaryfield = metadata.fields[i];
              }else if(metadata.fields[i].position == 2){
                dbmeta.secondaryfield = metadata.fields[i];
              }
            }
            //sort metadata by position
            metadata.fields = metadata.fields.sort(function(a,b) {
              return (a.position > b.position) ? 1 : ((b.position > a.position) ? -1 : 0);
            });
            cache.getOrgUsers(req, userdetails.customerid, false, function(orgusers){
              res.render('custom/editdocument', {
                template: 'custom',
                sitetitle: config.sitetitle,
                pagetitle: dbinfo.title,
                dbicon: '/getdbicon/' + req.params.db,
                dbinfo: dbinfo,
                metadata: metadata,
                dbmeta: dbmeta,
                isAdmin: userdetails.isAdmin || userdetails.customerid == "via-customer",
                breadcrumbs: [
                  {title: dbinfo.title, link: "/custom/index/" + dbinfo.db},
                  {title: dbmeta.title, link: "/custom/index/" + req.params.db + "/" + req.params.collection},
                  {title: "New"}
                ],
                menuitems: [
                  {link: "/custom/index/" + req.params.db, icon: "fa-home", label: dbinfo.title},
                  {link: "/custom/editdocument/" + req.params.db + "/" + req.params.collection, icon: "fa-pencil", label: "New", active: true}
                ],
                db: req.params.db,
                collection: req.params.collection,
                document: seeddata,
                error: error,
                orgusers: orgusers
              })
            })
          })
        }
      })
    })
  }

  app.post('/custom/editdocument/:db/:collection/:unid', upload.single('upload'), function(req, res, next){
    cache.getUserDetails(req, function(userdetails){
      if (req.file){
        req.body.upload = {
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

      if (req.params.unid == "new"){
        restler.putJson(
          config.apihost + "/document/" + req.params.db + "/" + req.params.collection,
          req.body,
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if(data == "Maximum number of databases reached or exceeded"){
            renderEditDocument(req, res, req.body, data);
          }else{
            if (req.body.__parentid){
              res.redirect("/custom/opendocument/" + req.params.db + "/" + req.body.__parentid);
            }else{
              res.redirect("/custom/index/" + req.params.db + "/" + req.params.collection);
            }
          }
        })
      }else{
        restler.postJson(
          config.apihost + "/document/" + req.params.db + "/" + req.params.collection + "/" + req.params.unid,
          req.body,
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(data, response){
          if(data == "Maximum number of databases reached or exceeded"){
            renderEditDocument(req, res, req.body, data);
          }else{
            if (req.body.__parentid){
              res.redirect("/custom/opendocument/" + req.params.db + "/" + req.body.__parentid);
            }else{
              res.redirect("/custom/index/" + req.params.db + "/" + req.params.collection);
            }
          }
        })
      }
    })
  })

  app.get('/custom/opendocument/:db/:unid', login.requiresLogin, function(req, res, next){
    restler.get(
      config.apihost + "/document/" + req.params.db + "/" + req.params.unid,
      {headers:
        {'cookie': getCookies(req)}
      }
    ).on('complete', function(data, response){
      if (data && data.collection){
        res.redirect('/custom/document/' + req.params.db + '/' + data.collection + '/' + req.params.unid);
      }else{
        res.redirect('/custom/index/' + req.params.db);
      }
    })
  })

  app.get('/custom/deletedocument/:db/:collection/:unid', login.requiresLogin, function(req, res, next){
    cache.getDbInfo(req, false, function(dbinfo){
      restler.del(
        config.apihost + "/document/" + req.params.db + "/" + req.params.collection + "/" + req.params.unid,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(){
        res.redirect('/custom/index/' + req.params.db + '/' + req.params.collection);
      })
    })
  })

}


function testValidAPIKeyResponse(response){
  if (response == "valid api key required in http headers" || response == 'Invalid API Key In Header' || (response.error && response.error == 'Invalid API Key In Header')){
    return false;
  }else{
    return true;
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
