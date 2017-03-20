/*!
 * Start Bootstrap - Freelancer Bootstrap Theme (http://startbootstrap.com)
 * Code licensed under the Apache License v2.0.
 * For details, see http://www.apache.org/licenses/LICENSE-2.0.
 */

// jQuery for page scrolling feature - requires jQuery Easing plugin
$(function() {
  $('body').on('click', '.page-scroll a', function(event) {
    var $anchor = $(this);
    $('html, body').stop().animate({
      scrollTop: $($anchor.attr('href')).offset().top
    }, 1500, 'easeInOutExpo');
    event.preventDefault();
  });

});

$(window).on('load', function() {
  var labels = ['weeks', 'days', 'hours', 'minutes', 'seconds'],
    startDate = '2016/09/15 10:00:00',
    template = _.template('<div class="time <%= label %>">' +
      '<span class="count curr top"><%= curr %></span>' +
      '<span class="count next top"><%= next %></span>' +
      '<span class="count next bottom"><%= next %></span>' +
      '<span class="count curr bottom"><%= curr %></span>' +
      '<span class="label"><%= label.length < 6 ? label : label.substr(0, 3)  %></span>' +
      '</div>'
    ),
    currDate = '00:00:00:00:00',
    nextDate = '00:00:00:00:00',
    parser = /([0-9]{2})/gi,
    $example = $('#getting-started');
  // Parse countdown string to an object
  function strfobj(str) {
    var parsed = str.match(parser),
      obj = {};
    labels.forEach(function(label, i) {
      obj[label] = parsed[i]
    });
    return obj;
  }
  // Return the time components that diffs
  function diff(obj1, obj2) {
    var diff = [];
    labels.forEach(function(key) {
      if (obj1[key] !== obj2[key]) {
        diff.push(key);
      }
    });
    return diff;
  }
  // Build the layout
  var initData = strfobj(currDate);
  labels.forEach(function(label, i) {
    $example.append(template({
      curr: initData[label],
      next: initData[label],
      label: label
    }));
  });
  // Starts the countdown
  $example.countdown(startDate, function(event) {
    var newDate = event.strftime('%w:%d:%H:%M:%S'),
      data;
    if (newDate !== nextDate) {
      currDate = nextDate;
      nextDate = newDate;
      // Setup the data
      data = {
        'curr': strfobj(currDate),
        'next': strfobj(nextDate)
      };
      // Apply the new values to each node that changed
      diff(data.curr, data.next).forEach(function(label) {
        var selector = '.%s'.replace(/%s/, label),
          $node = $example.find(selector);
        // Update the node
        $node.removeClass('flip');
        $node.find('.curr').text(data.curr[label]);
        $node.find('.next').text(data.next[label]);
        // Wait for a repaint to then flip
        _.delay(function($node) {
          $node.addClass('flip');
        }, 50, $node);
      });
    }
  });
});


// Floating label headings for the contact form
$(function() {
  $("body").on("input propertychange", ".floating-label-form-group", function(e) {
    $(this).toggleClass("floating-label-form-group-with-value", !!$(e.target).val());
  }).on("focus", ".floating-label-form-group", function() {
    $(this).addClass("floating-label-form-group-with-focus");
  }).on("blur", ".floating-label-form-group", function() {
    $(this).removeClass("floating-label-form-group-with-focus");
  });
});

// Highlight the top nav as scrolling occurs
$('body').scrollspy({
  target: '.navbar-fixed-top'
})

// Closes the Responsive Menu on Menu Item Click
$('.navbar-collapse ul li a:not(.dropdown-toggle)').click(function() {
  $('.navbar-toggle:visible').click();
});

function togglePrice(currency, element) {
  $("#currencies li").removeClass("active");
  $(element).addClass("active");
  if (currency == "GBP") {
    $(".gbp").removeClass("hidden");
    if (!$(".usd").hasClass("hidden")) {
      $(".usd").addClass("hidden");
    }
    if (!$(".eur").hasClass("hidden")) {
      $(".eur").addClass("hidden");
    }
  } else if (currency == "USD") {
    $(".usd").removeClass("hidden");
    if (!$(".gbp").hasClass("hidden")) {
      $(".gbp").addClass("hidden");
    }
    if (!$(".eur").hasClass("hidden")) {
      $(".eur").addClass("hidden");
    }
  } else if (currency == "EUR") {
    $(".eur").removeClass("hidden");
    if (!$(".usd").hasClass("hidden")) {
      $(".usd").addClass("hidden");
    }
    if (!$(".gbp").hasClass("hidden")) {
      $(".gbp").addClass("hidden");
    }
  }
}

$('.modal').on('show.bs.modal', function(e) {
  if (!isIE()){
    //$(".modal-content").css("top", $(document).scrollTop() + "px");
    $(".modal-content").css("top", "0px");
  }
})

function isIE() {
  var ua = window.navigator.userAgent;
  var msie = ua.indexOf("MSIE ");

  if (msie > 0 || !!navigator.userAgent.match(/Trident.*rv\:11\./)) {
    return true;
  } else {
    return false;
  }
}
