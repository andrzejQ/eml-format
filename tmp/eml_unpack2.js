//node --inspect-brk eml_unpack2.js   (debugger - chrome)

var fs = require('fs');
var emlformat = require("../lib/eml-format.js");

/**/var eml = fs.readFileSync("../test/fixtures/8bit_iso-8859-2_txt.eml", "binary"); 
/*/emlformat.charsetDefault = 'iso-8859-2'; var eml = fs.readFileSync("../test/fixtures/8bit_iso-8859-2_txt_no-charset.eml", "binary"); 
/**/
emlformat.unpack2(eml, './em','00000.', function(error, data) {
  if (error) return console.log(error);
  //fs.writeFileSync("sample.json", JSON.stringify(data, " ", 2));
  console.log(data);
  console.log("Done!");
});
