
# ..... / 2018-08-23

  * unquoteConv() decodes string with substrings like `"=?...?.?.......?="`
  * unquotePrintable() - improved utf8 multi-byte conversion - 2-bytes starts with /[CD]/...., 3-bytes starts with /E/, 4-bytes: /F[0-7]/
