"use strict";

var emlformat     = require('../lib/eml-format.js');
const Mbox        = require('node-mbox');
const mbox        = new Mbox();

emlformat.allTxtToHtml = true; //unpack2() - save plain text file as HTML with '<br>' at line break
emlformat.charsetDefault = 'utf-8';//'iso-8859-1'; 

var i = 0;
var err = '';
// wait for message events
mbox.on('message', function(eml) {
  var num = String(++i);
  if (num.length < 5) num = String('00000'+num).slice(-5); //'00001'
  num += '.';
  console.log(num+">>>");
  emlformat.unpack2(eml.toString((emlformat.charsetDefault=='utf-8')?'utf8':'binary'), './em',num, function(error, data) {
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

// pipe stdin to mbox parser: node mbox-example.js <../test/fixtures/my.mbox
process.stdin.pipe(mbox);