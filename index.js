#!/usr/bin/env node

var fs = require('fs');
var parse = require('csv-parse');
var stream = require('stream');

// Turns CSV files into "maps" AKA JSON, not real ES6 Maps.
//
// In the most simple case you have a CSV with two columns and you map one to
// the other.
//
// Name,SSN
// Bill,111-22-3333
// Sue,444-55-6666
//
// { "Bill": "111-22-3333",
//   "Sue": "444-55-6666"}
//
// You could also want to map multiple keys to a single value. So we append the
// key field values together with some delimiter. In the example below it's an
// underscore (_).
//
// First,Last,SSN
// Bill,Smith,111-22-3333
// Sue,Stork,444-55-6666
//
// { "Bill_Smith": "111-22-3333",
//   "Sue_Stork": "444-55-6666"}
//
// You may also want to map one or more key columns to JSON (AKA multiple value
// columns) instead of just a single value column.
//
// Name,SSN,Birthplace,Birthdate
// Bill,111-22-3333,Rochester NY,3/11/1934
// Sue,444-55-6666,NY NY,5/22/2001
//
// { "Bill": { "SSN": "111-22-3333", "Birthplace": "Rochester NY", "Birthdate": "3/11/1934" },
//   "Sue": { "SSN": "444-55-6666", "Birthplace": "NY NY", "Birthdate": "5/22/2001" }}
//
// In all of the above examples we expect that the key column(s) are unique per
// the CSV file. Another use case is where there are multiple rows in the CSV
// file per key column(s) value. For this use case we assume a single value
// column. Can't think of an example where you would want multiple value
// columns.
//
// Name,Sport
// Joe,Soccer
// Sally,Rugby
// Joe,Boxing
// Sally,Sailing
//
// { "Joe": [ "Soccer", "Boxing" ],
//   "Sally": [ "Rugby", "Sailing" ]}

function resolveStream(input) {
  var rv;
  if (typeof input === 'string' || input instanceof String) {
    if (input.indexOf('\n') > -1) {
      // If there is a newline we assume you passed us a string that contains
      // your entire csv.
      rv = new stream.Readable();
      rv.push(input);
      rv.push(null);
    } else {
      // If no newline we assume you passed a file name.
      rv = fs.createReadStream(input);
    }
  } else {
    rv = input;
  }
  return rv;
}

function CsvMapper() {
  if (!(this instanceof CsvMapper)) {
    return new CsvMapper();
  }

  this.build = function build(options, cb) {

    var map = {};

    var keyDelimiter = options.keyDelimiter || '_';

    var duplicateKeys = options.duplicateKeys;

    var instream = [];
    if (!options.input) {
      instream = [process.stdin];
    } else {
      if (!Array.isArray(options.input)) {
        options.input = [options.input];
      }
      options.input.forEach(function(input) {
        instream.push(resolveStream(input));
      });
    }

    if (!options.keyColNames) {
      throw new Error('options.keyColNames required. ' + options);
    }
    var keyColNames = options.keyColNames;
    if (!Array.isArray(keyColNames)) {
      keyColNames = [keyColNames];
    }

    var valColNames = options.valColNames;
    if (!valColNames) {
      valColNames = [];
    } else {
      if (!Array.isArray(valColNames)) {
        valColNames = [valColNames];
      }
    }

    var getKey = function getKey(row) {
      var key = '';
      var delim = '';
      keyColNames.forEach(function(colName) {
        key += delim + row[colName];
        delim = keyDelimiter;
      });
      return key;
    };

    var getValue = function getValue(row) {
      if (duplicateKeys) {
        return row[valColNames[0]];
      }
      if (valColNames.length === 0) {
        return row;
      }
      if (valColNames.length === 1) {
        return row[valColNames[0]];
      }
      var v = {};
      valColNames.forEach(function(colName) {
        v[colName] = row[colName];
      });
      return v;
    };

    var doNormal = function doNormal(row) {
      var key = getKey(row);
      var value = getValue(row);
      map[key] = value;
    };

    var doDupKeys = function doDupKeys(row) {
      var key = getKey(row);
      var value = getValue(row);
      var o = map[key];
      if (!o) {
        o = [];
        map[key] = o;
      }
      o.push(value);
    };

    var currentStream = 0;

    // Added ability to read from multiple input files. I could not just use
    // something like https://github.com/grncdr/merge-stream because the csv
    // parser would expect all the files to have exactly the same columns.
    // Doing it this way only the columns you care about need to be the same.
    var doIt = function doIt(cb) {
      if (currentStream === instream.length) {
        cb(null, map);
        return;
      }
      instream[currentStream].pipe(parse({
          columns: true
        }))
        .on('data', function(row) {
          if (duplicateKeys) {
            doDupKeys(row);
          } else {
            doNormal(row);
          }
        })
        .on('error', function(err) {
          cb(err);
        })
        .on('finish', function() {
          currentStream++;
          doIt(cb);
        });
    };

    doIt(cb);

  };
}

exports = module.exports = CsvMapper;