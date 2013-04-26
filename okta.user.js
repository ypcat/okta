// ==UserScript==
// @name        okta
// @namespace   ypcat.csie.org
// @include     https://splunk.okta.com/login/second-factor-challenge*
// @require     http://code.jquery.com/jquery.min.js
// @require     https://github.com/downloads/harthur/brain/brain-0.6.0.js
// @require     https://github.com/downloads/harthur/hog-descriptor/hog-0.3.0.js
// @require     https://raw.github.com/odyniec/imgareaselect/master/jquery.imgareaselect.dev.js
// @version     1
// @grant       all
// ==/UserScript==

$(function(){
    //$('#oktaSoftTokenAttempt\\.rememberDevice').attr('checked', true);
    $('body').append('<video id="video" width="640" height="480" style="border:1px solid;">');
    $('body').append('<button id="snap">snapshot</button');
    $('body').append('<canvas id="canvas" width="640" height="480" style="border:1px solid;">');
    $('body').append('<button id="hog">hog</button');
    var video = document.querySelector("#video");
    var canvas = document.querySelector("#canvas");
    var context = canvas.getContext('2d');
    var training_data = [];
    var net = new brain.NeuralNetwork();
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || navigator.oGetUserMedia;
    if (navigator.getUserMedia) {
        navigator.getUserMedia({video: true}, handleVideo, videoError);
    }
    function handleVideo(stream) {
        video.src = window.URL.createObjectURL(stream);
        video.play();
    }
    function videoError(e) {
        console.log('video error', e);
    }
    $('#snap').click(function(){
        // capture image from camera to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        // draw circle
        /*
        context.beginPath();
        context.arc(canvas.width/2, canvas.height/2, canvas.width/4, 0, 2*3.141592654, false);
        context.lineWidth = 5;
        context.strokeStyle = 'green';
        context.stroke();
        */
    });
    $('#canvas').click(function(e){
        var x = e.pageX - canvas.offsetLeft;
        var y = e.pageY - canvas.offsetTop;
        var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        var r = pixels.data[(canvas.width*y+x)*4+0];
        var g = pixels.data[(canvas.width*y+x)*4+1];
        var b = pixels.data[(canvas.width*y+x)*4+2];
        console.log('x',x,'y',y,'r',r,'g',g,'b',b);
    });
    $('#hog').click(function(){
        //hog.drawGradient(canvas, 'y');
        hog.drawMagnitude(canvas);
        //hog.drawGreyscale(canvas);

        var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        var d = pixels.data;
        var w = pixels.width;
        var h = pixels.height;
        var x, y, i, j;
        for(y = 0; y < h; y++){
            i = y * w;
            for(x = 0; x < w; x++){
                j = (i + x) * 4;
                if(d[j] > 10){
                    d[j] = 255;
                    d[j+1] = 0;
                    d[j+2] = 0;
                }
            }
        }
        context.putImageData(pixels, 0, 0);
    });
    $('#canvas').imgAreaSelect({
        handles: true,
        show: true,
        autohide: true,
        onSelectEnd: function(img, sel){
            console.log(img, sel);
            $('body').append('<br>');
            $('<canvas style="border:1px solid;">').each(function(){
                console.log(this);
                this.width = 8; //sel.x2 - sel.x1;
                this.height = 8; //sel.y2 - sel.y1;
                var ctx = this.getContext('2d');
                //var src = context.getImageData(sel.x1, sel.y1, sel.x2, sel.y2);
                //ctx.putImageData(src, 0, 0);
                ctx.drawImage(canvas, sel.x1, sel.y1, sel.x2-sel.x1, sel.y2-sel.y1, 0, 0, this.width, this.height);

                if(training_data.length > 0){
                    var descriptor = hog.extractHOG(this);
                    var output = net.run(descriptor);
                    var guess = 0, max = 0;
                    for(var i = 0; i < output.length; i++){
                        if(output[i] > max){
                            max = output[i];
                            guess = i;
                        }
                    }
                    console.log('guess', guess, 'output', output);
                    //$(this).next().val(output[0]);
                };
            }).click(function(){
                var label = $(this).next().val();
                //hog.drawMagnitude(this);
                var descriptor = hog.extractHOG(this);
                var output = [0,0,0,0,0,0,0,0,0,0];
                output[Number(label)] = 1;
                console.log('training', label, 'descriptor length', descriptor.length);
                training_data.push({'input': descriptor, 'output': output});
                console.log('done', net.train(training_data));
            }).appendTo('body');
            $('body').append('<input type="text">');
        }
    });
});

