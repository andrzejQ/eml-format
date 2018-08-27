var fs = require("fs");
var path = require("path");
var emlformat = require("../lib/eml-format.js");

exports["Unpack2 sample.eml"] = function(test) {
  var expected, actual;
  var src = path.join(__dirname, "./fixtures/sample.eml");
  var eml = fs.readFileSync(src, "utf-8");
  
  var dst = path.join(__dirname, "./unpack2");
  var num = "0x0x0x0.";//prefix for all filenames
  if (!fs.existsSync(dst)) {
    fs.mkdirSync(dst);
  }
  else {//remove old output files
    fs.readdirSync(dst).forEach(function (file, index) {
      var currentPath = path.join(dst, file);
      if (file.startsWith(num)) {
        fs.unlinkSync(currentPath); // delete file
      }
    })
  }
  emlformat.verbose = false;
  emlformat.unpack2(eml, dst, num, function(error, result) {
    if (error) {
      test.ok(false, error.message);
    }
    else {
      test.ok(fs.readdirSync(dst).length > 0, "Expected at least one output file!");
    }
    test.done();
  });  
};
