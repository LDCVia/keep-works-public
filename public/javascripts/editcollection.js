$(document).ready(function() {
  var fixHelperModified = function(e, tr) {
    var $originals = tr.children();
    var $helper = tr.clone();
    $helper.children().each(function(index) {
      $(this).width($originals.eq(index).width())
    });
    return $helper;
  };
  $(".table tbody").sortable({
    containment: 'parent', 
    cursor: 'move',
    cursorAt: {left: 5},
    forceHelperSize: true,
    forcePlaceholderSize: true,
    helper: 'clone',
    opacity: 0.8,
    scroll: false,
    helper: fixHelperModified,
    stop: function(event, ui) {
      renumber_table()
    }
  }).disableSelection();

  toggleResponseCollection();
});

function renumber_table() {
  $(".table tr").each(function() {
    count = $(this).parent().children().index($(this)) + 1;
    $(this).find('.position').val(count);
  });
}

function setPrimaryField(){
  var field = $("#" + $("#primaryfield").val());
  var tr = field.closest('tr');
  var firstrow = $(".table tbody tr:first");
  tr.insertBefore(firstrow);
  renumber_table();
}

function setSecondaryField(){
  var field = $("#" + $("#secondaryfield").val());
  var tr = field.closest('tr');
  var firstrow = $(".table tbody tr:nth-child(2)");
  tr.insertBefore(firstrow);
  renumber_table();
}

function toggleResponseCollection(){
  if($("#allowresponses")){
    if ($("#allowresponses").val() == "1"){
      $(".responsecollection").show();
    }else{
      $(".responsecollection").hide();
    }
  }
}
