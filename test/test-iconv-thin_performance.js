if (module.parent) // Skip this file from testing.
    return;

//for other tests - in ../../ : nodeunit test 
    
var iconv_thin = require('../lib/iconv-thin');
var iconv_lite = require("iconv-lite");

var encoding = process.argv[2] || "windows1251";
var convertTimes = 1000;//0;

var encodingStrings = {
    'windows1251': 'This is a test string 32 chars..',
    'windows1250': [0x41,0x42,0x43,0x20,0xA5,0xC6,0xCA,0xA3,0xD1,0xD3,0x8C,0x8F,0xAF,0x20,0x61,0x62,0x63,0x20,0xB9,0xE6,0xEA,0xB3,0xF1,0xF3,0x9C,0x9F,0xBF,0x20,0x31,0x32,0x33],
                    //'ABC ĄĆĘŁŃÓŚŹŻ abc ąćęłńóśźż 123';
    //'gbk':          '这是中文字符测试。。！@￥%12',
    'utf8': '这是中文字符测试。。！@￥%12This is a test string, ABC ĄĆĘŁŃÓŚŹŻ abc ąćęłńóśźż 123 €, ...',
};

var str = encodingStrings[encoding];
if (!str) {
    throw new Error('Don\'t support ' + encoding + ' performance test.');
}
console.log(typeof str);
console.log('iconv_lite: ',iconv_lite.decode(Buffer.from(str),encoding));
console.log('iconv_thin: ',iconv_thin.decode(Buffer.from(str),encoding));
if (typeof str == 'object')
    str = str.toString(encoding);
for (var i = 0; i < 13; i++) {
    str = str + str;
}

// Test decoding.
var buf = iconv_lite.encode(str, encoding);
console.log("\nDecoding "+encoding+" "+buf.length+" bytes "+convertTimes+" times:");

var start = Date.now();
for (var i = 0; i < convertTimes; i++) {
    var s = iconv_thin.decode(buf, encoding);
}
var duration = Date.now() - start;
var mbs = convertTimes*buf.length/duration/1024;

console.log("iconv_thin: "+duration+"ms, "+mbs.toFixed(2)+" Mb/s.");

var start = Date.now();
for (var i = 0; i < convertTimes; i++) {
    var s = iconv_lite.decode(buf, encoding);
}
var duration = Date.now() - start;
var mbs = convertTimes*buf.length/duration/1024;

console.log("iconv-lite: "+duration+"ms, "+mbs.toFixed(2)+" Mb/s.");

