//node --inspect-brk t1.js
var emlformat = require('../lib/eml-format');
var message = emlformat.unquoteConv(
  "Start: =?UTF-8?B?VGVzdDEgxITEhsSYxYHFg8OTxZrFucW7IOKCrCDEhcSHxJnFgsWEw7M=?="
  +"=?UTF-8?Q? | =C5=9B=C5=BC=C5=BA |?="
  +"  ABC=?iso-8859-2?Q? =A1=C6=CA=A3=D1=D3=A6=AC=AF xyz =B1=E6=EA=B3=F1=F3=B6=BC=BF?=  stop."
);
console.log(message);
//message: "Start: Test1 ĄĆĘŁŃÓŚŹŻ € ąćęłńó | śżź |  ABC ĄĆĘŁŃÓŚŹŻ xyz ąćęłńóśźż  stop."