"use strict";
/********************************************************
* All emails in single HTML file with linked attachments.
* ./tmp/mbox-1html-example.js 
*/
var emlformat     = require('../lib/eml-format.js');
var fs = require("fs");
var path = require("path");
const Mbox        = require('node-mbox');
const mbox        = new Mbox();

emlformat.allTxtToHtml = true; //unpack2() - save plain text file as HTML with '<br>' at line break
emlformat.htmlBodyStr = true; // set `data.data_html_body` as string with html body
emlformat.charsetDefault = 'iso-8859-1';

var i = 0;
var err = '';
var directory = './em_1';   var fName = 'All.html';
fName = path.resolve(directory, fName);
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
</head><html><body>`
);
mbox.on('message', function(eml) { // wait for message events
  var num = String(++i);
  if (num.length < 5) num = String('00000'+num).slice(-5); //'00001'
  num += '.';
  console.log(num+">>>");
  fs.appendFileSync(fName, `
  <br><hr>
  <h2 class="nextEmail">` + num + `</h2>
  <hr>
  `);
  emlformat.unpack2(eml.toString("binary"), directory,'atch/'+num, function(error, data) {
    if (error) 
      err += num+" !!!\n"+error;
    else {
      if (data.files[0]) {console.log(data.files)}; //List of attachments
      fs.appendFileSync(fName, data.data_html_body);
      console.log(data.indxs+"-body added **************************************************");
    }
  });
});
mbox.on('end', function() {
  fs.appendFileSync(fName, '</body></html>');
  if (err) console.log('\nERRORS:\n'+err);
});

// pipe stdin to mbox parser: node mbox-1html-example.js <../test/fixtures/my.mbox 
process.stdin.pipe(mbox);
