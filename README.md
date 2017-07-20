# jsReplay
https://github.com/elliotnb/js-replay

Version 0.0.1.

Licensed under the MIT license:

http://www.opensource.org/licenses/MIT

## Overview 
jsReplay is a record and playback tool used for functional regression testing. It is a singleton with two modes of operation: record and playback.
	
In record mode, jsReplay will record all user events that occur on the page and log them silently in the background. When the recording is stopped, the entire user event log is sent to the console in JSON format.

In playback mode, jsReplay will read in a previously recorded JSON file, simulate all the user events and log any errors or mismatched elements on the page. When playback stops, a log of discrepancies and/or errors that occured during the playback is sent to the console in JSON format.


## Playback usage
	
To playback a regression test you must first instantiate a new playback object. The constructor accepts a single argument -- a URL of a JSON file of the full playback script. The playback will not start until the start() method is invoked. Only one playback instance can run at a time.

```javascript
var widgetTest = new jsReplay.playback("https://foobar.com/helloworld/widget-test.json");
widgetTest.start();
```

## Record usage

To record a regression test, execute the following command:	

```javascript
jsReplay.record.start();
```

When you've finished recording your regression test, execute the following command:

```javascript
jsReplay.record.stop();
```

The test script will be logged to the console as a JSON string. Save the JSON to a file for later playback.

## Requirements

At the moment, jsReplay requires jQuery 1.7+. This requirements will be removed in future versions.

jsReplay only supports Chrome and has only been tested in Chrome 59. jsReplay should not be expected to function properly in other web browsers.