"use strict";

var iconv1 = require('iconv-lite');
var iconv2 = require('../lib/iconv-thin');


var contentOK='ABC ĄĆĘŁŃÓŚŹŻ abc ąćęłńóśźż 123';
var ansiBuf = [0x41, 0x42, 0x43, 0x20, 0xA5, 0xC6, 0xCA, 0xA3, 0xD1, 0xD3, 0x8C, 0x8F, 0xAF, 0x20, 0x61, 0x62, 0x63, 0x20, 0xB9, 0xE6, 0xEA, 0xB3, 0xF1, 0xF3, 0x9C, 0x9F, 0xBF, 0x20, 0x31, 0x32, 0x33];
var content1 = iconv2.decode(Buffer.from(ansiBuf), "windows1250");
var content2 = iconv2.decode(Buffer.from(ansiBuf), "windows1250");
var content3 = iconv2.decode(Buffer.from(ansiBuf), "win1250");

console.log(contentOK);
console.log(content1);
console.log(content2);
console.log(content3);
