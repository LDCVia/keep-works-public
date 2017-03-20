function createNewDatabase(){
  $(".has-error").removeClass("has-error");
  $(".databaseerror").text("");
  var invalidchars = [' ', '$', '@', '£', '#', '%', '^', '&', '*', '(', ')', '\'', '"', '\\', ':', ';', '?', '/', '<', '>', ',', '.', '`', '~'];
  var formattedDbName = $("#databasetitle").val();
  for(var i=0; i<invalidchars.length; i++){
    formattedDbName = formattedDbName.split(invalidchars[i]).join('');
  }
  if($("#template").val() == ""){
    $("#template").parent().addClass("has-error");
  }
  if($("#databasetitle").val() == ""){
    $("#databasetitle").parent().addClass("has-error")
  }
  if ($(".has-error").length == 0){
    //Check the Database name
    $.ajax({
      method: "GET",
      contentType: "application/json",
      url: "/checknewdatabase?db=" + encodeURIComponent(formattedDbName)
    })
    .complete(function( data ) {
      data = JSON.parse(data.responseText);
      if(data.valid){
        window.location.href="/newdatabase/" + $("#template").val() + "/" + formattedDbName + "?title=" + encodeURIComponent($("#databasetitle").val());
      }else{
        $("#databasetitle").parent().addClass("has-error");
        $(".databaseerror").text("Invalid Database Name");
      }
    });
  }
}
