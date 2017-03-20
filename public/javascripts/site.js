$(function(){
  //Functions

  //cookies for the sidebar collapse
  function toggleSideBar(_this){
    var b = $("#sidebar-collapse")[0];
    var w = $("#cl-wrapper");
    var s = $(".cl-sidebar");

    if(w.hasClass("sb-collapsed")){
      $(".fa",b).addClass("fa-angle-left").removeClass("fa-angle-right");
      w.removeClass("sb-collapsed");
      s.find(".footer").removeClass("hidden");
      $.cookie('FLATDREAM_sidebar','open',{expires:365, path:'/'});
    }else{
      $(".fa",b).removeClass("fa-angle-left").addClass("fa-angle-right");
      w.addClass("sb-collapsed");
      s.find(".footer").addClass("hidden");
      $.cookie('FLATDREAM_sidebar','closed',{expires:365, path:'/'});
    }
  }


  //Fixed Menu

  if ($("#cl-wrapper").hasClass("fixed-menu")){
      $('#head-nav').addClass('navbar-fixed-top');
  }
  function updateHeight(){
    if(!$("#cl-wrapper").hasClass("fixed-menu")){
      var button = $("#cl-wrapper .collapse-button").outerHeight();
      var navH = $("#head-nav").height();
      //var document = $(document).height();
      var cont = $("#pcont").height();
      var sidebar = ($(window).width() > 755 && $(window).width() < 963)?0:$("#cl-wrapper .menu-space .content").height();
      var windowH = $(window).height();

      if(sidebar < windowH && cont < windowH){
        if(($(window).width() > 755 && $(window).width() < 963)){
          var height = windowH;
        }else{
          var height = windowH - button;
        }
      }else if((sidebar < cont && sidebar > windowH) || (sidebar < windowH && sidebar < cont)){
        var height = cont + button;
      }else if(sidebar > windowH && sidebar > cont){
        var height = sidebar + button;
      }

      $("#cl-wrapper .menu-space").css("min-height",height);
    }else{
      $("#cl-wrapper .nscroller").nanoScroller({ preventPageScrolling: true });
    }
  }


      /*VERTICAL MENU*/
      $(".cl-vnavigation li ul").each(function(){
        $(this).parent().addClass("parent");
      });

      $(".cl-vnavigation li ul li.active").each(function(){//If li.active is a sub-menu item open all its parents

        $(this).parents(".sub-menu").css({'display':'block'});
        $(this).parents(".parent").addClass("open");

      });

      $('.cl-vnavigation li > a').on('click', function (e) {
        if ($(this).next().hasClass('sub-menu') === false) {
            return;
        }
        var parent = $(this).parent().parent();


        parent.children('li.open').children('a').children('.arrow').removeClass('open');
        parent.children('li.open').children('a').children('.arrow').removeClass('active');
        parent.children('li.open').children('.sub-menu').slideUp(200);
        parent.children('li').removeClass('open');
        if ($('#cl-wrapper').hasClass('sb-collapsed') === false){
          var sub = jQuery(this).next();
          if (sub.is(":visible")) {
              jQuery('.arrow', jQuery(this)).removeClass("open");
              jQuery(this).parent().removeClass("active");
              sub.slideUp(200, function () {
                  handleSidebarAndContentHeight();
              });
          } else {
              jQuery('.arrow', jQuery(this)).addClass("open");
              jQuery(this).parent().addClass("open");
              sub.slideDown(200, function () {
                  handleSidebarAndContentHeight();
              });
          }
       }
        e.preventDefault();
    });
    //Auto close open menus in Condensed menu
    if ($('#cl-wrapper').hasClass('sb-collapsed')) {
        var elem = $('.cl-sidebar ul');
        elem.children('li.open').children('a').children('.arrow').removeClass('open');
        elem.children('li.open').children('a').children('.arrow').removeClass('active');
        elem.children('li.open').children('.sub-menu').slideUp(0);
        elem.children('li').removeClass('open');
    }

    var handleSidebarAndContentHeight = function () {
        var content = $('.page-content');
        var sidebar = $('.cl-vnavigation');

        if (!content.attr("data-height")) {
            content.attr("data-height", content.height());
        }

        if (sidebar.height() > content.height()) {
            content.css("min-height", sidebar.height() + 120);
        } else {
            content.css("min-height", content.attr("data-height"));
        }
    };

      /*Small devices toggle*/
      $(".cl-toggle").click(function(e){
        var ul = $(".cl-vnavigation");
        ul.slideToggle(300, 'swing', function () {
        });
        e.preventDefault();
      });

      /*Collapse sidebar*/
      $("#sidebar-collapse").click(function(){
          toggleSideBar();
      });


      if($("#cl-wrapper").hasClass("fixed-menu")){
        var scroll =  $("#cl-wrapper .menu-space");
        scroll.addClass("nano nscroller");

        function update_height(){
          var button = $("#cl-wrapper .collapse-button");
          var collapseH = button.outerHeight();
          var navH = $("#head-nav").height();
          var height = $(window).height() - ((button.is(":visible"))?collapseH:0);
          scroll.css("height",height);
          $("#cl-wrapper .nscroller").nanoScroller({ preventPageScrolling: true });
        }

        $(window).resize(function() {
          update_height();
        });

        update_height();
        $("#cl-wrapper .nscroller").nanoScroller({ preventPageScrolling: true });

      }

      /*SubMenu hover */
        var tool = $("<div id='sub-menu-nav' style='position:fixed;z-index:9999;'></div>");

        function showMenu(_this, e){
          if(($("#cl-wrapper").hasClass("sb-collapsed") || ($(window).width() > 755 && $(window).width() < 963)) && $("ul",_this).length > 0){
            $(_this).removeClass("ocult");
            var menu = $("ul",_this);
            if(!$(".dropdown-header",_this).length){
              var head = '<li class="dropdown-header">' +  $(_this).children().html()  + "</li>" ;
              menu.prepend(head);
            }

            tool.appendTo("body");
            var top = ($(_this).offset().top + 8) - $(window).scrollTop();
            var left = $(_this).width();

            tool.css({
              'top': top,
              'left': left + 8
            });
            tool.html('<ul class="sub-menu">' + menu.html() + '</ul>');
            tool.show();

            menu.css('top', top);
          }else{
            tool.hide();
          }
        }

        $(".cl-vnavigation li").hover(function(e){
          showMenu(this, e);
        },function(e){
          tool.removeClass("over");
          setTimeout(function(){
            if(!tool.hasClass("over") && !$(".cl-vnavigation li:hover").length > 0){
              tool.hide();
            }
          },500);
        });

        tool.hover(function(e){
          $(this).addClass("over");
        },function(){
          $(this).removeClass("over");
          tool.fadeOut("fast");
        });


        $(document).click(function(){
          tool.hide();
        });
        $(document).on('touchstart click', function(e){
          tool.fadeOut("fast");
        });

        tool.click(function(e){
          e.stopPropagation();
        });

        $(".cl-vnavigation li").click(function(e){
          if((($("#cl-wrapper").hasClass("sb-collapsed") || ($(window).width() > 755 && $(window).width() < 963)) && $("ul",this).length > 0) && !($(window).width() < 755)){
            showMenu(this, e);
            e.stopPropagation();
          }
        });

      /*Return to top*/
      var offset = 220;
      var duration = 500;
      var button = $('<a href="#" class="back-to-top"><i class="fa fa-angle-up"></i></a>');
      button.appendTo("body");

      jQuery(window).scroll(function() {
        if (jQuery(this).scrollTop() > offset) {
            jQuery('.back-to-top').fadeIn(duration);
        } else {
            jQuery('.back-to-top').fadeOut(duration);
        }
      });

      jQuery('.back-to-top').click(function(event) {
          event.preventDefault();
          jQuery('html, body').animate({scrollTop: 0}, duration);
          return false;
      });

  /*Tooltips*/
  $('.ttip, [data-toggle="tooltip"]').tooltip();

  /*Popover*/
  $('[data-popover="popover"]').popover();


  /*Tabs refresh hidden elements*/
  $('.nav-tabs').on('shown.bs.tab', function (e) {
    $(".nscroller").nanoScroller();
  });

});

$(function(){
  if($('body').hasClass('animated')){
    $("#cl-wrapper").css({opacity:1,'margin-left':0});
  }
  //Check cookie for menu collapse (ON DOCUMENT READY)
  if($.cookie('FLATDREAM_sidebar') && $.cookie('FLATDREAM_sidebar') == 'closed'){
      $('#cl-wrapper').addClass('sb-collapsed');
      $(".cl-sidebar .footer").addClass("hidden");
      $('.fa',$('#sidebar-collapse')[0]).addClass('fa-angle-right').removeClass('fa-angle-left');
  }
});

$(document).ready(function(){
  try{
  	tinymce.init({
      mode: "textareas",
      editor_deselector: 'mceNoEditor',
  		menubar: false,
  		statusbar: true,
      resize: true
  	});
  }catch(e){

  }

	$('.jconfirm').on('click', function(e){
		e.preventDefault();
		$.jAlert(
			{
				type:"confirm",
				confirmQuestion: "This will delete your account and all data immediately. Are you sure you want to continue?",
				onConfirm: function(){
					document.forms['delete-form'].submit();
				},
				onDeny:function(){

				}
			}
		)
	});

	try{
		$(".date").datetimepicker({
			format: "DD MMM YYYY"
		});

    $(".time").datetimepicker({
			format: "HH:mm"
		});
	}catch(e){
    console.log(e);
	}
})

function deleteDocument(url){
	$.jAlert(
		{
			type:"confirm",
			confirmQuestion: "The document will be deleted immediately. Are you sure you want to continue?",
			onConfirm: function(){
				$.ajax(
					{
						url: url,
						type: "GET",
						success: function(result){
							window.location.href = result;
						}
					}
				)
			},
			onDeny: function(){

			}
		}
	)
}

function deleteFile(el, filename, fileurl){
	$.jAlert(
		{
			type:"confirm",
			confirmQuestion: "The attachment \"" + filename + "\" will be deleted immediately. Are you sure you want to continue?",
			onConfirm: function(){
				$.ajax(
					{
						url: fileurl,
						type: "DELETE",
						success: function(result){
							$(el).remove();
						}
					}
				)
			},
			onDeny: function(){

			}
		}
	)
}

function deleteDatabase(fileurl){
	$.jAlert(
		{
			type:"confirm",
			confirmQuestion: "The database will be deleted immediately. Are you sure you want to continue?",
			onConfirm: function(){
				$.ajax(
					{
						url: fileurl,
						type: "DELETE",
						success: function(result){
							window.location.href = "/selectdatabase";
						}
					}
				)
			},
			onDeny: function(){

			}
		}
	)
}

function deleteAccount(){
  if ($("#confirmdelete").val() == "confirm"){
    $.jAlert(
      {
        type:"confirm",
        confirmQuestion: "This will immediately delete your account and all data associated with it. Do you want to continue?",
        onConfirm: function(){
          document.forms['delete-form'].submit();
        },
        onDeny: function(){

        }
      }
    )
  }
}

function confirmAndContinue(question, url){
  $.jAlert(
    {
      type:"confirm",
      confirmQuestion: question,
      onConfirm: function(){
        window.location.href = url;
      },
      onDeny: function(){

      }
    }
  )
}

function addUserToDatabase(database){
	var user = $('#adduser').val();
	if(user != ""){
		$.ajax({
			url: "/addusertodb",
			type: "POST",
			data: {user: user, database: database},
			success: function(result){
				window.location.href="/editdatabase/" + database;
			}
		})
	}
}

function addDatabaseToUser(user){
	var database = $('#adddatabase').val();
	if(database != ""){
		$.ajax({
			url: "/addusertodb",
			type: "POST",
			data: {user: user, database: database},
			success: function(result){
				window.location.href="/user/" + encodeURIComponent(user);
			}
		})
	}
}

function removeUserFromDatabase(database, user, href){
	$.ajax({
		url: "/removeuserfromdb",
		type: "POST",
		data: {user: user, database: database},
		success: function(result){
      if (href){
        window.location.href = href;
      }else{
        window.location.href="/editdatabase/" + database;
      }
		}
	})
}

function removeUser(user){
	$.ajax({
		url: "/removeuser",
		type: "POST",
		data: {user: user},
		success: function(result){
			window.location.href="/account";
		}
	})
}
