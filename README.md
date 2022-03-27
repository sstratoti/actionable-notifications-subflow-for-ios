# Actionable Notifications Subflow for iOS
Actionable Notifications Node-Red Subflow for Home Assistant Companion - iOS

This was originally a gist [link](https://gist.github.com/sstratoti/8021c5a4ee8e34313c3f59ba20c4a83a) but I felt that a true github project would help with those that would like to submit issues, questions or pull requests. This way we can manage the code all in one place and people can follow it for updates.

This is a subflow I created that is based originally on the [actionable-notifications-subflow-for-android](https://zachowj.github.io/node-red-contrib-home-assistant-websocket/cookbook/actionable-notifications-subflow-for-android.html) that is in the Home Assistant Node-Red cookbook. It simplfies the creation of Home Assistant Companion App notifications, and especially Actionable Notifications.

![image](https://user-images.githubusercontent.com/1392597/160261749-40ef13d7-ea33-4159-bee3-7649270af769.png)

The input to this node can accept overriden values for the notification. The 4 outputs are each linked to each configurable "Action" in the node.

![image](https://user-images.githubusercontent.com/1392597/160261862-8eb11732-5a95-4a56-acb1-3a1a3066b90b.png)

Press an hold the notification to see the actions that can take place:

![image](https://user-images.githubusercontent.com/1392597/160261871-aeb2715a-5e52-4672-af65-daf84a886c2e.png)

...and then add nodes to the output of the Notification node to perform other tasks, make HA API calls, etc.

Please visit the [Wiki](https://github.com/sstratoti/actionable-notifications-subflow-for-ios/wiki) for information about installation, updating, documentation and examples.
