## EML file format

A pure Node.js library for parsing and building EML files, i.e. e-mail message format described in [RFC 822](http://www.ietf.org/rfc/rfc0822.txt). EML is returned by the POP3 protocol and handled by many e-mail agents like Mozilla Thunderbird or Micfosot Outlook. An EML file consists of headers and body similar to the HTTP structure.

UTF-8 character encoding, as other encoding accepted in `iconv-lite` can be used.

```
File extension: .eml
Mime type: message/rfc822
```

### How does EML look like?

```
Date: Wed, 29 Jan 2014 11:10:06 +0100
To: "Foo Bar" <foo.bar@example.com>
From: Online Shop <no-reply@example.com>
Subject: Winter promotions
Content-Type: text/plain; charset=utf-8

Lorem ipsum...
```

### Getting Started

Setup

~~npm install -g eml-format~~


Read EML file
```javascript
var fs = require('fs');
var emlformat = require('eml-format');

var eml = fs.readFileSync("sample.eml", "utf-8"); // for 1-byte charset: ...eml", "binary"); 
emlformat.read(eml, function(error, data) {
  if (error) return console.log(error);
  fs.writeFileSync("sample.json", JSON.stringify(data, " ", 2));
  console.log(data);
});
```

Output structure
```json
{
  "subject": "Winter promotions",
  "from": "Online Shop <no-reply@example.com>",
  "to": "\"Foo Bar\" <foo.bar@example.com>",
  "headers": {
    "Date": "Wed, 29 Jan 2014 11:10:06 +0100",
    "To": "\"Foo Bar\" <foo.bar@example.com>",
    "From": "Online Shop <no-reply@example.com>",
    "Subject": "Winter promotions",
    "Content-Type": "multipart/related; type=\"text/html\";\r\nboundary=\"b1_4afb675bba4c412783638afbee8e8c71\"",
    "MIME-Version": "1.0"
  },
  "html": "<!DOCTYPE html>\r\n<html lang=\"en\">\r\n<head>\r\n<title>Lorem ipsum</title>\r\n=09<meta name=\"description\" ...",
  "text": "Lorem ipsum dolor sit amet, consectetur adipiscing elit....",
  "attachments": [
    {
      "name": "nodejs.png",
      "mimeType": "image/png",
      "data": {
        "type": "Buffer",
        "data": [ 137, 80, 78, 71, ... ]
      }
    }
  ]
}
```

### Command Line

A command line tool to extract .eml file into a folder. Output directory will be populated with .txt and .html message and attachment files.
```
Usage:
  eml-unpack [options] [message.eml] [directory]

Options:
  --help       Print this message
  --verbose    Enable detailed logging
  --version    Print version number
  --json       Create parsed.json and manifest.json
  --no-unpack  Used with --json to skip unpacking

Examples:
  eml-unpack message.eml .
  eml-unpack --verbose sample.eml folder
  eml-unpack --json --no-unpack ./sample.eml ./folder
```

## Reference

### Overridable properties

```javascript
var emlformat = {
  verbose: false,
  notCRLFboundary: true, //set true for an old emails without CRLF preceding the boundary
  charsetDefault: 'iso-8859-1', //or 'utf-8' ... - to use if charset=... is missing
  noTextIfHtml: true, //in unpack2() - save plain text file only in case if HTML is missing
...
```

### read(eml, [options], callback)

Parses EML file content and return user-friendly object.

| Argument | Type | Description |
|----------|------|-------------|
| eml | string or object | EML file content or object from 'parse' |
| options | object | Optional parameter, `{ headersOnly: true }` (`false` by default) |
| callback | function(error, data) | Callback function to be invoked when read is complete |

### parse(eml, [options], callback)

Parses EML file content and returns object-oriented representation of the content.
 
| Argument | Type | Description |
|----------|------|-------------|
| eml | string | EML file content |
| options | object | Optional parameter, `{ headersOnly: true }` (`false` by default) |
| callback | function(error, data) | Callback function to be invoked when parse is complete |

### build(eml, callback)

Builds an EML message.

| Argument | Type | Description |
|----------|------|-------------|
| data | object | E-mail data, see example |
| callback | function(error, eml) | Callback function to be invoked when build is complete |

### unpack2(eml, directory, fnamePrefix, callback)

Unpacks (read) EML message and attachments to a directory; apply padding string to file names;
set short header (From, To, Date, Subj.) in HTML and TEXT file

| Argument | Type | Description |
|----------|------|-------------|
| eml | string or object | EML file content or object from 'parse' |
| directory | string | Folder name or directory path where to unpack |
| fnamePrefix | string | prefix added to content file names and attachments file names |
| callback | function(error, data) | Callback function to be invoked when read is complete |

### unpack(eml, directory, callback)

Unpacks EML message and attachments to a directory.

| Argument | Type | Description |
|----------|------|-------------|
| eml | string or object | EML file content or object from 'parse' |
| directory | string | Folder name or directory path where to unpack |
| callback | function(error, data) | Callback function to be invoked when read is complete |

## Examples

### Read headers only
```javascript
var fs = require('fs');
var emlformat = require('eml-format');

var eml = fs.readFileSync("sample.eml", "utf-8");
emlformat.read(eml, { headersOnly: true }, function(error, data) {
  if (error) return console.log(error);
  fs.writeFileSync("headers.json", JSON.stringify(data, " ", 2));
  console.log(data);
  console.log("Done!");
});
```

### Read the complete EML file

The `parse` function parses raw EML content into JavaScript object for further processing.
```javascript
var fs = require('fs');
var emlformat = require('eml-format');

var eml = fs.readFileSync("sample.eml", "utf-8");
emlformat.parse(eml, function(error, data) {
  if (error) return console.log(error);
  fs.writeFileSync("sample.json", JSON.stringify(data, " ", 2));
  console.log(data);
  console.log("Done!");
});
```

Or use the `read` instead of parse `parse`. The `read` function decodes the **base64**, **quote-printable**, **=?UTF-8?...?=** encoded content and extracts plain text, html content and attachments. So this method is a little slower but more user friendly.
```javascript
emlformat.read(eml, function(error, data) {
  if (error) return console.log(error);
  fs.writeFileSync("user-friendly.json", JSON.stringify(data, " ", 2));
  console.log(data);
  console.log("Done!");
});
```

### Unpack files from an EML file

Extracts plain text, html content and attachments to a directory
```javascript
var fs = require('fs');
var emlformat = require('eml-format');

var dir = "unpacked"; //Output directory
var eml = fs.readFileSync("sample.eml", "utf-8");
emlformat.unpack(eml, dir, function(error, data) {
  if (error) return console.log(error);
  console.log(data); //List of files
  console.log("Done!");
});
```

Extracts html or plain text content and attachments to a directory
with short headers in TEXT and HTML file
```javascript
var fs = require('fs');
var emlformat = require('./lib/eml-format.js');

var dir = "unpacked2"; //Output directory
var num = "00001.";//prefix for all filenames
var eml = fs.readFileSync("sample.eml", "binary"); //"binary" if not "utf-8" case
emlformat.unpack2(eml, dir, num, function(error, data) {
  if (error) return console.log(error);
  console.log(data); //List of files
  console.log("Done!");
});
```

Extracts html or plain text content and attachments to a directory from all emails
in `mbox` file (mbox-example.js):

```javascript
var emlformat     = require('./lib/eml-format.js');
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
// pipe stdin to mbox parser: node mbox-example < my.mbox
process.stdin.pipe(mbox);
```

### Create an EML file

```javascript
var fs = require('fs');
var emlformat = require('eml-format');

var data = {
  from: "no-reply@bar.com",
  to: {
    name: "Foo Bar",
    email: "foo@bar.com"
  },
  subject: "Winter promotions",
  text: "Lorem ipsum...",
  html: '<html><head></head><body>Lorem ipsum...<br /><img src="nodejs.png" alt="" /></body></html>',
  attachments: [
    {
      name: "sample.txt",
      contentType: "text/plain; charset=utf-8",
      data: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi eget elit turpis. Aliquam lorem nunc, dignissim in risus at, tempus aliquet justo..."
    },
    {
      name: "nodejs.png",
      contentType: "image/png",
      data: fs.readFileSync("nodejs.png"),
      inline: true
    }
  ]
};

var eml = fs.readFileSync("sample.eml", "utf-8");
emlformat.build(data, function(error, eml) {
  if (error) return console.log(error);
  fs.writeFileSync("build.eml", eml);
  console.log("Done!");
});
```

### Register a new mime type file extension

```javascript
var emlformat = require('eml-format');
emlformat.fileExtensions["application/zip"] = ".zip";
emlformat.fileExtensions["application/octet-stream"] = ".bin";
```
### Extract e-mail address and name

`emlformat.getEmailAddress()` and  `emlformat.getEmailAddress()` are not used because they are not useful for multiply addresses.

In `emlformat.read()` `data.from` and `data.to` are set as strings with unquoted names.

### Decode "quoted-printable"

```javascript
var emlformat = require('eml-format');
var encodingChr = 'utf8';
var message = emlformat.unquotePrintable("Join line 1=\r\n=20with line 2=0D=0A", encodingChr);
```

`encodingChr` is 'utf8' or accepted in `iconv.decode(...., encodingChr)`, like `iso88591` or `iso-8859-1`

### Decode "=?...?.?........?=" string
("UTF-8" or `iconv-lite` is used)

```javascript
var emlformat = require('eml-format');
var message = emlformat.unquoteConv("=?UTF-8?B?V2hhdOKAmXMgeW91ciBvbmxpbmUgc2hvcHBpbmcgc3R5bGU/?=");
```
