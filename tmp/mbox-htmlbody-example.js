"use strict";
/********************************************************
* All emails in HTML files with body content only
* ./tmp/mbox-htmlbody-example.js
*/
var emlformat     = require('../lib/eml-format.js');
var fs = require("fs");
var path = require("path");
const Mbox        = require('node-mbox');
const mbox        = new Mbox();

emlformat.allTxtToHtml = true; //unpack2() - save plain text file as HTML with '<br>' at line break
emlformat.htmlBodyOnly = true; 
emlformat.charsetDefault = 'utf-8';//'iso-8859-1';//

var i = 0;
var err = '';
var directory = './em_1';   
var fName = path.resolve(directory, '00000.index__.html');
var dir = path.dirname(fName); if (!fs.existsSync(dir)) {fs.mkdirSync(dir);}
fs.writeFileSync(fName, `<!doctype html><html><meta charset="UTF-8" />
<head>
<style>
div.FromTo {background-color:LightBlue;}
div.FileList {background-color:Aqua; margin:2px 0px;}
div.FromTo ul, div.FileList ul {margin: 0px; padding:4px;}
div.FromTo ul {list-style: none;}
div.FileList li{display:inline; padding: 0px 6px;}
.plainText {font-family: monospace;}
.nextEmail {background-color:Aqua;}
</style>
</head>
<html><body>`
);
fs.writeFileSync(path.resolve(directory, '99999.index__.html'), `
</html></body>`
);
// wait for message events
mbox.on('message', function(eml) {
  var num = String(++i);
  if (num.length < 5) num = String('00000'+num).slice(-5); //'00001'
  num += '.';
  console.log(num+">>>");
  emlformat.unpack2(eml.toString((emlformat.charsetDefault=='utf-8')?'utf8':'binary'), directory,num, function(error, data) {
    if (error) 
      err += "\n"+num+" !!! "+error;
    else {
      if (data.files[0]) {console.log(data.files)}; //List of attachments
      console.log(data.indxs+" saved **************************************************");
    }
  });
});

mbox.on('end', function() {
  if (err) console.log('\nERRORS:\n'+err);
});

// pipe stdin to mbox parser: node mbox-htmlbody-example.js <../test/fixtures/my.mbox 
process.stdin.pipe(mbox);
