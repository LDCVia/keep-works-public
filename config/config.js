(function() {
  'use strict';
  var env = process.env.NODE_ENV || 'beta';
  var out = {};
  out.env = env;
  out.apihost = process.env.LDCVIA_APIHOST || "https://eu.ldcvia.com/1.0";
  out.host = process.env.LDCVIA_HOST || "https://beta.ldcvia.com";
  out.apphost = process.env.LDCVIA_APPHOST || 'https://localhost:5000/';
  out.sitetitle = process.env.SITETITLE || "keep.works";
  out.adminapikey = process.env.LDCVIA_ADMINKEY || 'ldcvia-adminkey';
  out.stripekey = process.env.STRIPEKEY || 'stripe-key';
  out.uploadurl = process.env.UPLOADURL || "https://mixed2.keep.works/viauploader.nsf/upload.xsp";
  out.uploadhost = process.env.UPLOADHOST || "https://mixed2.keep.works/viauploader.nsf/";
  /* Re-captcha */
  /* Get your key / secret from https://developers.google.com/recaptcha/docs/start */
  out.recaptcha = {
    key: process.env.RECAPTCHA_KEY || 'recaptcha-key',
    secret: process.env.RECAPTCHA_SECRET || 'recaptcha-secret'
  };
  out.couponrequired = process.env.COUPON_REQUIRED || "0";
  out.enableregistration = process.env.ENABLEREGISTRATION && process.env.ENABLEREGISTRATION == "1" || false;
  out.secret = process.env.SECRET || "supersecretkey";
  out.count = 10;
  /* Mailgun config can be created here: https://www.mailgun.com/ */
  out.mailgunapikey = process.env.MAILGUN_KEY || 'mailgun-key';
  out.mailgundomain = process.env.MAILGUN_DOMAIN || 'mg.keep.works';
  out.admindb = process.env.LDCVIA_ADMINDB || 'keep-works-admin';
  out.datetimeformat = 'D MMM YYYY h:mm a';
  out.dateformat = 'D MMM YYYY';
  out.timeformat = 'h:mm a';
  out.subscriptionid = 'keep-works-personal';
  out.subscriptions = [{
    name: "Personal (£20 per month)",
    id: "keep-works-personal",
    planindex: 4,
    dblimit: 2
  }, {
    name: "Team (£50 per month)",
    id: "keep-works-team",
    planindex: 5,
    dblimit: 10
  }];
  /* Zendesk Can Be Configured here: http://zendesk.com */
  out.zendesk = {
    username: process.env.ZENDESK_USERNAME || 'zendesk-user',
    token: process.env.ZENDESK_TOKEN || 'zendesk-token',
    remoteUri: process.env.ZENDESK_URI || 'zendesk-uri'
  }
  out.newreply = {
    subject: "<from> replied to you on <db> - <maintopic>",
    body: "To view the reply click here: <link>"
  };
  out.newaccount = { //Is called when first user in an org registers
    subject: "keep.works Next Steps: Activate your account and import database",
    body: "<p>Please add a payment method to activate your account.</p>" +
      "<p>Then you can <a href=\"https://keep.works/importdatabase\">import your first database</a>.</p>" +
      "<p>If you have any issues please <a href=\"https://keep.works/support\">contact us</a>.</p>"
  };
  out.newuser = { //Is called when registering an additional user
    subject: "You have been registered for keep.works",
    body: "<p>You have been set up with an account for keep.works.</p>" +
      "<p>To log in, you will first need to set a password by visiting our <a href=\"https://keep.works/forgottenpassword?useremail=newuseremail\">" +
      "reset password</a> page and entering your email address.</p>"
  };
  out.eucountries = [
    "Austria",
    "Belgium",
    "Bulgaria",
    "Croatia",
    "Cyprus",
    "Czech Republic",
    "Denmark",
    "Estonia",
    "Finland",
    "France",
    "Germany",
    "Greece",
    "Hungary",
    "Ireland",
    "Italy",
    "Latvia",
    "Lithuania",
    "Luxembourg",
    "Malta",
    "Netherlands",
    "Poland",
    "Portugal",
    "Romania",
    "Slovakia",
    "Slovenia",
    "Spain",
    "Sweden",
    "United Kingdom"
  ];
  out.countries = ["Afghanistan", "Aland Islands", "Albania", "Algeria", "American Samoa", "Andorra", "Angola", "Anguilla", "Antarctica", "Antigua and Barbuda", "Argentina", "Armenia", "Aruba", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bermuda", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Bouvet Island", "Brazil", "British Indian Ocean Territory", "British Virgin Islands", "Brunei Darussalam", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", "Cayman Islands", "Central African Republic", "Chad", "Chile", "China", "Christmas Island", "Cocos (Keeling) Islands", "Colombia", "Comoros", "Congo (Brazzaville)", "Congo, Democratic Republic of the", "Cook Islands", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Côte d'Ivoire", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Falkland Islands (Malvinas)", "Faroe Islands", "Fiji", "Finland", "France", "French Guiana", "French Polynesia", "French Southern Territories", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Gibraltar", "Greece", "Greenland", "Grenada", "Guadeloupe", "Guam", "Guatemala", "Guernsey", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Heard Island and Mcdonald Islands", "Holy See (Vatican City State)", "Honduras", "Hong Kong, Special Administrative Region of China", "Hungary", "Iceland", "India", "Indonesia", "Iran, Islamic Republic of", "Iraq", "Ireland", "Isle of Man", "Israel", "Italy", "Jamaica", "Japan", "Jersey", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, Democratic People's Republic of", "Korea, Republic of", "Kuwait", "Kyrgyzstan", "Lao PDR", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Macao, Special Administrative Region of China", "Macedonia, Republic of", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Martinique", "Mauritania", "Mauritius", "Mayotte", "Mexico", "Micronesia, Federated States of", "Moldova", "Monaco", "Mongolia", "Montenegro", "Montserrat", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "Netherlands Antilles", "New Caledonia", "New Zealand", "Nicaragua", "Niger", "Nigeria", "Niue", "Norfolk Island", "Northern Mariana Islands", "Norway", "Oman", "Pakistan", "Palau", "Palestinian Territory, Occupied", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Pitcairn", "Poland", "Portugal", "Puerto Rico", "Qatar", "Romania", "Russian Federation", "Rwanda", "Réunion", "Saint Helena", "Saint Kitts and Nevis", "Saint Lucia", "Saint Pierre and Miquelon", "Saint Vincent and Grenadines", "Saint-Barthélemy", "Saint-Martin (French part)", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Georgia and the South Sandwich Islands", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Svalbard and Jan Mayen Islands", "Swaziland", "Sweden", "Switzerland", "Syrian Arab Republic (Syria)", "Taiwan, Republic of China", "Tajikistan", "Tanzania, United Republic of", "Thailand", "Timor-Leste", "Togo", "Tokelau", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Turks and Caicos Islands", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States Minor Outlying Islands", "United States of America", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela (Bolivarian Republic of)", "Viet Nam", "Virgin Islands, US", "Wallis and Futuna Islands", "Western Sahara", "Yemen", "Zambia", "Zimbabwe"];
  out.vatrate = 20;

  //template defaults
  out.defaultmenus = [{
    template: 'custom',
    defaultmenu: [{
      link: "/custom/index/__db__",
      icon: "fa-home",
      label: '__title__'
    }]
  }, {
    template: 'discussion',
    defaultmenu: [{
      link: "/discussion/index/__db__",
      icon: "fa-home",
      label: '__title__'
    }, {
      link: "/discussion/newtopic/__db__",
      icon: "fa-pencil",
      label: "New Topic"
    }]
  }, {
    template: 'doclibrary',
    defaultmenu: [{
      link: "/doclibrary/index/__db__",
      icon: "fa-home",
      label: '__title__'
    }, {
      link: "/doclibrary/newtopic/__db__",
      icon: "fa-pencil",
      label: "New Topic"
    }]
  }, {
    template: 'journal',
    defaultmenu: [{
      link: "/journal/entries/__db__",
      icon: "fa-home",
      label: '__title__'
    }, {
      link: "/journal/newentry/__db__",
      icon: "fa-pencil",
      label: "New Entry"
    }, {
      link: "/journal/newcleansheet/__db__",
      icon: "fa-pencil",
      label: "New Clean Sheet"
    }]
  }, {
    template: 'mail',
    defaultmenu: [{
      link: "/mail/index/__db__",
      icon: "fa-home",
      label: '__title__'
    }]
  }, {
    template: 'personalnab',
    defaultmenu: [{
      link: "/personalnab/index/__db__",
      icon: "fa-home",
      label: '__title__'
    }, {
      link: "/personalnab/newperson/__db__",
      icon: "fa-pencil",
      label: "New Person"
    }]
  }, {
    template: 'teamroom',
    defaultmenu: [{
      link: "/teamroom/index/__db__",
      icon: "fa-home",
      label: '__title__'
    }, {
      link: "/teamroom/newtopic/__db__",
      icon: "fa-pencil",
      label: "New Topic",
      dataintro: "Click the New Topic button to add a new topic"
    }, {
      link: "/teamroom/participants/__db__",
      icon: "fa-user",
      label: "Team Members"
    }, {
      link: "/teamroom/subteams/__db__",
      icon: "fa-group",
      label: "Subteams"
    }, {
      link: "/teamroom/events/__db__",
      icon: "fa-calendar",
      label: "Events"
    }]
  }];
  out.rttags = {
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
      'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
      'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'img', 'span'
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'style'],
      p: ['style'],
      img: ['src', 'style'],
      span: ['style'],
      strong: ['style']
    },
    selfClosing: ['img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta'],
    allowedSchemes: ['http', 'https', 'ftp', 'mailto'],
    allowedSchemesByTag: {}
  }
  module.exports = out;
}());
