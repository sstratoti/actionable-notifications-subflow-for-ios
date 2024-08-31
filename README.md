# Actionable Notifications Subflow for iOS
Actionable Notifications Node-Red Subflow for Home Assistant Companion - iOS

This was originally a gist [link](https://gist.github.com/sstratoti/8021c5a4ee8e34313c3f59ba20c4a83a) but I felt that a true github project would help with those that would like to submit issues, questions or pull requests. This way we can manage the code all in one place and people can follow it for updates.

This is a subflow I created that is based originally on the [actionable-notifications-subflow-for-android](https://zachowj.github.io/node-red-contrib-home-assistant-websocket/cookbook/actionable-notifications-subflow-for-android.html) that is in the Home Assistant Node-Red cookbook.

| Options        | Description                                                                                            |                                                             Documentation                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------ | :-----------------------------------------------------------------------------------------------------------------------------------: |
| Group Name                                                                    | You can edit this in the subflow directly and add in the values for your groups. Grouping combines notifications together visually.                                                                                                                                                                      | [link](https://companion.home-assistant.io/docs/notifications/notifications-basic/#grouping)                              |
| Tag (for replacing messages - optional)                                       | Replace an existing notification by using a tag for the notification. All subsequent notifications will take the place of a notification with the same tag. If a tag is not provided, one will be auto-generated.                                                                                        | [link](https://companion.home-assistant.io/docs/notifications/notifications-basic/#replacing)                             |
| Notify Service                                                                | Can take multiple services as a comma delimited list e.g.: `mobile_app_username, mobile_app_username2`                                                                                                                                                                                                   |                                                                                                                   |
| Title                                                                         | Top line of text                                                                                                                                                                                                                                                                                         | [link](https://companion.home-assistant.io/docs/notifications/notifications-basic)                                        |
| Subtitle (optional)                                                           | Second line of text                                                                                                                                                                                                                                                                                      | [link](https://companion.home-assistant.io/docs/notifications/notifications-basic/#subtitle--subject)                     |
| Message                                                                       | Message Text                                                                                                                                                                                                                                                                                             |                                                                                                                   |
| Notification URL (optional)                                                   | lovelace dashboard, https:// or app://.                                                                                                                                                                                                                                                                  | [link](https://companion.home-assistant.io/docs/notifications/notifications-basic#opening-a-url)                          |
| Pre-installed Custom Sound                                                    | This is a drop down with the sounds that are pre-installed with the companion app.                                                                                                                                                                                                                                      | [link](https://companion.home-assistant.io/docs/notifications/notification-sounds#custom-push-notification-sounds)        |
| Custom Sound (Optional - will override pre-installed selection)               | Please see the companion documentation.                                                                                                                                                                                                                                                                  | [link](https://companion.home-assistant.io/docs/notifications/notification-sounds#custom-push-notification-sounds)        |
| Critical Notification?                                                        | iOS gives special priority to this type of notification. Critical alerts always appear at the top of your lock screen above all other notifications, and play a sound even if Do Not Disturb is enabled or the iPhone is muted. If set to true, will override Interruption Level to 'Critical'.                                                                         | [link](https://companion.home-assistant.io/docs/notifications/critical-notifications/)                                    |
| Interruption Level                                                        | For use with iOS 15+. If you use any of these options pre-15, the message will arrive as default UNLESS you select Critical. Selecting Critical employs the same logic as the "Critical Notification?" above except it sends in an interruption level as well. There are currently 4 Options. Passive: Quiet notifications without waking the screen - doesn't override focus. Active: Default behavior - doesn't override focus. Time Sensitive: Important Notifications - overrides focus. Critical: Critical Notifications - overrides focus, even mute.   | [link](https://companion.home-assistant.io/docs/notifications/notifications-basic/#interruption-level)                                    |
| Populate User Information                                                     | Will resolve user info in Node-RED and place it in `msg.userData`                                                                                                                                                                                                                                        |                                                                                                                   |
| Clear notifications on Action Received?                                       | Will clear all notifications related to this if an action is recieved from any of the devices notified.                                                                                                                                                                                                  | [link](https://companion.home-assistant.io/docs/notifications/notifications-basic#clearing)                               |
| Action [x] Title                                                              | iOS notifications can have from ZERO to 10 actions. If you do not populate any of the action titles, the notification sent will just be a non-actionable notification. This is the title that is displayed on the action button.                                                                                                                                                                                                    | [link](https://companion.home-assistant.io/docs/notifications/actionable-notifications#building-actionable-notifications) |
| Action [x] URL (optional)                                                     | Optional. The URL to open when tapped                                                                                                                                                                                                                                                                    |                                                                                                                   |
| Action [x] Activation Mode                                                    | Set to foreground to launch the app when tapped. Defaults to background which just fires the event. This is automatically set to foreground when providing a uri.                                                                                                                                        | [link](https://companion.home-assistant.io/docs/notifications/actionable-notifications#ios-specific-options)              |
| Action [x] App Authentication Required?                                       | true to require entering a passcode to use the action.                                                                                                                                                                                                                                                   | [link](https://companion.home-assistant.io/docs/notifications/actionable-notifications#ios-specific-options)              |
| Action [x] Destructive?                                                       | true to color the action's title red, indicating a destructive action.                                                                                                                                                                                                                                   | [link](https://companion.home-assistant.io/docs/notifications/actionable-notifications#ios-specific-options)              |
| Action [x] Behavior                                                           | textInput to prompt for text to return with the event. This also occurs when setting the action to REPLY.                                                                                                                                                                                                | [link](https://companion.home-assistant.io/docs/notifications/actionable-notifications#ios-specific-options)              |
| Action [x] Text Input Button Title (Required if behavior is Text Input)       | Title to use for text input for actions that prompt.                                                                                                                                                                                                                                                     | [link](https://companion.home-assistant.io/docs/notifications/actionable-notifications#ios-specific-options)              |
| Action [x] Text Input Placeholder (Optional - only if behavior is Text Input) | Placeholder to use for text input for actions that prompt.
| Action [x] Icon                                                               | Icon for the action button. Please see the companion documentation.                                                                                                                                                                                                                                      | [link](https://companion.home-assistant.io/docs/notifications/actionable-notifications#ios-specific-options)              |
| Latitude for Pin 1                                                            | Will show a centered map with a red pin at the given coordinates.                                                                                                                                                                                                                                        | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#map)                                        |
| Longitude for Pin 1                                                           | Will show a centered map with a red pin at the given coordinates.                                                                                                                                                                                                                                        | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#map)                                        |
| Latitude for Pin 2                                                            | The latitude of the second pin.                                                                                                                                                                                                                                                                          | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#showing-a-second-pin)                       |
| Longitude for Pin 2                                                           | The longitude of the second pin.                                                                                                                                                                                                                                                                         | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#showing-a-second-pin)                       |
| Show a line between points?                                                   | Displays a line connecting the first and second pin.                                                                                                                                                                                                                                                     | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#showing-a-second-pin)                       |
| Show a compass on the map?                                                    | Displays a compass control on the map.                                                                                                                                                                                                                                                                   | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#extra-configuration)                        |
| Show points of interest?                                                      | Displays point-of-interest (POI) information on the map.                                                                                                                                                                                                                                                 | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#extra-configuration)                        |
| Show scale information on the map?                                            | Shows scale information on the map.                                                                                                                                                                                                                                                                      | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#extra-configuration)                        |
| Show Traffic?                                                                 | Displays traffic information on the map.                                                                                                                                                                                                                                                                 | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#extra-configuration)                        |
| Show User Location?                                                           | Attempts to display user's location on the map.                                                                                                                                                                                                                                                          | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#extra-configuration)                        |
| Camera Entity                                                                 | The preview thumbnail of the notification will display a still image from the camera. When expanded, the notification content displays a real time MJPEG stream if the camera supports it.                                                                                                               | [link](https://companion.home-assistant.io/docs/notifications/dynamic-content#camera-stream)                              |
| Image Path (10MB limit)                                                       | An attachment is an image, video, or audio file which is downloaded to the device when a notification is received and shown alongside the notification. A thumbnail is shown when the notification is not expanded. The full size attachment is shown when the notification is expanded.                 | [link](https://companion.home-assistant.io/docs/notifications/notification-attachments/#parameters)                       |
| Video Path (50MB limit)                                                       |                                                                                                                                                                                                                                                                                                          | [link](https://companion.home-assistant.io/docs/notifications/notification-attachments/#parameters)                       |
| Audio Path (5MB limit)                                                        |                                                                                                                                                                                                                                                                                                          | [link](https://companion.home-assistant.io/docs/notifications/notification-attachments/#parameters)                       |
| Content URL (overrides image/video/audio)                                     | Optional. The URL of content to use as the attachment. This URL must be accessible from the Internet, or the receiving device must be on the same network as the hosted content. This overrides any image, video or audio values.                                                                        | [link](https://companion.home-assistant.io/docs/notifications/notification-attachments/#configuration)                    |
| Load Media in Notification Lazily?                                            | Optional.If set to true the attachment will not be downloaded immediately and will only be loaded when viewing the notification. Use this to avoid downloading obviously-too-large attachments, but if they are only occasionally too large, you shouldn't provide this key as the app can attempt both. | [link](https://companion.home-assistant.io/docs/notifications/notification-attachments/#configuration)                    |
| Hide thumbnail?                                                               | Optional. If set to true the thumbnail will not show on the notification. The content will only be viewable by expanding.                                                                                                                                                                                | [link](https://companion.home-assistant.io/docs/notifications/notification-attachments/#configuration)                    |
| Debug Mode?                                                                   | If set to true, debug messages will print to node red when this subflow is called. This can help with troubleshooting this subflow. Please see this project's wiki for more information.                                                                                                                            | [link](https://github.com/sstratoti/actionable-notifications-subflow-for-ios/wiki/Debugging-and-Troubleshooting)                    |


When using the iOS Actionable Notification node, you can dynamically override various properties by setting the `msg.notificationOverride` object. Below is a complete sample that demonstrates how to override each possible value, including the newly added properties.

#### **Sample Code for Overrides**

```javascript
// Set msg overrides
### Documentation Sample for Override Properties
msg.notificationOverride = {};

// Basic Notification Information
msg.notificationOverride.title = "Dynamic Title!";
msg.notificationOverride.subtitle = "Dynamic Subtitle";
msg.notificationOverride.message = "Battery is at " + msg.payload.attributes.battery + "%!! Replace it soon!";
msg.notificationOverride.url = "/hacs";
msg.notificationOverride.services = "my_phone, partners_phone, kids_phone"; // Define which devices to send the notification to.
msg.notificationOverride.cameraEntity = "camera.my_back_yard"; // must be a camera entity.
msg.notificationOverride.interruptionLevel = "time-sensitive"; //must be one of the following: passive, active, time-sensitive or critical
msg.notificationOverride.customSound = "custom_sound.wav"; // Custom sound for notification
msg.notificationOverride.group = "family_notifications"; // Group notifications for easy management on the device

// Tag Override (for de-duplication or grouping)
msg.notificationOverride.tag = "xyzTag"; // Use the same tag to overwrite the previous notification or a new tag to send it as a new one.

// Action Properties Overrides - ...repeat as necessary for actions 2 through 10, changing the number in the action's property.
msg.notificationOverride.action1Title = "New Action Title for Action 1!";
msg.notificationOverride.action1ActivationMode = "foreground"; // Options: "foreground", "background"
msg.notificationOverride.action1Uri = "https://www.google.com"; // URI for the action, can also be relative to HA such as /lovelace/myDashboard
msg.notificationOverride.action1TextInputButtonTitle = "Reply"; // may not work with later versions of iOS
msg.notificationOverride.action1TextInputPlaceholder = "Type your response here..."; // may not work with later versions of iOS
msg.notificationOverride.action1AuthenticationRequired = true; // Requires authentication before performing the action
msg.notificationOverride.action1Destructive = true; // Indicates a destructive action (will show option in Red)
msg.notificationOverride.action1Behavior = "default"; // Behavior of the action (e.g., "default", "textInput")
msg.notificationOverride.action1Icon = "sfsymbols:bell.slash"; // Icon associated with the action - check companion documentation for available icons.

// Map Information Overrides
msg.notificationOverride.latitudeFirst = "40.712776";
msg.notificationOverride.longitudeFirst = "-74.005974";
msg.notificationOverride.latitudeSecond = "34.052235";
msg.notificationOverride.longitudeSecond = "-118.243683";
msg.notificationOverride.showLineBetweenPoints = true; // Show a line between the two points on the map
msg.notificationOverride.showCompass = true; // Show compass on the map
msg.notificationOverride.showPointsOfInterest = false; // Show points of interest on the map
msg.notificationOverride.showScale = true; // Show scale on the map
msg.notificationOverride.showTraffic = false; // Show traffic information on the map
msg.notificationOverride.showUserLocation = true; // Show user location on the map

// Media Information Overrides
msg.notificationOverride.contentUrl = "https://example.com/image.jpg"; // URL for the content (image, video, etc.)
msg.notificationOverride.imagePath = "/local/images/picture.jpg"; // Local path for image
msg.notificationOverride.videoPath = "/local/videos/video.mp4"; // Local path for video
msg.notificationOverride.audioPath = "/local/audio/alert.mp3"; // Local path for audio
msg.notificationOverride.lazyLoading = true; // Enable lazy loading for the media content
msg.notificationOverride.hideThumbnail = true; // Hide the thumbnail for the attachment

return msg;
```

### **Explanation of Override Properties**

- **Basic Notification Information**:
  - `title`: Override the title of the notification.
  - `subtitle`: Override the subtitle of the notification.
  - `message`: Override the main message body.
  - `url`: Override the URL that opens when the notification is clicked.
  - `services`: Specify which devices should receive the notification.
  - `cameraEntity`: The camera entity to display in the notification.
  - `interruptionLevel`: Define the interruption level, e.g., "time-sensitive".
  - `customSound`: Custom sound file to play when the notification is received. You need to load in custom sounds into the app. See [Companion documentation](https://companion.home-assistant.io/docs/notifications/notification-sounds#importing-sounds-from-ios) for more information.
  - `group`: Group notifications under a specific group tag. Groups like messages in notification center.

- **Tag Override**:
  - `tag`: Use this to control whether the notification overwrites a previously sent notification with the same tag or appears as a new notification.

- **Action Properties**:
  - `action1Title`: Title for the first action button.
  - `action1ActivationMode`: Mode for the action (foreground or background).
  - `action1Uri`: URI to open when the action is triggered.
  - `action1TextInputButtonTitle`: Title for the text input button.
  - `action1TextInputPlaceholder`: Placeholder text for the text input.
  - `action1AuthenticationRequired`: Boolean to require authentication before the action.
  - `action1Destructive`: Boolean to mark the action as destructive.
  - `action1Behavior`: Behavior of the action, such as default or text input.
  - `action1Icon`: Icon for the action.

...repeat as necessary for actions 2 through 10.

- **Map Information**:
  - `latitudeFirst`, `longitudeFirst`: Coordinates for the first point on the map.
  - `latitudeSecond`, `longitudeSecond`: Coordinates for the second point on the map.
  - `showLineBetweenPoints`: Boolean to show a line between the two points.
  - `showCompass`: Boolean to show the compass.
  - `showPointsOfInterest`: Boolean to show points of interest on the map.
  - `showScale`: Boolean to show the map scale.
  - `showTraffic`: Boolean to show traffic information.
  - `showUserLocation`: Boolean to show the user's location.

- **Media Information**:
  - `contentUrl`: URL for the content to be displayed in the notification.
  - `imagePath`: Local path for an image to be displayed.
  - `videoPath`: Local path for a video to be displayed.
  - `audioPath`: Local path for audio to be played.
  - `lazyLoading`: Boolean to enable lazy loading for the media content.
  - `hideThumbnail`: Boolean to hide the thumbnail for the attachment.

### **How to Use the Overrides**
Place a function node before the iOS Actionable Notification node, and copy the above code into the function node. This will allow you to dynamically set or override notification properties based on your specific requirements at runtime.


