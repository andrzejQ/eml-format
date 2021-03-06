"use strict";

/******************************************************************************************
 * EML format parser. EML is raw e-mail message header + body as returned by POP3 protocol.
 * RFC 822: http://www.ietf.org/rfc/rfc0822.txt
 * RFC 1521: https://www.ietf.org/rfc/rfc1521.txt
 ******************************************************************************************/

// Original source:
// https://github.com/papnkukn/eml-format
// 2018-08-20: 
// 1. Charsets other then utf-8
// 2. unpack2() - short header (From, To, Date, Subj.) in HTML and TEXT file
// 3. unpack2() - prefix for filenames - for use with node-mbox
 
var fs = require("fs");
var path = require("path");

//var iconv = require('iconv-lite');
var iconv = require('./iconv-thin.js'); //case of utf8 and single-byte encoing

function encodingOfCharset(charset) { //to skip conversion in iconv (important for `iconv-thin`)
  //encoding for iconv, eq. 'iso-8859-1' -> 'iso88591'
  return charset.toLowerCase().replace(/[^0-9a-z]/g, "");
}

//Generates a random id
function guid() {
  return 'xxxxxxxxxxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  }).replace("-", "");
}

//Word-wrap the string 's' to 'i' chars per row
function wrap(s, i) {
  var a = [ ];
  do { a.push(s.substring(0, i)) }
  while( (s = s.substring(i, s.length)) != "" );
  return a.join("\r\n");
}

//Overridable properties and functions
var emlformat = {
  verbose: false,
  notCRLFboundary: true, //set true for an old emails without CRLF preceding the boundary
  charsetDefault: 'iso-8859-1', //or 'utf-8' ... - to use if charset=... is missing
  noTextIfHtml: true, //in unpack2() - save plain text file only in case if HTML is missing
  allTxtToHtml: false, //in unpack2() - save plain text file as HTML with '<br>' at line break
  htmlBodyOnly: false, // in unpack2(): if true: in index.html file include inner body content only
                       //could be used to concatenate some of e-mails content
                       //(set also: `emlformat.allTxtToHtml = true`)
                       //(But whole <html> files can be also concatenated)
  htmlBodyStr : false, // in unpack2(): if true: don't generate index.html file 
                       // but set `data.data_html_body` as HTML body string 
                       //(set also: `emlformat.allTxtToHtml = true`)
  srcToTxt : true,     //in unpack2(): convert <...src=  ..> to [ ... ] and remove <script> ... </script>
  
  fileExtensions: {
    "text/plain": ".txt",
    "text/html": ".html",
    "image/png": ".png",
    "image/jpg": ".jpg",
    "image/jpeg": ".jpg",
  },
  //Gets file extension by mime type
  getFileExtension: function(mimeType) {
    return emlformat.fileExtensions[mimeType] || "";
  },
  //Gets the boundary name
  getBoundary: function(contentType) {
    var match = /boundary="?(.+?)"?(\s*;[\s\S]*)?$/g.exec(contentType);
    return match ? match[1] : undefined;
  },
  
  getCharset: function(contentType) { //eq. contentType='.....charset="iso-8859-1"....'  //AK
      var match = /charset\s*=\W*([\w\-]+)/g.exec(contentType); // ?.exec /g with regexp literal and without while() ?
      return match ? match[1] : undefined;
  },

  //Gets name and e-mail address from a string, e.g. "PayPal" <noreply@paypal.com> => { name: "PayPal", email: "noreply@paypal.com" }
  getEmailAddress: function(raw) { //AK: not used - not useful for multiply addresses
    var result = { };
    var regex = /^(.*?)(\s*\<(.*?)\>)$/g;
    var match = regex.exec(raw); 
    if (match) { // ?.exec /g without while() ?
      var name = emlformat.unquoteConv(match[1]).replace(/"/g, "").trim();
      if (name && name.length) {
        result.name = name;
      }
      result.email = match[3].trim();
    }
    else {
      result.email = raw;
    }
    return result;
  },
  //Builds e-mail address string, e.g. { name: "PayPal", email: "noreply@paypal.com" } => "PayPal" <noreply@paypal.com>
  toEmailAddress: function(data) { //AK: not used - not useful for multiply addresses
    var email = "";
    if (typeof data == "undefined") {
      //No e-mail address
    }
    else if (typeof data == "string") {
      email = data;
    }
    else {
      if (data.name) {
        email += '"' + data.name + '"';
      }
      if (data.email) {
        email += (email.length ? ' ' : '') + '<' + data.email + '>';
      }
    }
    return email;
  },
  //Decodes string with substrings like =?UTF-8?B?V2hhdOKAmXMgeW91ciBvbmxpbmUgc2hvcHBpbmcgc3R5bGU/?= or =?UTF-8?Q?...?=
  unquoteConv: function(s) {
    if (typeof s != "string")
      return '';
    s = s.replace(/\?=\s+=\?/g,'?==?');//https://tools.ietf.org/html/rfc2047 6.2.
    var regex = /=\?([^?]+)\?(B|Q)\?(.+?)\?=/gi;
    return s
      .replace(regex, function(matcher, p1, p2, p3, offset, string) {
        var encodingChr = encodingOfCharset(p1 || emlformat.charsetDefault); //eq. p1 = 'iso-8859-1'; encodingChr = 'iso88591'
        var type = p2.toUpperCase(); //'B' or 'Q'
        var value = p3;
        if (type == "B") { //Base64
          if (encodingChr == "utf8") {
            return Buffer.from(value.replace(/\r?\n/g, ""), "base64").toString("utf8");
          }
          else {
            return iconv.decode(Buffer.from(value.replace(/\r?\n/g, ""), "base64"), encodingChr); 
          }
        }
        else if (type == "Q") { //Quoted printable
          return emlformat.unquotePrintable(value, encodingChr);
        }
    });
  },
  
  //Decodes "quoted-printable"
  unquotePrintable: function(s, encodingChr) {
    //Convert =0D to '\r', =20 to ' ', etc.
    s = s.replace(/_/g,' ');//https://tools.ietf.org/html/rfc2047 4.2.
    if (encodingChr == "utf8") {
      //return decodeURIComponent(s.replace('%','%25').replace('=','%').replace(/=\r?\n/gi, "").replace(??????));
      return s
      .replace(/=(F[0-7])=([A-F0-9]{2})=([A-F0-9]{2})=([A-F0-9]{2})/gi, function(matcher, p1, p2, p3, p4, offset, string) { return Buffer.from([ parseInt(p1, 16), parseInt(p2, 16), parseInt(p3, 16), parseInt(p4, 16) ]).toString("utf8"); })
      .replace(/=(E[A-F0-9])=([A-F0-9]{2})=([A-F0-9]{2})/gi, function(matcher, p1, p2, p3, offset, string) { return Buffer.from([ parseInt(p1, 16), parseInt(p2, 16), parseInt(p3, 16) ]).toString("utf8"); })
      .replace(/=([CD][A-F0-9])=([A-F0-9]{2})/gi, function(matcher, p1, p2, offset, string) { return Buffer.from([ parseInt(p1, 16), parseInt(p2, 16) ]).toString("utf8"); })
      .replace(/=([A-F0-9]{2})/gi, function(matcher, p1, offset, string) { return String.fromCharCode(parseInt(p1, 16)); })
      .replace(/=\r?\n/gi, ""); //Join line
      //2-bytes starts with /[CD]/...., 3-bytes starts with /E/, 4-bytes: /F[0-7]/
    }
    else {
      return s
      .replace(/=([A-F0-9]{2})/gi, function(matcher, p1, offset, string) { return iconv.decode(Buffer.from([ parseInt(p1, 16) ]), encodingChr); })
      .replace(/=\r?\n/gi, ""); //Join line
    }
  }
};

/******************************************************************************************
 * Unpacks EML message and attachments to a directory.
 * @params eml         EML file content or object from 'parse'
 * @params directory   Folder name or directory path where to unpack
 * @params options     Optional parameters: { parsedJsonFile, readJsonFile, simulate }
 * @params callback    Callback function(error)
 ******************************************************************************************/
emlformat.unpack = function(eml, directory, options, callback) {
  //Shift arguments
  if (typeof options == "function" && typeof callback == "undefined") {
    callback = options;
    options = null;
  }
  
  if (typeof callback != "function") {
    callback = function(error, result) { };
  }
  
  var result = { files: [ ] };
  
  function _unpack(data) {
    try {
      //Create the target directory
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
      }
      
      //Plain text file
      if (typeof data.text == "string") {
        result.files.push("index.txt");
        if (options && options.simulate) {
          //Skip writing to file
        }
        else {
          fs.writeFileSync(path.join(directory, "index.txt"), data.text);
        }
      }
      
      //Message in HTML format
      if (typeof data.html == "string") {
        result.files.push("index.html");
        if (options && options.simulate) {
          //Skip writing to file
        }
        else {
          fs.writeFileSync(path.join(directory, "index.html"), data.html);
        }
      }
      
      //Attachments
      if (data.attachments && data.attachments.length > 0) {
        for (var i = 0; i < data.attachments.length; i++) {
          var attachment = data.attachments[i];
          var filename = attachment.name;
          if (!filename) {
            filename = "attachment_" + (i + 1) + emlformat.getFileExtension(attachment.mimeType);
          }
          result.files.push(filename);
          if (options && options.simulate) continue; //Skip writing to file
          fs.writeFileSync(path.join(directory, filename), attachment.data);
        }
      }
      
      callback(null, result);
    }
    catch (e) {
      callback(e);
    }
  }
  
  //Check the directory argument
  if (typeof directory != "string" || directory.length == 0) {
    return callback(new Error("Directory argument is missing!"));
  }
  
  //Argument as EML file content or "parsed" version of object
  if (typeof eml == "string" || (typeof eml == "object" && eml.headers && eml.body)) {
    emlformat.parse(eml, function(error, parsed) {
      if (error) return callback(error);
      
      //Save parsed EML as JSON file
        if (options && options.parsedJsonFile) {
        var file = path.resolve(directory, options.parsedJsonFile);
        var dir = path.dirname(file);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir);
        }
        result.files.push(options.parsedJsonFile);
        fs.writeFileSync(file, JSON.stringify(parsed, " ", 2));
      }
      
      //Convert parsed EML object to a friendly object with text, html and attachments
      emlformat.read(parsed, function(error, data) {
        if (error) return callback(error);
        
        //Save read structure as JSON file
        if (options && options.readJsonFile) {
          var file = path.resolve(directory, options.readJsonFile);
          var dir = path.dirname(file);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
          }
          result.files.push(options.readJsonFile);
          var json = data.attachments ? JSON.stringify(data) : JSON.stringify(data, " ", 2); //Attachments may be large, so make a compact JSON string
          fs.writeFileSync(file, json);
        }
        
        //Extract files from the EML file
        _unpack(data);
      });
    });
  }
  else if (typeof eml != "object") {
    return callback(new Error("Expected string or object as argument!"));
  }
  else {
    _unpack(eml);
  }
};

/******************************************************************************************
 * Parses EML file content and return user-friendly object.
 * @params data        EML structure
 * @params options     EML build options
 * @params callback    Callback function(error, data)
 ******************************************************************************************/
emlformat.build = function(data, options, callback) {
  //Shift arguments
  if (typeof options == "function" && typeof callback == "undefined") {
    callback = options;
    options = null;
  }
  
  if (typeof callback != "function") {
    callback = function(error, result) { };
  }
  
  var eml = "";
  var EOL = "\r\n"; //End-of-line
  
  try {
    if (!data || typeof data != "object") {
      throw new Error("Argument 'data' expected to be an object!");
    }
    
    if (!data.headers) {
      data.headers = { };
    }
    
    if (typeof data.subject == "string") {
      data.headers["Subject"] = data.subject;
    }
    
    if (typeof data.from != "undefined") {
      //data.headers["From"] = (typeof data.from == "string" ? data.from : emlformat.toEmailAddress(data.from));
      data.headers["From"] = data.from;
    }
    
    if (typeof data.to != "undefined") {
      //data.headers["To"] = (typeof data.to == "string" ? data.to : emlformat.toEmailAddress(data.to));
      data.headers["To"] = data.to;
    }
    
    if (!data.headers["To"]) {
      throw new Error("Missing 'To' e-mail address!");
    }
    
    var boundary = "----=" + guid();
    if (typeof data.headers["Content-Type"] == "undefined") {
      data.headers["Content-Type"] = 'multipart/mixed;' + EOL + 'boundary="' + boundary + '"';
    }
    else {
      var name = emlformat.getBoundary(data.headers["Content-Type"]);
      if (name) {
        boundary = name;
      }
    }

    //Build headers
    var keys = Object.keys(data.headers);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = data.headers[key];
      if (typeof value == "undefined") {
        continue; //Skip missing headers
      }
      else if (typeof value == "string") {
        eml += key + ": " + value.replace(/\r?\n/g, EOL + "  ") + EOL;
      }
      else { //Array
        for (var j = 0; j < value.length; j++) {
          eml += key + ": " + value[j].replace(/\r?\n/g, EOL + "  ") + EOL;
        }
      }
    }
    
    //Start the body
    eml += EOL;
    
    //Plain text content
    if (data.text) {
      eml += "--" + boundary + EOL;
      eml += "Content-Type: text/plain; charset=utf-8" + EOL;
      eml += EOL;
      eml += data.text;
      eml += EOL + EOL;
    }
    
    //HTML content
    if (data.html) {
      eml += "--" + boundary + EOL;
      eml += "Content-Type: text/html; charset=utf-8" + EOL;
      eml += EOL;
      eml += data.html;
      eml += EOL + EOL;
    }
    
    //Append attachments
    if (data.attachments) {
      for (var i = 0; i < data.attachments.length; i++) {
        var attachment = data.attachments[i];
        eml += '--' + boundary + EOL;
        eml += 'Content-Type: ' + (attachment.contentType || "application/octet-stream") + EOL;
        eml += 'Content-Transfer-Encoding: base64' + EOL;
        eml += 'Content-Disposition: ' + (attachment.inline ? "inline" : "attachment") + '; filename="' + (attachment.filename || attachment.name || ("attachment_" + (i + 1))) + '"' + EOL;
        eml += EOL;
        if (typeof attachment.data == "string") {
          var content = Buffer.from(attachment.data).toString("base64");
          eml += wrap(content, 76) + EOL;
        }
        else { //Buffer
          var content = attachment.data.toString("base64");
          eml += wrap(content, 76) + EOL;
        }
        eml += EOL;
      }      
    }
    
    //Finish the boundary
    eml += "--" + boundary + "--" + EOL;
    
    callback(null, eml);
  }
  catch (e) {
    callback(e);
  }
};

/******************************************************************************************
 * Parses EML file content and return user-friendly object.
 * @params eml         EML file content or object from 'parse'
 * @params options     EML parse options
 * @params callback    Callback function(error, data)
 ******************************************************************************************/
emlformat.read = function(eml, options, callback) {
  //Shift arguments
  if (typeof options == "function" && typeof callback == "undefined") {
    callback = options;
    options = null;
  }
  
  if (typeof callback != "function") {
    callback = function(error, result) { };
  }
  
  function _read(data) {
    try {
      var result = { };
      if (data.headers["Date"]) {
        var timestamp = Date.parse(data.headers["Date"]);
        if (isNaN(timestamp)) { //try remve part from ':'<seconds> to the end
          timestamp = Date.parse(data.headers["Date"].replace(/^(.*):.*$/,'$1'));
        }
        if (!isNaN(timestamp)) {
          result.date = new Date(timestamp);
        }
        else {
          result.date = new Date('1900');
        }
      }
      else {
        result.date = new Date('1800');
      }
      if (data.headers["Subject"]) {
        result.subject = emlformat.unquoteConv(data.headers["Subject"]);
      }
      if (data.headers["From"]) {
        //result.from = emlformat.getEmailAddress(data.headers["From"]);
        result.from = emlformat.unquoteConv(data.headers["From"]);
      }
      if (data.headers["To"]) {
        //result.to = emlformat.getEmailAddress(data.headers["To"]);
        result.to = emlformat.unquoteConv(data.headers["To"]);
      }
      
      if (data.headers["Message-ID"]) {
        result.messageID = data.headers["Message-ID"];
      }
      else if (data.headers["Message-Id"]) {
        result.messageID = data.headers["Message-Id"];
      }
      if (data.headers["References"]) {
        result.references = data.headers["References"];
      }
      
      result.headers = data.headers;
      
      //Appends the boundary to the result
      function _append(headers, content) {
        if (!content) 
          content = '';
        var contentType = headers["Content-Type"];
        var encodingChrBound = encodingOfCharset(emlformat.getCharset(contentType) || emlformat.charsetDefault);
        var encoding = headers["Content-Transfer-Encoding"];
        if (!(contentType) && !(encoding) && !(headers["Content-Disposition"])) { //probably pure text
            headers["Content-Type"] = contentType = "text/plain"
            headers["Content-Transfer-Encoding"] = encoding = "8bit";
        }
        if (typeof encoding == "string") {
          encoding = encoding.toLowerCase();
        }
        if (encoding == "base64") {
          content = Buffer.from(content.replace(/\r?\n/g, ""), "base64");
        }
        else if (encoding == "quoted-printable") {
          content = emlformat.unquotePrintable(content, encodingChrBound);
        }
        else if (encodingChrBound != "utf8" && (typeof encoding == "string") 
            && (encoding.startsWith("binary") || encoding.startsWith("8bit"))) {
          //"8bit" "binary" "8bitmime" "binarymime"
          content = iconv.decode(Buffer.from(content,'binary'), encodingChrBound);
        }
          
        //old (see above): var contentType = headers["Content-Type"];
        if (!result.html && contentType && contentType.indexOf("text/html") >= 0) {
          if (typeof content != "string") {
            if (encodingChrBound == "utf8")
              content = content.toString("utf8");
            else
              content = iconv.decode(Buffer.from(content), encodingChrBound);
          }
          //Message in HTML format
          result.html = content;
        }
        else if (!result.text && contentType && contentType.indexOf("text/plain") >= 0) {
          if (typeof content != "string") {
            if (encodingChrBound == "utf8")
              content = content.toString("utf8");
            else
              content = iconv.decode(Buffer.from(content), encodingChrBound);
          }
          //Plain text message
          result.text = content;
        }
        else {
          //Get the attachment
          if (!result.attachments) {
            result.attachments = [ ];
          }
          
          var attachment = { };
          
          var id = headers["Content-ID"];
          if (id) {
            attachment.id = id;
          }
          var name = headers["Content-Disposition"] || headers["Content-Type"];
          var match;
          if (name) {
            match = /name="?(.+?)"?$/gi.exec(name);
            if (match) {
              name = match[1];
            }
            else {
              //AK - try different formats
              //match = /name="([\S\s]+?)"/gi.exec(name);//="..."... 
              // [\S\s] - any char including '\n', eq.: name='attachment; filename="=?UTF-8?B?...?=\n=?UTF-8?B?...?="'
              match = /name="([^"]+)"/gi.exec(name);//="..."...    [^"] contain '\n'
              if (match) {
                name = match[1];
              }
              else {
                var name012 = ''; //https://tools.ietf.org/html/rfc2231
                var r012 = /filename\*[^=]*=\s*(.*)$/mgi;// filename*0*=... \nfilename*1*=... 
                while ((match = r012.exec(name)) !== null) {
                  name012 += match[1].replace(/;$/g,''); // xyz; -> xyz
                }
                if (name012) {
                  name = name012;
                  if (name) {
                    name = name.split("'");
                    var encod = '';
                    if (name.length > 1)
                      encod=encodingOfCharset(name[0]);
                    name = name[name.length-1];
                    if (encod == 'utf8')
                      name = decodeURIComponent(name);
                    else
                      name = name.replace(/%([A-F0-9]{2})/gi, function(matcher, p1, offset, string) { 
                        return iconv.decode(Buffer.from([ parseInt(p1, 16) ]), encod); 
                      });
                  }
                }
                else
                  name = null;
              }
            }
          }
          if (name) {  //"=?UTF-8?Q?a.zip?="
            attachment.name = emlformat.unquoteConv(name)
                .replace(/\//g,'_').replace(/\\/g,'_')
                .replace(/^"/,'').replace(/"$/,'').replace(/"/g,'_')
                .replace(/[\x00-\x1F]/g,' ');
          }
          
          var ct = headers["Content-Type"];
          if (ct) {
            attachment.contentType = ct;
          }
          
          var cd = headers["Content-Disposition"];
          if (cd) {
            attachment.inline = /^\s*inline/g.test(cd);
          }
          
          attachment.data = content;
          result.attachments.push(attachment);
        }
      }
      
      //Content mime type
      var boundary = null;
      var ct = data.headers["Content-Type"];
      if (ct && /^multipart\//g.test(ct)) {
        var b = emlformat.getBoundary(ct);
        if (b && b.length) {
          boundary = b;
        }
      }
      
      if (boundary) {
        for (var i = 0; i < data.body.length; i++) {
          var b = data.body[i];
          
          //Get the message content
          if (typeof b.part == "undefined") {
            conole.warn("Warning: undefined b.part");
          }
          else if (typeof b.part == "string") {
            result.data = b.part;
          }
          else {
            if (typeof b.part.body == "undefined") {
            console.warn("Warning: undefined b.part.body");
            }
            else if (typeof b.part.body == "string") {
              //?? b.part.body
              
              var headers = b.part.headers;
              var content = b.part.body;
              
              _append(headers, content);
            }
            else {
              for (var j = 0; j < b.part.body.length; j++) {
                if (typeof b.part.body[j] == "string") {
                  result.data = b.part.body[j];
                  continue;
                }
                
                var headers = b.part.body[j].part.headers;
                var content = b.part.body[j].part.body;
                
                _append(headers, content);
              }
            }
          }
        }
      }
      else if (typeof data.body == "string") {
        _append(data.headers, data.body);
      }
      
      callback(null, result);
    }
    catch (e) {
      callback(e);
    }
  }
  
  if (typeof eml == "string") {
    emlformat.parse(eml, options, function(error, data) {
      if (error) return callback(error);
      _read(data);
    });
  }
  else if (typeof eml == "object") {
    _read(eml);
  }
  else {
    callback(new Error("Missing EML file content!"));
  }
};

/******************************************************************************************
 * Parses EML file content and returns object-oriented representation of the content.
 * @params eml         EML file content
 * @params options     EML parse options
 * @params callback    Callback function(error, data)
 ******************************************************************************************/
emlformat.parse = function(eml, options, callback) {
  //Shift arguments
  if (typeof options == "function" && typeof callback == "undefined") {
    callback = options;
    options = null;
  }
  
  if (typeof callback != "function") {
    callback = function(error, result) { };
  }
  
  try {
    if (typeof eml != "string") {
      throw new Error("Argument 'eml' expected to be string!");
    }
    
    var lines = eml.split(/\r?\n/);
    var result = { };
    parseRecursive(lines, 0, result, options);
    callback(null, result);
  }
  catch (e) {
    callback(e);
  }
};

/******************************************************************************************
 * Parses EML file content.
 ******************************************************************************************/
function parseRecursive(lines, start, parent, options) {
  var boundary = null;
  var lastHeaderName = "";
  var findBoundary = "";
  var insideBody = false;
  var insideBoundary = false;
  var isMultiHeader = false;
  var isMultipart = false;
  
  parent.headers = { };
  //parent.body = null;
  
  function complete(boundary) {
    //boundary.part = boundary.lines.join("\r\n");
    boundary.part = { };
    parseRecursive(boundary.lines, 0, boundary.part, options);
    delete boundary.lines;
  }
  
  //Read line by line
  for (var i = start; i < lines.length; i++) {
    var line = lines[i];
        
    //Header
    if (!insideBody) {
      //Search for empty line
      if (line == "") {
        insideBody = true;
        
        if (options && options.headersOnly) {
          break;
        }
        
        //Expected boundary
        var ct = parent.headers["Content-Type"];
        if (ct && /^multipart\//g.test(ct)) {
          var b = emlformat.getBoundary(ct);
          if (b && b.length) {
            findBoundary = b;
            isMultipart = true;
            parent.body = [ ];
          }
          else {
            if (emlformat.verbose) {
              console.warn("Multipart without boundary! " + ct.replace(/\r?\n/g, " "));
            }
          }
        }
        
        continue;
      }
      
      //Header value with new line
      var match = /^\s+([^\r\n]+)/g.exec(line);
      if (match) {
        if (isMultiHeader) {
          parent.headers[lastHeaderName][parent.headers[lastHeaderName].length - 1] += "\r\n" + match[1];
        }
        else {
          parent.headers[lastHeaderName] += "\r\n" + match[1];
        }
        continue;
      }
      
      function toTitleCase(str) {
        //return str.replace(/\w\S*/g, function(txt){
        return str.replace(/\w+/g, function(txt){
            return txt.charAt(0).toUpperCase() + txt.substr(1);//.toLowerCase();
        });
      }
      //Header name and value
      //var match = /^([\w\d\-]+):\s+([^\r\n]+)/gi.exec(line);  
      var match = /^([\w\-]+):\s+([^\r\n]+)/gi.exec(line);  
      if (match) {
        // lastHeaderName = match[1]; 
        lastHeaderName = toTitleCase(match[1]); // ? Capitalized? 
        
        if (parent.headers[lastHeaderName]) {
          //Multiple headers with the same name
          isMultiHeader = true;
          if (typeof parent.headers[lastHeaderName] == "string") {
            parent.headers[lastHeaderName] = [ parent.headers[lastHeaderName] ];
          }
          parent.headers[lastHeaderName].push(match[2]);
        }
        else {
          //Header first appeared here
          isMultiHeader = false;
          parent.headers[lastHeaderName] = match[2];
        }
        continue;
      }
    }
    //Body
    else {
      
      //Multipart body
      if (isMultipart) {
        //Search for boundary start
        if (
            (emlformat.notCRLFboundary || lines[i - 1] == "")
            && line.indexOf("--" + findBoundary) == 0 
            && !/\-\-(\r?\n)?$/g.test(line)) {
          insideBoundary = true;
          
          //Complete the previous boundary
          if (boundary && boundary.lines) {
            complete(boundary);
          }
          
          //Start a new boundary
          var match = /^\-\-([^\r\n]+)(\r?\n)?$/g.exec(line);
          boundary = { boundary: match[1], lines: [ ] };
          parent.body.push(boundary);
          
          if (emlformat.verbose) {
            console.log("Found boundary: " + boundary.boundary);
          }
          
          continue;
        }
        
        if (insideBoundary) {
          //Search for boundary end
          if (boundary.boundary 
              && (emlformat.notCRLFboundary || lines[i - 1] == "" )
              && line.indexOf("--" + findBoundary + "--") == 0) {
            insideBoundary = false;
            complete(boundary);
            continue;
          }
          boundary.lines.push(line); 
        }
      }
      else {
        //Solid string body
        parent.body = lines.splice(i).join("\r\n");
        break;
      }
    }
  }
  
  //Complete the last boundary
  if (parent.body && parent.body.length && parent.body[parent.body.length - 1].lines) {
    complete(parent.body[parent.body.length - 1]);
  }
}


/******************************************************************************************
 * AK - unpack2
 * Unpacks (read) EML message and attachments to a directory; file names with padding string
 *         and short header (From, To, Date, Subj.) in HTML and TEXT file
 * @params eml         EML file content or object from 'parse'
 * @params directory   Folder name or directory path where to unpack attachments
 * @params attPadStr   string padding original file name (optionally containing subdir)
 * @params options     Optional parameters: { parsedJsonFile, readJsonFile }
 * @params callback    Callback function(error)
 ******************************************************************************************/
emlformat.unpack2 = function(eml, directory, attPadStr, options, callback) {
  //Shift arguments
  if (typeof options == "function" && typeof callback == "undefined") {
    callback = options;
    options = null;
  }
  
  if (typeof callback != "function") {
    callback = function(error, result) { };
  }
  
  var result = { 
    files: [ ], //attachments
    indxs: [ ]  //index.html and/or index.txt +<subject>
  }; 
  if (emlformat.htmlBodyStr) {
    result.data_html_body = 'Problem - no BODY content!'; //will be overwr.
  }
  //if (emlformat.verbose)
    console.log(attPadStr+eml.slice(0,88).toString("utf8").split(/[\n\r]/,1)[0]);
  
  function _unpack(data) {
    try {
      //Create the target directories
      if (!fs.existsSync(directory)) {fs.mkdirSync(directory);}
      if (/[\/\\]/.test(attPadStr)) { //subdir in attPadStr
        var dir = path.dirname(path.resolve(directory,attPadStr)); 
        if (!fs.existsSync(dir)) {fs.mkdirSync(dir);}
      }
    var divStyle = `
<style>
div.FromTo {background-color:LightBlue;}
div.FileList {background-color:Aqua; margin:2px 0px;}
div.FromTo ul, div.FileList ul {margin: 0px; padding:4px;}
div.FromTo ul {list-style: none;}
div.FileList li{display:inline; padding: 0px 6px;}
.plainText {font-family: monospace;}
.nextEmail {background-color:Aqua; margin: 0px; padding:4px; color: Blue}
.references {font: x-small normal sans-serif; color: SkyBlue}

</style>
`;
      
    //Attachments
    var attachmentsInDiv = '';
    if (data.attachments && data.attachments.length > 0) {
      attachmentsInDiv = `
<div class="FileList"><ul>
<li><b>&amp;:</b></li>
`;
      for (var i = 0; i < data.attachments.length; i++) {
        var attachment = data.attachments[i];
        var filename = attachment.name;
        if (!filename) {
          filename = "attachment_" + (i + 1)
            + emlformat.getFileExtension(attachment.mimeType ? attachment.mimeType : attachment.contentType);
        }
        filename = attPadStr+filename;
        var fileNm = path.resolve(directory, filename);
        
        if (Array.isArray(attachment.data)) {//hmm (?!)
          attachment.data = JSON.stringify(attachment.data);
        }
        fs.writeFileSync(fileNm, attachment.data);
        //console.log(filename, data.date.toLocaleString());
        result.files.push(filename);
        fs.utimesSync(fileNm, data.date, data.date);//files have sometimes today date (?!)
        attachmentsInDiv += '<li> '+(i+1)+'. <a href="'+filename+'" download>'+filename+'</a></li>\n';
      }
      attachmentsInDiv += '</ul></div>\n';
    }
    
    var dateOptions = {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'};
    
    function divFromTo(data) {
      function emailToHtml(s) {
        //&lt;<a href="mailto:x@y.z">x@y.z</a>&gt;
        return (''+s) //'¬' -> '@' at the end
          .replace(/(([\w.-]+)@([\w.-]+))(.*<\1>)/g, '$2¬$3$4') //case: 'x@y.z <x@y.z>' -> 'x¬y.z <x@y.z>'
          .replace(/</g,'&lt;')
          .replace(/>/g,'&gt;')
          .replace(/([\w.-]+@[\w.-]+)/g, '<a href="mailto:$1">$1</a>')
          .replace(/¬/g, '@');
          //old: .replace(/<(.+?)>/g, '<a href="mailto:$1">&lt;$1&gt;</a>')
      }
      return `

<hr>
<h2 class="nextEmail">` + attPadStr + `
<span class="references">Message-ID: ` + (data.messageID || '') +` ; References: ` + (data.references || '') +` ;</span>
</h2>
<hr>
<div class="FromTo"><ul>
  <li><b>From: </b>`+emailToHtml(data.from)+`</li>
  <li><b>_To_: </b>`+emailToHtml(data.to)+`</li>
  <li><b>Date: </b>`+data.date.toLocaleString(undefined, dateOptions)+`</li>
  <li><b>Subj: </b>`+data.subject+`</li>
</ul></div>
`
      }
      
      function subjectFNameAdd() {
        return ('__' + data.subject).slice(0,120).replace(/[\x00-\x1F]/g,' ').replace(/[/:\\\?\*\+\%\|"<>']/g,'_').replace(/[�]/g,'_');
      }
      
      function disableSrc(s) {
        //convert <...src=...> to [ ...src=... ] and remove <script> ... </script>
        if (emlformat.srcToTxt) {
          return s
            .replace(/<script[\S\s]+?<\/script>/gmi,'')
            .replace(/<([^>]+src\s*=[^>]+)>/gmi,'[ $1 ]');
        }
      }
      if ((!data.html) && (!data.text)) data.text = '--empty--?!!!';
      
      //Message in HTML format
      if (typeof data.html == "string") {
        var htmlName = attPadStr+"index"+subjectFNameAdd()+".html";
        result.indxs.push(htmlName);
        
        var data_html = data.html;
        
        if (!(/<\/body>/i.test(data_html))) 
          data_html = 
            '<!doctype html><html><meta charset="UTF-8" /><head></head><html><body>'
            + data_html
            + '</body></html>';
        else {
          if (!(/<\/head>/i.test(data_html))) //</body> exists, but </head> not
            data_html = data_html.replace(/(<body[^>]*>)/i, '<head></head>$1');
          if (!(/<\/html>/i.test(data_html))) //</html> is missing
            data_html = 
              '<!doctype html><html><meta charset="UTF-8" />'
              + data_html
              + '</html>';
        }
        data_html = data_html.replace(/(charset\s*=\W*)[\w-]+("?)/gi,'$1UTF-8$2');
        
        data_html = data_html.replace(/(<\/head>)/i, divStyle+'$1');
            
        data_html = data_html.replace(/(<body[^>]*>)/i, '$1'
            + divFromTo(data)
            + attachmentsInDiv
            + '<hr>');

        var html_body = undefined;
        if (emlformat.htmlBodyStr || emlformat.htmlBodyOnly) {
          var match = /<body[^>]*>([\S\s]+)<\/body>/mi.exec(data_html);
          if (match) {          // [\S\s] - any char including '\n'
            html_body = disableSrc( match[1] );
          }
        }
        if (emlformat.htmlBodyStr) 
          result.data_html_body = html_body;
        else {
          var fileNm = path.resolve(directory, htmlName);
          if (!emlformat.htmlBodyOnly) {
            fs.writeFileSync(fileNm, disableSrc( data_html ));
          }
          else {
            fs.writeFileSync(fileNm, html_body);
          }
          fs.utimesSync(fileNm, data.date, data.date);
        }
        //result.files.push("index.html");
        //fs.writeFileSync(path.join(directory, "index.html"), data.html);
      }
      //Plain text file if HTML is missing
      if ((!(emlformat.noTextIfHtml) || !(typeof data.html == "string")) 
          && (typeof data.text == "string")) { 
        var txtName = attPadStr+"index" + subjectFNameAdd() + (emlformat.allTxtToHtml ? ".html" : ".txt");
        result.indxs.push(txtName);
        //discovery of EOL
        var EOL = '\n';
        var match = /(\r?\n)/.exec(data.text);
        if (match) 
          EOL = match[1];
        
        if (!emlformat.allTxtToHtml) {
          var attachmentsInTxt = '';
          if (result.files[0]) {
            attachmentsInTxt = '------------------------------'+EOL
              +'&:  ' + result.files.join(',  ')
              +EOL;
          }
          var data_text = '------------------------------ '+txtName+EOL
            +'From:\t'+data.from+EOL
            +'  To:\t'+data.to+EOL
            +'Date:\t'+data.date.toLocaleString(undefined, dateOptions)+EOL
            +'Subj:\t'+data.subject+EOL
            + attachmentsInTxt
            +'------------------------------'+EOL+EOL
            + data.text;
          var fileNm = path.resolve(directory, txtName);
          fs.writeFileSync(fileNm, data_text);
          fs.utimesSync(fileNm, data.date, data.date);
        } //(!emlformat.allTxtToHtml)
        else { //(emlformat.allTxtToHtml) 
          var reEOL = new RegExp(EOL, 'g'); // -> '<br>'
          var data_html_body = divFromTo(data)
            + attachmentsInDiv
            + '<hr>'
            + EOL+'<p class="plainText" style="font-family: monospace;">'+EOL
            +(data.text
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;")
             .replace(reEOL,'<br>'+EOL)
             )
            +EOL+'</p>';
          if (emlformat.htmlBodyStr) {
            result.data_html_body = disableSrc( data_html_body );
          }
          else {
            if (!emlformat.htmlBodyOnly)
              var data_html = '<!doctype html><html><meta charset="UTF-8" /><head>'+divStyle+'</head><html><body>';
            else
              var data_html = '';
            data_html += data_html_body;
            if (!emlformat.htmlBodyOnly)
              data_html += '</body></html>';
            var fileNm = path.resolve(directory, txtName);
            fs.writeFileSync(fileNm, disableSrc( data_html ));
            fs.utimesSync(fileNm, data.date, data.date);
          }
        }
      }
      
      callback(null, result);
    }
    catch (e) {
      callback(e);
    }
  }
  
  //Check the directory argument
  if (typeof directory != "string" || directory.length == 0) {
    return callback(new Error("Directory argument is missing!"));
  }
  //Check the attPadStr argument
  if (typeof attPadStr != "string") {
    return callback(new Error("attPadStr argument is missing!"));
  }
  
  //Argument as EML file content or "parsed" version of object
  if (typeof eml == "string" || (typeof eml == "object" && eml.headers && eml.body)) {
    emlformat.parse(eml, function(error, parsed) {
      if (error) return callback(error);
      
      //Save parsed EML as JSON file
        if (options && options.parsedJsonFile) {
        var file = path.resolve(directory, attPadStr+options.parsedJsonFile);
        var dir = path.dirname(file);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir);
        }
        result.files.push(attPadStr+options.parsedJsonFile);
        fs.writeFileSync(file, JSON.stringify(parsed, " ", 2));
      }
      
      //Convert parsed EML object to a friendly object with text, html and attachments
      emlformat.read(parsed, function(error, data) {
        if (error) return callback(error);
        
        //Save read structure as JSON file
        if (options && options.readJsonFile) {
          var file = path.resolve(directory, attPadStr+options.readJsonFile);
          var dir = path.dirname(file);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
          }
          result.files.push(attPadStr+options.readJsonFile);
          var json = data.attachments ? JSON.stringify(data) : JSON.stringify(data, " ", 2); //Attachments may be large, so make a compact JSON string
          fs.writeFileSync(file, json);
        }
        
        //Extract files from the EML file
        _unpack(data);
      });
    });
  }
  else if (typeof eml != "object") {
    return callback(new Error("Expected string or object as argument!"));
  }
  else {
    _unpack(eml);
  }
};


module.exports = emlformat;
