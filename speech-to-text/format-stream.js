'use strict';

var Transform = require('stream').Transform;
var util = require('util');
var clone = require('clone');

/**
 * Applies some basic formating to transcriptions:
 *  - Capitalize the first word of each sentence
 *  - Add a period to the end
 *  - Fix any "cruft" in the transcription
 *  - etc.
 *
 * @param opts
 * @param opts.model - some models / languages need special handling
 * @param [opts.hesitation='\u2026'] - what to put down for a "hesitation" event, defaults to an ellipsis (...)
 * @constructor
 */
function FormatStream(opts) {
  this.opts = util._extend({
    model: '', // some models should have all spaces removed
    hesitation: '\u2026', // ellipsis
    decodeStrings: true
  }, opts);
  Transform.call(this, opts);

  this.isJaCn = ((this.opts.model.substring(0,5) === 'ja-JP') || (this.opts.model.substring(0,5) === 'zh-CN'));

  var handleResult = this.handleResult.bind(this);
  this.on('pipe', function(source) {
    source.on('result', handleResult);
  });
}
util.inherits(FormatStream, Transform);

var reHesitation = /%HESITATION\s/g; // when the service tetects a "hesitation" pause, it literally puts the string "%HESITATION" into the transcription
var reRepeatedCharacter = /(.)\1{2,}/g; // detect the same character repeated three or more times and remove it
var reDUnderscoreWords = /D_[^\s]+/g; // replace D_(anything)

/**
 * Formats a single alternative of a final or interim result
 * @param text
 * @param isFinal
 * @returns {String}
 */
FormatStream.prototype.format = function format(text, isFinal) {
  // clean out "junk"
  text = text.trim().replace(reHesitation, this.opts.hesitation)
    .replace(reRepeatedCharacter, '')
    .replace(reDUnderscoreWords,'');

  // short-circuit if there's no actual text (avoids getting multiple periods after a pause)
  if (!text) {
    return text;
  }

  // capitalize first word
  text = text.charAt(0).toUpperCase() + text.substring(1);

  // remove spaces for Japanese and Chinese
  if (this.isJaCn) {
    text = text.replace(/ /g,'');
  }

  // if final, insert a period and restore the trailing space
  if (isFinal) {
      text = text + (this.isJaCn ? '。' : '. ');
  }
  return text;
};


FormatStream.prototype._transform = function(chunk, encoding, next) {
  this.push(this.format(chunk.toString(), true));
  next();
};

/**
 * Creates a new result with all transcriptions formatted
 *
 * @param result
 */
FormatStream.prototype.handleResult = function handleResult(result) {
  result = clone(result);
  result.alternatives = result.alternatives.map(function(alternative) {
    alternative.transcript = this.format(alternative.transcript, result.final);
    return alternative;
  }, this);
  this.emit('result', result);
};

FormatStream.prototype.promise = require('./promise');

module.exports = FormatStream;
