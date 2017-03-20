var cache = require('../controllers/cache');
module.exports.requiresLogin = function (req, res, next) {
  if (req.cookies['connect.sid'] != null){
    cache.getUserDetails(req, function(userdata){
      if (userdata){
        cache.getOrgDetails(userdata.customerid, function(customerdata){
          if ((customerdata && customerdata.cardid) || (userdata.customerid == "via-customer")){
            return next();
          }else{
            res.redirect('/registercc');
          }
        })
      }else{
        console.log('user is not authenticated');
        res.redirect("/login?redirectto=" + req.url);
      }
    })
  }else{
    //The user isn't logged in
    console.log('no session cookie');
    res.redirect("/login?redirectto=" + req.url);
  }
}
