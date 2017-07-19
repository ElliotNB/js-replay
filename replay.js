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
				
				if (userEvent.hasOwnProperty("clientX") && userEvent.hasOwnProperty("clientY")) {
				
					// get the target based on the click coordinates
					var target = document.elementFromPoint(userEvent.clientX, userEvent.clientY);
					
					// verify that the target from the coordinates matches the logged CSS selector
					if (target === $(userEvent.selector)[0]) {
						console.log("PASS - click target matches selector element.");
					} else {
						throw new Error("FAIL - Element at point ("+userEvent.clientX+"px, "+userEvent.clientY+"px) does not match selector " + userEvent.selector);
					}
					
				}
					
				switch (userEvent.type) {
					case "click":
					case "focus":
						$(userEvent.selector)[0].focus();
					case "mouseup":
					case "mousedown":
						var event = new MouseEvent(userEvent.type, userEvent);
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
				
				$(userEvent.selector)[0].dispatchEvent(event);
				
			};
		
			/*	Constructor function for the playback functionality. Unlike recording, to playback a test the user must 
				create a new instance of the playback constructor and manually start it.
				
				Parameters:
					testRunURL - String, the URL where the JSON playback file is stored.
			*/
			var constructor = function(testRunURL) {

				var self = this;
			
				$.ajax({
					url: testRunURL,
					success: function(userEventLog) {
						
						if (Array.isArray(userEventLog)) {
							self.userEventLog = userEventLog;
						} else {
							throw new Error("Received an invalid test script event log.");
						}
					},
					error: function(jqXHR, textStatus, errorThrown) {
						throw new Error("Failed to retrieve test script event log.");
					},
					dataType: "json"
				});

				this.userEventLog = null;
			
			};
			
			constructor.prototype = {

				"start":function() {
		
					var self = this;
					if (this.userEventLog !== null) {
						if (playbackInProgress == false) {
							if (recordInProgress == false) {
							
								console.log("Starting test script playback.");

								playbackInProgress = true;
							
								var delayTime = new Date().getTime();
								var runSimulator = setInterval(function() {
									var currentTime = new Date().getTime();
									
									for (var i = 0, l = self.userEventLog.length; i < l; i++) {
										if (currentTime > (self.userEventLog[i].timeStamp + delayTime)) {
											
											var userEvent = self.userEventLog.splice(i,1)[0];
											simulateEvent(userEvent);
											break;
											
										}
									};
									
									if (self.userEventLog.length == 0) {
										clearInterval(runSimulator);
										console.log("simulator done");
										playbackInProgress = false;
									}
								},50);
							} else {
								throw new Error("Cannot start playback -- there test script record in-progress.");
							}
						} else {
							throw new Error("Cannot start playback -- there is already another test playback in-progress.");
						}
					} else {
						throw new Error("Cannot start playback -- have not received a valid test script event log.");
					}
				},
				
			}
			
			return constructor;
			
		})()
		
		,"record":(function() {
			
			var userEventLog = [];
			var ctrlKeyDown = false;
			
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
			
			var logEvent = function(event) {
				if (recordInProgress == true) {
					var userEvent = {"selector":getSelector(event.target)};

					for (var prop in event) {
						if (["number","string"].indexOf(typeof event[prop]) > -1 && ["AT_TARGET","BUBBLING_PHASE","CAPTURING_PHASE","NONE","DOM_KEY_LOCATION_STANDARD","DOM_KEY_LOCATION_LEFT","DOM_KEY_LOCATION_RIGHT","DOM_KEY_LOCATION_NUMPAD"].indexOf(prop) == -1) {
							userEvent[prop] = event[prop];
						}
					}
					
					if (userEvent.selector !== null) {
						if (playbackInProgress == false) {
							userEventLog.push(userEvent);
							console.log("LOGGED EVENT:");
							console.log(userEventLog);
						}
					}
				}
			};
			
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
						names.unshift("."+classSelector);
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
			document.addEventListener('blur',function(event) { logEvent(event); },true);
			document.addEventListener('keypress',function(event) { logEvent(event); },true);
			document.addEventListener('keydown',function(event) { logEvent(event); },true);
			document.addEventListener('keyup',function(event) { logEvent(event); },true);
			
			return {
				"start": function() {
					if (playbackInProgress == false) {
						console.log("Start recording.");
						recordInProgress = true;
					} else {
						throw new Error("Cannot start recording -- test playback is in progress.");
					}
				},
				"stop": function() {
					console.log("Stop recording.");
					recordInProgress = false;
					this.getEvents();
				},
				"getEvents": function() {
					console.log(JSON.stringify(userEventLog));
				}
			};
			
		})()
	};
})();
