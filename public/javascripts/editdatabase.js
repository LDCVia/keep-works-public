$(document).ready(function(){
  new Morris.Donut({
    element: 'dbstats',
    data: dbstatsdata
  });

  new Morris.Line({
    element: 'dbactivity',
    data: dbactivitydata,
    xkey: 'month',
    ykeys: ['value'],
    labels: ['API Calls'],
    parseTime: false
  });

  toggleSecurityField();

  try {
    $('#image-cropper').cropit({
      imageBackground: true,
      imageState: {
        src: "/getdbicon/" + db
      }
    });
    $('.rotate-cw-btn').click(function() {
      $('#image-cropper').cropit('rotateCW');
    });
    $('.rotate-ccw-btn').click(function() {
      $('#image-cropper').cropit('rotateCCW');
    });
    $('#setdbiconform').submit(function() {
      var imageData = $('#image-cropper').cropit('export');
      $("#imagedata").val(imageData);
      var formValue = $(this).serialize();
      console.log(formValue);
    });
    $('#deletedatabaseimage').click(function(){
      $.ajax({
        url: "/deletedbicon/" + db,
        success: function(response){
          if (response.result == "ok"){
            window.location.href = window.location.href;
          }else{
            console.log(response);
          }
        }
      })
    })
  }catch(e){

  }
})

function toggleSecurityField(){
  try{
    var template = $("#template").val();
    if (template == "discussion" || template == "doclibrary" || template == "teamroom"){
      $(".security").removeClass('hidden');
    }else{
      $(".security").addClass('hidden');
    }
  }catch(e){

  }
}

function base64ToBlob(base64, mime)
{
    mime = mime || '';
    var sliceSize = 1024;
    var byteChars = window.atob(base64);
    var byteArrays = [];

    for (var offset = 0, len = byteChars.length; offset < len; offset += sliceSize) {
        var slice = byteChars.slice(offset, offset + sliceSize);

        var byteNumbers = new Array(slice.length);
        for (var i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }

        var byteArray = new Uint8Array(byteNumbers);

        byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, {type: mime});
}
