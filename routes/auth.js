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
var stripe = require('stripe')(config.stripekey);
var mailgun = require('mailgun-js')({apiKey: config.mailgunapikey, domain: config.mailgundomain});
var async = require('async');
var uuid = require('node-uuid');
var Recaptcha = require('recaptcha-verify');

/*
 *  Generic require login routing middleware
 */
module.exports = function(app){

  var getCookies = function(req){
    var cookies = _.map(req.cookies, function(val, key) {
      if(key == "connect.sid"){
        return key + "=" + val['connect.sid'];
      }
    }).join("; ");
    return cookies;
  }

  /* GET login page */
  app.get('/login',  function(req, res, next) {
    res.render('login', {
      sitetitle: config.sitetitle,
      pagetitle: "Login",
      hidelogout: true,
      redirectto: req.query.redirectto,
      menuitems: [
        {link: "/", icon: "fa-home", label: "Workspace"},
        {link: "/login", icon: "fa-power-off", label: "Login", active: true},
        {link: "/forgottenpassword", icon: "fa-mail-reply", label: "I forgot my password"},
        {link: "/register", icon: "fa-sign-in", label: "Register"}
      ]
    });
  });

  app.post('/login', function(req, res, next){
    doLogin(req, res, next);
  });

  app.get('/forgottenpassword', function(req, res, next){
    var error = req.query.error;
    if (error == "1"){
      error = true;
    }else{
      error = false;
    }
    var message = req.query.message;
    var info = "";
    if (error){
      error = message;
    }else{
      info = message;
    }
    var useremail = "";
    if (req.query.useremail){
      useremail = req.query.useremail;
    }

    res.render('forgottenpassword', {
      sitetitle: config.sitetitle,
      pagetitle: "Reset Password",
      hidelogout: true,
      menuitems: [
        {link: "/", icon: "fa-home", label: "Workspace"},
        {link: "/login", icon: "fa-power-off", label: "Login"},
        {link: "/forgottenpassword", icon: "fa-mail-reply", label: "I forgot my password", active: true},
        {link: "/register", icon: "fa-sign-in", label: "Register"}
      ],
      error: error,
      info: info,
      useremail: useremail
    });
  })

  app.post('/forgottenpassword', function(req, res, next){
    restler.postJson(
      config.apihost + "/remotepasswordreset",
      {
        "useremail": req.body.email
      },
      {headers: { 'apikey': config.adminapikey }}
    ).on('complete', function(resdata, response){
      var message = "Error getting reset password token";
      var error = 1;
      try{
        if (resdata.token){
          message = "An email has been sent to your address with instructions detailing how to reset your password.";
          error = 0;
          var subject = "KEEP.WORKS Reset Password";
          var body = "<p>Hello " + req.body.email + "!</p>";
          body += "<p>Someone has requested a link to change your KEEP.WORKS account password, and you can do this through the link below.</p>";
          body += "<p><a href=\"https://keep.works/resetpassword/" + req.body.email + "/" + resdata.token + "\">Change Password</a></p>";
          body += "<p>If you didn't request this, please ignore this email.</p>";
          body += "<p>Your password won't change until you access the link above and create a new one.</p>";
          var email = {
            from: 'keep.works support <support@keep.works>',
            to: req.body.email,
            subject: subject,
            html: body
          }
          mailgun.messages().send(email, function(error, body){
            console.log("Reset password email sent");
          })
        }else if(resdata.error){
          message = resdata.error;
        }else{
          message = resdata;
        }
      }catch(e){
        message = resdata;
      }
      res.redirect("/forgottenpassword?message=" + message + "&error=" + error);
    })
  })

  app.get('/resetpassword/:email/:token', function(req, res, next){
    var error = req.query.error;
    if (error == "1"){
      error = true;
    }else{
      error = false;
    }
    var message = req.query.message;
    var info = "";
    if (error){
      error = message;
    }else{
      info = message;
    }
    res.render('resetpassword', {
      sitetitle: config.sitetitle,
      pagetitle: "Reset Password",
      hidelogout: true,
      menuitems: [
        {link: "/", icon: "fa-home", label: "Workspace"},
        {link: "/login", icon: "fa-power-off", label: "Login"},
        {link: "/forgottenpassword", icon: "fa-mail-reply", label: "I forgot my password"},
        {link: "/register", icon: "fa-sign-in", label: "Register"}
      ],
      error: error,
      info: info,
      email: req.params.email,
      token: req.params.token
    });
  })

  app.post('/resetpassword/:email/:token', function(req, res, next){
    try{
      if (req.body.password != req.body.passwordconfirm){
        res.redirect("/resetpassword/" + req.params.email + "/" + req.params.token + "?message=Passwords do not match&error=1");
      }else{
        restler.postJson(
          config.apihost + "/remotepasswordreset",
          {
            "useremail": req.params.email,
            "token": req.params.token,
            "password": req.body.password
          },
          {headers: { 'apikey': config.adminapikey }}
        ).on('complete', function(resdata, response){
          var message = "Error resetting password";
          var error = 1;
          try{
            if (resdata.result){
              res.redirect("/login");
              error = 0;
            }else if(resdata.error){
              message = resdata.error;
            }else{
              message = resdata;
            }
          }catch(e){
            message = resdata;
          }
          if (error == 1){
            res.redirect("/resetpassword/" + req.params.email + "/" + req.params.token + "?message=" + message + "&error=" + error);
          }
        })
      }
    }catch(e){
      console.log(e);
      res.redirect("/resetpassword/" + req.params.email + "/" + req.params.token + "?message=Error resetting password&error=1");
    }
  })

  function doLogin(req, res, next){
    try{
      restler.postJson(
        config.apihost + "/login",
        {'username': req.body.username, 'password': req.body.password}
      ).on('complete', function (data, response){
        if (data.error && data.error == "invalid username or password" || !response){
          res.render("login", {sitetitle: config.sitetitle, error: "Invalid username or password", hidelogout: true});
        }else{
          var setcookie = response.headers["set-cookie"];
          var cookieobj = {};
          if (setcookie){
            for (var i=0; i<setcookie.length; i++){
              if (setcookie[i].indexOf("connect.sid=") > -1) cookieobj = cookie.parse(setcookie[i]);
            }
          }
          if (cookieobj['connect.sid']){
            res.cookie('connect.sid', cookieobj);
            res.cookie('email', req.body.username, {signed: true});
            if (req.params.db){
              res.redirect("/opendatabase/" + req.params.db);
            }else{
              if (req.body.redirectto && req.body.redirectto != ""){
                res.redirect(req.body.redirectto);
              }else{
                res.redirect("/selectdatabase");
              }
            }
          } else {
            var errMsg = "Unknown authentication error";
            if(data.errors) errMsg = data.errors[0];
            res.render("login", {sitetitle: config.sitetitle, error: errMsg, hidelogout: true});
          }
        }
      });
    } catch(e){
      res.render("login", {sitetitle: config.sitetitle, hidelogout: true, error: JSON.stringify(e)});
    }
  }

  /* Logout page */
  app.get('/logout', login.requiresLogin, function(req, res, next){
    res.clearCookie('connect.sid');
    res.clearCookie('email');
    res.redirect('/');
  });

  app.get('/logout/:db', login.requiresLogin, function(req, res, next){
    res.clearCookie('connect.sid');
    res.clearCookie('email');
    res.redirect("/login");
  });

  /* GET register page */
  app.get('/register',  function(req, res, next) {
    var data = {
      firstname: "",
      lastname: "",
      email: "",
      password: "",
      confirmpassword: ""
    }
    res.render('register', {
      sitetitle: config.sitetitle,
      pagetitle: "Register",
      couponrequired: config.couponrequired,
      hidelogout: true,
      data: data,
      menuitems: [
        {link: "/", icon: "fa-home", label: "Workspace"},
        {link: "/register", icon: "fa-sign-in", label: "Register", active: true},
        {link: "/login", icon: "fa-power-off", label: "Login"}
      ],
      recaptchakey: config.recaptcha.key
    });
  });

  app.post('/register', function(req, res, next) {
    var valid = true;
    if (req.body.firstname == null || req.body.firstname == ""){
      valid = false;
    }
    if (req.body.lastname == null || req.body.lastname == ""){
      valid = false;
    }
    if (req.body.email == null || req.body.email == ""){
      valid = false;
    }
    if (req.body.password == null || req.body.password == ""){
      valid = false;
    }
    if (req.body.confirmpassword == null || req.body.confirmpassword == ""){
      valid = false;
    }
    if (req.body.confirmpassword != req.body.password){
      valid = false;
    }
    if (req.body['g-recaptcha-response'] == ""){
      valid = false;
    }
    if(valid == true){
      //First validate the captcha
      var userResponse = req.body['g-recaptcha-response'];
      var recaptcha = new Recaptcha({
        secret: config.recaptcha.secret,
        verbose: true
      });
      recaptcha.checkResponse(userResponse, function(error, captchaverify){
        console.log(captchaverify);
        if (captchaverify.success == true){
          //First go and validate that the user isn't already registered
          console.log("Getting userdetails for " + req.body.email);
          restler.get(
            config.apihost + "/userdetails/" + req.body.email,
            { headers: { 'apikey': config.adminapikey } }
          )
          .on('complete', function(testuserdata, response){
            console.log(testuserdata);
            if (response.statusCode == 404){
              console.log("User doesn't already exist");
              //There isn't already a user account with this email
              //Now go and create the Stripe customer
              var options = {};
              options.email = req.body.email;
              //console.log("Creating stripe customer");
              stripe.customers.create(options, function(err, customer) {
                if (err){
                  console.log("Error...");
                  console.log(JSON.stringify(err));
                  res.render('register', {
                    sitetitle: config.sitetitle,
                    pagetitle: "Register",
                    hidelogout: true,
                    error: err,
                    data: req.body,
                    menuitems: [
                      {link: "/", icon: "fa-home", label: "Workspace"},
                      {link: "/login", icon: "fa-sign-in", label: "Login"}
                    ]
                  });
                }else{
                  console.log("Got customer");
                  console.log(JSON.stringify(customer));
                  //Now store the customer details
                  var data = {
                    email: req.body.email,
                    customer: customer,
                    customerid: customer.id
                  }
                  console.log("Storing customer");
                  restler.putJson(
                    config.apihost + '/document/' + config.admindb + '/customers',
                    data,
                    { headers: { 'apikey': config.adminapikey }}
                  ).on('complete', function(customerdata, response){
                    if (response.statusCode == 200){
                      console.log("Storing organisation");
                      restler.put(
                        config.apihost + '/document/' + config.admindb + '/organisations',
                        { headers: { 'apikey': config.adminapikey }, data: {customerid: data.customerid, customer: data.customer} }
                      ).on('complete', function(orgdata, orgresponse){
                        console.log("Creating Via account");
                        //Now go and create LDC Via Account
                        req.body.organisation = "";
                        var loggedin = false;
                        restler.post(
                          config.host + '/register?noemail=true',
                          {data: req.body}
                        ).on('complete', function(userdata, response){
                          if (!loggedin){
                            loggedin = true;
                            var subject = config.newaccount.subject;
                            var body = config.newaccount.body;
                            var email = {
                              from: 'keep.works support <support@keep.works>',
                              to: req.body.email,
                              subject: subject,
                              html: body
                            }
                            mailgun.messages().send(email, function(error, body){
                              req.body.username = req.body.email;
                              console.log("Logging new user in");
                              doLogin(req, res, next);
                            })
                            var email = {
                              from: 'keep.works support <support@keep.works>',
                              to: 'keep.works support <support@keep.works>',
                              subject: "New KEEP.WORKS user registered",
                              html: "<p>A new user has registered (but not yet paid) for KEEP.WORKS: " + req.body.email
                            }
                            mailgun.messages().send(email, function(error, body){
                            })
                          }else{
                            console.log("Not logging in for a second time");
                          }
                        })
                      })
                    }else{
                      console.log("Error");
                      console.log(JSON.stringify(response));
                      res.render('register', {
                        sitetitle: config.sitetitle,
                        pagetitle: "Register",
                        hidelogout: true,
                        error: data,
                        data: req.body,
                        menuitems: [
                          {link: "/", icon: "fa-home", label: "Workspace"},
                          {link: "/login", icon: "fa-sign-in", label: "Login"}
                        ]
                      });
                    }
                  });
                }
              });
            }else{
              console.log("User already exists");
              res.render('register', {
                sitetitle: config.sitetitle,
                pagetitle: "Register",
                hidelogout: true,
                error: "Account already exists",
                data: req.body,
                menuitems: [
                  {link: "/", icon: "fa-home", label: "Workspace"},
                  {link: "/login", icon: "fa-sign-in", label: "Login"}
                ]
              });
            }
          })
        }else{
          res.render('register', {
            sitetitle: config.sitetitle,
            pagetitle: "Register",
            hidelogout: true,
            error: "Invalid Recaptcha verification",
            data: req.body,
            menuitems: [
              {link: "/", icon: "fa-home", label: "Workspace"},
              {link: "/login", icon: "fa-sign-in", label: "Login"}
            ]
          });
        }
      })
    }else{
      res.render('register', {
        sitetitle: config.sitetitle,
        pagetitle: "Register",
        hidelogout: true,
        error: "Please complete all fields",
        data: req.body,
        menuitems: [
          {link: "/", icon: "fa-home", label: "Workspace"},
          {link: "/login", icon: "fa-sign-in", label: "Login"}
        ]
      });
    }
  })

  app.get('/registercc', function(req, res, next){
    cache.getUserDetails(req, function(userdata){
      cache.getOrgDetails(userdata.customerid, function(orgdata){
        if (!orgdata){
          orgdata = {};
        }
        if (!orgdata.company){
          orgdata.company = "";
        }
        if (!orgdata.address1){
          orgdata.address1 = "";
        }
        if (!orgdata.address2){
          orgdata.address2 = "";
        }
        if (!orgdata.city){
          orgdata.city = "";
        }
        if (!orgdata.postcode){
          orgdata.postcode = "";
        }
        if (!orgdata.state){
          orgdata.state = "";
        }
        if (!orgdata.country){
          orgdata.country = "";
        }
        if (!orgdata.vatid){
          orgdata.vatid = "";
        }
        if (!orgdata.ccnumber){
          orgdata.ccnumber = "";
        }
        if (!orgdata.cvcnumber){
          orgdata.cvcnumber = "";
        }
        if (!orgdata.expmonth){
          orgdata.expmonth = "";
        }
        if (!orgdata.expyear){
          orgdata.expyear = "";
        }
        if (!orgdata.coupon){
          orgdata.coupon = "";
        }
        res.render('registercc', {
          sitetitle: config.sitetitle,
          pagetitle: "Register Payment Details",
          couponrequired: config.couponrequired,
          hidelogout: false,
          userdata: userdata,
          orgdata: orgdata,
          subscriptions: config.subscriptions,
          countries: config.countries,
          menuitems: [
            {link: "/", icon: "fa-home", label: "Workspace"},
            {link: "/registercc", icon: "fa-sign-in", label: "Register Payment Details", active: true},
          ]
        });
      })
    })
  })

  app.post('/registercc', function(req, res, next){
    cache.getUserDetails(req, function(userdata){
      if (config.couponrequired == "1" && (!req.body.coupon || req.body.coupon == "")){
        res.render('registercc', { sitetitle:
          config.sitetitle,
          pagetitle: "Register Payment Details",
          hidelogout: false,
          userdata: userdata,
          orgdata: req.body,
          error: "A coupon code is required",
          subscriptions: config.subscriptions,
          countries: config.countries
        });
      }else{
        stripe.customers.createSource(
          userdata.customerid,
          {
            source: {
              object: "card",
              exp_month: req.body.expmonth,
              exp_year: req.body.expyear,
              cvc: req.body.cvcnumber,
              number: req.body.ccnumber
            }
          },
          function(err, card){
            if (err){
              var orgdata = {};
              orgdata.company = req.body.company;
              orgdata.address1 = req.body.address1;
              orgdata.address2 = req.body.address2;
              orgdata.city = req.body.city;
              orgdata.postcode = req.body.postcode;
              orgdata.state = req.body.state;
              orgdata.country = req.body.country;
              orgdata.vatid = req.body.vatid;

              res.render('registercc', {
                sitetitle: config.sitetitle,
                pagetitle: "Register Payment Details",
                hidelogout: false,
                userdata: userdata,
                orgdata: req.body,
                error: err.message,
                subscriptions: config.subscriptions,
                countries: config.countries
              });
            }else{
              var subdata = {plan: req.body.plan};
              if (req.body.coupon && req.body.coupon != ""){
                subdata.coupon = req.body.coupon;
              }
              subdata.metadata = {
                company: req.body.company,
                address1: req.body.address1,
                address2: req.body.address2,
                city: req.body.city,
                postcode: req.body.postcode,
                state: req.body.state,
                country: req.body.country,
                vatid: req.body.vatid
              };
              if (!req.body.country || req.body.country == "" || (config.eucountries.indexOf(req.body.country) > -1 && !req.body.vatid)){
                subdata.tax_percent = config.vatrate;
              }else{
                subdata.tax_percent = 0;
              }
              stripe.customers.createSubscription(
                userdata.customerid,
                subdata,
                function(err, subscription){
                  if (err){
                    res.render('registercc', { sitetitle:
                      config.sitetitle,
                      pagetitle: "Register Payment Details",
                      hidelogout: false,
                      userdata: userdata,
                      orgdata: req.body,
                      error: err.message,
                      subscriptions: config.subscriptions,
                      countries: config.countries
                    });
                  }else{
                    cache.getOrgDetails(userdata.customerid, function(orgdata){
                      var unid = orgdata.__unid;
                      restler.get(
                        config.apihost + "/userdetails",
                        {headers:
                          {'cookie': getCookies(req)}
                        }
                      )
                      .on('complete', function(userdetails){
                        var accountlevel = 0;
                        for (var i=0; i<config.subscriptions.length; i++){
                          if (config.subscriptions[i].id == req.body.plan){
                            accountlevel = config.subscriptions[i].planindex;
                          }
                        }
                        restler.postJson(
                          config.apihost + "/admin/organisations",
                          {
                            organisation: userdetails.organisations[0].orgid,
                            accountlevel: accountlevel
                          },
                          {headers: {'apikey': config.adminapikey}}
                        )
                        .on('complete', function(){
                          //Update the org with the card details

                          restler.postJson(
                            config.apihost + '/document/' + config.admindb + '/organisations/' + unid,
                            {
                              cardid: card.id,
                              card: card,
                              subscriptionid: subscription.id,
                              subscription: subscription,
                              company: req.body.company,
                              address1: req.body.address1,
                              address2: req.body.address2,
                              city: req.body.city,
                              postcode: req.body.postcode,
                              state: req.body.state,
                              country: req.body.country,
                              vatid: req.body.vatid
                            },
                            { headers: { 'apikey': config.adminapikey }}
                          ).on('complete', function(orgdata, orgresponse){
                            cache.getOrgDetails(userdata.customerid, function(orgdata){
                              res.redirect('/selectdatabase');
                            }, true);
                          })
                        })
                      })
                    }, true);
                  }
                }
              )
            }
          }
        )
      }
    })

  })

  app.post('/updatecc', function(req, res, next){
    cache.getUserDetails(req, function(userdata){
      stripe.customers.createSource(
        userdata.customerid,
        {
          source: {
            object: "card",
            exp_month: req.body.expmonth,
            exp_year: req.body.expyear,
            cvc: req.body.cvcnumber,
            number: req.body.ccnumber
          }
        },
        function(err, card){
          if (err){
            res.redirect("/account?ccerror=" + err.message);
          }else{
            cache.getOrgDetails(userdata.customerid, function(orgdata){
              //Update the org with the card details
              restler.postJson(
                config.apihost + '/document/' + config.admindb + '/organisations/' + orgdata.__unid,
                {cardid: card.id, card: card},
                { headers: { 'apikey': config.adminapikey }}
              ).on('complete', function(orgdata, orgresponse){
                cache.getOrgDetails(userdata.customerid, function(orgdata){
                  res.redirect('/account');
                }, true);
              })
            }, true);
          }
        }
      )
    })
  })

  app.post('/updateplan', function(req, res, next){
    cache.getUserDetails(req, function(userdata){
      restler.get(
        config.apihost + "/userdetails",
        {headers:
          {'cookie': getCookies(req)}
        }
      )
      .on('complete', function(userdetails){
        var maxdbs = 2;
        for (var i=0; i<config.subscriptions.length; i++){
          if (config.subscriptions[i].id == req.body.plan){
            maxdbs = config.subscriptions[i].dblimit;
          }
        }
        restler.get(
          config.apihost + "/databases",
          {headers:
            {'cookie': getCookies(req)}
          }
        ).on('complete', function(databases, response){
          if (databases.length > maxdbs){
            res.redirect("/account?planerror=You need to delete at least " + (databases.length - maxdbs) + " databases to downgrade your account");
          }else{
            cache.getOrgDetails(userdata.customerid, function(orgdata){
              if (orgdata.subscriptionid){
                stripe.customers.updateSubscription(
                  orgdata.customerid,
                  orgdata.subscriptionid,
                  {plan: req.body.plan},
                  function(err, subscription){
                    cache.getOrgDetails(userdata.customerid, function(orgdata){
                      //Update the org with the subscription details
                      restler.postJson(
                        config.apihost + '/document/' + config.admindb + '/organisations/' + orgdata.__unid,
                        {subscription: subscription},
                        { headers: { 'apikey': config.adminapikey }}
                      ).on('complete', function(orgdata, orgresponse){
                        cache.getOrgDetails(userdata.customerid, function(orgdata){
                          var accountlevel = 0;
                          for (var i=0; i<config.subscriptions.length; i++){
                            if (config.subscriptions[i].id == req.body.plan){
                              accountlevel = config.subscriptions[i].planindex;
                            }                      }
                          restler.postJson(
                            config.apihost + "/admin/organisations",
                            {
                              organisation: userdetails.organisations[0].orgid,
                              accountlevel: accountlevel
                            },
                            {headers: {'apikey': config.adminapikey}}
                          )
                          .on('complete', function(accountlevelresponse){
                            res.redirect('/account');
                          })
                        }, true);
                      })
                    }, true);
                  }
                )
              }else{
                stripe.customers.createSubscription(
                  userdata.customerid,
                  {plan: req.body.plan},
                  function(err, subscription){
                    //Update the org with the subscription details
                    restler.postJson(
                      config.apihost + '/document/' + config.admindb + '/organisations/' + orgdata.__unid,
                      {subscription: subscription},
                      { headers: { 'apikey': config.adminapikey }}
                    ).on('complete', function(orgdata, orgresponse){
                      cache.getOrgDetails(userdata.customerid, function(orgdata){
                        var accountlevel = 0;
                        for (var i=0; i<config.subscriptions.length; i++){
                          if (config.subscriptions[i].id == req.body.plan){
                            accountlevel = config.subscriptions[i].planindex;
                          }
                        }
                        restler.postJson(
                          config.apihost + "/admin/organisations",
                          {
                            organisation: userdetails.organisations[0].orgid,
                            accountlevel: accountlevel
                          },
                          {headers: {'apikey': config.adminapikey}}
                        )
                        .on('complete', function(){
                          res.redirect('/account');
                        })
                      }, true);
                    })
                  }
                )
              }
            })
          }
        });
      })
    }, true)
  })

  app.get('/account', login.requiresLogin, function(req, res, next){
    res.locals.formatDatetime = formatDatetime;
    cache.getUserDetails(req, function(userdata){
      if (!userdata){
        res.redirect("/login?redirectto=" + req.url);
      }
      cache.getOrgDetails(userdata.customerid, function(orgdata){
        if (!orgdata.company){
          orgdata.company = "";
        }
        if (!orgdata.address1){
          orgdata.address1 = "";
        }
        if (!orgdata.address2){
          orgdata.address2 = "";
        }
        if (!orgdata.city){
          orgdata.city = "";
        }
        if (!orgdata.postcode){
          orgdata.postcode = "";
        }
        if (!orgdata.state){
          orgdata.state = "";
        }
        if (!orgdata.country){
          orgdata.country = "";
        }
        if (!orgdata.vatid){
          orgdata.vatid = "";
        }
        cache.getOrgUsers(req, userdata.customerid, false, function(usersdata){
          if (!testValidAPIKeyResponse(usersdata)){
            res.redirect("/login?redirectto=" + req.url);
          }
          if (orgdata.customerid){
            stripe.invoices.list(
              {customer: orgdata.customerid},
              function(err, invoices){
                stripe.invoiceItems.list(
                  {
                    customer: orgdata.customerid,
                    limit: 100
                  },
                  function(err, invoiceitems){
                    //Present the page to the user
                    res.render('account', {
                      sitetitle: config.sitetitle,
                      pagetitle: 'Account',
                      hidelogout: false,
                      userdata: userdata,
                      orgdata: orgdata,
                      invoices: invoices,
                      invoiceitems: invoiceitems,
                      subscriptions: config.subscriptions,
                      countries: config.countries,
                      users: usersdata,
                      isAdmin: userdata.isAdmin,
                      menuitems: [
                        {link: "/selectdatabase", icon: "fa-home", label: "Workspace"},
                        {link: "/account", icon: "fa-user", label: "Account", active: true}
                      ],
                      planerror: req.query.planerror,
                      ccerror: req.query.ccerror
                    });
                  }
                )
              }
            )
          }else{
            res.render('account', {
              sitetitle: config.sitetitle,
              pagetitle: 'Account',
              hidelogout: false,
              userdata: userdata,
              orgdata: orgdata,
              invoices: {data: []},
              invoiceitems: {data: []},
              subscriptions: config.subscriptions,
              countries: config.countries,
              users: usersdata,
              isAdmin: userdata.isAdmin,
              menuitems: [
                {link: "/selectdatabase", icon: "fa-home", label: "Workspace"},
                {link: "/account", icon: "fa-user", label: "Account", active: true}
              ],
              planerror: req.query.planerror,
              ccerror: req.query.ccerror
            });
          }
        })
      })
    })
  })

  app.get('/invoice/:invoiceid', login.requiresLogin, function(req, res, next){
    res.locals.formatDate = formatDate;
    res.locals.formatDatetime = formatDatetime;
    res.locals.formatNumber = formatNumber;
    cache.getUserDetails(req, function(userdata){
      if (!userdata){
        res.redirect("/login?redirectto=" + req.url);
      }else{
        cache.getOrgDetails(userdata.customerid, function(orgdata){
          stripe.invoices.retrieve(req.params.invoiceid, function(err, invoice){
            if (err){
              res.redirect("/login?redirectto=" + req.url);
            }else{
              res.render('invoice', {
                invoice: invoice,
                org: orgdata,
                userdata: userdata,
                index: parseInt(req.query.index, 10)
              })
            }
          })
        })
      }
    })
  })

  app.get('/admininvoice/:invoiceid', login.requiresLogin, function(req, res, next){
    res.locals.formatDate = formatDate;
    res.locals.formatDatetime = formatDatetime;
    res.locals.formatNumber = formatNumber;
    cache.getUserDetails(req, function(userdata){
      if (!userdata || userdata.email != "support@ldcvia.com"){
        res.redirect("/login?redirectto=" + req.url);
      }else{
        stripe.invoices.retrieve(req.params.invoiceid, function(err, invoice){
          stripe.invoices.list({customer: invoice.customer, limit: 10000}, function(err, invoices){
            if (err){
              res.redirect("/login?redirectto=" + req.url);
            }else{
              invoices.data = invoices.data.reverse();
              for (var i=0; i<invoices.data.length; i++){
                if (invoices.data[i].id == req.params.invoiceid){
                  var invoice = invoices.data[i];
                  var index = i + 1;
                  cache.getOrgDetails(invoice.customer, function(orgdata){
                    if (!orgdata){
                      try{
                        orgdata = invoice.lines.data[0].metadata;
                      }catch(e){

                      }
                    }
                    res.render('invoice', {
                      invoice: invoice,
                      org: orgdata,
                      userdata: userdata,
                      index: index
                    })
                  })
                }
              }
            }
          })
        })
      }
    })
  })

  app.post('/updatevat', function(req, res, next){
    if (req.body.vat == "" || checkVATNumber(req.body.vat)){
      cache.getUserDetails(req, function(userdata){
        cache.getOrgDetails(userdata.customerid, function(orgdata){
          stripe.customers.update(userdata.customerid,
            {business_vat_id: req.body.vat},
            function(err, customer){
              var subdata = {plan: config.subscriptionid};
              subdata.metadata = {
                company: req.body.company,
                address1: req.body.address1,
                address2: req.body.address2,
                city: req.body.city,
                postcode: req.body.postcode,
                state: req.body.state,
                country: req.body.country,
                vatid: req.body.vat
              };
              if (config.eucountries.indexOf(req.body.country) > -1 && !req.body.vatid){
                subdata.tax_percent = config.vatrate;
              }else{
                subdata.tax_percent = 0;
              }
              stripe.customers.updateSubscription(
                orgdata.customerid,
                orgdata.subscriptionid,
                subdata,
                function(err, subscription){
                  cache.getOrgDetails(userdata.customerid, function(orgdata){
                    restler.postJson(
                      config.apihost + '/document/' + config.admindb + '/organisations/' + orgdata.__unid,
                      {
                        customer: customer,
                        subscription: subscription,
                        company: req.body.company,
                        address1: req.body.address1,
                        address2: req.body.address2,
                        city: req.body.city,
                        postcode: req.body.postcode,
                        state: req.body.state,
                        country: req.body.country,
                        vatid: req.body.vat
                      },
                      { headers: { 'apikey': config.adminapikey }}
                    ).on('complete', function(orgdata, orgresponse){
                      cache.getOrgDetails(userdata.customerid, function(orgdata){
                        res.redirect('/account');
                      }, true)
                    })
                  }, true);
                }
              )
            }
          )
        })
      })
    }else{
      res.redirect('/account');
    }
  })

  app.post('/adduser', function(req, res, next){
    cache.getUserDetails(req, function(userdata){
      console.log("Got user details");
      var data = {
        email: req.body.newuseremail,
        customerid: userdata.customerid
      }
      restler.put(
        config.apihost + '/document/' + config.admindb + '/customers',
        { headers: { 'apikey': config.adminapikey }, data: data }
      ).on('complete', function(customerdata, response){
        console.log("Added new customer document");
        restler.get(
          config.apihost + '/userdetails',
          {headers:
            {'cookie': getCookies(req)}
          }
        ).on('complete', function(userdetails, response){
          console.log("Got userdetails 2");
          var data = {
            organisation: userdetails.organisations[0].orgid,
            users: [{
              "email": req.body.newuseremail
            }]
          }
          restler.postJson(
            config.apihost + '/users',
            data,
            {headers:
              {'cookie': getCookies(req)}
            }
          ).on('success', function(result, response){
            console.log("Posted users");
            cache.getOrgUsers(req, userdata.customerid, true, function(usersdata){
              var subject = config.newuser.subject;
              var body = config.newuser.body;
              body = body.replaceAll("newuseremail", req.body.newuseremail);
              var email = {
                from: 'keep.works support <support@keep.works>',
                to: req.body.newuseremail,
                subject: subject,
                text: body,
                html: body
              }
              mailgun.messages().send(email, function(error, body){
                console.log("Sent email");
                if (!res.headersSent){
                  res.redirect('/account');
                }
              })
            });
          }).on('fail', function(data, response){
            console.log('Failed');
            if (!res.headersSent){
              res.redirect('/account');
            }
          }).on('error', function(err, response){
            console.log(err);
            if (!res.headersSent){
              res.redirect('/account');
            }
          })
        })
      })
    })
  })

  app.post('/addusertodb', function(req, res, next){
    cache.getUserDetails(req, function(userdata){
      restler.get(
        config.apihost + "/userdetails/" + req.body.user + "/" + req.body.database,
        {headers:
          {'cookie': getCookies(req)}
        }
      ).on('complete', function(result, response){
        cache.getDbUsers(req, req.body.database, true, function(dbusers){
          res.redirect('/editdatabase/' + req.body.database);
        })
      })
    })
  })

  app.post('/removeuserfromdb', function(req, res, next){
    cache.getUserDetails(req, function(userdata){
      restler.del(
        config.apihost + "/userdetails/" + encodeURIComponent(req.body.user) + "/" + req.body.database,
        {headers: { 'apikey': config.adminapikey }}
      ).on('complete', function(result, response){
        res.send(result);
      })
    })
  })

  app.post('/removeuser', function(req, res, next){
    cache.getUserDetails(req, function(userdata){
      restler.del(
        config.apihost + "/userdetails/" + req.body.user,
        {headers:
          {'cookie': getCookies(req)}
        }
      ).on('complete', function(result, response){
        restler.postJson(
          config.apihost + "/search/" + config.admindb + "/customers",
          {"filters": [
            {
              "operator": "equals",
              "field": "email",
              "value": req.body.user
            }
          ]},
          {headers: { 'apikey': config.adminapikey }}
        )
        .on('complete', function(deluserdata, response){
          if (deluserdata.data.length > 0){
            async.eachSeries(deluserdata.data, function(usertodelete, callback){
              restler.del(
                config.apihost + "/document/" + config.admindb + "/customers/" + usertodelete.__unid,
                {headers: { 'apikey': config.adminapikey }}
              )
              .on('complete', function(result, response){
                callback();
              })
            }, function(err){
              cache.getOrgUsers(req, userdata.customerid, true, function(usersdata){
                res.redirect('/account');
              });
            })
          }else{
            cache.getOrgUsers(req, userdata.customerid, true, function(usersdata){
              res.redirect('/account');
            });
          }
        })
      })
    })
  })

  app.post('/deleteaccount', function(req, res, next){
    cache.getUserDetails(req, function(userdata){
      //Delete any databases from org
      restler.get(
        config.apihost + "/databases",
        {headers:
          {'cookie': getCookies(req)}
        }
      ).on('complete', function(databases, response){
        restler.get(
          config.apihost + "/userdetails",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(userdetails){
          async.eachSeries(databases, function (database, callback){
            restler.del(
              config.apihost + "/database/" + database.name,
              {headers:
                {'cookie': getCookies(req)}
              }
            ).on('complete', function(){
              callback();
            })
          }, function (err){
            //Downgrade Via Account to Free
            restler.postJson(
              config.apihost + "/admin/organisations",
              {
                organisation: userdetails.organisations[0].orgid,
                accountlevel: 0
              },
              {headers: {'apikey': config.adminapikey}}
            )
            .on('complete', function(){
              //Remove subscription from Stripe
              cache.getOrgDetails(userdata.customerid, function(orgdata){
                stripe.customers.cancelSubscription(
                  orgdata.customerid,
                  orgdata.subscriptionid,
                  function(err, confirmation){
                    cache.getOrgDetails(userdata.customerid, function(orgdata){
                      //Update the org with the card details
                      restler.postJson(
                        config.apihost + '/document/' + config.admindb + '/organisations/' + orgdata.__unid,
                        {subscriptionid: null, subscription: null, card: null, cardid: null},
                        { headers: { 'apikey': config.adminapikey }}
                      ).on('complete', function(orgdata, orgresponse){
                        cache.getOrgDetails(userdata.customerid, function(orgdata){
                          res.redirect('/');
                        }, true);
                      })
                    }, true);
                  }
                )
              })
            })
          })
        })
      })
    })
  })

  app.post('/stripe-webhooks', function(req, res, next){
    var event_json = req.body;
    restler.putJson(
      config.apihost + "/document/" + config.admindb + "/stripe-events",
      event_json,
      { headers: { 'apikey': config.adminapikey }}
    ).on('complete', function(){
      try{
        stripe.customers.retrieve(
          event_json.data.object.customer,
          function(err, customer) {
            var customername = event_json.data.object.customer;
            if (customer){
              customername = customer.email;
              if (customer.subscriptions && customer.subscriptions.length > 0){
                try{
                  customername = customer.subscriptions[0].data.metadata.company;
                }catch(e){

                }
              }
            }
            if (req.body.type == 'invoice.created'){
              var subject = "New Invoice for " + customername;
              var body = "<p>A new invoice was issued for " + customername + ". It can be viewed at: ";
              body += config.apphost + "admininvoice/" + event_json.data.object.id + "</p><div>";
              body += JSON.stringify(event_json);
              body += "</div>";
            }else if (req.body.type == 'invoice.payment_succeeded'){
              var subject = "Payment Succeeded for " + customername;
              var body = "<p>Payment succeeded for " + customername + ". Invoice can be viewed at: ";
              body += config.apphost + "admininvoice/" + event_json.data.object.id + "</p><div>";
              body += JSON.stringify(event_json);
              body += "</div>";
            }else if (req.body.type == 'invoice.payment_failed'){
              var subject = "Payment failed for " + customername;
              var body = "<p>Payment failed for " + customername + ". Invoice can be viewed at: ";
              body += config.apphost + "admininvoice/" + event_json.data.object.id + "</p><div>";
              body += JSON.stringify(event_json);
              body += "</div>";
            }else if(req.body.type == 'customer.subscription.trial_will_end'){
              var body = "<p>We wanted to let you know that your trial period for using KEEP.WORKS will end in three days time. At that time, your credit card will be charged.<p>";
              body += "<p>To log into your account, click <a href=\"" + config.apphost + "account\">here</a>";
              var email = {
                from: 'keep.works support <support@keep.works>',
                to: customername,
                subject: config.site.title + " - Approaching end of trial period.",
                html: body
              }
              mailgun.messages().send(email, function(error, body){
              })
            }
            var email = {
              from: 'keep.works support <support@keep.works>',
              to: "support@ldcvia.com",
              subject: subject,
              html: body
            }
            mailgun.messages().send(email, function(error, body){
            })
          }
        );
      }catch(e){
        console.log(e);
      }
    })
    res.send(200, 'ok');
  })

  app.post('/stripe-webhooks-beta', function(req, res, next){
    var event_json = req.body;
    restler.putJson(
      config.apihost + "/document/" + config.admindb + "/stripe-events-beta",
      event_json,
      { headers: { 'apikey': config.adminapikey }}
    ).on('complete', function(){
      try{
        stripe.customers.retrieve(
          event_json.data.object.customer,
          function(err, customer) {
            var customername = event_json.data.object.customer;
            if (customer){
              customername = customer.email;
              if (customer.subscriptions && customer.subscriptions.length > 0){
                try{
                  customername = customer.subscriptions[0].data.metadata.company;
                }catch(e){

                }
              }
            }
            if (req.body.type == 'invoice.created'){
              var subject = "BETA New Invoice for " + customername;
              var body = "<p>A new invoice was issued for " + customername + ". It can be viewed at: ";
              body += config.apphost + "admininvoice/" + event_json.data.object.id + "</p><div>";
              body += JSON.stringify(event_json);
              body += "</div>";
            }else if (req.body.type == 'invoice.payment_succeeded'){
              var subject = "BETA Payment Succeeded for " + customername;
              var body = "<p>Payment succeeded for " + customername + ". Invoice can be viewed at: ";
              body += config.apphost + "admininvoice/" + event_json.data.object.id + "</p><div>";
              body += JSON.stringify(event_json);
              body += "</div>";
            }else if (req.body.type == 'invoice.payment_failed'){
              var subject = "BETA Payment failed for " + customername;
              var body = "<p>Payment failed for " + customername + ". Invoice can be viewed at: ";
              body += config.apphost + "admininvoice/" + event_json.data.object.id + "</p><div>";
              body += JSON.stringify(event_json);
              body += "</div>";
            }else if(req.body.type == 'customer.subscription.trial_will_end'){
              var body = "<p>We wanted to let you know that your trial period for using KEEP.WORKS will end in three days time. At that time, your credit card will be charged.<p>";
              body += "<p>To log into your account, click <a href=\"" + config.apphost + "account\">here</a>";
              var email = {
                from: 'keep.works support <support@keep.works>',
                to: customername,
                subject: config.site.title + " - Approaching end of trial period.",
                html: body
              }
              mailgun.messages().send(email, function(error, body){
              })
            }
            var email = {
              from: 'keep.works support <support@keep.works>',
              to: "matt@ldcvia.com",
              subject: subject,
              html: body
            }
            mailgun.messages().send(email, function(error, body){
            })
          }
        );
      }catch(e){
        console.log(e);
      }
    })
    res.send(200, 'ok');
  })

  app.get('/user/:email', login.requiresLogin, function(req, res, next){
    res.locals.formatDatetime = formatDatetime;
    cache.getUserDetails(req, function(userdata){
      if (!userdata){
        res.redirect("/login?redirectto=" + req.url);
      }else if(!userdata.isAdmin){
        res.redirect('/selectdatabase');
      }
      restler.get(
        config.apihost + "/userdetails/" + req.params.email,
        {headers:
          {'cookie': getCookies(req)}
        }
      ).on('complete', function(otheruserdata){
        var groups = [];
        var usernames = [];
        if (otheruserdata && otheruserdata.notesnames && Array.isArray(otheruserdata.notesnames)){
          for (var i=0; i<otheruserdata.notesnames.length; i++){
            if(otheruserdata.notesnames[i].group){
              groups.push(otheruserdata.notesnames[i].notesname);
            }else{
              usernames.push(otheruserdata.notesnames[i].notesname);
            }
          }
        }
        restler.get(
          config.apihost + "/databases",
          {headers:
            {'cookie': getCookies(req)}
          }
        )
        .on('complete', function(databases, response){
          res.render('user', {
            sitetitle: config.sitetitle,
            pagetitle: 'Account / User',
            hidelogout: false,
            userdata: userdata,
            otheruserdata: otheruserdata,
            groups: groups,
            usernames: usernames,
            databases: databases,
            isAdmin: userdata.isAdmin,
            breadcrumbs: [
              {title: 'Account', link: "/account"},
              {title: otheruserdata.email}
            ],
            menuitems: [
              {link: "/selectdatabase", icon: "fa-home", label: "Workspace"},
              {link: "/account", icon: "fa-user", label: "Account", active: true}
            ]
          });
        })
      })
    })
  })

  app.post('/user/:email', login.requiresLogin, function(req, res, next){
    var data = req.body;
    var notesnames = [];
    if (data.usernames){
      data.usernames = data.usernames.replaceAll("\n", ";");
      data.usernames = data.usernames.replaceAll("\r", ";");
      if (data.usernames.indexOf(";") > -1){
        var usernames = data.usernames.split(";");
        for (var i=0; i<usernames.length; i++){
          if(usernames[i].trim() != ""){
            notesnames.push({notesname: usernames[i].trim()});
          }
        }
      }else if(data.usernames.trim() != ""){
        notesnames.push({notesname: data.usernames.trim()});
      }
    }
    if (data.groups){
      data.groups = data.groups.replaceAll("\n", ";");
      data.groups = data.groups.replaceAll("\r", ";");
      if (data.groups.indexOf(";") > -1){
        var groups = data.groups.split(";");
        for (var i=0; i<groups.length; i++){
          notesnames.push({notesname: groups[i], group: true});
        }
      }else if(data.groups != ""){
        notesnames.push({notesname: data.groups, group: true});
      }
    }
    delete data['usernames'];
    delete data['groups'];
    data.notesnames = notesnames;
    restler.postJson(
      config.apihost + "/userdetails/" + req.params.email,
      data,
      {headers:
        {'cookie': getCookies(req)}
      }
    ).on('complete', function(response){
      console.log(response);
      res.redirect('/user/' + req.body.email);
    })
  })
}

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

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

/**
* Format date time helper
*
* @param {Date} date
* @return {String}
* @api private
*/

function formatDatetime (date) {
  date = new Date(date)
  var hour = date.getHours();
  var minutes = date.getMinutes() < 10
    ? '0' + date.getMinutes().toString()
    : date.getMinutes();

  return formatDate(date) + ' ' + hour + ':' + minutes;
}
/**
* Format date helper
*
* @param {Date} date
* @return {String}
* @api private
*/

function formatDate (date) {
  date = new Date(date)
  var monthNames = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ]
  return monthNames[date.getMonth()]+' '+date.getDate()+', '+date.getFullYear()
}

function formatNumber(input) {
  return parseFloat(Math.round(input * 100) / 100).toFixed(2);
}

function testValidAPIKeyResponse(response){
  if (response == "valid api key required in http headers" || response == 'Invalid API Key In Header' || (response.error && response.error == 'Invalid API Key In Header')){
    return false;
  }else{
    return true;
  }
}



/**
* VAT Handling
**/
function checkVATNumber (toCheck) {

  // Array holds the regular expressions for the valid VAT number
  var vatexp = [];

  // To change the default country (e.g. from the UK to Germany - DE):
  //    1.  Change the country code in the defCCode variable below to "DE".
  //    2.  Remove the question mark from the regular expressions associated with the UK VAT number:
  //        i.e. "(GB)?" -> "(GB)"
  //    3.  Add a question mark into the regular expression associated with Germany's number
  //        following the country code: i.e. "(DE)" -> "(DE)?"

  var defCCode = "GB";

  // Note - VAT codes without the "**" in the comment do not have check digit checking.

  vatexp.push (/^(AT)U(\d{8})$/);                           //** Austria
  vatexp.push (/^(BE)(0?\d{9})$/);                          //** Belgium
  vatexp.push (/^(BG)(\d{9,10})$/);                         //** Bulgaria
  vatexp.push (/^(CHE)(\d{9})(MWST)?$/);                    //** Switzerland
  vatexp.push (/^(CY)([0-5|9]\d{7}[A-Z])$/);                //** Cyprus
  vatexp.push (/^(CZ)(\d{8,10})(\d{3})?$/);                 //** Czech Republic
  vatexp.push (/^(DE)([1-9]\d{8})$/);                       //** Germany
  vatexp.push (/^(DK)(\d{8})$/);                            //** Denmark
  vatexp.push (/^(EE)(10\d{7})$/);                          //** Estonia
  vatexp.push (/^(EL)(\d{9})$/);                            //** Greece
  vatexp.push (/^(ES)([A-Z]\d{8})$/);                       //** Spain (National juridical entities)
  vatexp.push (/^(ES)([A-H|N-S|W]\d{7}[A-J])$/);            //** Spain (Other juridical entities)
  vatexp.push (/^(ES)([0-9|Y|Z]\d{7}[A-Z])$/);              //** Spain (Personal entities type 1)
  vatexp.push (/^(ES)([K|L|M|X]\d{7}[A-Z])$/);              //** Spain (Personal entities type 2)
  vatexp.push (/^(EU)(\d{9})$/);                            //** EU-type
  vatexp.push (/^(FI)(\d{8})$/);                            //** Finland
  vatexp.push (/^(FR)(\d{11})$/);                           //** France (1)
  vatexp.push (/^(FR)([(A-H)|(J-N)|(P-Z)]\d{10})$/);        // France (2)
  vatexp.push (/^(FR)(\d[(A-H)|(J-N)|(P-Z)]\d{9})$/);       // France (3)
  vatexp.push (/^(FR)([(A-H)|(J-N)|(P-Z)]{2}\d{9})$/);      // France (4)
  vatexp.push (/^(GB)?(\d{9})$/);                           //** UK (Standard)
  vatexp.push (/^(GB)?(\d{12})$/);                          //** UK (Branches)
  vatexp.push (/^(GB)?(GD\d{3})$/);                         //** UK (Government)
  vatexp.push (/^(GB)?(HA\d{3})$/);                         //** UK (Health authority)
  vatexp.push (/^(HR)(\d{11})$/);                           //** Croatia
  vatexp.push (/^(HU)(\d{8})$/);                            //** Hungary
  vatexp.push (/^(IE)(\d{7}[A-W])$/);                       //** Ireland (1)
  vatexp.push (/^(IE)([7-9][A-Z\*\+)]\d{5}[A-W])$/);        //** Ireland (2)
  vatexp.push (/^(IE)(\d{7}[A-W][AH])$/);                   //** Ireland (3)
  vatexp.push (/^(IT)(\d{11})$/);                           //** Italy
  vatexp.push (/^(LV)(\d{11})$/);                           //** Latvia
  vatexp.push (/^(LT)(\d{9}|\d{12})$/);                     //** Lithunia
  vatexp.push (/^(LU)(\d{8})$/);                            //** Luxembourg
  vatexp.push (/^(MT)([1-9]\d{7})$/);                       //** Malta
  vatexp.push (/^(NL)(\d{9})B\d{2}$/);                      //** Netherlands
  vatexp.push (/^(NO)(\d{9})$/);                            //** Norway (not EU)
  vatexp.push (/^(PL)(\d{10})$/);                           //** Poland
  vatexp.push (/^(PT)(\d{9})$/);                            //** Portugal
  vatexp.push (/^(RO)([1-9]\d{1,9})$/);                     //** Romania
  vatexp.push (/^(RU)(\d{10}|\d{12})$/);                    //** Russia
  vatexp.push (/^(RS)(\d{9})$/);                            //** Serbia
  vatexp.push (/^(SI)([1-9]\d{7})$/);                       //** Slovenia
  vatexp.push (/^(SK)([1-9]\d[(2-4)|(6-9)]\d{7})$/);        //** Slovakia Republic
  vatexp.push (/^(SE)(\d{10}01)$/);                         //** Sweden

  // Load up the string to check
  var VATNumber = toCheck.toUpperCase();

  // Remove spaces etc. from the VAT number to help validation
  VATNumber = VATNumber.replace (/(\s|-|\.)+/g, '');

  // Assume we're not going to find a valid VAT number
  var valid = false;

  // Check the string against the regular expressions for all types of VAT numbers
  for (var i=0; i<vatexp.length; i++) {

    // Have we recognised the VAT number?
    if (vatexp[i].test(VATNumber)) {

      // Yes - we have
      var cCode = RegExp.$1;                             // Isolate country code
      var cNumber = RegExp.$2;                           // Isolate the number
      if (cCode.length === 0) {
        cCode = defCCode;           // Set up default country code
      }

      // Call the appropriate country VAT validation routine depending on the country code
      if (eval(cCode+"VATCheckDigit ('"+cNumber+"')")) {
        valid = VATNumber;
      }

      // Having processed the number, we break from the loop
      break;
    }
  }

  // Return with either an error or the reformatted VAT number
  return valid;
}

function ATVATCheckDigit (vatnumber) {

  // Checks the check digits of an Austrian VAT number.

  var total = 0;
  var multipliers = [1,2,1,2,1,2,1];
  var temp = 0;

  // Extract the next digit and multiply by the appropriate multiplier.
  for (var i = 0; i < 7; i++) {
    temp = Number(vatnumber.charAt(i)) * multipliers[i];
    if (temp > 9){
      total += Math.floor(temp/10) + temp%10;
    }else{
      total += temp;
    }
  }

  // Establish check digit.
  total = 10 - (total+4) % 10;
  if (total === 10){
    total = 0;
  }

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total === vatnumber.slice (7,8)){
    return true;
  }else{
    return false;
  }
}

function BEVATCheckDigit (vatnumber) {

  // Checks the check digits of a Belgium VAT number.

  // Nine digit numbers have a 0 inserted at the front.
  if (vatnumber.length === 9) {
    vatnumber = "0" + vatnumber;
  }

  if (vatnumber.slice(1,2) === 0) {
    return false;
  }

  // Modulus 97 check on last nine digits
  if (97 - vatnumber.slice (0,8) % 97 === vatnumber.slice (8,10)){
    return true;
  }else{
    return false;
  }
}

function BGVATCheckDigit (vatnumber) {

  // Checks the check digits of a Bulgarian VAT number.

  if (vatnumber.length === 9) {

    // Check the check digit of 9 digit Bulgarian VAT numbers.
    var total = 0;

    // First try to calculate the check digit using the first multipliers
    var temp = 0;
    for (var i = 0; i < 8; i++) {
      temp += Number(vatnumber.charAt(i)) * (i+1);
    }

    // See if we have a check digit yet
    total = temp % 11;
    if (total !== 10) {
      if (total === vatnumber.slice (8)){
        return true;
      }else{
        return false;
      }
    }

    // We got a modulus of 10 before so we have to keep going. Calculate the new check digit using
    // the different multipliers
    var temp = 0;
    for (var i = 0; i < 8; i++) {
      temp += Number(vatnumber.charAt(i)) * (i+3);
    }

    // See if we have a check digit yet. If we still have a modulus of 10, set it to 0.
    total = temp % 11;
    if (total === 10) {
      total = 0;
    }
    if (total === vatnumber.slice (8)){
      return true;
    }else{
      return false;
    }
  }

  // 10 digit VAT code - see if it relates to a standard physical person
  if ((/^\d\d[0-5]\d[0-3]\d\d{4}$/).test(vatnumber)) {

    // Check month
    var month = Number(vatnumber.slice(2,4));
    if ((month > 0 && month < 13) || (month > 20 & month < 33)) {

      // Extract the next digit and multiply by the counter.
      var multipliers = [2,4,8,5,10,9,7,3,6];
      var total = 0;
      for (var i = 0; i < 9; i++) {
        total += Number(vatnumber.charAt(i)) * multipliers[i];
      }

      // Establish check digit.
      total = total % 11;
      if (total === 10) {
        total = 0;
      }

      // Check to see if the check digit given is correct, If not, try next type of person
      if (total === vatnumber.substr (9,1)) {
        return true;
      }
    }
  }

  // It doesn't relate to a standard physical person - see if it relates to a foreigner.

  // Extract the next digit and multiply by the counter.
  var multipliers = [21,19,17,13,11,9,7,3,1];
  var total = 0;
  for (var i = 0; i < 9; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Check to see if the check digit given is correct, If not, try next type of person
  if (total % 10 === vatnumber.substr (9,1)) {
    return true;
  }

  // Finally, if not yet identified, see if it conforms to a miscellaneous VAT number

  // Extract the next digit and multiply by the counter.
  var multipliers = [4,3,2,7,6,5,4,3,2];
  var total = 0;
  for (var i = 0; i < 9; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digit.
  total = 11 - total % 11;
  if (total === 10) {
    return false;
  }
  if (total === 11) {
    total = 0;
  }

  // Check to see if the check digit given is correct, If not, we have an error with the VAT number
  if (total === vatnumber.substr (9,1)){
    return true;
  }else{
    return false;
  }
}

function CHEVATCheckDigit (vatnumber) {

  // Checks the check digits of a Swiss VAT number.

  // Extract the next digit and multiply by the counter.
  var multipliers = [5,4,3,2,7,6,5,4];
  var total = 0;
  for (var i = 0; i < 8; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digit.
  total = 11 - total % 11;
  if (total === 10) {
    return false;
  }
  if (total === 11) {
    total = 0;
  }

  // Check to see if the check digit given is correct, If not, we have an error with the VAT number
  if (total === vatnumber.substr (8,1)){
    return true;
  }else{
    return false;
  }
}

function CYVATCheckDigit (vatnumber) {

  // Checks the check digits of a Cypriot VAT number.

  // Not allowed to start with '12'
  if (Number(vatnumber.slice(0,2) === 12)) {
    return false;
  }

  // Extract the next digit and multiply by the counter.
  var total = 0;
  for (var i = 0; i < 8; i++) {
    var temp = Number(vatnumber.charAt(i));
    if (i % 2 == 0) {
      switch (temp) {
        case 0: temp = 1; break;
        case 1: temp = 0; break;
        case 2: temp = 5; break;
        case 3: temp = 7; break;
        case 4: temp = 9; break;
        default: temp = temp*2 + 3;
      }
    }
    total += temp;
  }

  // Establish check digit using modulus 26, and translate to char. equivalent.
  total = total % 26;
  total = String.fromCharCode(total+65);

  // Check to see if the check digit given is correct
  if (total === vatnumber.substr (8,1)){
    return true;
  }else{
    return false;
  }
}

function CZVATCheckDigit (vatnumber) {

  // Checks the check digits of a Czech Republic VAT number.

  var total = 0;
  var multipliers = [8,7,6,5,4,3,2];

  var czexp = new Array ();
  czexp[0] = (/^\d{8}$/);
  czexp[1] = (/^[0-5][0-9][0|1|5|6]\d[0-3]\d\d{3}$/);
  czexp[2] = (/^6\d{8}$/);
  czexp[3] = (/^\d{2}[0-3|5-8]\d[0-3]\d\d{4}$/);
  var i = 0;

  // Legal entities
  if (czexp[0].test(vatnumber)) {

    // Extract the next digit and multiply by the counter.
    for (var i = 0; i < 7; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    // Establish check digit.
    total = 11 - total % 11;
    if (total == 10) {
      total = 0;
    }
    if (total == 11) {
      total = 1;
    }

    // Compare it with the last character of the VAT number. If it's the same, then it's valid.
    if (total == vatnumber.slice (7,8)){
      return true;
    }else{
      return false;
    }
  }

  // Individuals type 1
  else if (czexp[1].test(vatnumber)) {
    if (temp = Number(vatnumber.slice(0,2)) > 53) {
      return false;
    }
    return true;
  }

  // Individuals type 2
  else if (czexp[2].test(vatnumber)) {

    // Extract the next digit and multiply by the counter.
    for (var i = 0; i < 7; i++) {
      total += Number(vatnumber.charAt(i+1)) * multipliers[i];
    }

    // Establish check digit.
    total = 11 - total % 11;
    if (total == 10) {
      total = 0;
    }
    if (total == 11) {
      total = 1;
    }

    // Convert calculated check digit according to a lookup table;
    var lookup  = [8,7,6,5,4,3,2,1,0,9,10];
    if (lookup[total-1] == vatnumber.slice (8,9)){
      return true;
    }else{
      return false;
    }
  }

  // Individuals type 3
  else if (czexp[3].test(vatnumber)) {
    var temp = Number(vatnumber.slice(0,2)) + Number(vatnumber.slice(2,4)) + Number(vatnumber.slice(4,6)) + Number(vatnumber.slice(6,8)) + Number(vatnumber.slice(8));
    if (temp % 11 == 0 && Number(vatnumber) % 11 == 0){
      return true;
    }else{
      return false;
    }
  }

  // else error
  return false;
}

function DEVATCheckDigit (vatnumber) {

  // Checks the check digits of a German VAT number.

  var product = 10;
  var sum = 0;
  var checkdigit = 0;
  for (var i = 0; i < 8; i++) {

    // Extract the next digit and implement peculiar algorithm!.
    sum = (Number(vatnumber.charAt(i)) + product) % 10;
    if (sum == 0) {sum = 10};
    product = (2 * sum) % 11;
  }

  // Establish check digit.
  if (11 - product == 10) {checkdigit = 0} else {checkdigit = 11 - product};

  // Compare it with the last two characters of the VAT number. If the same, then it is a valid
  // check digit.
  if (checkdigit == vatnumber.slice (8,9)){
    return true;
  }else{
    return false;
  }
}

function DKVATCheckDigit (vatnumber) {

  // Checks the check digits of a Danish VAT number.

  var total = 0;
  var multipliers = [2,7,6,5,4,3,2,1];

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 8; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digit.
  total = total % 11;

  // The remainder should be 0 for it to be valid..
  if (total == 0){
    return true;
  }else{
    return false;
  }
}

function EEVATCheckDigit (vatnumber) {

  // Checks the check digits of an Estonian VAT number.

  var total = 0;
  var multipliers = [3,7,1,3,7,1,3,7];

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 8; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digits using modulus 10.
  total = 10 - total % 10;
  if (total == 10) {
    total = 0;
  }

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (8,9)){
    return true;
  }else{
    return false;
  }
}

function ELVATCheckDigit (vatnumber) {

  // Checks the check digits of a Greek VAT number.

  var total = 0;
  var multipliers = [256,128,64,32,16,8,4,2];

  //eight character numbers should be prefixed with an 0.
  if (vatnumber.length == 8) {vatnumber = "0" + vatnumber};

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 8; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digit.
  total = total % 11;
  if (total > 9) {total = 0;};

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (8,9)){
    return true;
  }else{
    return false;
  }
}

function ESVATCheckDigit (vatnumber) {

  // Checks the check digits of a Spanish VAT number.

  var total = 0;
  var temp = 0;
  var multipliers = [2,1,2,1,2,1,2];
  var esexp = new Array ();
  esexp[0] = (/^[A-H|J|U|V]\d{8}$/);
  esexp[1] = (/^[A-H|N-S|W]\d{7}[A-J]$/);
  esexp[2] = (/^[0-9|Y|Z]\d{7}[A-Z]$/);
  esexp[3] = (/^[K|L|M|X]\d{7}[A-Z]$/);
  var i = 0;

  // National juridical entities
  if (esexp[0].test(vatnumber)) {

    // Extract the next digit and multiply by the counter.
    for (i = 0; i < 7; i++) {
      temp = Number(vatnumber.charAt(i+1)) * multipliers[i];
      if (temp > 9)
      total += Math.floor(temp/10) + temp%10
      else
      total += temp;
    }
    // Now calculate the check digit itself.
    total = 10 - total % 10;
    if (total == 10) {total = 0;}

    // Compare it with the last character of the VAT number. If it's the same, then it's valid.
    if (total == vatnumber.slice (8,9)){
      return true;
    }else{
      return false;
    }
  }

  // Juridical entities other than national ones
  else if (esexp[1].test(vatnumber)) {

    // Extract the next digit and multiply by the counter.
    for (i = 0; i < 7; i++) {
      temp = Number(vatnumber.charAt(i+1)) * multipliers[i];
      if (temp > 9)
      total += Math.floor(temp/10) + temp%10
      else
      total += temp;
    }

    // Now calculate the check digit itself.
    total = 10 - total % 10;
    total = String.fromCharCode(total+64);

    // Compare it with the last character of the VAT number. If it's the same, then it's valid.
    if (total == vatnumber.slice (8,9)){
      return true;
    }else{
      return false;
    }
  }

  // Personal number (NIF) (starting with numeric of Y or Z)
  else if (esexp[2].test(vatnumber)) {
    var tempnumber = vatnumber;
    if (tempnumber.substring(0,1) == 'Y') {
      tempnumber = tempnumber.replace (/Y/, "1");
    }
    if (tempnumber.substring(0,1) == 'Z') {
      tempnumber = tempnumber.replace (/Z/, "2");
    }
    return tempnumber.charAt(8) == 'TRWAGMYFPDXBNJZSQVHLCKE'.charAt(Number(tempnumber.substring(0,8)) % 23);
  }

  // Personal number (NIF) (starting with K, L, M, or X)
  else if (esexp[3].test(vatnumber)) {
    return vatnumber.charAt(8) == 'TRWAGMYFPDXBNJZSQVHLCKE'.charAt(Number(vatnumber.substring(1,8)) % 23);
  }

  else return false;
}

function EUVATCheckDigit (vatnumber) {

  // We know little about EU numbers apart from the fact that the first 3 digits represent the
  // country, and that there are nine digits in total.
  return true;
}

function FIVATCheckDigit (vatnumber) {

  // Checks the check digits of a Finnish VAT number.

  var total = 0;
  var multipliers = [7,9,10,5,8,4,2];

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 7; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digit.
  total = 11 - total % 11;
  if (total > 9) {total = 0;};

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (7,8)){
    return true;
  }else{
    return false;
  }
}

function FRVATCheckDigit (vatnumber) {

  // Checks the check digits of a French VAT number.

  if (!(/^\d{11}$/).test(vatnumber)) {
    return true;
  }

  // Extract the last nine digits as an integer.
  var total = vatnumber.substring(2);

  // Establish check digit.
  total = (total*100+12) % 97;

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (0,2)){
    return true;
  }else{
    return false;
  }
}

function GBVATCheckDigit (vatnumber) {

  // Checks the check digits of a UK VAT number.

  var multipliers = [8,7,6,5,4,3,2];

  // Government departments
  if (vatnumber.substr(0,2) == 'GD') {
    if (vatnumber.substr(2,3) < 500){
      return true;
    }else{
      return false;
    }
  }

  // Health authorities
  if (vatnumber.substr(0,2) == 'HA') {
    if (vatnumber.substr(2,3) > 499){
      return true;
    }else{
      return false;
    }
  }

  // Standard and commercial numbers
  var total = 0;

  // 0 VAT numbers disallowed!
  if (Number(vatnumber.slice(0)) == 0) {
    return false;
  }

  // Check range is OK for modulus 97 calculation
  var no = Number(vatnumber.slice(0,7));

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 7; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Old numbers use a simple 97 modulus, but new numbers use an adaptation of that (less 55). Our
  // VAT number could use either system, so we check it against both.

  // Establish check digits by subtracting 97 from total until negative.
  var cd = total;
  while (cd > 0) {cd = cd - 97;}

  // Get the absolute value and compare it with the last two characters of the VAT number. If the
  // same, then it is a valid traditional check digit. However, even then the number must fit within
  // certain specified ranges.
  cd = Math.abs(cd);
  if (cd == vatnumber.slice (7,9) && no < 9990001 && (no < 100000 || no > 999999) && (no < 9490001 || no > 9700000)) {
    return true;
  }

  // Now try the new method by subtracting 55 from the check digit if we can - else add 42
  if (cd >= 55){
    cd = cd - 55;
  }else{
    cd = cd + 42;
  }
  if (cd == vatnumber.slice (7,9) && no > 1000000){
    return true;
  }else{
    return false;
  }
}

function HRVATCheckDigit (vatnumber) {

  // Checks the check digits of a Croatian VAT number using ISO 7064, MOD 11-10 for check digit.

  var product = 10;
  var sum = 0;
  var checkdigit = 0;

  for (var i = 0; i < 10; i++) {

    // Extract the next digit and implement the algorithm
    sum = (Number(vatnumber.charAt(i)) + product) % 10;
    if (sum == 0) {sum = 10};
    product = (2 * sum) % 11;
  }

  // Now check that we have the right check digit
  if ((product + vatnumber.slice (10,11)*1) % 10== 1){
    return true;
  }else{
    return false;
  }
}

function HUVATCheckDigit (vatnumber) {

  // Checks the check digits of a Hungarian VAT number.

  var total = 0;
  var multipliers = [9,7,3,1,9,7,3];

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 7; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digit.
  total = 10 - total % 10;
  if (total == 10) {
    total = 0;
  }

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (7,8)){
    return true;
  }else{
    return false;
  }
}

function IEVATCheckDigit (vatnumber) {

  // Checks the check digits of an Irish VAT number.

  var total = 0;
  var multipliers = [8,7,6,5,4,3,2];

  // If the code is type 1 format, we need to convert it to the new before performing the validation.
  if (/^\d[A-Z\*\+]/.test(vatnumber)) {
    vatnumber = "0" + vatnumber.substring(2,7) + vatnumber.substring(0,1) + vatnumber.substring(7,8);
  }

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 7; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // If the number is type 3 then we need to include the trailing A or H in the calculation
  if (/^\d{7}[A-Z][AH]$/.test(vatnumber)) {

    // Add in a multiplier for the character A (1*9=9) or H (8*9=72)
    if (vatnumber.charAt(8) == 'H'){
      total += 72;
    }else{
      total += 9;
    }
  }

  // Establish check digit using modulus 23, and translate to char. equivalent.
  total = total % 23;
  if (total == 0){
    total = "W";
  }else{
    total = String.fromCharCode(total+64);
  }

  // Compare it with the eighth character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (7,8)){
    return true;
  }else{
    return false;
  }
}

function ITVATCheckDigit (vatnumber) {

  // Checks the check digits of an Italian VAT number.

  var total = 0;
  var multipliers = [1,2,1,2,1,2,1,2,1,2];
  var temp;

  // The last three digits are the issuing office, and cannot exceed more 201, unless 999 or 888
  if (Number(vatnumber.slice(0,7))==0) {
    return false;
  }
  temp=Number(vatnumber.slice(7,10));
  if ((temp<1) || (temp>201) && temp != 999 && temp != 888) {
    return false;
  }

  // Extract the next digit and multiply by the appropriate
  for (var i = 0; i < 10; i++) {
    temp = Number(vatnumber.charAt(i)) * multipliers[i];
    if (temp > 9){
      total += Math.floor(temp/10) + temp%10;
    }else{
      total += temp;
    }
  }

  // Establish check digit.
  total = 10 - total % 10;
  if (total > 9) {total = 0;};

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (10,11)){
    return true;
  }else{
    return false;
  }
}

function LTVATCheckDigit (vatnumber) {

  // Checks the check digits of a Lithuanian VAT number.

  // 9 character VAT numbers are for legal persons
  if (vatnumber.length == 9) {

    // 8th character must be one
    if (!(/^\d{7}1/).test(vatnumber)) {
      return false;
    }

    // Extract the next digit and multiply by the counter+1.
    var total = 0;
    for (var i = 0; i < 8; i++) {
      total += Number(vatnumber.charAt(i)) * (i+1);
    }

    // Can have a double check digit calculation!
    if (total % 11 == 10) {
      var multipliers = [3,4,5,6,7,8,9,1];
      total = 0;
      for (i = 0; i < 8; i++) {
        total += Number(vatnumber.charAt(i)) * multipliers[i];
      }
    }

    // Establish check digit.
    total = total % 11;
    if (total == 10) {total = 0;};

    // Compare it with the last character of the VAT number. If it's the same, then it's valid.
    if (total == vatnumber.slice (8,9)){
      return true;
    }else{
      return false;
    }
  }

  // 12 character VAT numbers are for temporarily registered taxpayers
  else {

    // 11th character must be one
    if (!(/^\d{10}1/).test(vatnumber)) {
      return false;
    }

    // Extract the next digit and multiply by the counter+1.
    var total = 0;
    var multipliers = [1,2,3,4,5,6,7,8,9,1,2];
    for (var i = 0; i < 11; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    // Can have a double check digit calculation!
    if (total % 11 == 10) {
      var multipliers = [3,4,5,6,7,8,9,1,2,3,4];
      total = 0;
      for (i = 0; i < 11; i++) {
        total += Number(vatnumber.charAt(i)) * multipliers[i];
      }
    }

    // Establish check digit.
    total = total % 11;
    if (total == 10) {total = 0;};

    // Compare it with the last character of the VAT number. If it's the same, then it's valid.
    if (total == vatnumber.slice (11,12)){
      return true;
    }else{
      return false;
    }
  }
}

function LUVATCheckDigit (vatnumber) {

  // Checks the check digits of a Luxembourg VAT number.

  if (vatnumber.slice (0,6) % 89 == vatnumber.slice (6,8)){
    return true;
  }else{
    return false;
  }
}

function LVVATCheckDigit (vatnumber) {

  // Checks the check digits of a Latvian VAT number.

  // Differentiate between legal entities and natural bodies. For the latter we simply check that
  // the first six digits correspond to valid DDMMYY dates.
  if ((/^[0-3]/).test(vatnumber)) {
    if ((/^[0-3][0-9][0-1][0-9]/).test(vatnumber) ){
      return true;
    }else{
      return false;
    }
  }

  else {

    var total = 0;
    var multipliers = [9,1,4,8,3,10,2,5,7,6];

    // Extract the next digit and multiply by the counter.
    for (var i = 0; i < 10; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    // Establish check digits by getting modulus 11.
    if (total%11 == 4 && vatnumber[0] ==9) {
      total = total - 45;
    }
    if (total%11 == 4){
      total = 4 - total%11;
    }else if (total%11 > 4){
      total = 14 - total%11;
    }else if (total%11 < 4){
      total = 3 - total%11;
    }

    // Compare it with the last character of the VAT number. If it's the same, then it's valid.
    if (total == vatnumber.slice (10,11)){
      return true;
    }else{
      return false;
    }
  }
}

function MTVATCheckDigit (vatnumber) {

  // Checks the check digits of a Maltese VAT number.

  var total = 0;
  var multipliers = [3,4,6,7,8,9];

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 6; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digits by getting modulus 37.
  total = 37 - total % 37;

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (6,8) * 1){
    return true;
  }else{
    return false;
  }
}

function NLVATCheckDigit (vatnumber) {

  // Checks the check digits of a Dutch VAT number.

  var total = 0;
  var multipliers = [9,8,7,6,5,4,3,2];

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 8; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digits by getting modulus 11.
  total = total % 11;
  if (total > 9) {total = 0;};

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (8,9)){
    return true;
  }else{
    return false;
  }
}

function NOVATCheckDigit (vatnumber) {

  // Checks the check digits of a Norwegian VAT number.
  // See http://www.brreg.no/english/coordination/number.html

  var total = 0;
  var multipliers = [3,2,7,6,5,4,3,2];

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 8; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digits by getting modulus 11. Check digits > 9 are invalid
  total = 11 - total % 11;
  if (total == 11) {total = 0;}
  if (total < 10) {

    // Compare it with the last character of the VAT number. If it's the same, then it's valid.
    if (total == vatnumber.slice (8,9)){
      return true;
    }else{
      return false;
    }
  }
}

function PLVATCheckDigit (vatnumber) {

  // Checks the check digits of a Polish VAT number.

  var total = 0;
  var multipliers = [6,5,7,2,3,4,5,6,7];

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 9; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digits subtracting modulus 11 from 11.
  total = total % 11;
  if (total > 9) {total = 0;};

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (9,10)){
    return true;
  }else{
    return false;
  }
}

function PTVATCheckDigit (vatnumber) {

  // Checks the check digits of a Portugese VAT number.

  var total = 0;
  var multipliers = [9,8,7,6,5,4,3,2];

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 8; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digits subtracting modulus 11 from 11.
  total = 11 - total % 11;
  if (total > 9) {total = 0;};

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (8,9)){
    return true;
  }else{
    return false;
  }
}

function ROVATCheckDigit (vatnumber) {

  // Checks the check digits of a Romanian VAT number.

  var multipliers = [7,5,3,2,1,7,5,3,2];

  // Extract the next digit and multiply by the counter.
  var VATlen = vatnumber.length;
  multipliers = multipliers.slice (10-VATlen);
  var total = 0;
  for (var i = 0; i < vatnumber.length-1; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digits by getting modulus 11.
  total = (10 * total) % 11;
  if (total == 10) {
    total = 0;
  }

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (total == vatnumber.slice (vatnumber.length-1, vatnumber.length)){
    return true;
  }else{
    return false;
  }
}

function RSVATCheckDigit (vatnumber) {

  // Checks the check digits of a Serbian VAT number using ISO 7064, MOD 11-10 for check digit.

  var product = 10;
  var sum = 0;
  var checkdigit = 0;

  for (var i = 0; i < 8; i++) {

    // Extract the next digit and implement the algorithm
    sum = (Number(vatnumber.charAt(i)) + product) % 10;
    if (sum == 0) {sum = 10};
    product = (2 * sum) % 11;
  }

  // Now check that we have the right check digit
  if ((product + vatnumber.slice (8,9)*1) % 10== 1){
    return true;
  }else{
    return false;
  }
}
function RUVATCheckDigit (vatnumber) {

  // Checks the check digits of a Russian INN number
  // See http://russianpartner.biz/test_inn.html for algorithm

  // 10 digit INN numbers
  if (vatnumber.length == 10) {
    var total = 0;
    var multipliers = [2,4,10,3,5,9,4,6,8,0]
    for (var i = 0; i < 10; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }
    total = total % 11
    if (total > 9) {total = total % 10}

    // Compare it with the last character of the VAT number. If it is the same, then it's valid
    if (total == vatnumber.slice (9,10)){
      return true;
    }else{
      return false;
    }

    // 12 digit INN numbers
  } else if(vatnumber.length == 12){
    var total1 = 0
    var multipliers1 = [7,2,4,10,3,5,9,4,6,8,0]
    var total2 = 0
    var multipliers2 = [3,7,2,4,10,3,5,9,4,6,8,0]

    for (var i = 0; i < 11; i++) {
      total1 += Number(vatnumber.charAt(i)) * multipliers1[i];
    }
    total1 = total1 % 11
    if (total1 > 9) {total1 = total1 % 10}

    for (var i = 0; i < 11; i++) {
      total2 += Number(vatnumber.charAt(i)) * multipliers2[i];
    }
    total2 = total2 % 11
    if (total2 > 9) {total2 = total2 % 10}

    // Compare the first check with the 11th character and the second check with the 12th and last
    // character of the VAT number. If they're both the same, then it's valid
    if ((total1 == vatnumber.slice (10,11)) && (total2 == vatnumber.slice (11,12))){
      return true;
    }else{
      return false;
    }
  }
}

function SEVATCheckDigit (vatnumber) {

  // Calculate R where R = R1 + R3 + R5 + R7 + R9, and Ri = INT(Ci/5) + (Ci*2) modulo 10
  var R = 0;
  var digit;
  for (var i = 0; i < 9; i=i+2) {
    digit = Number(vatnumber.charAt(i));
    R += Math.floor(digit / 5)  + ((digit * 2) % 10);
  }

  // Calculate S where S = C2 + C4 + C6 + C8
  var S = 0;
  for (var i = 1; i < 9; i=i+2) {
    S += Number(vatnumber.charAt(i));
  }

  // Calculate the Check Digit
  var cd = (10 - (R + S) % 10) % 10;

  // Compare it with the last character of the VAT number. If it's the same, then it's valid.
  if (cd == vatnumber.slice (9,10)){
    return true;
  }else{
    return false;
  }
}

function SIVATCheckDigit (vatnumber) {

  // Checks the check digits of a Slovenian VAT number.

  var total = 0;
  var multipliers = [8,7,6,5,4,3,2];

  // Extract the next digit and multiply by the counter.
  for (var i = 0; i < 7; i++) {
    total += Number(vatnumber.charAt(i)) * multipliers[i];
  }

  // Establish check digits using modulus 11
  total = 11 - total % 11;
  if (total == 10) {total = 0;};

  // Compare the number with the last character of the VAT number. If it is the
  // same, then it's a valid check digit.
  if (total != 11 && total == vatnumber.slice (7,8)){
    return true;
  }else{
    return false;
  }
}

function SKVATCheckDigit (vatnumber) {

  // Checks the check digits of a Slovakian VAT number.

  // Check that the modulus of the whole VAT number is 0 - else error
  if (Number(vatnumber % 11) == 0){
    return true;
  }else{
    return false;
  }
}
