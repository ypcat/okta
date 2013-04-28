// ==UserScript==
// @name        okta
// @namespace   ypcat.csie.org
// @include     https://*.okta.com/login/second-factor-challenge*
// @include     file://*/test.html
// @require     http://code.jquery.com/jquery.min.js
// @require     https://github.com/downloads/harthur/brain/brain-0.6.0.js
// @require     https://github.com/downloads/harthur/hog-descriptor/hog-0.3.0.js
// @version     1
// @grant       all
// ==/UserScript==

$(function(){
    var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || navigator.oGetUserMedia;
    var requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame;
    var net = new brain.NeuralNetwork();
    var training_data = [];
    var max_confidence = 0;

    // load saved training data from local storage
    if(localStorage.ocr){
        try{
            net.fromJSON(JSON.parse(localStorage.ocr));
            console.log('loaded ocr training data');
        }
        catch(e){
            console.warn(e);
            localStorage.removeItem('ocr');
        }
    }

    if(localStorage.training_data){
        try{
            training_data = JSON.parse(localStorage.training_data);
        }
        catch(e){
            console.warn(e);
            localStorage.removeItem('training_data');
        }
    }

    // check remember device checkbox
    //$('#oktaSoftTokenAttempt\\.rememberDevice').attr('checked', true);

    // create video tag to interface with camera
    $('body').append('<video id="camera" width="320" height="240" style="display:none;">');

    // connect camera to hidden video tag
    if(getUserMedia){
        getUserMedia({video: true}, function(stream){
            var video = $('#camera')[0];
            video.src = window.URL.createObjectURL(stream);
            video.play();
            requestAnimationFrame(render);
        }, function(error){
            console.error('video error', error);
        });
    }
    else{
        console.error('getUserMedia not supported');
    }

    // create canvas
    $('#subcontainer').css({
        'float':'left',
        'margin':'50px 10px 0 30px'
    }).after('<canvas id="canvas">');
    $('#canvas').css({
        'float':'left',
        'margin':'50px 0 0',
        'border':'1px solid'
    }).each(function(){
        var video = $('#camera')[0];
        this.width = video.width;
        this.height = video.height;
    });

    // smaller canvas for detection window
    $('#canvas').after('<canvas id="binary">');
    $('#binary').css({
        'float':'left',
        'border':'1px solid'
    }).each(function(){
        var canvas = $('#canvas')[0];
        this.width = canvas.width / 2;
        this.height = canvas.height / 4;
    });

    // buttons
    $('#verify_factor').after('<button id="clear">clear</button>');
    $('#verify_factor').after('<button id="save">save</button>');
    $('#verify_factor').after('<button id="test">test</button>');
    $('#verify_factor').after('<button id="train">train</button>');

    // 6 tiny canvas to hold detected digits
    for(i = 5; i >= 0; i--){
        var id = 'digit' + i;
        $('#oktaSoftTokenAttempt\\.answer\\.label').after('<canvas id="{}">'.replace('{}', id));
        $('#' + id).css({
            'float':'left',
            //'border':'1px solid',
            'width':'16px',
            'height':'16px',
            //'margin':'8px 5px',
        }).each(function(){
            this.width = 16;
            this.height = 16;
        });
    }

    // per frame updating function
    function render(){
        var canvas = $('#canvas')[0];
        var context = canvas.getContext('2d');
        var video = $('#camera')[0];

        // copy camera frame from video to canvas so lines can be drawn on
        try{
            context.drawImage(video, 0, 0, video.width, video.height);
        }
        catch(error){
            if(error.name != "NS_ERROR_NOT_AVAILABLE"){
                throw error;
            }
        }

        // save original canvas
        var subcanvas = $('#binary')[0];
        var subcontext = subcanvas.getContext('2d');
        subcontext.drawImage(canvas, canvas.width/4, canvas.height*3/8, canvas.width/2, canvas.height/4, 0, 0, subcanvas.width, subcanvas.height);

        // remaining detection
        process(subcanvas);

        // flip horizontally
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.translate(canvas.width, 0);
        context.scale(-1, 1);

        // draw line
        context.lineWidth = 1;
        context.strokeStyle = 'green';
        context.beginPath();
        context.moveTo(canvas.width/4, canvas.height/2);
        context.lineTo(canvas.width*3/4, canvas.height/2);
        context.moveTo(canvas.width/2, canvas.height*3/8);
        context.lineTo(canvas.width/2, canvas.height*5/8);
        context.stroke();

        context.strokeStyle = 'blue';
        context.beginPath();
        context.moveTo(canvas.width*1/4, canvas.height*3/8);
        context.lineTo(canvas.width*3/4, canvas.height*3/8);
        context.lineTo(canvas.width*3/4, canvas.height*5/8);
        context.lineTo(canvas.width*1/4, canvas.height*5/8);
        context.closePath();
        context.stroke();

        requestAnimationFrame(render);
    }

    function process(canvas){
        var context = canvas.getContext('2d');
        var w = canvas.width;
        var h = canvas.height;
        var pixels = context.getImageData(0, 0, w, h);
        var d = pixels.data;
        var x, y, i, j, n = w * h * 4;
        var r, g, b;
        var th = 0;
        var ymin, ymax;
        var xlabel = new Array(w);
        var xbound = [];
        var valid = true;

        // grayscale
        for(i = 0; i < n; i += 4){
            r = d[i]; g = d[i + 1]; b = d[i + 2];
            th += d[i] = d[i+1] = d[i+2] = 0.2126*r + 0.7152*g + 0.0722*b;
        }
        th /= w * h;
        th = (255 + th) / 2;

        // binarize
        for(i = 0; i < n; i += 4){
            d[i] = d[i + 1] = d[i + 2] = d[i] > th? 255: 0;
            d[i + 3] = 255;
        }

        context.putImageData(pixels, 0, 0);

        // find boundary
        for(y = 0; y < h; y++){
            i = y * w * 4;
            for(x = 0; x < w; x++){
                j = i + x * 4;
                if(d[j]){
                    xlabel[x] = 1;
                    ymin = ymin < y? ymin: y;
                    ymax = ymax > y? ymax: y;
                }
            }
        }

        for(x = 1; x < w - 1; x++){
            if(xlabel[x] && !xlabel[x - 1])
                xbound.push(x - 1);
            else if(!xlabel[x] && xlabel[x - 1])
                xbound.push(x);
        }

        // validate bounary
        if(xbound.length != 12)
            valid = false;
        if(ymin <= 0 || ymax >= h - 1 || xbound[0] <= 0 || xbound[11] >= w - 1)
            valid = false;
        for(i = 0; i < 12; i += 2){
            if(xbound[i] == xbound[i + 1]){
                valid = false;
                break;
            }
        }

        if(valid){
            // copy to digit canvas
            for(i = 0; i < 6; i++){
                var dcanvas = $('#digit' + i)[0];
                var dcontext = dcanvas.getContext('2d');
                dcontext.setTransform(1, 0, 0, 1, 0, 0);
                dcontext.translate(dcanvas.width, 0);
                dcontext.scale(-1, 1);
                j = (5 - i) * 2;
                try{
                    dcontext.drawImage(canvas, xbound[j], ymin, xbound[j+1] - xbound[j], ymax - ymin, 0, 0, dcanvas.width, dcanvas.height);
                }
                catch(e){
                    console.log('i', i, 'j', j, 'xbound', xbound);
                    console.log(canvas, xbound[j], ymin, xbound[j+1] - xbound[j], ymax - ymin, 0, 0, dcanvas.width, dcanvas.height);
                    throw e;
                }
            }

            // draw boundary
            context.beginPath();
            context.strokeStyle = 'red';
            context.moveTo(0, ymin);
            context.lineTo(w, ymin);
            context.moveTo(0, ymax);
            context.lineTo(w, ymax);
            context.stroke();
            context.strokeStyle = 'green';
            for(i = 0; i < 12; i += 2){
                context.moveTo(xbound[i], 0);
                context.lineTo(xbound[i], h);
                context.moveTo(xbound[i + 1], 0);
                context.lineTo(xbound[i + 1], h);
            }
            context.stroke();

            // realtime ocr
            if(training_data.length > 0){
                var input = '';
                var min_confidence = 1;
                for(i = 0; i < 6; i++){
                    var dcanvas = $('#digit' + i)[0];
                    var guess = ocr(dcanvas);
                    input += guess.guess;
                    min_confidence = Math.min(guess.max, min_confidence);
                }
                if(min_confidence > max_confidence){
                    $('#oktaSoftTokenAttempt\\.passcode').val(input);
                    console.log(input, min_confidence);
                    max_confidence = min_confidence;
                }
                if(max_confidence > 0.80){
                    // submit form!
                    //$('#oktaSoftTokenAttempt\\.passcode').css('border', 'red 1px solid');
                    console.log('fire!');
                    $('#verify_factor').click();
                }
            }
        }
        else{ // !valid
            max_confidence = 0; // reset max_confidence
            //$('#oktaSoftTokenAttempt\\.passcode').css('border', '');
        }
    }

    $('#train').click(function(){
        var input = $('#oktaSoftTokenAttempt\\.passcode').val();
        var canvas, feature, output, i;
        if(input.length != 6){
            console.warn('no input');
            return;
        }
        for(i = 0; i < 6; i++){
            canvas = $('#digit' + i)[0];
            feature = extract_feature(canvas);
            output = [0,0,0,0,0,0,0,0,0,0];
            output[Number(input[i])] = 1;
            training_data.push({'input':feature, 'output':output});
        }
        console.log('training', input, net.train(training_data, {'log':true}));
    });

    $('#test').click(function(){
        var canvas, feature, output, i, j, guess, max, result = '';
        for(i = 0; i < 6; i++){
            canvas = $('#digit' + i)[0];
            guess = ocr(canvas);
            console.log('guess', guess.guess, 'max', guess.max, 'output', guess.output);
            result += guess.guess
        }
        console.log('result', result);
        $('#oktaSoftTokenAttempt\\.passcode').val(result);
    });

    $('#save').click(function(){
        localStorage.ocr = JSON.stringify(net.toJSON());
        localStorage.training_data = JSON.stringify(training_data);
        console.log('saved ocr traing data');
    });

    $('#clear').click(function(){
        localStorage.removeItem('ocr');
        localStorage.removeItem('training_data');
        console.log('deleted ocr traing data');
    });

    function histogram(canvas){
        var context = canvas.getContext('2d');
        var w = canvas.width;
        var h = canvas.height;
        var d = context.getImageData(0, 0, w, h).data;
        var hhist = new Array(w);
        var vhist = new Array(h);
        var x, y, i, j;

        for(x = 0; x < w; x++)
            hhist[x] = 0;
        for(y = 0; y < h; y++){
            vhist[y] = 0;
            i = y * w * 4;
            for(x = 0; x < w; x++){
                j = i + x * 4;
                if(d[j]){
                    hhist[x]++;
                    vhist[y]++;
                }
            }
        }

        return {'h':hhist, 'v':vhist};
    }

    function extract_feature(canvas){
        //return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        var feature = hog.extractHOG(canvas);
        //var hist = histogram(canvas);
        //feature = feature.concat(hist.h, hist.v);
        return feature;
    }

    // recognize a single digit
    function ocr(canvas){
        var feature = extract_feature(canvas);
        var output = net.run(feature);
        var max = -1;
        var guess;
        for(var j = 0; j < output.length; j++){
            if(output[j] > max){
                max = output[j];
                guess = j;
            }
            output[j] = Math.floor(Number(output[j] * 1000)) / 1000;
        }
        return {
            'guess': guess,
            'max': max,
            'output': output,
        };
    }
});

