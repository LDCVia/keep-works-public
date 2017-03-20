var cache = require('memory-cache');
var config = require('../config/config');
var restler = require('restler');
var _ = require("underscore");
var sanitizeHtml = require("sanitize-html");

var getCookies = function(req){
  var cookies = _.map(req.cookies, function(val, key) {
    if(key == "connect.sid"){
      return key + "=" + val['connect.sid'];
    }
  }).join("; ");
  return cookies;
}

exports.getDbInfo = function(req, force, callback){
  var db = req.params.db;
  if (db){
    if (cache.get('db-' + db) && cache.get('db-' + db).title && !force){
      callback(cache.get('db-' + db));
    }else{
      restler.get(
        config.apihost + "/database/" + db,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(data, response){
        if (response && response.statusCode == 200){
          cache.put('db-' + db, data, 180000);
          callback(cache.get('db-' + db));
        }else{
          callback(
            {
              "db": db,
              "readonly": false,
              "indexed": false,
              "title": db
            }
          )
        }
      })
    }
  }else{
    callback();
  }
}

exports.getCategories = function(req, collection, field, callback){
  var db = req.params.db;
  if (db){
    if (cache.get('categories-' + db + collection + field) && cache.get('categories-' + db + collection + field).title){
      callback(cache.get('categories-' + db + collection + field));
    }else{
      restler.get(
        config.apihost + "/list/" + db + "/" + collection + "/" + field,
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(data, response){
        cache.put('categories-' + db + collection + field, data, 180000);
        callback(cache.get('categories-' + db + collection + field));
      })
    }
  }else{
    callback();
  }
}

exports.getUserDetails = function(req, callback){
  var email = req.signedCookies['email'];
  if (email){
    if (cache.get('users-' + email)){
      callback(cache.get('users-' + email));
    }else{
      restler.postJson(
        config.apihost + "/search/" + config.admindb + "/customers",
        {"filters": [
          {
            "operator": "equals",
            "field": "email",
            "value": email
          }
        ]},
        {headers: { 'apikey': config.adminapikey }}
      )
      .on('complete', function(userdata, response){
        try{
          if (userdata.count == 1){
            if(userdata.data[0].customer){
              userdata.data[0].isAdmin = true;
            }
            cache.put('users-' + email, userdata.data[0], 180000);
            callback(cache.get('users-' + email));
          }else if(userdata.count == 0){
            //We've encountered a Via user so let's create a profile for them
            restler.get(
              config.apihost + "/userdetails",
              {headers:
                {'cookie': getCookies(req)}
              }
            ).on('complete', function(viauserdetails){
              viauserdetails.customerid = "via-customer";
              cache.put('users-' + email, viauserdetails, 180000);
              callback(cache.get('users-' + email));})
          }else{
            callback();
          }
        }catch(e){
          callback();
        }
      })
    }
  }else{
    callback();
  }
}

exports.getOrgDetails = function(orgid, callback, force){
  if (cache.get('orgs-' + orgid) && !force){
    callback(cache.get('orgs-' + orgid));
  }else{
    restler.postJson(
      config.apihost + "/search/" + config.admindb + "/organisations",
      {"filters": [
        {
          "operator": "equals",
          "field": "customerid",
          "value": orgid
        }
      ]},
      {headers: { 'apikey': config.adminapikey }}
    )
    .on('complete', function(orgdata, response){
      if (orgdata.count == 1){
        cache.put('orgs-' + orgid, orgdata.data[0], 180000);
        callback(cache.get('orgs-' + orgid));
      }else{
        callback();
      }
    })
  }
}

exports.getOrgUsers = function(req, orgid, force, callback){
  if (cache.get('orgusers-' + orgid) && !force){
    callback(cache.get('orgusers-' + orgid));
  }else{
    restler.get(
      config.apihost + "/users",
      {headers:
        {'cookie': getCookies(req)}
      }
    )
    .on('complete', function(users, response){
      if (users){
        cache.put('orgusers-' + orgid, users, 180000);
        callback(cache.get('orgusers-' + orgid));
      }else{
        callback();
      }
    })
  }
}

exports.getDbUsers = function(req, db, force, callback){
  if (cache.get('dbusers-' + db) && !force){
    callback(cache.get('dbusers-' + db));
  }else{
    restler.get(
      config.apihost + "/dbacl/" + db,
      {headers:
        {cookie: getCookies(req)}
      }
    )
    .on('complete', function(users, response){
      if(users){
        cache.put('dbusers-' + db, users, 180000);
        callback(cache.get('dbusers-' + db));
      }else{
        callback();
      }
    })
  }
}
exports.getMetaData = function(req, db, collection, force, callback){
  if(cache.get('meta-' + db + collection) && !force){
    callback(cache.get('meta-' + db + collection));
  }else{
    restler.get(
      config.apihost + "/metadata/" + db + "/" + collection,
      {headers:
        {cookie: getCookies(req)}
      }
    ).on('complete', function(meta, response){
      if(meta){
        cache.put('meta-' + db + collection, meta, 180000);
        callback(cache.get('meta-' + db + collection));
      }else{
        callback();
      }
    })
  }
}

exports.getXRates = function(callback){
  if (cache.get('xrates')){
    callback(cache.get('xrates'));
  }else{
    restler.get(
      'http://api.fixer.io/latest?base=GBP'
    ).on('complete', function(xrates){
      if (xrates){
        cache.put('xrates', xrates, 3600000);
        callback(cache.get('xrates'));
      }else{
        callback();
      }
    })
  }
}
