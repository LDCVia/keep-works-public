$(document).ready(function(){
  toggleDocType();

  $("#DocType").change(function(){
    toggleDocType();
  })

})

function toggleDocType(){
  var doctype = $("#DocType").val();
  $(".aifield").addClass('hidden');
  $(".mtgfield").addClass('hidden');
  $(".discfield").addClass('hidden');
  $(".reffield").addClass('hidden');
  if (doctype == "Action Item"){
    $(".aifield").removeClass("hidden");
  }
  if (doctype == "Meeting"){
    $(".mtgfield").removeClass("hidden");
  }
  if (doctype == "Discussion"){
    $(".discfield").removeClass("hidden");
  }
  if (doctype == "Reference"){
    $(".reffield").removeClass("hidden");
  }
}
