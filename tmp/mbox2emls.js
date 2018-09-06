//node --inspect-brk mbox-expl.js   (debugger - chrome)

var fs = require('fs');
const Mbox = require('node-mbox');
const mbox = new Mbox();

var i = 0;
var dir = './emls_1/';
if (!fs.existsSync(dir)) {fs.mkdirSync(dir);}

mbox.on('message', function(eml) {// wait for message events
  var num = String(++i);
  if (num.length < 5) num = String('00000'+num).slice(-5); //'00001'
  num += '.eml';
  fs.writeFileSync(dir+num, eml);
  console.log(num,'->', eml.slice(0,88).toString("binary").match(/.*/)[0]);
});                                                     //1-st line of eml

// pipe stdin to mbox parser: node mbox2emls < my.mbox
process.stdin.pipe(mbox);
