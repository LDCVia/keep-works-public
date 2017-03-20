function getSuggestions(){
  var question = $("#question").val();
  console.log(question);
  if (question.indexOf(" ") > -1){
    $.get("/supportsuggestion?q=" + question, function(data){
      if (data && data.count && data.count > 0){
        var html = "<h2>Help Suggestions</h2>";
        html += "<p>Based on your question, we have found some documents that may be of assistance</p>";
        html += "<div class=\"row\">";
        for (var i=0; i<data.count; i++){
          html += "<div class=\"col-sm-12\">";
          html += "<div class=\"block-flat\">";
          html += "<div class=\"header\">";
          html += "<h3>" + data.results[i].title + "</h3>";
          html += "</div>";
          html += "<div class=\"content\">";
          html += data.results[i].body;
          html += "</div>";
          html += "</div>";
          html += "</div>";
        }
        html += "</div>";
        $("#suggestions").html(html);
      }
    })
  }
}
