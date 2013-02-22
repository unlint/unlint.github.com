var sockUrl = 'http://91.228.153.235:8000/unlint';
//var sockUrl = 'http://127.0.0.1:8000/unlint';
var reChanges = new RegExp("https://github.com/(.*)/(.*)/pull/([^/]*)/*");
var transport = undefined;

function getParameter(name) {
    var uri = decodeURIComponent(location);
    return (RegExp(name + '=' + '(.*?)(&|$)').exec(uri)||[,''])[1];
}

function unlint() {
    $('.error').hide();
    
    var options = {
        url: getParameter('url'),
        username: getParameter('username'),
        password:  getParameter('password'),
    }

    if (!transport) {
        transport = new SockTransport(sockUrl, function() {
            inspect(options);
        });
    } else {
        throw new Error("Unexcepted behaviour");
    }
}

function inspect(options) {
     var match = options.url.match(reChanges);
    
    if (match) {
    	var changesUrl = makeChangesUrl(match);
    	transport.download('changes', {
    		url: changesUrl,
    		username: options.username,
    		password: options.password,
    		data: "json",
    		callback: function(data) {
    			changes(data, options);
    		}
    	});
    } else {
    	alert("Please enter correct github url");
    }
}

function changes(data, options) {
    if (typeof data  === 'string') {
	   data = JSON.parse(data);
    }

    if (Object.prototype.toString.call( data ) !== '[object Array]') {
        $('.error').html("<b>Error:</b> " + JSON.stringify(data));
        $('.error').show();
        return;
    }
	
	var files = [];
	var rawfiles = [];
	
	for (var index=0; index<data.length; ++index) {
        files.push(data[index].filename);
		rawfiles.push(data[index].raw_url);
	}
	
    Templates.get("templates/changes.tmpl", function(template) {
        var content = template({
            files: files
        });

        $('.changes-container').html(content);
    });

    analyzeInSequence(_.clone(files), _.clone(rawfiles), options);
}

function analyzeInSequence(files, rawfiles, options) {
    if (files.length == 0 || rawfiles.length == 0) {
        transport.close();
        transport = undefined;
        return;
    }

    var file = files.shift();
    var raw = rawfiles.shift();

    var callback = (function (filename, raw) {
        return function (source) {
            $("a[href='#" + file + "']>div").html('<span style="color: blue;">(2/3) Analyzing, please wait...</span>');

            transport.analyze(filename, source, raw, function(filename, source, raw, data) {
                analyze(filename, source, raw, data);

                setTimeout(function() {
                    analyzeInSequence(files, rawfiles, options);
                }, 100);
            });
        }
    })(file, raw);

    $("a[href='#" + file + "']>div").html('<span style="color: blue;">(1/3) Downloading, please wait...</span>');

    transport.download('raw', {
        url: raw,
        username: options.username,
        password: options.password,
        callback: callback
    });
}

function analyze(filename, source, raw, data) {
    if (data.indexOf('<advice>') == 0) {
        var xml = $.parseXML(data);
        renderAdvice(filename, source, $(xml), raw);        
    } else {
        renderSimpleAdvice(filename, source, data, raw);
    }
}

function renderSimpleAdvice(filename, source, fileAdvice, raw) {
    Templates.get("templates/advices.tmpl", function(template) {
        var content = template({
            filename: filename,
            raw: raw,
            source: source.replace(/>/g, "&gt;").replace(/</g, "&lt;").split("\n"),
            fileAdvice: fileAdvice,
            errors: {}
        });

        $('.advice-container').append(content);
    });
}

function renderAdvice(filename, source, xml, raw) {
    var nodes = xml.find("error");
    var errors = {};

    var error;
    for (var i = 0; i < nodes.length; ++i) {
        var error = nodes[i];
        var lineError = asObject(error.attributes);
        var lines = lineError['line'].split(',');
        
        for (var j = 0; j < lines.length; ++j) {
            var lineNumber = parseInt(lines[j]);
        
            if (!errors[lineNumber]) {
                errors[lineNumber] = [];
            }

            errors[lineNumber].push(lineError);
        }
    }

    Templates.get("templates/advices.tmpl", function(template) {
        var content = template({
            filename: filename,
            raw: raw,
            fileAdvice: 'checked',
            source: source.replace(/>/g, "&gt;").replace(/</g, "&lt;").split("\n"),
            errors: errors
        });

        $('.advice-container').append(content);
    });
}

function asObject(array) {
    var result = {};

    for (var i = 0; i < array.length; ++i) {
        var attribute = array[i];
        result[attribute.nodeName] = attribute.nodeValue;
    }

    return result;
}

function toggleAuthBlock() {
    $(".auth-block").toggle();
}

function makeChangesUrl(match) {
    return "https://api.github.com/repos/" + match[1] + "/" + match[2] + "/pulls/" + match[3] + "/files";
}