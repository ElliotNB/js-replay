/*
 * 	jsReplay (v0.0.1)
 * 	https://github.com/elliotnb/js-replay
 *
 * 	Licensed under the MIT license:
 * 	http://www.opensource.org/licenses/MIT
 *
 *	jsReplay is a record and playback tool used for functional regression testing. It is a singleton with two modes of operation: record and playback.
 *	
 *	In record mode, jsReplay will record all user events that occur on the page and log them silently in the background. When the recording is stopped, 
 *	the entire user event log is sent to the console in JSON format.
 *	
 *	In playback mode, jsReplay will read in a previously recorded JSON file, simulate all the user events and log any errors or mismatched elements on the page.
 *	When playback stops, a log of discrepancies and/or errors that occured during the playback is sent to the console in JSON format.
 *
 *	Playback usage:
 *		
 *		To playback a regression test you must first instantiate a new playback object. The constructor accepts a single argument -- a URL of a JSON file 
 *		of the full playback script. The playback will not start until the start() method is invoked. Only one playback instance can run at a time.
 *
 *		var widgetTest = new jsReplay.playback("https://foobar.com/helloworld/widget-test.json");
 *		widgetTest.start();
 *
 *	Record usage:
 *
 *		To record a regression test, execute the following command:	
 *
 *		jsReplay.record.start();
 *
 *		When you've finished recording your regression test, execute the following command:
 *
 *		jsReplay.record.stop();
 *		
 *		The test script will be logged to the console as a JSON string. Save the JSON to a file for later playback.
 *
 */
var jsReplay = (function() {

	// Indicates whether or not jsReplay is playing back user events. When set to true, jsReplay will not start another playback nor record user events.
	var playbackInProgress = false;
	
	// Indicates whether or not jsReplay is recording user events. When set to true, jsReplay will not start another recording nor start a playback.
	var recordInProgress = false;

	return {

		"playback":(function() {
			
			var selectorHash = {};
			
			/* 	Function: verifyContains 
					Verifies whether the element specified by the userEvent.selector contains the text stored in userEvent.text
				
				Parameters:
					userEvent - Object, a single DOM event from the JSON playback file. 
				
				Returns:
					Boolean - true if the element does contain the specified text or false if it does not.
			*/
			var verifyContains = function(userEvent) {
					
				var elementText = $(userEvent.selector).val() || $(userEvent.selector)[0].innerHTML;
				
				if (elementText.indexOf(userEvent.text) !== -1) {
					console.log("PASS - element does contain specified text.");
				} else {
					throw new Error("FAIL - element does not contain specified text.");
				}
			};
				
			/*	Function: simulateEvent
					Replays the DOM event specified by userEvent -- uses the same event type and same coordinates that were originally recorded for the event.
				
				Parameters:
					userEvent - Object, a single DOM event from the JSON playback file. 
					
				Returns:
					Nothing.				
			*/
			var simulateEvent = function(userEvent) {
				
				if (userEvent.selector in selectorHash) {
					var eventTarget = selectorHash[userEvent.selector];
				} else {
				
					var eventTarget = $(userEvent.selector)[0];

					if (userEvent.hasOwnProperty("clientX") && userEvent.hasOwnProperty("clientY")) {
					
						// get the target based on the click coordinates
						var target = document.elementFromPoint(userEvent.clientX, userEvent.clientY);
						
						// verify that the target from the coordinates matches the logged CSS selector
						if (target === eventTarget) {
							console.log("PASS - click target matches selector element.");
							selectorHash[userEvent.selector] = eventTarget;
						} else {
							throw new Error("FAIL - Element at point ("+userEvent.clientX+"px, "+userEvent.clientY+"px) does not match selector " + userEvent.selector);
						}
						
					}
				}
				
				var launchTime = new Date().getTime()
				console.log("Simulating ("+launchTime+"): " + userEvent.type + " selector: " + userEvent.selector);
				
				switch (userEvent.type) {
					case "focusin":
					case "focusout":
					case "focus":
					case "blur":
						var event = new FocusEvent(userEvent.type, userEvent);
						break;
					case "tap":
					case "click":
					case "mouseup":
					case "mousedown":
						var event = new MouseEvent(userEvent.type, userEvent);
						break;
					case "touchstart":
					case "touchend":
					case "touchmove":
					case "touchcancel":
						
						var touchList = [];
						for (var i = 0; i < userEvent.touches.length; i++) {
							var touch = userEvent.touches[i];
							var newTouch = new Touch({
								"clientX":touch.clientX
								,"clientY":touch.clientY
								,"force":touch.force
								,"identifier":touch.identifier
								,"pageX":touch.pageX
								,"pageY":touch.pageY
								,"radiusX":touch.radiusX
								,"radiusY":touch.radiusY
								,"rotationAngle":touch.rotationAngle
								,"screenX":touch.screenX
								,"screenY":touch.screenY
								,"target":$(touch.selector)[0]
							});
							touchList.push(newTouch);
						}
						
						userEvent.touches = touchList;
						
						var touchList = [];
						for (var i = 0; i < userEvent.changedTouches.length; i++) {
							var touch = userEvent.changedTouches[i];
							var newTouch = new Touch({
								"clientX":touch.clientX
								,"clientY":touch.clientY
								,"force":touch.force
								,"identifier":touch.identifier
								,"pageX":touch.pageX
								,"pageY":touch.pageY
								,"radiusX":touch.radiusX
								,"radiusY":touch.radiusY
								,"rotationAngle":touch.rotationAngle
								,"screenX":touch.screenX
								,"screenY":touch.screenY
								,"target":$(touch.selector)[0]
							});
							touchList.push(newTouch);
						}
						
						userEvent.changedTouches = touchList;
					
						var event = new TouchEvent(userEvent.type, userEvent);
						
						break;
					case "keypress":
					case "keydown":
					case "keyup":
						var event = new KeyboardEvent(userEvent.type, userEvent);
						break;
					case "input":
						var event = new Event(userEvent.type, userEvent);
						$(userEvent.selector).val(userEvent.value);
						break;
					case "contains":
						verifyContains(userEvent);
						return;
					default:
						throw new Error("Unsupported event type.");
						break;
				}
				
				eventTarget.dispatchEvent(event);
				
			};
		
		
			/*	Playback constructor function. Unlike recording, to playback a test the user must 
				create a new instance of the playback constructor and manually start it.
				
				Parameters:
					testRunURL - String, the URL where the JSON playback file is stored.
			*/
			var constructor = function(testRunURL) {

				var self = this;
			
				/*	this.window
						Object, stores the width and height attributes that the playback JSON file was designed to run in. It is essential
						that the playback occur in a web browser window with the same dimensions as the original test run recording.
				*/
				this.window = null;
				
				/*	Property: this.userEventLog
						Array of events, this is where the recorded events are stored. Each event contains most standard event properties as well as 
						some additional properties (selector and text) used for identifying the element and the contents of the element. The events are ordered
						oldest to newest (i.e., the events that were recorded first are at the beginning of the array).
				*/
				this.userEventLog = null;
			
				$.ajax({
					url: testRunURL,
					success: function(playbackData) {
						
						// Validate the playback file we've received
						if (typeof playbackData == "object") {
							
							// We won't run the playback file without the window attributes (i.e., browser window dimensions)
							if (typeof playbackData.window == "object") {
								self.window = playbackData.window;
							} else {
								throw new Error("Playback JSON file does not contain required window attributes.");
							}
						
							// Verify that the event_log is an array, if it's not an array, then this is an invalid playback JSON file.
							if (Array.isArray(playbackData.event_log)) {
								self.userEventLog = playbackData.event_log;
							} else {
								throw new Error("Event log in the JSON playback file is not an array.");
							}
						} else {
							throw new Error("Received an invalid playback JSON file.");
						}
					},
					error: function(jqXHR, textStatus, errorThrown) {
						throw new Error("Failed to retrieve the playback JSON file.");
					},
					dataType: "json"
				});

			};
			
			constructor.prototype = {

				/*	Method: start
						This method will start the playback of the user event log.
				*/
				"start":function() {
		
					var self = this;
					
					if (playbackInProgress !== false) {
						throw new Error("Cannot start playback -- there is another test playback already in-progress.");
						return;
					}
					
					if (recordInProgress !== false) {
						throw new Error("Cannot start playback -- a recording is already in-progress.");
						return;
					}
					
					if (window.innerHeight !== this.window.height || window.innerWidth !== this.window.width) {
						throw new Error("Cannot start playback -- browser window must match dimensions that the playback script was recorded in ("+this.window.width+"px by "+this.window.height+"px). Window is currently "+window.innerWidth+"px by "+window.innerHeight+"px.");
						return;
					}
					
					console.log("Starting test script playback.");

					playbackInProgress = true;
				
					// record the time that the user started the playback
					var timeStartedPlayback = new Date().getTime();
					
					// run the setInterval on a very short 10ms iteration so we can, as closely as possible, siumulate events exactly when they 
					// were originally fired
					var runSimulator = setInterval(function() {
						
						var currentTime = new Date().getTime();
						
						// we store the array length as a variable for performance reasons (faster than continually accessing the .length property).
						var userEventLength = self.userEventLog.length;
						
						// if the current time is greater than the timestamp of the first event in the array (e.g., 3000ms) plus when the playback started, 
						// then the event should be triggered
						if (currentTime > (self.userEventLog[0].timeStamp + timeStartedPlayback)) {
							do {
								// we're going to trigger this event, so we remove it from the array
								var userEvent = self.userEventLog.splice(0,1)[0];
								
								// reduce the array length, must be done manually since we've stored the length in a variable for performance reasons
								userEventLength--;
								
								// trigger the event
								simulateEvent(userEvent);
							
							// continue this loop for events that occurred up to 200ms in the future. we do this because a simple user action like a mouse click
							// will trigger multiple events (click, mousedown, mouseup, etc). if those events were separated by even 10ms, then the DOM could change in-between
							// those events and we'd encounter an element target mismatch. looking forward 200ms and firing them at the same time allows us to avoid this issue.
							} while (userEventLength > 0 && ((currentTime+200) > (self.userEventLog[0].timeStamp + timeStartedPlayback)));
						}
						
						// if userEventLength is 0, then that means there are no more events to replay
						if (userEventLength == 0) {
							clearInterval(runSimulator);
							console.log("Test script playback finished.");
							playbackInProgress = false;
						}
					},10);
					
				}
				
			}
			
			return constructor;
			
		})()
		
		,"record":(function() {
			
			var userEventLog = [];
			var ctrlKeyDown = false;
			
			// After recording is starting, startTimeDelay is set to the Unix time difference when the page was loaded and when recording started.
			// We use this value to adjust the timestamp stored on recorded events -- we don't want the dead time that occurs from when the page is loaded
			// until the recording is started to be reflected in our playback script.
			var startTimeDelay = new Date().getTime();
			
			/*	Function: _getSelectionText
					This function will retrieve the value of the text currently selected by the user.
				
				Returns: String
			*/
			var _getSelectionText = function() {
				var text = "";
				var activeEl = document.activeElement;
				var activeElTagName = activeEl ? activeEl.tagName.toLowerCase() : null;
				if (
				  (activeElTagName == "textarea") || (activeElTagName == "input" &&
				  /^(?:text|search|password|tel|url)$/i.test(activeEl.type)) &&
				  (typeof activeEl.selectionStart == "number")
				) {
					text = activeEl.value.slice(activeEl.selectionStart, activeEl.selectionEnd);
				} else if (window.getSelection) {
					text = window.getSelection().toString();
				}
				return text;
			};
			
			/*	Function: logEvent
					This function will parse the 
			
			*/
			var logEvent = function(event) {
				
				// Only record the event if recording is in progress
				if (recordInProgress == true) {
				
					var userEvent = {"selector":getSelector(event.target)};

					for (var prop in event) {
						// We can only record plain such as string, numbers and booleans in JSON. Objects will require special processing.
						if (["number","string","boolean"].indexOf(typeof event[prop]) > -1 
								// Exclude certain event event attributes in order to keep the JSON log as small as possible.
								// These attributes are not needed to re-create the event during playback.
								&& ["AT_TARGET","BUBBLING_PHASE","CAPTURING_PHASE","NONE","DOM_KEY_LOCATION_STANDARD","DOM_KEY_LOCATION_LEFT","DOM_KEY_LOCATION_RIGHT","DOM_KEY_LOCATION_NUMPAD"].indexOf(prop) == -1) {
							userEvent[prop] = event[prop];
						} else if (["touches","changedTouches"].indexOf(prop) > -1) {
							
							userEvent[prop] = [];
							
							for (var i = 0; i < event[prop].length; i++) {
								var touch = event[prop][i];
								userEvent[prop].push({
									"clientX":touch.clientX
									,"clientY":touch.clientY
									,"force":touch.force
									,"identifier":touch.identifier
									,"pageX":touch.pageX
									,"pageY":touch.pageY
									,"radiusX":touch.radiusX
									,"radiusY":touch.radiusY
									,"rotationAngle":touch.rotationAngle
									,"screenX":touch.screenX
									,"screenY":touch.screenY
									,"selector":getSelector(touch.target)
								});

							}

						}
					}
					
					// Subtract the start time delay from the timestamp so we don't include the dead time (i.e., time between
					// page load and recording started) in our playback JSON log.
					userEvent.timeStamp = userEvent.timeStamp - startTimeDelay;
					
					if (userEvent.selector !== null) {
						if (playbackInProgress == false) {
							userEventLog.push(userEvent);
							console.log("LOGGED EVENT:");
							console.log(userEventLog);
						}
					} else {
						console.warn("Null selector");
					}
				}
			};
			
			/*	Function: getSelector
					This function starts at the DOM element specified by 'el' and traverses upward through the DOM tree building out a unique 
					CSS selector for the DOM element 'el'.
					
				Parameters:
					el - DOM element, the element that we want to determine CSS selector
					names - Array of strings, records the CSS selectors for the target element and parent elements as we progress up the DOM tree.
				
				Returns:
					String, a unique CSS selector for the target element (el).
			*/
			var getSelector = function(el, names) {
				if (el === document || el === document.documentElement || el === document.body) return null;
				if (typeof names === "undefined") var names = [];
				if (el.id) {
					names.unshift('#'+el.id);
					return names.join(" > ");
				} else if (el.className) {
					var arrNode = [].slice.call(el.parentNode.getElementsByClassName(el.className));
					var classSelector = el.className.split(" ").join(".");
					if (arrNode.length == 1) {
						names.unshift(el.tagName.toLowerCase()+"."+classSelector);
					} else {
						for (var c=1,e=el;e.previousElementSibling;e=e.previousElementSibling,c++); 
						names.unshift(el.tagName.toLowerCase()+":nth-child("+c+")");
					}
				} else {
					for (var c=1,e=el;e.previousElementSibling;e=e.previousElementSibling,c++); 
					names.unshift(el.tagName.toLowerCase()+":nth-child("+c+")");
				}
				
				if (el.parentNode !== document.body) {
					getSelector(el.parentNode, names) 
				}
				return names.join(" > ");
			};
			
			document.addEventListener('click',function(event) { logEvent(event); },true);
			document.addEventListener('mousedown',function(event) { logEvent(event); },true);
			document.addEventListener('mouseup',function(event) { 
				
				logEvent(event);
				
				// if the user has selected text, then we want to record an extra 'contains' event. on playback, this is used
				// to verify that the selected text is contained within the target element
				var selectedText = _getSelectionText();
				if (selectedText.length > 1) {
					logEvent({"target":document.activeElement,"type":"contains","text":selectedText,"timeStamp":event.timeStamp});
				}
			},true);
			document.addEventListener('input',function(event) { 
				logEvent($.extend(true,event,{"value":$(event.target).val()})); 
			},true);
			document.addEventListener('focus',function(event) { logEvent(event); },true);
			document.addEventListener('focusin',function(event) { logEvent(event); },true);
			document.addEventListener('focusout',function(event) { logEvent(event); },true);
			document.addEventListener('blur',function(event) { logEvent(event);},true);
			document.addEventListener('keypress',function(event) { logEvent(event); },true);
			document.addEventListener('keydown',function(event) { logEvent(event); },true);
			document.addEventListener('keyup',function(event) { logEvent(event); },true);
			document.addEventListener('touchstart',function(event) {  logEvent(event); },true);
			document.addEventListener('touchend',function(event) { logEvent(event); },true);
			document.addEventListener('touchmove',function(event) { logEvent(event); },true);
			document.addEventListener('touchcancel',function(event) { logEvent(event); },true);
			
			return {
			
				/*	Method: start
						When this method is invoked, jsReplay will begin to record all user events that occur on the web page.
				*/
				"start": function() {
					if (playbackInProgress == false) {
						
						console.log("Start recording.");
						
						// Record the time that occurred from the page being loaded to the recording started. We will
						// subtract this value from the timestamp on the events in order to eliminate the dead time from our playback JSON log.
						startTimeDelay = Math.abs(startTimeDelay - new Date().getTime());
						recordInProgress = true;
						
					} else {
						throw new Error("Cannot start recording -- test playback is in progress.");
					}
				},
				
				/*	Method: stop
						When this method is invoked, jsReplay will stop recording user events and print playback JSON script to the console.
				*/
				"stop": function() {
					
					console.log("Stop recording.");
					
					recordInProgress = false;
					
					var playbackScript = {
						"window":{"width":window.innerWidth,"height":window.innerHeight}
						,"event_log":userEventLog
					};
					
					console.log(JSON.stringify(playbackScript));
				}
			};	
		})()
	};
})();