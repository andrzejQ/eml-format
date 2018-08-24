var emlformat     = require('../lib/eml-format.js');
const Mbox        = require('node-mbox');
const mbox        = new Mbox();
var i = 0;
// wait for message events
mbox.on('message', function(eml) {
  var num = String(++i);
  if (num.length < 5) num = String('00000'+num).slice(-5); //'00001'
  num += '.';
  console.log(num+">>>");
  emlformat.unpack2(eml.toString("binary"), './em',num, function(error, data) {
    if (error) return console.log(error);
    console.log(data); //List of files
    console.log(num+" saved **************************************************");
  });
});
// pipe stdin to mbox parser: node mbox-example.js <../test/fixtures/my.mbox
process.stdin.pipe(mbox);